import { LeadStatus, PriorityLevel } from '@prisma/client';
import prisma from '../src/config/database';
import { LeadsService } from '../src/modules/leads/leads.service';
import { PermissionService } from '../src/services/permission.service';
import { AuthenticatedUser } from '../src/types/auth.types';
import { PermissionString } from '../src/types/permissions.types';
import { AppError } from '../src/utils/api-response';

async function main() {
  console.log('====================================================');
  console.log(' Testing Leads Permissions & Security Overrides');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(` [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  // 1. Fetch live Super Admin
  const superAdminUser = await prisma.user.findFirst({
    where: { role: { isSuperAdmin: true }, accountStatus: 'ACTIVE' },
    include: { role: true, employee: true },
  });

  if (!superAdminUser) {
    console.error('Super Admin not found.');
    process.exit(1);
  }

  const superAdminActor: AuthenticatedUser = {
    userId: superAdminUser.id,
    email: superAdminUser.email,
    isSuperAdmin: true,
    role: {
      id: superAdminUser.role.id,
      name: superAdminUser.role.name,
      isSuperAdmin: true,
      isSystemRole: superAdminUser.role.isSystem,
      permissions: [],
    },
    employeeId: superAdminUser.employeeId ?? undefined,
    permissions: new Set<PermissionString>(),
  };

  // Find Admin and Developer roles
  const adminRole = await prisma.role.findFirst({ where: { name: 'Admin' } });
  const devRole = await prisma.role.findFirst({ where: { name: 'Developer' } });

  if (!adminRole || !devRole) {
    console.error('Required roles not found in DB');
    process.exit(1);
  }

  // Create a temporary test employee & user without leads permissions (Developer)
  const testDevEmail = `test.dev.${Date.now()}@officecrm.internal`;
  const devEmployee = await prisma.employee.create({
    data: {
      employeeCode: `EMP-T${Date.now().toString().slice(-4)}`,
      firstName: 'Dev',
      lastName: 'User',
      email: testDevEmail,
      jobTitle: 'Developer',
      joiningDate: new Date(),
    },
  });

  const devUser = await prisma.user.create({
    data: {
      email: testDevEmail,
      passwordHash: 'dummy-hash',
      roleId: devRole.id,
      employeeId: devEmployee.id,
      accountStatus: 'ACTIVE',
    },
    include: { role: true },
  });

  // Create a temporary test employee & user with Admin role (has role permissions)
  const testAdminEmail = `test.admin.${Date.now()}@officecrm.internal`;
  const adminEmployee = await prisma.employee.create({
    data: {
      employeeCode: `EMP-A${Date.now().toString().slice(-4)}`,
      firstName: 'Admin',
      lastName: 'Staff',
      email: testAdminEmail,
      jobTitle: 'Admin Specialist',
      joiningDate: new Date(),
    },
  });

  const adminUser = await prisma.user.create({
    data: {
      email: testAdminEmail,
      passwordHash: 'dummy-hash',
      roleId: adminRole.id,
      employeeId: adminEmployee.id,
      accountStatus: 'ACTIVE',
    },
    include: { role: true },
  });

  let testLeadId = '';
  let convertedClientId = '';

  try {
    // -----------------------------------------------------------------
    // 1. Permission checks for dev user (has no leads permissions)
    // -----------------------------------------------------------------
    console.log('--- Suite 1: User without leads permissions ---');
    const devPermList = await PermissionService.getEffectivePermissions(devUser.id);
    const devPerms = new Set(devPermList as PermissionString[]);
    assert(!devPerms.has('leads.view'), 'Dev user does not have leads.view');
    assert(!devPerms.has('leads.create'), 'Dev user does not have leads.create');
    assert(!devPerms.has('leads.edit'), 'Dev user does not have leads.edit');
    assert(!devPerms.has('leads.delete'), 'Dev user does not have leads.delete');
    assert(!devPerms.has('leads.assign'), 'Dev user does not have leads.assign');

    const devActor: AuthenticatedUser = {
      userId: devUser.id,
      email: devUser.email,
      isSuperAdmin: false,
      role: {
        id: devUser.role.id,
        name: devUser.role.name,
        isSuperAdmin: false,
        isSystemRole: devUser.role.isSystem,
        permissions: [],
      },
      employeeId: devUser.employeeId ?? undefined,
      permissions: devPerms,
    };

    assert(
      !PermissionService.hasPermission(devActor, 'leads.view'),
      'PermissionService blocks leads.view for dev user'
    );
    assert(
      !PermissionService.hasPermission(devActor, 'leads.create'),
      'PermissionService blocks leads.create for dev user'
    );

    // -----------------------------------------------------------------
    // 2. Permission checks for Admin role user
    // -----------------------------------------------------------------
    console.log('\n--- Suite 2: Admin user role permissions ---');
    const adminPermList = await PermissionService.getEffectivePermissions(adminUser.id);
    const adminPerms = new Set(adminPermList as PermissionString[]);
    assert(adminPerms.has('leads.view'), 'Admin role user has leads.view');
    assert(adminPerms.has('leads.create'), 'Admin role user has leads.create');
    assert(adminPerms.has('leads.edit'), 'Admin role user has leads.edit');
    assert(adminPerms.has('leads.assign'), 'Admin role user has leads.assign');

    const adminActor: AuthenticatedUser = {
      userId: adminUser.id,
      email: adminUser.email,
      isSuperAdmin: false,
      role: {
        id: adminUser.role.id,
        name: adminUser.role.name,
        isSuperAdmin: false,
        isSystemRole: adminUser.role.isSystem,
        permissions: [],
      },
      employeeId: adminUser.employeeId ?? undefined,
      permissions: adminPerms,
    };

    assert(
      PermissionService.hasPermission(adminActor, 'leads.view'),
      'PermissionService grants leads.view for admin user'
    );
    assert(
      PermissionService.hasPermission(adminActor, 'leads.create'),
      'PermissionService grants leads.create for admin user'
    );
    assert(
      PermissionService.hasPermission(adminActor, 'leads.assign'),
      'PermissionService grants leads.assign for admin user'
    );

    // Super Admin bypass
    assert(
      PermissionService.hasPermission(superAdminActor, 'leads.create'),
      'Super Admin bypasses all checks via isSuperAdmin === true'
    );

    // -----------------------------------------------------------------
    // 3. User Permission Override: DENY on Admin User
    // -----------------------------------------------------------------
    console.log('\n--- Suite 3: DENY User Permission Override ---');
    const leadsCreatePerm = await prisma.permission.findUnique({ where: { key: 'leads.create' } });
    assert(leadsCreatePerm !== null, 'Permission record leads.create exists');

    if (leadsCreatePerm) {
      await prisma.userPermissionOverride.create({
        data: {
          userId: adminUser.id,
          permissionId: leadsCreatePerm.id,
          allowed: false, // DENY override
        },
      });

      const updatedAdminList = await PermissionService.getEffectivePermissions(adminUser.id);
      const updatedAdminPerms = new Set(updatedAdminList as PermissionString[]);
      assert(!updatedAdminPerms.has('leads.create'), 'DENY override removes leads.create from Admin user');

      adminActor.permissions = updatedAdminPerms;
      assert(
        !PermissionService.hasPermission(adminActor, 'leads.create'),
        'PermissionService denies leads.create when DENY override is active'
      );
    }

    // -----------------------------------------------------------------
    // 4. User Permission Override: ALLOW on Dev User
    // -----------------------------------------------------------------
    console.log('\n--- Suite 4: ALLOW User Permission Override ---');
    const leadsViewPerm = await prisma.permission.findUnique({ where: { key: 'leads.view' } });
    assert(leadsViewPerm !== null, 'Permission record leads.view exists');

    if (leadsViewPerm) {
      await prisma.userPermissionOverride.create({
        data: {
          userId: devUser.id,
          permissionId: leadsViewPerm.id,
          allowed: true, // ALLOW override
        },
      });

      const updatedDevList = await PermissionService.getEffectivePermissions(devUser.id);
      const updatedDevPerms = new Set(updatedDevList as PermissionString[]);
      assert(updatedDevPerms.has('leads.view'), 'ALLOW override grants leads.view to Dev user');

      devActor.permissions = updatedDevPerms;
      assert(
        PermissionService.hasPermission(devActor, 'leads.view'),
        'PermissionService allows leads.view when ALLOW override is active'
      );
    }

    // -----------------------------------------------------------------
    // 5. Lead Creation and Conversion Security Check
    // -----------------------------------------------------------------
    console.log('\n--- Suite 5: Lead Operations & Conversion Security ---');
    const createdLead = await LeadsService.createLead(
      {
        firstName: 'Diana',
        lastName: 'Prince',
        company: 'Themyscira Exports',
        email: 'diana@themyscira.example.com',
        phone: '+1-555-0999',
        priority: PriorityLevel.HIGH,
      },
      superAdminActor
    );

    testLeadId = createdLead.id;
    assert(createdLead.leadCode.startsWith('LEAD-'), 'Lead created with code');

    // Check conversion permissions: requires leads.edit AND clients.create
    assert(
      !PermissionService.hasPermission(devActor, 'clients.create'),
      'Dev user does not have clients.create permission'
    );

    // Super Admin executes conversion
    const convertResult = await LeadsService.convertLead(testLeadId, {}, superAdminActor);
    convertedClientId = convertResult.client.id;
    assert(convertResult.lead.status === LeadStatus.CONVERTED, 'Lead status is CONVERTED');
    assert(convertResult.client.sourceLeadId === testLeadId, 'Client correctly linked to sourceLeadId');

    // Verify duplicate conversion rejected with 409
    let duplicateRejected = false;
    try {
      await LeadsService.convertLead(testLeadId, {}, superAdminActor);
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 409) {
        duplicateRejected = true;
      }
    }
    assert(duplicateRejected, 'Duplicate conversion correctly throws 409 Conflict');

    // Verify converted lead deletion rejected with 409
    let deleteConvertedRejected = false;
    try {
      await LeadsService.deleteLead(testLeadId, superAdminActor);
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 409) {
        deleteConvertedRejected = true;
      }
    }
    assert(deleteConvertedRejected, 'Deleting converted lead throws 409 Conflict');
  } finally {
    // -----------------------------------------------------------------
    // Safe Cleanup: Remove only temporary test entities
    // -----------------------------------------------------------------
    console.log('\n--- Cleaning up temporary test entities ---');
    if (convertedClientId) {
      await prisma.client.deleteMany({ where: { id: convertedClientId } });
    }
    if (testLeadId) {
      await prisma.auditLog.deleteMany({ where: { entityId: testLeadId } });
      await prisma.lead.deleteMany({ where: { id: testLeadId } });
    }
    await prisma.userPermissionOverride.deleteMany({
      where: { userId: { in: [devUser.id, adminUser.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [devUser.id, adminUser.id] } },
    });
    await prisma.employee.deleteMany({
      where: { id: { in: [devEmployee.id, adminEmployee.id] } },
    });
    console.log('Cleanup completed successfully.');
  }

  console.log('\n====================================================');
  console.log(` Permission Verification Summary: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('Permission verification failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
