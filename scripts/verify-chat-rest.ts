import prisma from '../src/config/database';
import { ChatService } from '../src/modules/chat/chat.service';
import { AuthenticatedUser } from '../src/types/auth.types';
import { PermissionString } from '../src/types/permissions.types';
import { ChannelType } from '@prisma/client';

async function runChatRestVerification() {
  console.log('====================================================');
  console.log(' Starting OfficeCRM Step 12: Chat REST API Verification');
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

  // 1. Fetch live Super Admin user
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

  // 2. Create two temporary test users for chat testing
  const testRole = await prisma.role.findFirst({ where: { isSuperAdmin: false } });
  if (!testRole) throw new Error('Non-admin role not found');

  const dept = (await prisma.department.findFirst())?.id || 'dummy-dept';

  const employeeA = await prisma.employee.create({
    data: {
      firstName: 'Alice',
      lastName: 'Staff',
      email: `alice_${Date.now()}@officecrm.internal`,
      jobTitle: 'Developer',
      departmentId: dept,
      employeeCode: `ALICE-${Date.now().toString().slice(-4)}`,
      joiningDate: new Date(),
    },
  });

  const staffUserA = await prisma.user.create({
    data: {
      email: employeeA.email,
      passwordHash: 'dummy_hash_test',
      roleId: testRole.id,
      employeeId: employeeA.id,
      accountStatus: 'ACTIVE',
    },
    include: { employee: true, role: true },
  });

  const employeeB = await prisma.employee.create({
    data: {
      firstName: 'Bob',
      lastName: 'Staff',
      email: `bob_${Date.now()}@officecrm.internal`,
      jobTitle: 'Designer',
      departmentId: dept,
      employeeCode: `BOB-${Date.now().toString().slice(-4)}`,
      joiningDate: new Date(),
    },
  });

  const staffUserB = await prisma.user.create({
    data: {
      email: employeeB.email,
      passwordHash: 'dummy_hash_test',
      roleId: testRole.id,
      employeeId: employeeB.id,
      accountStatus: 'ACTIVE',
    },
    include: { employee: true, role: true },
  });

  const staffActorA: AuthenticatedUser = {
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
    employeeId: staffUserA.employeeId ?? undefined,
    permissions: new Set<PermissionString>([
      'chat.view' as any,
      'chat.send_messages' as any,
      'chat.create_channels' as any,
      'chat.manage_channels' as any,
    ]),
  };

  const staffActorB: AuthenticatedUser = {
    userId: staffUserB.id,
    email: staffUserB.email,
    isSuperAdmin: false,
    role: {
      id: staffUserB.role.id,
      name: staffUserB.role.name,
      isSuperAdmin: false,
      isSystemRole: false,
      permissions: ['chat.view', 'chat.send_messages'] as any,
    },
    employeeId: staffUserB.employeeId ?? undefined,
    permissions: new Set<PermissionString>(['chat.view' as any, 'chat.send_messages' as any]),
  };

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Direct Message (DM) Creation and Canonical Uniqueness
    // ------------------------------------------------------------------------
    console.log('\n--- 1. Testing Direct Messages (DM) ---');
    const dm1 = await ChatService.getOrCreateDM(staffUserB.id, staffActorA);
    assert(!!dm1 && !!dm1.id, 'DM created between Alice and Bob');

    const dm2 = await ChatService.getOrCreateDM(staffUserA.id, staffActorB);
    assert(dm1.id === dm2.id, 'Bob -> Alice resolves to canonical identical DM conversation as Alice -> Bob');

    // Prevent DM with oneself
    let selfDMRaised = false;
    try {
      await ChatService.getOrCreateDM(staffUserA.id, staffActorA);
    } catch {
      selfDMRaised = true;
    }
    assert(selfDMRaised, 'Attempt to create DM with oneself is rejected');

    // ------------------------------------------------------------------------
    // TEST 2: Channels (Creation, Members, Admin Management)
    // ------------------------------------------------------------------------
    console.log('\n--- 2. Testing Channels ---');
    const channel = await ChatService.createChannel(
      {
        name: 'Backend Engineering',
        description: 'Internal discussions for backend dev team',
        type: ChannelType.GROUP,
        memberUserIds: [staffUserB.id],
      },
      staffActorA
    );
    assert(channel.name === 'Backend Engineering', 'Channel created with initial member');
    assert(channel.membersCount === 2, 'Channel creator and Bob both added as members');

    // Channel Member listing
    const members = await ChatService.listChannelMembers(channel.id, staffActorA);
    assert(members.length === 2, 'Channel members listed accurately');

    // Update Channel
    const updatedChannel = await ChatService.updateChannel(
      channel.id,
      { name: 'Core Engineering' },
      staffActorA
    );
    assert(updatedChannel.name === 'Core Engineering', 'Channel updated by owner/admin');

    // ------------------------------------------------------------------------
    // TEST 3: Unauthorized Access Blocking (Isolation)
    // ------------------------------------------------------------------------
    console.log('\n--- 3. Testing Access Isolation ---');
    // Create an outsider user not in the channel
    const outsider = await prisma.user.create({
      data: {
        email: `outsider_${Date.now()}@officecrm.internal`,
        passwordHash: 'dummy',
        roleId: testRole.id,
        accountStatus: 'ACTIVE',
      },
      include: { role: true },
    });

    const outsiderActor: AuthenticatedUser = {
      userId: outsider.id,
      email: outsider.email,
      isSuperAdmin: false,
      role: {
        id: outsider.role.id,
        name: outsider.role.name,
        isSuperAdmin: false,
        isSystemRole: false,
        permissions: ['chat.view'] as any,
      },
      permissions: new Set<PermissionString>(['chat.view' as any]),
    };

    let blockedAccess = false;
    try {
      await ChatService.assertConversationAccess(channel.id, outsiderActor);
    } catch (err: any) {
      blockedAccess = err.statusCode === 403;
    }
    assert(blockedAccess, 'Outsider blocked from accessing private group channel');

    // Super Admin can bypass
    const superAdminChannelAccess = await ChatService.assertConversationAccess(channel.id, superAdminActor);
    assert(superAdminChannelAccess.id === channel.id, 'Super Admin bypasses record-level access check');

    // ------------------------------------------------------------------------
    // TEST 4: Sending Messages & Message Persistence
    // ------------------------------------------------------------------------
    console.log('\n--- 4. Testing Message Sending & Replies ---');
    const msg1 = await ChatService.sendMessage(
      channel.id,
      { content: 'Hello team, welcome to the new chat service!' },
      staffActorA
    );
    assert(msg1.content === 'Hello team, welcome to the new chat service!', 'Message sent and persisted in channel');
    assert(msg1.senderId === staffUserA.id, 'Sender identity verified from authenticated context');

    // Reply / Threading
    const reply1 = await ChatService.sendMessage(
      channel.id,
      {
        content: 'Thanks Alice, glad to be here!',
        parentMessageId: msg1.id,
      },
      staffActorB
    );
    assert(reply1.parentMessageId === msg1.id, 'Reply message correctly references parent');
    assert(reply1.parentMessage?.senderId === staffUserA.id, 'Reply embeds parent message preview');

    // Cross-conversation reply rejection test
    let crossReplyBlocked = false;
    try {
      await ChatService.sendMessage(
        dm1.id, // In DM, try to reply to message from channel
        {
          content: 'This reply is invalid',
          parentMessageId: msg1.id,
        },
        staffActorA
      );
    } catch {
      crossReplyBlocked = true;
    }
    assert(crossReplyBlocked, 'Cross-conversation reply reference is strictly rejected');

    // ------------------------------------------------------------------------
    // TEST 5: Message List Pagination (Cursor)
    // ------------------------------------------------------------------------
    console.log('\n--- 5. Testing Message Listing & Cursor Pagination ---');
    const messageList = await ChatService.listMessages(channel.id, { limit: 10 }, staffActorA);
    assert(messageList.items.length === 2, 'Message list returns all 2 messages in channel');
    assert(messageList.items[0].id === reply1.id, 'Newest message appears first');

    // ------------------------------------------------------------------------
    // TEST 6: Reactions
    // ------------------------------------------------------------------------
    console.log('\n--- 6. Testing Reactions ---');
    const msgWithReaction = await ChatService.addReaction(msg1.id, '🚀', staffActorB);
    assert(msgWithReaction.reactions.length === 1 && msgWithReaction.reactions[0].emoji === '🚀', 'Reaction 🚀 added');
    assert(msgWithReaction.reactions[0].count === 1, 'Reaction count is 1');

    // Duplicate reaction test (should be idempotent)
    await ChatService.addReaction(msg1.id, '🚀', staffActorB);
    const recheckedMsg = await ChatService.addReaction(msg1.id, '🚀', staffActorB);
    assert(recheckedMsg.reactions[0].count === 1, 'Duplicate reaction from same user is idempotent');

    // Remove reaction
    const removedReaction = await ChatService.removeReaction(msg1.id, '🚀', staffActorB);
    assert(removedReaction.reactions.length === 0, 'Reaction removed successfully');

    // ------------------------------------------------------------------------
    // TEST 7: Mentions
    // ------------------------------------------------------------------------
    console.log('\n--- 7. Testing Mentions ---');
    const mentionMsg = await ChatService.sendMessage(
      channel.id,
      {
        content: 'Hey @Bob please check the latest schema updates',
        mentionUserIds: [staffUserB.id],
      },
      staffActorA
    );
    assert(mentionMsg.mentions.length === 1, 'Mention persisted for user Bob');
    assert(mentionMsg.mentions[0].userId === staffUserB.id, 'Mentioned user ID matches Bob');

    // ------------------------------------------------------------------------
    // TEST 8: File Attachments Integration (Reusing FileAsset from Step 11)
    // ------------------------------------------------------------------------
    console.log('\n--- 8. Testing File Attachments Integration ---');
    const dummyFile = await prisma.fileAsset.create({
      data: {
        name: 'spec_document.pdf',
        originalName: 'spec_document.pdf',
        mimeType: 'application/pdf',
        size: BigInt(2048),
        storageKey: 'general/test_spec.pdf',
        storageProvider: 'LOCAL',
        uploadedById: staffUserA.id,
      },
    });

    const msgWithAttachment = await ChatService.sendMessage(
      channel.id,
      {
        content: 'Attached is the design spec',
        attachmentFileIds: [dummyFile.id],
      },
      staffActorA
    );
    assert(msgWithAttachment.attachments.length === 1, 'File attached to ChatMessage');
    assert(msgWithAttachment.attachments[0].id === dummyFile.id, 'Attachment file ID matches');
    assert(msgWithAttachment.attachments[0].downloadUrl === `/api/files/${dummyFile.id}/download`, 'Secure download URL provided');

    // ------------------------------------------------------------------------
    // TEST 9: Message Edit & Soft Delete
    // ------------------------------------------------------------------------
    console.log('\n--- 9. Testing Message Edit & Soft Delete ---');
    const editedMsg = await ChatService.editMessage(
      msg1.id,
      { content: 'Hello team, welcome to the modern real-time chat!' },
      staffActorA
    );
    assert(editedMsg.content === 'Hello team, welcome to the modern real-time chat!', 'Author successfully edited own message');

    // Non-author edit blocked
    let nonAuthorEditBlocked = false;
    try {
      await ChatService.editMessage(msg1.id, { content: 'Tampered content' }, staffActorB);
    } catch {
      nonAuthorEditBlocked = true;
    }
    assert(nonAuthorEditBlocked, 'Non-author cannot edit another user message');

    // Soft delete
    const deleteResult = await ChatService.deleteMessage(msg1.id, staffActorA);
    assert(!!deleteResult.id, 'Message soft-deleted');

    const msgListAfterDelete = await ChatService.listMessages(channel.id, { limit: 10 }, staffActorB);
    const deletedInList = msgListAfterDelete.items.find((m) => m.id === msg1.id);
    assert(deletedInList?.isDeleted === true, 'Message marked as deleted');
    assert(deletedInList?.content === 'This message was deleted', 'Content redacted as deleted message');

    // ------------------------------------------------------------------------
    // TEST 10: Read State & Unread Counts
    // ------------------------------------------------------------------------
    console.log('\n--- 10. Testing Read State & Unread Counts ---');
    // Staff B unread counts
    const unreadBefore = await ChatService.getUnreadCounts(staffActorB);
    assert(unreadBefore.totalUnread > 0, `Staff B has ${unreadBefore.totalUnread} unread messages`);

    // Mark channel as read for Staff B
    await ChatService.markAsRead(channel.id, staffActorB);
    const unreadAfter = await ChatService.getUnreadCounts(staffActorB);
    assert(unreadAfter.conversations[channel.id] === undefined || unreadAfter.conversations[channel.id] === 0, 'Channel unread count reset to 0 after markAsRead');

    // ------------------------------------------------------------------------
    // TEST 11: Conversations List & Search
    // ------------------------------------------------------------------------
    console.log('\n--- 11. Testing Conversations List & Search ---');
    const convList = await ChatService.listConversations(staffActorA);
    assert(convList.length >= 2, 'Conversations list returns active DMs and Channels');

    // Send a message to search for (since msg1 was soft-deleted in Test 9)
    await ChatService.sendMessage(
      channel.id,
      { content: 'We are searching for this modern real-time communication test!' },
      staffActorA
    );

    const searchResults = await ChatService.searchMessages({ q: 'modern real-time' }, staffActorA);
    assert(searchResults.length >= 1, 'Search finds messages matching text query');

    // Outsider cannot search messages from private channels
    const outsiderSearch = await ChatService.searchMessages({ q: 'modern real-time' }, outsiderActor);
    assert(outsiderSearch.length === 0, 'Message search strictly respects record-level access boundaries');

    // Clean up outsider
    await prisma.user.delete({ where: { id: outsider.id } });
    await prisma.fileAsset.delete({ where: { id: dummyFile.id } });

    console.log('\n====================================================');
    console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    // Clean up temporary test data
    await prisma.chatMessage.deleteMany({
      where: {
        OR: [{ senderId: staffUserA.id }, { senderId: staffUserB.id }],
      },
    });
    await prisma.chatChannel.deleteMany({
      where: { createdById: staffUserA.id },
    });
    await prisma.chatConversation.deleteMany({
      where: {
        OR: [
          { userOneId: staffUserA.id },
          { userTwoId: staffUserA.id },
          { userOneId: staffUserB.id },
          { userTwoId: staffUserB.id },
        ],
      },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [staffUserA.id, staffUserB.id] } },
    });
    await prisma.employee.deleteMany({
      where: { id: { in: [staffUserA.employee?.id!, staffUserB.employee?.id!].filter(Boolean) as string[] } },
    });
  }
}

runChatRestVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
