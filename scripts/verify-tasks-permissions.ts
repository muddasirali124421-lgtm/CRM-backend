import { PriorityLevel, TaskStatus } from '@prisma/client';
import prisma from '../src/config/database';
import { ClientsService } from '../src/modules/clients/clients.service';
import { ProjectsService } from '../src/modules/projects/projects.service';
import { TasksService } from '../src/modules/tasks/tasks.service';
import { PermissionService } from '../src/services/permission.service';
import { AuthenticatedUser } from '../src/types/auth.types';
import { PermissionString } from '../src/types/permissions.types';
import { AppError } from '../src/utils/api-response';

async function main() {
  console.log('====================================================');
  console.log(' Testing Tasks Permissions & Security Overrides');
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

  // User 1: Designer (no task permissions by default)
  const testDesignerEmail = `test.designer.task.${Date.now()}@officecrm.internal`;
  const designerEmployee = await prisma.employee.create({
    data: {
      employeeCode: `EMP-TD${Date.now().toString().slice(-4)}`,
      firstName: 'Donna',
      lastName: 'Troy',
      email: testDesignerEmail,
      jobTitle: 'Creative Designer',
      employmentStatus: 'ACTIVE',
      joiningDate: new Date(),
    },
  });

  const designerUser = await prisma.user.create({
    data: {
      email: testDesignerEmail,
      passwordHash: 'dummy-hash',
      roleId: designerRole.id,
      employeeId: designerEmployee.id,
      accountStatus: 'ACTIVE',
    },
    include: { role: true },
  });

  // User 2: Admin (has task permissions)
  const testAdminEmail = `test.admin.task.${Date.now()}@officecrm.internal`;
  const adminEmployee = await prisma.employee.create({
    data: {
      employeeCode: `EMP-TA${Date.now().toString().slice(-4)}`,
      firstName: 'Diana',
      lastName: 'Prince',
      email: testAdminEmail,
      jobTitle: 'Admin Director',
      employmentStatus: 'ACTIVE',
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

  // Setup test client & project
  const testClient = await ClientsService.createClient(
    {
      name: 'Themyscira Embassy',
      company: 'Amazon Enterprises',
      email: `test.tasks.perm.${Date.now()}@themyscira.example.com`,
    },
    superAdminActor
  );

  const testProject = await ProjectsService.createProject(
    {
      name: 'Diplomatic Mission Infrastructure',
      clientId: testClient.id,
      managerId: adminEmployee.id,
      memberIds: [designerEmployee.id],
    },
    superAdminActor
  );

  let taskId1 = '';
  let taskId2 = '';

  try {
    // -----------------------------------------------------------------
    // Suite 1: Designer role lacks tasks capabilities
    // -----------------------------------------------------------------
    console.log('--- Suite 1: User without tasks permissions ---');
    const designerPermList = await PermissionService.getEffectivePermissions(designerUser.id);
    const designerPerms = new Set(designerPermList as PermissionString[]);

    assert(!designerPerms.has('tasks.view'), 'Designer user lacks tasks.view');
    assert(!designerPerms.has('tasks.create'), 'Designer user lacks tasks.create');
    assert(!designerPerms.has('tasks.edit'), 'Designer user lacks tasks.edit');
    assert(!designerPerms.has('tasks.delete'), 'Designer user lacks tasks.delete');
    assert(!designerPerms.has('tasks.assign'), 'Designer user lacks tasks.assign');
    assert(!designerPerms.has('tasks.approve'), 'Designer user lacks tasks.approve');

    const designerActor: AuthenticatedUser = {
      userId: designerUser.id,
      email: designerUser.email,
      isSuperAdmin: false,
      role: {
        id: designerUser.role.id,
        name: designerUser.role.name,
        isSuperAdmin: false,
        isSystemRole: designerUser.role.isSystem,
        permissions: [],
      },
      employeeId: designerUser.employeeId ?? undefined,
      permissions: designerPerms,
    };

    assert(
      !PermissionService.hasPermission(designerActor, 'tasks.view'),
      'PermissionService blocks tasks.view for designer user'
    );
    assert(
      !PermissionService.hasPermission(designerActor, 'tasks.create'),
      'PermissionService blocks tasks.create for designer user'
    );

    // -----------------------------------------------------------------
    // Suite 2: Admin role has tasks capabilities
    // -----------------------------------------------------------------
    console.log('\n--- Suite 2: Admin user tasks permissions ---');
    const adminPermList = await PermissionService.getEffectivePermissions(adminUser.id);
    const adminPerms = new Set(adminPermList as PermissionString[]);

    assert(adminPerms.has('tasks.view'), 'Admin role has tasks.view');
    assert(adminPerms.has('tasks.create'), 'Admin role has tasks.create');
    assert(adminPerms.has('tasks.edit'), 'Admin role has tasks.edit');
    assert(adminPerms.has('tasks.delete'), 'Admin role has tasks.delete');
    assert(adminPerms.has('tasks.assign'), 'Admin role has tasks.assign');
    assert(adminPerms.has('tasks.approve'), 'Admin role has tasks.approve');

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
      PermissionService.hasPermission(adminActor, 'tasks.view'),
      'PermissionService grants tasks.view to admin user'
    );
    assert(
      PermissionService.hasPermission(adminActor, 'tasks.create'),
      'PermissionService grants tasks.create to admin user'
    );
    assert(
      PermissionService.hasPermission(adminActor, 'tasks.edit'),
      'PermissionService grants tasks.edit to admin user'
    );
    assert(
      PermissionService.hasPermission(adminActor, 'tasks.approve'),
      'PermissionService grants tasks.approve to admin user'
    );

    // Super Admin bypass
    assert(
      PermissionService.hasPermission(superAdminActor, 'tasks.create'),
      'Super Admin unconditionally bypasses all permission checks'
    );

    // -----------------------------------------------------------------
    // Suite 3: User Permission Overrides (DENY and ALLOW)
    // -----------------------------------------------------------------
    console.log('\n--- Suite 3: Individual Permission Overrides ---');
    const tasksCreatePerm = await prisma.permission.findUnique({ where: { key: 'tasks.create' } });
    assert(tasksCreatePerm !== null, 'tasks.create permission exists');

    if (tasksCreatePerm) {
      // Apply DENY override on Admin user
      const denyOverride = await prisma.userPermissionOverride.create({
        data: {
          userId: adminUser.id,
          permissionId: tasksCreatePerm.id,
          allowed: false, // DENY
        },
      });

      const updatedAdminPerms = new Set(
        (await PermissionService.getEffectivePermissions(adminUser.id)) as PermissionString[]
      );
      assert(!updatedAdminPerms.has('tasks.create'), 'DENY override removes tasks.create from admin user');
      adminActor.permissions = updatedAdminPerms;
      assert(
        !PermissionService.hasPermission(adminActor, 'tasks.create'),
        'PermissionService blocks tasks.create with DENY override'
      );

      // Clean up override
      await prisma.userPermissionOverride.delete({ where: { id: denyOverride.id } });
      adminActor.permissions = new Set(
        (await PermissionService.getEffectivePermissions(adminUser.id)) as PermissionString[]
      );
    }

    const tasksViewPerm = await prisma.permission.findUnique({ where: { key: 'tasks.view' } });
    if (tasksViewPerm) {
      // Apply ALLOW override on Designer user
      const allowOverride = await prisma.userPermissionOverride.create({
        data: {
          userId: designerUser.id,
          permissionId: tasksViewPerm.id,
          allowed: true, // ALLOW
        },
      });

      const updatedDesignerPerms = new Set(
        (await PermissionService.getEffectivePermissions(designerUser.id)) as PermissionString[]
      );
      assert(updatedDesignerPerms.has('tasks.view'), 'ALLOW override grants tasks.view to designer user');
      designerActor.permissions = updatedDesignerPerms;
      assert(
        PermissionService.hasPermission(designerActor, 'tasks.view'),
        'PermissionService grants tasks.view with ALLOW override'
      );

      // Clean up override
      await prisma.userPermissionOverride.delete({ where: { id: allowOverride.id } });
    }

    // -----------------------------------------------------------------
    // Suite 4: QA -> COMPLETED Approval Enforcement
    // -----------------------------------------------------------------
    console.log('\n--- Suite 4: QA -> COMPLETED Approval Enforcement ---');
    // Create task in QA status
    const qaTask = await TasksService.createTask(
      {
        title: 'Review Embassy Security Protocols',
        projectId: testProject.id,
        status: TaskStatus.QA,
        assigneeIds: [adminEmployee.id],
      },
      superAdminActor
    );
    taskId1 = qaTask.id;

    // Create an actor who has tasks.edit BUT lacks tasks.approve
    const noApproveActor: AuthenticatedUser = {
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
      permissions: new Set(['tasks.view', 'tasks.edit'] as PermissionString[]),
    };

    let approveRejected = false;
    try {
      await TasksService.updateTaskStatus(taskId1, TaskStatus.COMPLETED, noApproveActor);
    } catch (err: any) {
      if (err instanceof AppError && err.statusCode === 403 && err.message.includes('tasks.approve')) {
        approveRejected = true;
      }
    }
    assert(approveRejected, 'Moving task from QA to COMPLETED without tasks.approve is rejected with 403');

    // With tasks.approve, transition succeeds
    const approveActor: AuthenticatedUser = {
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
      permissions: new Set(['tasks.view', 'tasks.edit', 'tasks.approve'] as PermissionString[]),
    };

    const approvedTask = await TasksService.updateTaskStatus(taskId1, TaskStatus.COMPLETED, approveActor);
    assert(approvedTask.status === TaskStatus.COMPLETED, 'User with tasks.approve successfully completes QA task');

    // -----------------------------------------------------------------
    // Suite 5: Comment Author Security
    // -----------------------------------------------------------------
    console.log('\n--- Suite 5: Comment Security ---');
    const commentByAdmin = await TasksService.createComment(
      taskId1,
      { content: 'Admin initial observation note.' },
      adminActor
    );

    // Designer user attempts to edit Admin comment
    let editOtherCommentRejected = false;
    try {
      await TasksService.updateComment(
        taskId1,
        commentByAdmin.id,
        { content: 'Hacked comment by someone else' },
        designerActor
      );
    } catch (err: any) {
      if (err instanceof AppError && err.statusCode === 403) {
        editOtherCommentRejected = true;
      }
    }
    assert(editOtherCommentRejected, "Editing another user's comment is rejected with 403");

    // Admin edits own comment
    const editSelfComment = await TasksService.updateComment(
      taskId1,
      commentByAdmin.id,
      { content: 'Admin revised observation note.' },
      adminActor
    );
    assert(editSelfComment.content === 'Admin revised observation note.', 'Author can edit own comment');

    // Designer user attempts to delete Admin comment without tasks.delete
    let deleteOtherCommentRejected = false;
    try {
      await TasksService.deleteComment(taskId1, commentByAdmin.id, designerActor);
    } catch (err: any) {
      if (err instanceof AppError && err.statusCode === 403) {
        deleteOtherCommentRejected = true;
      }
    }
    assert(deleteOtherCommentRejected, "Deleting another user's comment without tasks.delete is rejected with 403");

    // Super Admin can delete any comment
    const superAdminDeleteRes = await TasksService.deleteComment(taskId1, commentByAdmin.id, superAdminActor);
    assert(superAdminDeleteRes.message.includes('deleted successfully'), 'Super Admin can delete any comment');
  } finally {
    console.log('\n--- Cleaning up temporary test fixtures ---');
    if (taskId1) {
      await prisma.taskComment.deleteMany({ where: { taskId: taskId1 } });
      await prisma.taskAssignee.deleteMany({ where: { taskId: taskId1 } });
      await prisma.taskActivity.deleteMany({ where: { taskId: taskId1 } });
      await prisma.task.deleteMany({ where: { id: taskId1 } });
    }
    if (taskId2) {
      await prisma.task.deleteMany({ where: { id: taskId2 } });
    }

    if (testProject.id) {
      await prisma.projectMember.deleteMany({ where: { projectId: testProject.id } });
      await prisma.auditLog.deleteMany({ where: { entityId: testProject.id } });
      await prisma.project.deleteMany({ where: { id: testProject.id } });
    }

    await prisma.auditLog.deleteMany({ where: { entityId: testClient.id } });
    await prisma.client.deleteMany({ where: { id: testClient.id } });

    await prisma.user.deleteMany({ where: { id: { in: [designerUser.id, adminUser.id] } } });
    await prisma.employee.deleteMany({ where: { id: { in: [designerEmployee.id, adminEmployee.id] } } });
    console.log('Permissions cleanup completed successfully.');
  }

  console.log('\n====================================================');
  console.log(` Tasks Permissions Summary: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('Tasks permissions verification failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
