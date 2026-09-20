import prisma from '../src/config/database';
import { ClientsService } from '../src/modules/clients/clients.service';
import { ProjectsService } from '../src/modules/projects/projects.service';
import { PermissionService } from '../src/services/permission.service';
import { AuthenticatedUser } from '../src/types/auth.types';
import { PermissionString } from '../src/types/permissions.types';

async function main() {
  console.log('====================================================');
  console.log(' Testing Projects Permissions & Security Overrides');
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
  const designerRole = await prisma.role.findFirst({ where: { name: 'Designer' } });

  if (!adminRole || !designerRole) {
    console.error('Required roles not found');
    process.exit(1);
  }

  // Temporary Designer user (no projects permissions)
  const testDevEmail = `test.designer.proj.${Date.now()}@officecrm.internal`;
  const devEmployee = await prisma.employee.create({
    data: {
      employeeCode: `EMP-PD${Date.now().toString().slice(-4)}`,
      firstName: 'Designer',
      lastName: 'ProjTest',
      email: testDevEmail,
      jobTitle: 'Designer',
      joiningDate: new Date(),
    },
  });

  const devUser = await prisma.user.create({
    data: {
      email: testDevEmail,
      passwordHash: 'dummy-hash',
      roleId: designerRole.id,
      employeeId: devEmployee.id,
      accountStatus: 'ACTIVE',
    },
    include: { role: true },
  });

  // Temporary Admin user (has role permissions)
  const testAdminEmail = `test.admin.proj.${Date.now()}@officecrm.internal`;
  const adminEmployee = await prisma.employee.create({
    data: {
      employeeCode: `EMP-PA${Date.now().toString().slice(-4)}`,
      firstName: 'Admin',
      lastName: 'ProjTest',
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

  // Temporary Client
  const testClient = await ClientsService.createClient(
    {
      name: 'Stark Industries',
      company: 'Stark Enterprises',
      email: `tony.stark.${Date.now()}@stark.example.com`,
    },
    superAdminActor
  );

  let testProjectId = '';

  try {
    // -----------------------------------------------------------------
    // Suite 1: Developer role lacks project permissions
    // -----------------------------------------------------------------
    console.log('--- Suite 1: User without project permissions ---');
    const devPermList = await PermissionService.getEffectivePermissions(devUser.id);
    const devPerms = new Set(devPermList as PermissionString[]);

    assert(!devPerms.has('projects.view'), 'Dev user lacks projects.view');
    assert(!devPerms.has('projects.create'), 'Dev user lacks projects.create');
    assert(!devPerms.has('projects.edit'), 'Dev user lacks projects.edit');
    assert(!devPerms.has('projects.delete'), 'Dev user lacks projects.delete');
    assert(!devPerms.has('projects.assign'), 'Dev user lacks projects.assign');

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
      !PermissionService.hasPermission(devActor, 'projects.view'),
      'PermissionService blocks projects.view for dev user'
    );
    assert(
      !PermissionService.hasPermission(devActor, 'projects.create'),
      'PermissionService blocks projects.create for dev user'
    );

    // -----------------------------------------------------------------
    // Suite 2: Admin user has project permissions
    // -----------------------------------------------------------------
    console.log('\n--- Suite 2: Admin role user permissions ---');
    const adminPermList = await PermissionService.getEffectivePermissions(adminUser.id);
    const adminPerms = new Set(adminPermList as PermissionString[]);

    assert(adminPerms.has('projects.view'), 'Admin role has projects.view');
    assert(adminPerms.has('projects.create'), 'Admin role has projects.create');
    assert(adminPerms.has('projects.edit'), 'Admin role has projects.edit');
    assert(adminPerms.has('projects.delete'), 'Admin role has projects.delete');
    assert(adminPerms.has('projects.assign'), 'Admin role has projects.assign');

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
      PermissionService.hasPermission(adminActor, 'projects.view'),
      'PermissionService grants projects.view to admin user'
    );
    assert(
      PermissionService.hasPermission(adminActor, 'projects.create'),
      'PermissionService grants projects.create to admin user'
    );
    assert(
      PermissionService.hasPermission(adminActor, 'projects.assign'),
      'PermissionService grants projects.assign to admin user'
    );

    // Super Admin bypass
    assert(
      PermissionService.hasPermission(superAdminActor, 'projects.create'),
      'Super Admin bypasses all checks via isSuperAdmin === true'
    );

    // -----------------------------------------------------------------
    // Suite 3: DENY User Override on Admin User
    // -----------------------------------------------------------------
    console.log('\n--- Suite 3: DENY User Permission Override ---');
    const projectsCreatePerm = await prisma.permission.findUnique({ where: { key: 'projects.create' } });
    assert(projectsCreatePerm !== null, 'Permission record projects.create exists');

    if (projectsCreatePerm) {
      await prisma.userPermissionOverride.create({
        data: {
          userId: adminUser.id,
          permissionId: projectsCreatePerm.id,
          allowed: false, // DENY override
        },
      });

      const updatedAdminList = await PermissionService.getEffectivePermissions(adminUser.id);
      const updatedAdminPerms = new Set(updatedAdminList as PermissionString[]);
      assert(!updatedAdminPerms.has('projects.create'), 'DENY override removes projects.create from admin user');

      adminActor.permissions = updatedAdminPerms;
      assert(
        !PermissionService.hasPermission(adminActor, 'projects.create'),
        'PermissionService denies projects.create when DENY override is present'
      );
    }

    // -----------------------------------------------------------------
    // Suite 4: ALLOW User Override on Dev User
    // -----------------------------------------------------------------
    console.log('\n--- Suite 4: ALLOW User Permission Override ---');
    const projectsViewPerm = await prisma.permission.findUnique({ where: { key: 'projects.view' } });
    assert(projectsViewPerm !== null, 'Permission record projects.view exists');

    if (projectsViewPerm) {
      await prisma.userPermissionOverride.create({
        data: {
          userId: devUser.id,
          permissionId: projectsViewPerm.id,
          allowed: true, // ALLOW override
        },
      });

      const updatedDevList = await PermissionService.getEffectivePermissions(devUser.id);
      const updatedDevPerms = new Set(updatedDevList as PermissionString[]);
      assert(updatedDevPerms.has('projects.view'), 'ALLOW override grants projects.view to dev user');

      devActor.permissions = updatedDevPerms;
      assert(
        PermissionService.hasPermission(devActor, 'projects.view'),
        'PermissionService allows projects.view when ALLOW override is present'
      );
    }

    // -----------------------------------------------------------------
    // Suite 5: Operation Execution with Super Admin
    // -----------------------------------------------------------------
    console.log('\n--- Suite 5: Operation Execution with Super Admin ---');
    const project = await ProjectsService.createProject(
      {
        name: 'Arc Reactor Miniaturization',
        clientId: testClient.id,
        budget: 500000,
      },
      superAdminActor
    );
    testProjectId = project.id;
    assert(project.name === 'Arc Reactor Miniaturization', 'Project created successfully');
    assert(project.projectCode.startsWith('PRJ-'), 'Valid project code generated');
  } finally {
    // Cleanup
    console.log('\n--- Cleaning up test fixtures ---');
    if (testProjectId) {
      await prisma.auditLog.deleteMany({ where: { entityId: testProjectId } });
      await prisma.project.deleteMany({ where: { id: testProjectId } });
    }
    await prisma.auditLog.deleteMany({ where: { entityId: testClient.id } });
    await prisma.client.deleteMany({ where: { id: testClient.id } });
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
  console.log(` Project Permission Verification Summary: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('Projects permission verification failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
