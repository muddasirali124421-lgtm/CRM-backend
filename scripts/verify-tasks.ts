import { PriorityLevel, TaskStatus } from '@prisma/client';
import prisma from '../src/config/database';
import { ClientsService } from '../src/modules/clients/clients.service';
import { ProjectsService } from '../src/modules/projects/projects.service';
import { TasksService } from '../src/modules/tasks/tasks.service';
import { AuthenticatedUser } from '../src/types/auth.types';
import { PermissionString } from '../src/types/permissions.types';
import { AppError } from '../src/utils/api-response';

async function main() {
  console.log('====================================================');
  console.log(' Starting OfficeCRM Tasks & Kanban Management Tests');
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

  // Setup test client
  const testClient = await ClientsService.createClient(
    {
      name: 'Omni Consumer Products',
      company: 'OCP Detroit',
      email: `test.tasks.client.${Date.now()}@ocp.example.com`,
    },
    superAdminActor
  );

  // Setup test employees
  const employeeA = await prisma.employee.create({
    data: {
      employeeCode: `EMP-TA${Date.now().toString().slice(-4)}`,
      firstName: 'Alex',
      lastName: 'Murphy',
      email: `alex.murphy.${Date.now()}@officecrm.internal`,
      jobTitle: 'Senior Officer',
      employmentStatus: 'ACTIVE',
      joiningDate: new Date(),
    },
  });

  const employeeB = await prisma.employee.create({
    data: {
      employeeCode: `EMP-TB${Date.now().toString().slice(-4)}`,
      firstName: 'Anne',
      lastName: 'Lewis',
      email: `anne.lewis.${Date.now()}@officecrm.internal`,
      jobTitle: 'Tactical Specialist',
      employmentStatus: 'ACTIVE',
      joiningDate: new Date(),
    },
  });

  // Non-member employee
  const nonMemberEmp = await prisma.employee.create({
    data: {
      employeeCode: `EMP-NM${Date.now().toString().slice(-4)}`,
      firstName: 'Dick',
      lastName: 'Jones',
      email: `dick.jones.${Date.now()}@officecrm.internal`,
      jobTitle: 'VP Executive',
      employmentStatus: 'ACTIVE',
      joiningDate: new Date(),
    },
  });

  // Inactive employee
  const inactiveEmp = await prisma.employee.create({
    data: {
      employeeCode: `EMP-IN${Date.now().toString().slice(-4)}`,
      firstName: 'Clarence',
      lastName: 'Boddicker',
      email: `clarence.${Date.now()}@officecrm.internal`,
      jobTitle: 'Contractor',
      employmentStatus: 'INACTIVE',
      joiningDate: new Date(),
    },
  });

  // Setup test project with employeeA and employeeB as members
  const testProject = await ProjectsService.createProject(
    {
      name: 'Delta City Development Project',
      clientId: testClient.id,
      managerId: employeeA.id,
      memberIds: [employeeB.id],
    },
    superAdminActor
  );

  let createdTaskId1 = '';
  let createdTaskId2 = '';
  let createdSubtaskId = '';

  try {
    // ----------------------------------------------------
    // Test 1: Collision-safe task code generation
    // ----------------------------------------------------
    console.log('\n--- 1. Task Code Generation ---');
    const code1 = await TasksService.generateNextTaskCode();
    assert(/^TASK-\d{4}$/.test(code1), `Generated task code '${code1}' matches TASK-XXXX pattern`);

    // ----------------------------------------------------
    // Test 2: Task Creation with Project & Client Derivation
    // ----------------------------------------------------
    console.log('\n--- 2. Create Task & Client Derivation ---');
    const pastDueDate = new Date(Date.now() - 3600 * 24 * 1000); // 1 day in the past

    const task1 = await TasksService.createTask(
      {
        title: 'Construct Sector 1 Infrastructure',
        description: 'Initial civil engineering foundation for Delta City',
        projectId: testProject.id,
        priority: PriorityLevel.HIGH,
        dueDate: pastDueDate,
        assigneeIds: [employeeA.id, employeeB.id],
      },
      superAdminActor
    );
    createdTaskId1 = task1.id;

    assert(task1.title === 'Construct Sector 1 Infrastructure', 'Task title created correctly');
    assert(task1.projectId === testProject.id, 'Task projectId linked correctly');
    assert(task1.clientId === testClient.id, 'Task clientId automatically derived from project.clientId');
    assert(task1.assignees.length === 2, 'Task created with 2 assignees');
    assert(task1.isOverdue === true, 'Past due date task with status TODO is computed as overdue');

    // ----------------------------------------------------
    // Test 3: Conflicting Client ID Rejection
    // ----------------------------------------------------
    console.log('\n--- 3. Client Validation ---');
    let conflictRejected = false;
    try {
      await TasksService.createTask(
        {
          title: 'Invalid Client Task',
          projectId: testProject.id,
          clientId: '00000000-0000-0000-0000-000000000000',
        },
        superAdminActor
      );
    } catch (err: any) {
      if (err instanceof AppError && err.statusCode === 400) {
        conflictRejected = true;
      }
    }
    assert(conflictRejected, 'Conflicting clientId mismatch with project is rejected with 400');

    // ----------------------------------------------------
    // Test 4: Assignee Validation (Active & Project Membership)
    // ----------------------------------------------------
    console.log('\n--- 4. Assignee Constraints & Validation ---');
    let nonMemberRejected = false;
    try {
      await TasksService.createTask(
        {
          title: 'Non Member Assignment Task',
          projectId: testProject.id,
          assigneeIds: [nonMemberEmp.id],
        },
        superAdminActor
      );
    } catch (err: any) {
      if (err instanceof AppError && err.statusCode === 400 && err.message.includes('not a member of project')) {
        nonMemberRejected = true;
      }
    }
    assert(nonMemberRejected, 'Assigning employee who is not a project member is rejected with 400');

    let inactiveRejected = false;
    try {
      await TasksService.createTask(
        {
          title: 'Inactive Employee Task',
          projectId: testProject.id,
          assigneeIds: [inactiveEmp.id],
        },
        superAdminActor
      );
    } catch (err: any) {
      if (err instanceof AppError && err.statusCode === 400 && err.message.includes('not ACTIVE')) {
        inactiveRejected = true;
      }
    }
    assert(inactiveRejected, 'Assigning inactive employee is rejected with 400');

    // Duplicate assignment check on existing task
    let duplicateRejected = false;
    try {
      await TasksService.addAssignee(createdTaskId1, { employeeId: employeeA.id }, superAdminActor);
    } catch (err: any) {
      if (err instanceof AppError && err.statusCode === 409) {
        duplicateRejected = true;
      }
    }
    assert(duplicateRejected, 'Duplicate assignee addition on existing task rejected with 409 Conflict');

    // ----------------------------------------------------
    // Test 5: Task Details API
    // ----------------------------------------------------
    console.log('\n--- 5. Task Details Payload ---');
    const details = await TasksService.getTaskById(createdTaskId1);
    assert(details.id === createdTaskId1, 'Task details retrieves correct task ID');
    assert(details.project.id === testProject.id, 'Task details includes project summary');
    assert(details.client?.id === testClient.id, 'Task details includes client summary');
    assert(Array.isArray(details.assignees), 'Task details includes assignees array');
    assert(Array.isArray(details.checklist), 'Task details includes checklist array');
    assert(Array.isArray(details.subtasks), 'Task details includes subtasks array');
    assert(Array.isArray(details.comments), 'Task details includes comments array');
    assert(Array.isArray(details.activities), 'Task details includes activity history array');
    assert(Array.isArray(details.attachments), 'Task details includes attachments metadata array');

    // ----------------------------------------------------
    // Test 6: List View & Filters
    // ----------------------------------------------------
    console.log('\n--- 6. List Tasks Filtering & Pagination ---');
    const listResult: any = await TasksService.listTasks({
      projectId: testProject.id,
      page: 1,
      limit: 10,
    });
    assert(listResult.items.length >= 1, 'List tasks returns items for test project');
    assert(listResult.pagination.total >= 1, 'Pagination metadata calculated correctly');

    const overdueList: any = await TasksService.listTasks({
      projectId: testProject.id,
      overdue: true,
    });
    assert(overdueList.items.some((t: any) => t.id === createdTaskId1), 'Overdue filter finds past due task');

    // ----------------------------------------------------
    // Test 7: Kanban View Grouping
    // ----------------------------------------------------
    console.log('\n--- 7. Kanban Grouping ---');
    const kanbanResult: any = await TasksService.listTasks({
      projectId: testProject.id,
      view: 'kanban',
    });
    assert(kanbanResult.view === 'kanban', 'Kanban response returns view: kanban');
    assert(Array.isArray(kanbanResult.columns[TaskStatus.TODO]), 'Kanban contains TODO column');
    assert(Array.isArray(kanbanResult.columns[TaskStatus.IN_PROGRESS]), 'Kanban contains IN_PROGRESS column');
    assert(Array.isArray(kanbanResult.columns[TaskStatus.QA]), 'Kanban contains QA column');
    assert(Array.isArray(kanbanResult.columns[TaskStatus.REVISION]), 'Kanban contains REVISION column');
    assert(Array.isArray(kanbanResult.columns[TaskStatus.COMPLETED]), 'Kanban contains COMPLETED column');

    // ----------------------------------------------------
    // Test 8: Update Task Fields
    // ----------------------------------------------------
    console.log('\n--- 8. Update Task Fields ---');
    const updatedTask = await TasksService.updateTask(
      createdTaskId1,
      {
        title: 'Construct Sector 1 Infrastructure - Revised Scope',
        priority: PriorityLevel.URGENT,
      },
      superAdminActor
    );
    assert(
      updatedTask.title === 'Construct Sector 1 Infrastructure - Revised Scope',
      'Title updated successfully'
    );
    assert(updatedTask.priority === PriorityLevel.URGENT, 'Priority updated to URGENT');

    // ----------------------------------------------------
    // Test 9: Kanban Status Movement & Idempotency
    // ----------------------------------------------------
    console.log('\n--- 9. Kanban Status Movement & Idempotency ---');
    // Move to IN_PROGRESS
    const moveInProgress = await TasksService.updateTaskStatus(
      createdTaskId1,
      TaskStatus.IN_PROGRESS,
      superAdminActor
    );
    assert(moveInProgress.status === TaskStatus.IN_PROGRESS, 'Status moved to IN_PROGRESS');

    // Idempotent move: moving to IN_PROGRESS again returns current task without error
    const moveIdempotent = await TasksService.updateTaskStatus(
      createdTaskId1,
      TaskStatus.IN_PROGRESS,
      superAdminActor
    );
    assert(moveIdempotent.status === TaskStatus.IN_PROGRESS, 'Idempotent status change succeeds');

    // Move to QA
    const moveQA = await TasksService.updateTaskStatus(
      createdTaskId1,
      TaskStatus.QA,
      superAdminActor
    );
    assert(moveQA.status === TaskStatus.QA, 'Status moved to QA');

    // Move QA -> COMPLETED (Super admin has implicit approve bypass)
    const moveCompleted = await TasksService.updateTaskStatus(
      createdTaskId1,
      TaskStatus.COMPLETED,
      superAdminActor
    );
    assert(moveCompleted.status === TaskStatus.COMPLETED, 'Status moved to COMPLETED');
    assert(moveCompleted.completedAt !== null, 'completedAt timestamp set on completion');
    assert(moveCompleted.isOverdue === false, 'Completed task is not overdue even if dueDate in past');

    // Move COMPLETED -> REVISION (Reopening)
    const moveReopen = await TasksService.updateTaskStatus(
      createdTaskId1,
      TaskStatus.REVISION,
      superAdminActor
    );
    assert(moveReopen.status === TaskStatus.REVISION, 'Status moved to REVISION');
    assert(moveReopen.completedAt === null, 'completedAt cleared on reopening');

    // ----------------------------------------------------
    // Test 10: Assignee Management
    // ----------------------------------------------------
    console.log('\n--- 10. Assignees API ---');
    const removeRes = await TasksService.removeAssignee(createdTaskId1, employeeB.id, superAdminActor);
    assert(removeRes.message.includes('successfully'), 'Assignee removed successfully');

    const remainingAssignees = await TasksService.getAssignees(createdTaskId1);
    assert(
      remainingAssignees.length === 1 && remainingAssignees[0].employeeId === employeeA.id,
      'One assignee remaining after deletion'
    );

    const reAddAssignee = await TasksService.addAssignee(
      createdTaskId1,
      { employeeId: employeeB.id },
      superAdminActor
    );
    assert(reAddAssignee.employeeId === employeeB.id, 'Assignee added back successfully');

    // ----------------------------------------------------
    // Test 11: Checklist Management
    // ----------------------------------------------------
    console.log('\n--- 11. Checklist API ---');
    const item1 = await TasksService.addChecklistItem(
      createdTaskId1,
      { title: 'Dig trench foundations', isCompleted: false },
      superAdminActor
    );
    const item2 = await TasksService.addChecklistItem(
      createdTaskId1,
      { title: 'Pour reinforced concrete', isCompleted: false },
      superAdminActor
    );
    assert(item1.title === 'Dig trench foundations', 'Checklist item 1 added');
    assert(item2.position > item1.position, 'Checklist item 2 gets sequential position');

    const updatedItem1 = await TasksService.updateChecklistItem(
      createdTaskId1,
      item1.id,
      { isCompleted: true },
      superAdminActor
    );
    assert(updatedItem1.isCompleted === true, 'Checklist item marked completed');

    const reorderRes = await TasksService.reorderChecklist(
      createdTaskId1,
      { itemIds: [item2.id, item1.id] },
      superAdminActor
    );
    assert(reorderRes[0].id === item2.id && reorderRes[0].position === 0, 'Checklist reordered');

    const deleteItemRes = await TasksService.deleteChecklistItem(createdTaskId1, item2.id, superAdminActor);
    assert(deleteItemRes.message.includes('successfully'), 'Checklist item deleted');

    // ----------------------------------------------------
    // Test 12: Subtasks (Real Task self-relation)
    // ----------------------------------------------------
    console.log('\n--- 12. Subtasks (Self-relation) ---');
    const subtask = await TasksService.createSubtask(
      createdTaskId1,
      {
        title: 'Order cement trucks',
        priority: PriorityLevel.MEDIUM,
        assigneeIds: [employeeA.id],
      },
      superAdminActor
    );
    createdSubtaskId = subtask.id;
    assert(subtask.title === 'Order cement trucks', 'Subtask created with title');
    assert(/^TASK-\d{4}$/.test(subtask.taskCode), 'Subtask receives its own unique TASK-XXXX code');

    const subtasksList = await TasksService.getSubtasks(createdTaskId1);
    assert(subtasksList.length === 1 && subtasksList[0].id === createdSubtaskId, 'Subtasks listed for parent');

    // ----------------------------------------------------
    // Test 13: Comments & Threaded Replies
    // ----------------------------------------------------
    console.log('\n--- 13. Comments & Threaded Replies ---');
    const comment1 = await TasksService.createComment(
      createdTaskId1,
      { content: 'Site inspection completed yesterday.' },
      superAdminActor
    );
    assert(comment1.content === 'Site inspection completed yesterday.', 'Top-level comment created');

    const reply1 = await TasksService.createComment(
      createdTaskId1,
      { content: 'Great, proceeding with excavation.', parentId: comment1.id },
      superAdminActor
    );
    assert(reply1.parentId === comment1.id, 'Comment reply attached to parent comment');

    const commentsThread = await TasksService.getComments(createdTaskId1);
    assert(
      commentsThread.length === 1 && commentsThread[0].replies?.length === 1,
      'Comments thread returns top-level comment with nested reply'
    );

    const updatedComment = await TasksService.updateComment(
      createdTaskId1,
      comment1.id,
      { content: 'Site inspection completed yesterday with zero infractions.' },
      superAdminActor
    );
    assert(
      updatedComment.content === 'Site inspection completed yesterday with zero infractions.',
      'Comment content updated by author'
    );

    // ----------------------------------------------------
    // Test 14: Activity Timeline History
    // ----------------------------------------------------
    console.log('\n--- 14. Activity Timeline ---');
    const activities = await TasksService.getActivity(createdTaskId1);
    assert(activities.length >= 5, `Timeline recorded ${activities.length} activities`);
    const actionTypes = activities.map((a) => a.action);
    assert(actionTypes.includes('TASK_CREATED'), 'Timeline includes TASK_CREATED');
    assert(actionTypes.includes('TASK_PRIORITY_CHANGED'), 'Timeline includes TASK_PRIORITY_CHANGED');
    assert(actionTypes.includes('TASK_STATUS_CHANGED'), 'Timeline includes TASK_STATUS_CHANGED');
    assert(actionTypes.includes('TASK_COMPLETED'), 'Timeline includes TASK_COMPLETED');
    assert(actionTypes.includes('TASK_REOPENED'), 'Timeline includes TASK_REOPENED');
    assert(actionTypes.includes('TASK_COMMENT_ADDED'), 'Timeline includes TASK_COMMENT_ADDED');

    // ----------------------------------------------------
    // Test 15: Safe Deletion & Audit Log
    // ----------------------------------------------------
    console.log('\n--- 15. Task Deletion & Audit Trail ---');
    // Create second task to delete
    const task2 = await TasksService.createTask(
      {
        title: 'Temporary Task For Deletion',
        projectId: testProject.id,
      },
      superAdminActor
    );
    createdTaskId2 = task2.id;

    const deleteRes = await TasksService.deleteTask(createdTaskId2, superAdminActor);
    assert(deleteRes.message.includes('deleted successfully'), 'Task deleted successfully');

    let fetchDeletedFailed = false;
    try {
      await TasksService.getTaskById(createdTaskId2);
    } catch (err: any) {
      if (err instanceof AppError && err.statusCode === 404) {
        fetchDeletedFailed = true;
      }
    }
    assert(fetchDeletedFailed, 'Fetching deleted task returns 404');

    const auditDeleted = await prisma.auditLog.findFirst({
      where: { entityType: 'TASK', entityId: createdTaskId2, action: 'TASK_DELETED' },
    });
    assert(auditDeleted !== null, 'Deletion preserved in AuditLog');
  } finally {
    // ----------------------------------------------------
    // Safe Cleanup: Remove temporary test fixtures only
    // ----------------------------------------------------
    console.log('\n--- Cleaning up temporary test fixtures ---');
    if (createdSubtaskId) {
      await prisma.taskAssignee.deleteMany({ where: { taskId: createdSubtaskId } });
      await prisma.taskActivity.deleteMany({ where: { taskId: createdSubtaskId } });
      await prisma.task.deleteMany({ where: { id: createdSubtaskId } });
    }
    if (createdTaskId1) {
      await prisma.taskComment.deleteMany({ where: { taskId: createdTaskId1 } });
      await prisma.taskChecklistItem.deleteMany({ where: { taskId: createdTaskId1 } });
      await prisma.taskAssignee.deleteMany({ where: { taskId: createdTaskId1 } });
      await prisma.taskActivity.deleteMany({ where: { taskId: createdTaskId1 } });
      await prisma.task.deleteMany({ where: { id: createdTaskId1 } });
    }
    if (createdTaskId2) {
      await prisma.task.deleteMany({ where: { id: createdTaskId2 } });
    }

    if (testProject.id) {
      await prisma.projectMember.deleteMany({ where: { projectId: testProject.id } });
      await prisma.auditLog.deleteMany({ where: { entityId: testProject.id } });
      await prisma.project.deleteMany({ where: { id: testProject.id } });
    }

    await prisma.auditLog.deleteMany({ where: { entityId: testClient.id } });
    await prisma.client.deleteMany({ where: { id: testClient.id } });
    await prisma.employee.deleteMany({
      where: { id: { in: [employeeA.id, employeeB.id, nonMemberEmp.id, inactiveEmp.id] } },
    });

    console.log('Cleanup completed successfully.');
  }

  console.log('\n====================================================');
  console.log(` Tasks Verification Summary: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('Tasks verification failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
