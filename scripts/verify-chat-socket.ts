import http from 'http';
import { io as Client, Socket } from 'socket.io-client';
import { app } from '../src/app';
import prisma from '../src/config/database';
import { initSocketIO } from '../src/socket';
import { signAccessToken } from '../src/utils/jwt';
import { ChatService } from '../src/modules/chat/chat.service';
import { ChannelType } from '@prisma/client';
import { AuthenticatedUser } from '../src/types/auth.types';
import { PermissionString } from '../src/types/permissions.types';

async function runSocketVerification() {
  console.log('====================================================');
  console.log(' Starting OfficeCRM Step 12: Socket.IO Verification');
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

  // 1. Create HTTP test server on an ephemeral port
  const server = http.createServer(app);
  const io = initSocketIO(server);

  const TEST_PORT = 5055;
  await new Promise<void>((resolve) => {
    server.listen(TEST_PORT, () => resolve());
  });

  const SERVER_URL = `http://localhost:${TEST_PORT}`;

  // 2. Setup test users in DB
  const testRole = await prisma.role.findFirst({ where: { isSuperAdmin: false } });
  if (!testRole) throw new Error('Role not found');
  const dept = (await prisma.department.findFirst())?.id || 'dummy-dept';

  const employeeA = await prisma.employee.create({
    data: {
      firstName: 'SocketAlice',
      lastName: 'Staff',
      email: `socket_alice_${Date.now()}@officecrm.internal`,
      jobTitle: 'Developer',
      departmentId: dept,
      employeeCode: `SKT-A-${Date.now().toString().slice(-4)}`,
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
      firstName: 'SocketBob',
      lastName: 'Staff',
      email: `socket_bob_${Date.now()}@officecrm.internal`,
      jobTitle: 'Designer',
      departmentId: dept,
      employeeCode: `SKT-B-${Date.now().toString().slice(-4)}`,
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

  // Suspended user
  const suspendedUser = await prisma.user.create({
    data: {
      email: `suspended_${Date.now()}@officecrm.internal`,
      passwordHash: 'dummy_hash',
      roleId: testRole.id,
      accountStatus: 'SUSPENDED',
    },
  });

  // Generate tokens
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

  const tokenSuspended = signAccessToken({
    userId: suspendedUser.id,
    email: suspendedUser.email,
    roleId: suspendedUser.roleId,
    isSuperAdmin: false,
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
      permissions: ['chat.view', 'chat.send_messages', 'chat.create_channels', 'chat.manage_channels'] as any,
    },
    permissions: new Set<PermissionString>([
      'chat.view' as any,
      'chat.send_messages' as any,
      'chat.create_channels' as any,
      'chat.manage_channels' as any,
    ]),
  };

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Reject unauthenticated & invalid token connections
    // ------------------------------------------------------------------------
    console.log('\n--- 1. Testing Socket Authentication Security ---');

    let invalidAuthRejected = false;
    await new Promise<void>((resolve) => {
      const socketInvalid = Client(SERVER_URL, {
        auth: { token: 'invalid.jwt.token' },
        transports: ['websocket'],
        reconnection: false,
      });
      socketInvalid.on('connect_error', (err) => {
        invalidAuthRejected = err.message.includes('Authentication error');
        socketInvalid.close();
        resolve();
      });
    });
    assert(invalidAuthRejected, 'Connection with invalid JWT token rejected');

    let suspendedRejected = false;
    await new Promise<void>((resolve) => {
      const socketSuspended = Client(SERVER_URL, {
        auth: { token: tokenSuspended },
        transports: ['websocket'],
        reconnection: false,
      });
      socketSuspended.on('connect_error', (err) => {
        suspendedRejected = err.message.includes('Authentication error');
        socketSuspended.close();
        resolve();
      });
    });
    assert(suspendedRejected, 'Connection from SUSPENDED user account rejected');

    // ------------------------------------------------------------------------
    // TEST 2: Valid connection succeeds & Presence tracking
    // ------------------------------------------------------------------------
    console.log('\n--- 2. Testing Valid Connection & Presence ---');

    const socketAlice: Socket = Client(SERVER_URL, {
      auth: { token: tokenAlice },
      transports: ['websocket'],
      reconnection: false,
    });

    await new Promise<void>((resolve) => {
      socketAlice.on('connect', () => {
        resolve();
      });
    });
    assert(socketAlice.connected, 'Valid JWT connection for Alice succeeded');

    const socketBob: Socket = Client(SERVER_URL, {
      auth: { token: tokenBob },
      transports: ['websocket'],
      reconnection: false,
    });

    await new Promise<void>((resolve) => {
      socketBob.on('connect', () => {
        resolve();
      });
    });
    assert(socketBob.connected, 'Valid JWT connection for Bob succeeded');

    // ------------------------------------------------------------------------
    // TEST 3: Room Authorization & Real-Time Messaging
    // ------------------------------------------------------------------------
    console.log('\n--- 3. Testing Room Authorization & Real-Time Events ---');

    // Create a private channel for Alice only initially
    const channel = await ChatService.createChannel(
      {
        name: 'Secret Socket Channel',
        description: 'Testing room isolation',
        type: ChannelType.GROUP,
      },
      actorAlice
    );

    // Bob tries to join without being a member -> should fail
    let bobJoinBlocked = false;
    await new Promise<void>((resolve) => {
      socketBob.emit('chat:conversation:join', { conversationId: channel.id }, (response: any) => {
        if (response?.status === 'error') {
          bobJoinBlocked = true;
        }
        resolve();
      });
    });
    assert(bobJoinBlocked, 'Unauthorized user join to channel room blocked');

    // Alice joins authorized room
    let aliceJoined = false;
    await new Promise<void>((resolve) => {
      socketAlice.emit('chat:conversation:join', { conversationId: channel.id }, (response: any) => {
        aliceJoined = response?.status === 'ok';
        resolve();
      });
    });
    assert(aliceJoined, 'Authorized channel creator successfully joins room');

    // Add Bob to the channel
    await ChatService.addChannelMember(channel.id, staffUserB.id, 'MEMBER', actorAlice);

    // Now Bob joins room
    let bobJoined = false;
    await new Promise<void>((resolve) => {
      socketBob.emit('chat:conversation:join', { conversationId: channel.id }, (response: any) => {
        bobJoined = response?.status === 'ok';
        resolve();
      });
    });
    assert(bobJoined, 'Bob joins room after being added as member');

    // Test real-time message sending and delivery
    let bobReceivedMessage: any = null;
    socketBob.on('chat:message:new', (payload) => {
      bobReceivedMessage = payload;
    });

    await new Promise<void>((resolve) => {
      socketAlice.emit(
        'chat:message:send',
        {
          conversationId: channel.id,
          content: 'Realtime Socket.IO test message!',
        },
        (res: any) => {
          assert(res.status === 'ok', 'Message send via socket acknowledged');
          setTimeout(resolve, 300);
        }
      );
    });

    assert(
      bobReceivedMessage !== null &&
      bobReceivedMessage.conversationId === channel.id &&
      bobReceivedMessage.message.content === 'Realtime Socket.IO test message!',
      'Bob received real-time chat:message:new event in authorized room'
    );

    // ------------------------------------------------------------------------
    // TEST 4: Typing Indicator Events
    // ------------------------------------------------------------------------
    console.log('\n--- 4. Testing Typing Indicator Events ---');
    let typingStatusReceived: any = null;
    socketBob.on('chat:typing:status', (payload) => {
      typingStatusReceived = payload;
    });

    socketAlice.emit('chat:typing:start', { conversationId: channel.id });
    await new Promise<void>((resolve) => setTimeout(resolve, 200));

    assert(
      typingStatusReceived !== null &&
      typingStatusReceived.conversationId === channel.id &&
      typingStatusReceived.isTyping === true,
      'Bob received chat:typing:status from Alice'
    );

    // ------------------------------------------------------------------------
    // TEST 5: Real-time Read State Event
    // ------------------------------------------------------------------------
    console.log('\n--- 5. Testing Read State Socket Event ---');
    let readReceiptReceived: any = null;
    socketAlice.on('chat:read:updated', (payload) => {
      readReceiptReceived = payload;
    });

    await new Promise<void>((resolve) => {
      socketBob.emit('chat:read', { conversationId: channel.id }, (res: any) => {
        assert(res.status === 'ok', 'Bob marked conversation as read via socket');
        setTimeout(resolve, 300);
      });
    });

    assert(
      readReceiptReceived !== null &&
      readReceiptReceived.conversationId === channel.id &&
      readReceiptReceived.userId === staffUserB.id,
      'Alice received chat:read:updated receipt for Bob'
    );

    // ------------------------------------------------------------------------
    // TEST 6: Disconnect and cleanup
    // ------------------------------------------------------------------------
    console.log('\n--- 6. Testing Disconnect & Presence Cleanup ---');
    socketAlice.close();
    socketBob.close();
    assert(!socketAlice.connected && !socketBob.connected, 'Sockets disconnected cleanly');

    console.log('\n====================================================');
    console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    // Close server
    await new Promise<void>((resolve) => server.close(() => resolve()));

    // Cleanup DB fixtures
    await prisma.chatMessage.deleteMany({
      where: {
        OR: [{ senderId: staffUserA.id }, { senderId: staffUserB.id }],
      },
    });
    await prisma.chatChannel.deleteMany({
      where: { createdById: staffUserA.id },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [staffUserA.id, staffUserB.id, suspendedUser.id] } },
    });
    await prisma.employee.deleteMany({
      where: { id: { in: [employeeA.id, employeeB.id] } },
    });
  }
}

runSocketVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal Socket test error:', err);
    process.exit(1);
  });
