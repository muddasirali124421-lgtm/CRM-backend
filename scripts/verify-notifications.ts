import http from 'http';
import { io as Client, Socket } from 'socket.io-client';
import { app } from '../src/app';
import prisma from '../src/config/database';
import { initSocketIO } from '../src/socket';
import { signAccessToken } from '../src/utils/jwt';
import { NotificationService } from '../src/modules/notifications/notifications.service';
import { TasksService } from '../src/modules/tasks/tasks.service';
import { ProjectsService } from '../src/modules/projects/projects.service';
import { ClientsService } from '../src/modules/clients/clients.service';
import { ChatService } from '../src/modules/chat/chat.service';
import { AuthenticatedUser } from '../src/types/auth.types';
import { PermissionString } from '../src/types/permissions.types';
import { NotificationCategory, TaskStatus } from '@prisma/client';

async function runNotificationsVerification() {
  console.log('====================================================');
  console.log(' Starting OfficeCRM Step 13: Notifications Verification');
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

  // 1. Create HTTP test server on port 5066
  const server = http.createServer(app);
  initSocketIO(server);

  const TEST_PORT = 5066;
  await new Promise<void>((resolve) => {
    server.listen(TEST_PORT, () => resolve());
  });

  const SERVER_URL = `http://localhost:${TEST_PORT}`;

  // 2. Setup Super Admin actor
  const superAdminUser = await prisma.user.findFirst({
    where: { role: { isSuperAdmin: true }, accountStatus: 'ACTIVE' },
    include: { role: true, employee: true },
  });

  if (!superAdminUser) {
    console.error('Error: Super Admin user not found.');
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

  // 3. Setup two staff test users (Alice and Bob)
  const testRole = await prisma.role.findFirst({ where: { isSuperAdmin: false } });
  if (!testRole) throw new Error('Role not found');
  const dept = (await prisma.department.findFirst())?.id || 'dummy-dept';

  const employeeA = await prisma.employee.create({
    data: {
      firstName: 'AliceNotif',
      lastName: 'Staff',
      email: `notif_alice_${Date.now()}@officecrm.internal`,
      jobTitle: 'Developer',
      departmentId: dept,
      employeeCode: `NTF-A-${Date.now().toString().slice(-4)}`,
      joiningDate: new Date(),
    },
  });

  const staffUserA = await prisma.user.create({
    data: {
      email: employeeA.email,
      passwordHash: 'dummy_hash',
      roleId: testRole.id,
      employeeId: employeeA.id,
      accountStatus: 'ACTIVE',
    },
    include: { employee: true, role: true },
  });

  const employeeB = await prisma.employee.create({
    data: {
      firstName: 'BobNotif',
      lastName: 'Staff',
      email: `notif_bob_${Date.now()}@officecrm.internal`,
      jobTitle: 'Designer',
      departmentId: dept,
      employeeCode: `NTF-B-${Date.now().toString().slice(-4)}`,
      joiningDate: new Date(),
    },
  });

  const staffUserB = await prisma.user.create({
    data: {
      email: employeeB.email,
      passwordHash: 'dummy_hash',
      roleId: testRole.id,
      employeeId: employeeB.id,
      accountStatus: 'ACTIVE',
    },
    include: { employee: true, role: true },
  });

  const actorAlice: AuthenticatedUser = {
    userId: staffUserA.id,
    email: staffUserA.email,
    isSuperAdmin: false,
    role: {
      id: staffUserA.role.id,
      name: staffUserA.role.name,
      isSuperAdmin: false,
      isSystemRole: false,
      permissions: [
        'tasks.view',
        'tasks.create',
        'tasks.edit',
        'tasks.assign',
        'projects.view',
        'projects.create',
        'projects.edit',
        'projects.assign_team',
        'chat.view',
        'chat.send_messages',
      ] as any,
    },
    employeeId: staffUserA.employeeId ?? undefined,
    permissions: new Set<PermissionString>([
      'tasks.view' as any,
      'tasks.create' as any,
      'tasks.edit' as any,
      'tasks.assign' as any,
      'projects.view' as any,
      'projects.create' as any,
      'projects.edit' as any,
      'projects.assign_team' as any,
      'chat.view' as any,
      'chat.send_messages' as any,
    ]),
  };

  const actorBob: AuthenticatedUser = {
    userId: staffUserB.id,
    email: staffUserB.email,
    isSuperAdmin: false,
    role: {
      id: staffUserB.role.id,
      name: staffUserB.role.name,
      isSuperAdmin: false,
      isSystemRole: false,
      permissions: ['tasks.view', 'projects.view', 'chat.view', 'chat.send_messages'] as any,
    },
    employeeId: staffUserB.employeeId ?? undefined,
    permissions: new Set<PermissionString>([
      'tasks.view' as any,
      'projects.view' as any,
      'chat.view' as any,
      'chat.send_messages' as any,
    ]),
  };

  const tokenAlice = signAccessToken({
    userId: staffUserA.id,
    email: staffUserA.email,
    roleId: staffUserA.roleId,
    isSuperAdmin: false,
    employeeId: staffUserA.employeeId ?? undefined,
  });

  const tokenBob = signAccessToken({
    userId: staffUserB.id,
    email: staffUserB.email,
    roleId: staffUserB.roleId,
    isSuperAdmin: false,
    employeeId: staffUserB.employeeId ?? undefined,
  });

  let socketAlice: Socket | null = null;
  let socketBob: Socket | null = null;

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Connect sockets for Alice and Bob
    // ------------------------------------------------------------------------
    console.log('\n--- 1. Testing Socket.IO Connection to User Rooms ---');
    socketAlice = Client(SERVER_URL, {
      auth: { token: tokenAlice },
      transports: ['websocket'],
      reconnection: false,
    });
    socketBob = Client(SERVER_URL, {
      auth: { token: tokenBob },
      transports: ['websocket'],
      reconnection: false,
    });

    await Promise.all([
      new Promise<void>((res) => socketAlice!.on('connect', () => res())),
      new Promise<void>((res) => socketBob!.on('connect', () => res())),
    ]);

    assert(socketAlice.connected, 'Alice socket connected to user room');
    assert(socketBob.connected, 'Bob socket connected to user room');

    // ------------------------------------------------------------------------
    // TEST 2: Task Assignment Notification & Real-Time Delivery
    // ------------------------------------------------------------------------
    console.log('\n--- 2. Testing Task Assignment Notification ---');
    let bobReceivedNotif: any = null;
    socketBob.on('notification:new', (payload) => {
      bobReceivedNotif = payload.notification;
    });

    // Create a client first
    const testClient = await ClientsService.createClient(
      {
        name: 'Notification Test Client',
        company: 'Notification Corp',
        email: `client_${Date.now()}@notiftest.example.com`,
      },
      superAdminActor
    );

    // Create a project first
    const testProject = await ProjectsService.createProject(
      {
        name: 'Notification Test Project',
        description: 'Testing task assignment notifications',
        clientId: testClient.id,
      },
      superAdminActor
    );

    // Add Bob to project team so he is an eligible assignee
    await ProjectsService.addTeamMember(testProject.id, { employeeId: employeeB.id }, superAdminActor);

    // Alice creates task assigned to Bob
    const task = await TasksService.createTask(
      {
        title: 'Review System Architecture',
        projectId: testProject.id,
        assigneeIds: [employeeB.id],
      },
      actorAlice
    );

    await new Promise<void>((resolve) => setTimeout(resolve, 500));

    assert(bobReceivedNotif !== null, 'Bob received real-time notification on socket');
    assert(bobReceivedNotif?.type === 'TASK_ASSIGNED', 'Notification type is TASK_ASSIGNED');
    assert(bobReceivedNotif?.userId === staffUserB.id, 'Notification is addressed to Bob');
    assert(bobReceivedNotif?.entityId === task.id, 'Notification references taskId');

    // Verify Bob sees this in his notification list
    const bobList = await NotificationService.listNotifications({}, actorBob);
    assert(bobList.items.length >= 1, 'Bob can retrieve his notification via listNotifications');
    assert(bobList.items[0].type === 'TASK_ASSIGNED', 'First notification in list is TASK_ASSIGNED');

    // Verify Alice cannot see Bob's notification (User isolation)
    const aliceList = await NotificationService.listNotifications({}, actorAlice);
    assert(
      !aliceList.items.some((n) => n.userId === staffUserB.id),
      'Alice notification list is isolated and does not leak Bob notifications'
    );

    // ------------------------------------------------------------------------
    // TEST 3: Read State, Mark One, Mark All, Unread Count
    // ------------------------------------------------------------------------
    console.log('\n--- 3. Testing Read State and Unread Count ---');
    const unreadCountBefore = await NotificationService.getUnreadCount(actorBob);
    assert(unreadCountBefore >= 1, `Bob has ${unreadCountBefore} unread notifications`);

    // Mark single notification read
    const markedOne = await NotificationService.markAsRead(bobList.items[0].id, actorBob);
    assert(markedOne.isRead === true, 'Notification marked as read');

    // Idempotency: marking again returns isRead === true without error
    const markedAgain = await NotificationService.markAsRead(bobList.items[0].id, actorBob);
    assert(markedAgain.isRead === true, 'Marking read is idempotent');

    // Unauthorized mark read attempt by Alice on Bob's notification
    let unauthorizedMarkFailed = false;
    try {
      await NotificationService.markAsRead(bobList.items[0].id, actorAlice);
    } catch {
      unauthorizedMarkFailed = true;
    }
    assert(unauthorizedMarkFailed, 'Unauthorized user cannot mark another user notification as read');

    // Mark all as read
    await NotificationService.markAllAsRead(actorBob);
    const unreadCountAfter = await NotificationService.getUnreadCount(actorBob);
    assert(unreadCountAfter === 0, 'Bob unread count is 0 after markAllAsRead');

    // ------------------------------------------------------------------------
    // TEST 4: Project Team Assignment & Project Manager Assignment
    // ------------------------------------------------------------------------
    console.log('\n--- 4. Testing Project Assignment Notifications ---');
    bobReceivedNotif = null;

    // Assign Bob as Project Manager
    await ProjectsService.assignManager(testProject.id, { employeeId: employeeB.id }, superAdminActor);
    await new Promise<void>((resolve) => setTimeout(resolve, 500));

    assert(
      bobReceivedNotif !== null && bobReceivedNotif.type === 'PROJECT_MANAGER_ASSIGNED',
      'Bob received PROJECT_MANAGER_ASSIGNED notification'
    );

    // ------------------------------------------------------------------------
    // TEST 5: Chat @Mention Notification
    // ------------------------------------------------------------------------
    console.log('\n--- 5. Testing Chat Mention Notification ---');
    bobReceivedNotif = null;

    // Alice creates channel and mentions Bob
    const channel = await ChatService.createChannel(
      {
        name: 'Notification Test Channel',
        memberUserIds: [staffUserB.id],
      },
      actorAlice
    );

    await ChatService.sendMessage(
      channel.id,
      {
        content: 'Hey @Bob please review notifications',
        mentionUserIds: [staffUserB.id],
      },
      actorAlice
    );

    await new Promise<void>((resolve) => setTimeout(resolve, 500));

    assert(
      bobReceivedNotif !== null && bobReceivedNotif.type === 'CHAT_MENTION',
      'Bob received CHAT_MENTION notification when mentioned in chat'
    );

    // ------------------------------------------------------------------------
    // TEST 6: Notification Preferences Enforcement
    // ------------------------------------------------------------------------
    console.log('\n--- 6. Testing Notification Preferences ---');
    // Disable CHAT in-app notifications for Bob
    await NotificationService.updatePreferences(
      {
        preferences: [
          {
            category: NotificationCategory.CHAT,
            inAppEnabled: false,
          },
        ],
      },
      actorBob
    );

    bobReceivedNotif = null;
    // Alice sends another mention
    await ChatService.sendMessage(
      channel.id,
      {
        content: 'Another mention for @Bob',
        mentionUserIds: [staffUserB.id],
      },
      actorAlice
    );

    await new Promise<void>((resolve) => setTimeout(resolve, 500));
    assert(bobReceivedNotif === null, 'Chat notification suppressed when inAppEnabled is false in user preferences');

    // ------------------------------------------------------------------------
    // TEST 7: System Notifications (Always Bypass Preferences)
    // ------------------------------------------------------------------------
    console.log('\n--- 7. Testing System Notifications ---');
    bobReceivedNotif = null;

    await NotificationService.sendSystemNotification(
      {
        recipientUserIds: [staffUserB.id],
        title: 'Security Notice',
        message: 'System scheduled maintenance at midnight.',
      },
      superAdminActor
    );

    await new Promise<void>((resolve) => setTimeout(resolve, 500));
    assert(
      bobReceivedNotif !== null && bobReceivedNotif.type === 'SYSTEM',
      'SYSTEM notification successfully delivered even with custom preferences'
    );

    // ------------------------------------------------------------------------
    // TEST 8: Reusable Due / Overdue Job Runner & Deduplication
    // ------------------------------------------------------------------------
    console.log('\n--- 8. Testing Due & Overdue Task Job Runner ---');
    // Create an overdue task for Bob
    const overdueTask = await prisma.task.create({
      data: {
        taskCode: `OD-${Date.now().toString().slice(-4)}`,
        title: 'Past Due Bugfix',
        projectId: testProject.id,
        createdById: superAdminUser.id,
        status: TaskStatus.TODO,
        dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        assignees: {
          create: { employeeId: employeeB.id },
        },
      },
    });

    // Run job
    const run1 = await NotificationService.processDueAndOverdueTasks();
    assert(run1.overdueCount >= 1, 'First run generated overdue notification');

    // Run job again immediately -> Deduplication should prevent duplicate
    const run2 = await NotificationService.processDueAndOverdueTasks();
    assert(run2.overdueCount === 0, 'Second run within 24 hours deduplicates and creates 0 duplicate notifications');

    // Cleanup overdue task
    await prisma.taskAssignee.deleteMany({ where: { taskId: overdueTask.id } });
    await prisma.task.delete({ where: { id: overdueTask.id } });

    console.log('\n====================================================');
    console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    if (socketAlice) socketAlice.close();
    if (socketBob) socketBob.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));

    // Cleanup test fixtures
    await prisma.notification.deleteMany({
      where: { userId: { in: [staffUserA.id, staffUserB.id] } },
    });
    await prisma.notificationPreference.deleteMany({
      where: { userId: { in: [staffUserA.id, staffUserB.id] } },
    });
    await prisma.chatMessage.deleteMany({
      where: { senderId: staffUserA.id },
    });
    await prisma.chatChannel.deleteMany({
      where: { createdById: staffUserA.id },
    });
    await prisma.taskAssignee.deleteMany({
      where: { employeeId: { in: [employeeA.id, employeeB.id] } },
    });
    await prisma.task.deleteMany({
      where: { createdById: staffUserA.id },
    });
    await prisma.projectMember.deleteMany({
      where: { employeeId: { in: [employeeA.id, employeeB.id] } },
    });
    await prisma.project.deleteMany({
      where: { name: 'Notification Test Project' },
    });
    await prisma.client.deleteMany({
      where: { name: 'Notification Test Client' },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [staffUserA.id, staffUserB.id] } },
    });
    await prisma.employee.deleteMany({
      where: { id: { in: [employeeA.id, employeeB.id] } },
    });
  }
}

runNotificationsVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal notification verification error:', err);
    process.exit(1);
  });
