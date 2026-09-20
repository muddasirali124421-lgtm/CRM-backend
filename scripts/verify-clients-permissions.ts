import { ClientStatus } from '@prisma/client';
import prisma from '../src/config/database';
import { ClientsService } from '../src/modules/clients/clients.service';
import { PermissionService } from '../src/services/permission.service';
import { AuthenticatedUser } from '../src/types/auth.types';
import { PermissionString } from '../src/types/permissions.types';

async function main() {
  console.log('====================================================');
  console.log(' Testing Clients Permissions & Security Overrides');
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

  // Roles
  const adminRole = await prisma.role.findFirst({ where: { name: 'Admin' } });
  const devRole = await prisma.role.findFirst({ where: { name: 'Developer' } });

  if (!adminRole || !devRole) {
    console.error('Required roles not found');
    process.exit(1);
  }

  // Temporary Developer user (no clients permissions)
  const testDevEmail = `test.dev.client.${Date.now()}@officecrm.internal`;
  const devEmployee = await prisma.employee.create({
    data: {
      employeeCode: `EMP-CD${Date.now().toString().slice(-4)}`,
      firstName: 'Dev',
      lastName: 'ClientTest',
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

  // Temporary Admin user (has role permissions)
  const testAdminEmail = `test.admin.client.${Date.now()}@officecrm.internal`;
  const adminEmployee = await prisma.employee.create({
    data: {
      employeeCode: `EMP-CA${Date.now().toString().slice(-4)}`,
      firstName: 'Admin',
      lastName: 'ClientTest',
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

  let testClientId = '';

  try {
    // -----------------------------------------------------------------
    // Suite 1: Developer role lacks client permissions
    // -----------------------------------------------------------------
    console.log('--- Suite 1: User without clients permissions ---');
    const devPermList = await PermissionService.getEffectivePermissions(devUser.id);
    const devPerms = new Set(devPermList as PermissionString[]);

    assert(!devPerms.has('clients.view'), 'Dev user does not have clients.view');
    assert(!devPerms.has('clients.create'), 'Dev user does not have clients.create');
    assert(!devPerms.has('clients.edit'), 'Dev user does not have clients.edit');
    assert(!devPerms.has('clients.delete'), 'Dev user does not have clients.delete');
    assert(!devPerms.has('clients.assign'), 'Dev user does not have clients.assign');

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
      !PermissionService.hasPermission(devActor, 'clients.view'),
      'PermissionService blocks clients.view for dev user'
    );
    assert(
      !PermissionService.hasPermission(devActor, 'clients.create'),
      'PermissionService blocks clients.create for dev user'
    );

    // -----------------------------------------------------------------
    // Suite 2: Admin user has clients permissions
    // -----------------------------------------------------------------
    console.log('\n--- Suite 2: Admin role user permissions ---');
    const adminPermList = await PermissionService.getEffectivePermissions(adminUser.id);
    const adminPerms = new Set(adminPermList as PermissionString[]);

    assert(adminPerms.has('clients.view'), 'Admin role has clients.view');
    assert(adminPerms.has('clients.create'), 'Admin role has clients.create');
    assert(adminPerms.has('clients.edit'), 'Admin role has clients.edit');
    assert(adminPerms.has('clients.delete'), 'Admin role has clients.delete');
    assert(adminPerms.has('clients.assign'), 'Admin role has clients.assign');

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
      PermissionService.hasPermission(adminActor, 'clients.view'),
      'PermissionService grants clients.view to admin user'
    );
    assert(
      PermissionService.hasPermission(adminActor, 'clients.create'),
      'PermissionService grants clients.create to admin user'
    );

    // Super Admin bypass
    assert(
      PermissionService.hasPermission(superAdminActor, 'clients.create'),
      'Super Admin bypasses all checks via isSuperAdmin === true'
    );

    // -----------------------------------------------------------------
    // Suite 3: DENY User Override on Admin User
    // -----------------------------------------------------------------
    console.log('\n--- Suite 3: DENY User Permission Override ---');
    const clientsCreatePerm = await prisma.permission.findUnique({ where: { key: 'clients.create' } });
    assert(clientsCreatePerm !== null, 'Permission record clients.create exists');

    if (clientsCreatePerm) {
      await prisma.userPermissionOverride.create({
        data: {
          userId: adminUser.id,
          permissionId: clientsCreatePerm.id,
          allowed: false, // DENY override
        },
      });

      const updatedAdminList = await PermissionService.getEffectivePermissions(adminUser.id);
      const updatedAdminPerms = new Set(updatedAdminList as PermissionString[]);
      assert(!updatedAdminPerms.has('clients.create'), 'DENY override strips clients.create from admin user');

      adminActor.permissions = updatedAdminPerms;
      assert(
        !PermissionService.hasPermission(adminActor, 'clients.create'),
        'PermissionService denies clients.create when DENY override is present'
      );
    }

    // -----------------------------------------------------------------
    // Suite 4: ALLOW User Override on Dev User
    // -----------------------------------------------------------------
    console.log('\n--- Suite 4: ALLOW User Permission Override ---');
    const clientsViewPerm = await prisma.permission.findUnique({ where: { key: 'clients.view' } });
    assert(clientsViewPerm !== null, 'Permission record clients.view exists');

    if (clientsViewPerm) {
      await prisma.userPermissionOverride.create({
        data: {
          userId: devUser.id,
          permissionId: clientsViewPerm.id,
          allowed: true, // ALLOW override
        },
      });

      const updatedDevList = await PermissionService.getEffectivePermissions(devUser.id);
      const updatedDevPerms = new Set(updatedDevList as PermissionString[]);
      assert(updatedDevPerms.has('clients.view'), 'ALLOW override grants clients.view to dev user');

      devActor.permissions = updatedDevPerms;
      assert(
        PermissionService.hasPermission(devActor, 'clients.view'),
        'PermissionService allows clients.view when ALLOW override is present'
      );
    }

    // -----------------------------------------------------------------
    // Suite 5: Operation Execution with Super Admin
    // -----------------------------------------------------------------
    console.log('\n--- Suite 5: Operation Execution with Super Admin ---');
    const client = await ClientsService.createClient(
      {
        name: 'Clark Kent',
        company: 'Daily Planet',
        email: 'clark@dailyplanet.example.com',
      },
      superAdminActor
    );
    testClientId = client.id;
    assert(client.name === 'Clark Kent', 'Client created successfully');
    assert(client.clientCode.startsWith('CL-'), 'Valid client code generated');
  } finally {
    // Cleanup
    console.log('\n--- Cleaning up test fixtures ---');
    if (testClientId) {
      await prisma.auditLog.deleteMany({ where: { entityId: testClientId } });
      await prisma.client.deleteMany({ where: { id: testClientId } });
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
    console.log('Cleanup completed.');
  }

  console.log('\n====================================================');
  console.log(` Client Permission Verification Summary: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('Clients permission verification failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
