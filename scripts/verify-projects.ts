import { PriorityLevel, ProjectStatus } from '@prisma/client';
import prisma from '../src/config/database';
import { ClientsService } from '../src/modules/clients/clients.service';
import { ProjectsService } from '../src/modules/projects/projects.service';
import { AuthenticatedUser } from '../src/types/auth.types';
import { PermissionString } from '../src/types/permissions.types';
import { AppError } from '../src/utils/api-response';

async function main() {
  console.log('====================================================');
  console.log(' Starting OfficeCRM Projects Management Verification');
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

  // 1. Fetch live Super Admin actor
  const superAdminUser = await prisma.user.findFirst({
    where: { role: { isSuperAdmin: true }, accountStatus: 'ACTIVE' },
    include: { role: true, employee: true },
  });

  if (!superAdminUser) {
    console.error('Error: Super Admin user not found. Please bootstrap first.');
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

  // Create temporary test client
  const testClient = await ClientsService.createClient(
    {
      name: 'Wayne Industries Corp',
      company: 'Wayne Enterprises',
      email: `test.client.${Date.now()}@wayne.example.com`,
    },
    superAdminActor
  );

  // Create temporary active employees for manager and team member
  const managerEmp = await prisma.employee.create({
    data: {
      employeeCode: `EMP-M${Date.now().toString().slice(-4)}`,
      firstName: 'Lucius',
      lastName: 'Fox',
      email: `lucius.fox.${Date.now()}@officecrm.internal`,
      jobTitle: 'Senior Project Manager',
      joiningDate: new Date(),
    },
  });

  const memberEmp = await prisma.employee.create({
    data: {
      employeeCode: `EMP-T${Date.now().toString().slice(-4)}`,
      firstName: 'Barbara',
      lastName: 'Gordon',
      email: `barbara.gordon.${Date.now()}@officecrm.internal`,
      jobTitle: 'Lead Software Architect',
      joiningDate: new Date(),
    },
  });

  let projectId1 = '';
  let projectId2 = '';
  let taskId = '';

  try {
    // ----------------------------------------------------
    // Test 1: Project Creation & Code Generation
    // ----------------------------------------------------
    console.log('--- Test Suite 1: Project Creation & Code Generation ---');
    const project1 = await ProjectsService.createProject(
      {
        name: 'Batmobile AI Guidance System',
        clientId: testClient.id,
        description: 'Autonomous high-speed navigation module',
        status: ProjectStatus.PLANNING,
        priority: PriorityLevel.HIGH,
        startDate: new Date('2026-03-01'),
        dueDate: new Date('2026-09-01'),
        budget: 150000.0,
        currency: 'USD',
        managerId: managerEmp.id,
        memberIds: [memberEmp.id],
      },
      superAdminActor
    );

    projectId1 = project1.id;
    assert(project1.name === 'Batmobile AI Guidance System', 'Project created with correct name');
    assert(project1.projectCode.startsWith('PRJ-'), 'Project code generated with PRJ- prefix');
    assert(project1.status === ProjectStatus.PLANNING, 'Initial status is PLANNING');
    assert(project1.priority === PriorityLevel.HIGH, 'Initial priority is HIGH');
    assert(project1.budget === 150000, 'Budget safely serialized as number');
    assert(project1.managerId === managerEmp.id, 'Manager assigned on creation');
    assert(project1.members?.length === 1, 'Initial team member assigned on creation');

    // Create second project to verify sequential code generation
    const project2 = await ProjectsService.createProject(
      {
        name: 'Satellite Defense Network',
        clientId: testClient.id,
        status: ProjectStatus.IN_PROGRESS,
        priority: PriorityLevel.URGENT,
      },
      superAdminActor
    );
    projectId2 = project2.id;
    assert(project2.projectCode.startsWith('PRJ-'), 'Second project generated valid code');
    assert(project2.projectCode !== project1.projectCode, 'Project codes are distinct and sequential');

    // ----------------------------------------------------
    // Test 2: Client Relationship Validation
    // ----------------------------------------------------
    console.log('\n--- Test Suite 2: Client Relationship Validation ---');
    let invalidClientRejected = false;
    try {
      await ProjectsService.createProject(
        {
          name: 'Invalid Client Project',
          clientId: '00000000-0000-0000-0000-000000000000',
        },
        superAdminActor
      );
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 400) {
        invalidClientRejected = true;
      }
    }
    assert(invalidClientRejected, 'Project creation with invalid clientId is rejected with 400');

    // ----------------------------------------------------
    // Test 3: Date Consistency Validation
    // ----------------------------------------------------
    console.log('\n--- Test Suite 3: Date Consistency Validation ---');
    let invalidDatesRejected = false;
    try {
      await ProjectsService.updateProject(
        projectId1,
        {
          startDate: new Date('2026-10-01'),
          dueDate: new Date('2026-05-01'), // Earlier than start!
        },
        superAdminActor
      );
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 400) {
        invalidDatesRejected = true;
      }
    }
    assert(invalidDatesRejected, 'Setting dueDate earlier than startDate is rejected with 400');

    // ----------------------------------------------------
    // Test 4: Project Listing with Search & Filters
    // ----------------------------------------------------
    console.log('\n--- Test Suite 4: Project Listing, Search & Filters ---');
    const searchByName = await ProjectsService.listProjects({
      search: 'Batmobile',
    });
    assert(
      searchByName.projects.some((p) => p.id === projectId1),
      'Search by project name finds project'
    );

    const searchByCode = await ProjectsService.listProjects({
      search: project1.projectCode,
    });
    assert(
      searchByCode.projects.some((p) => p.id === projectId1),
      'Search by projectCode finds project'
    );

    const filterByClient = await ProjectsService.listProjects({
      clientId: testClient.id,
    });
    assert(
      filterByClient.projects.length >= 2,
      'Filter by clientId returns all projects for this client'
    );

    const filterByManager = await ProjectsService.listProjects({
      managerId: managerEmp.id,
    });
    assert(
      filterByManager.projects.some((p) => p.id === projectId1),
      'Filter by managerId returns managed project'
    );

    const filterByMember = await ProjectsService.listProjects({
      teamMemberId: memberEmp.id,
    });
    assert(
      filterByMember.projects.some((p) => p.id === projectId1),
      'Filter by teamMemberId returns assigned project'
    );

    // ----------------------------------------------------
    // Test 5: Project Details with Task Summary
    // ----------------------------------------------------
    console.log('\n--- Test Suite 5: Project Details & Task Summary Counts ---');
    const details = await ProjectsService.getProjectById(projectId1);
    assert(details.id === projectId1, 'Details returned for correct project');
    assert(details.client?.id === testClient.id, 'Client summary populated');
    assert(details.manager?.id === managerEmp.id, 'Manager summary populated');
    assert(details.manager?.firstName === 'Lucius', 'Manager first name matches');
    assert(details.taskSummary !== undefined, 'Task summary object returned');
    assert(details.taskSummary?.total === 0, 'Zero tasks on new project');

    // ----------------------------------------------------
    // Test 6: Project Update & CompletedAt Handling
    // ----------------------------------------------------
    console.log('\n--- Test Suite 6: Project Update & Status Handling ---');
    const updated = await ProjectsService.updateProject(
      projectId1,
      {
        name: 'Batmobile AI Guidance System v2',
        status: ProjectStatus.COMPLETED,
      },
      superAdminActor
    );
    assert(updated.name === 'Batmobile AI Guidance System v2', 'Name updated successfully');
    assert(updated.status === ProjectStatus.COMPLETED, 'Status updated to COMPLETED');
    assert(updated.completedAt !== null, 'completedAt timestamp automatically populated on completion');

    // Transition back to IN_PROGRESS
    const reopened = await ProjectsService.updateProject(
      projectId1,
      { status: ProjectStatus.IN_PROGRESS },
      superAdminActor
    );
    assert(reopened.status === ProjectStatus.IN_PROGRESS, 'Status transitioned back to IN_PROGRESS');
    assert(reopened.completedAt === null, 'completedAt cleared when reopened');

    // ----------------------------------------------------
    // Test 7: Project Manager Assignment
    // ----------------------------------------------------
    console.log('\n--- Test Suite 7: Project Manager Assignment ---');
    const assignedManager = await ProjectsService.assignManager(
      projectId2,
      { employeeId: managerEmp.id },
      superAdminActor
    );
    assert(assignedManager.managerId === managerEmp.id, 'Manager assigned via dedicated endpoint');
    assert(assignedManager.manager?.firstName === 'Lucius', 'Assigned manager details returned');

    // ----------------------------------------------------
    // Test 8: Team Member Management
    // ----------------------------------------------------
    console.log('\n--- Test Suite 8: Team Member Management ---');
    // Add team member
    const newMember = await ProjectsService.addTeamMember(
      projectId2,
      { employeeId: memberEmp.id, projectRole: 'LEAD_DEV' },
      superAdminActor
    );
    assert(newMember.employeeId === memberEmp.id, 'Team member added');
    assert(newMember.projectRole === 'LEAD_DEV', 'Project role assigned');

    // Duplicate team member should be blocked with 409
    let duplicateBlocked = false;
    try {
      await ProjectsService.addTeamMember(
        projectId2,
        { employeeId: memberEmp.id },
        superAdminActor
      );
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 409) {
        duplicateBlocked = true;
      }
    }
    assert(duplicateBlocked, 'Duplicate team member addition blocked with 409 Conflict');

    // Get team members list
    const teamList = await ProjectsService.getTeamMembers(projectId2);
    assert(teamList.length === 1, 'Team member list contains 1 member');
    assert(teamList[0].employee.firstName === 'Barbara', 'Team member details populated');

    // Remove team member
    const removeResult = await ProjectsService.removeTeamMember(
      projectId2,
      memberEmp.id,
      superAdminActor
    );
    assert(removeResult.success === true, 'Team member removed from project');

    // Verify Employee still exists in DB
    const checkEmp = await prisma.employee.findUnique({ where: { id: memberEmp.id } });
    assert(checkEmp !== null, 'Removing team member did NOT delete the employee record');

    // ----------------------------------------------------
    // Test 9: Safe Archive vs Clean Deletion
    // ----------------------------------------------------
    console.log('\n--- Test Suite 9: Safe Archive (Historical Data) vs Clean Deletion ---');
    // Create a temporary task on project1 to test archive behavior
    const task = await prisma.task.create({
      data: {
        taskCode: `TASK-T${Date.now().toString().slice(-4)}`,
        title: 'Calibrate LIDAR sensors',
        projectId: projectId1,
      },
    });
    taskId = task.id;

    // Attempting delete on project1 should archive it (status = CANCELLED)
    const archiveResult = await ProjectsService.deleteProject(projectId1, superAdminActor);
    assert(archiveResult.archived === true, 'Project with historical task is archived, not deleted');
    assert(archiveResult.project.status === ProjectStatus.CANCELLED, 'Archived project status is CANCELLED');

    // Clean project2 with 0 tasks should be cleanly deleted
    const deleteResult = await ProjectsService.deleteProject(projectId2, superAdminActor);
    assert(deleteResult.deleted === true, 'Clean project without historical records is deleted');
    const checkDeleted = await prisma.project.findUnique({ where: { id: projectId2 } });
    assert(checkDeleted === null, 'Project confirmed removed from database');
    projectId2 = '';
  } finally {
    // ----------------------------------------------------
    // Safe Cleanup: Remove only temporary test fixtures
    // ----------------------------------------------------
    console.log('\n--- Cleaning up temporary test fixtures ---');
    if (taskId) {
      await prisma.task.deleteMany({ where: { id: taskId } });
    }
    if (projectId1) {
      await prisma.projectMember.deleteMany({ where: { projectId: projectId1 } });
      await prisma.auditLog.deleteMany({ where: { entityId: projectId1 } });
      await prisma.project.deleteMany({ where: { id: projectId1 } });
    }
    if (projectId2) {
      await prisma.projectMember.deleteMany({ where: { projectId: projectId2 } });
      await prisma.auditLog.deleteMany({ where: { entityId: projectId2 } });
      await prisma.project.deleteMany({ where: { id: projectId2 } });
    }
    await prisma.auditLog.deleteMany({ where: { entityId: testClient.id } });
    await prisma.client.deleteMany({ where: { id: testClient.id } });
    await prisma.employee.deleteMany({ where: { id: { in: [managerEmp.id, memberEmp.id] } } });
    console.log('Cleanup completed successfully.');
  }

  console.log('\n====================================================');
  console.log(` Project Verification Summary: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('Projects verification failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
