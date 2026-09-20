import http from 'http';
import { app } from '../src/app';
import prisma from '../src/config/database';
import { signAccessToken } from '../src/utils/jwt';

async function runStep15FinalVerification() {
  console.log('====================================================');
  console.log(' Starting OfficeCRM Step 15: Final Verification & Hardening');
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

  // 1. Start HTTP test server on port 5099
  const server = http.createServer(app);
  const TEST_PORT = 5099;
  await new Promise<void>((resolve) => {
    server.listen(TEST_PORT, () => resolve());
  });

  const SERVER_URL = `http://localhost:${TEST_PORT}`;

  // 2. Fetch Super Admin
  const superAdmin = await prisma.user.findFirst({
    where: { role: { isSuperAdmin: true }, accountStatus: 'ACTIVE' },
    include: { role: true, employee: true },
  });

  if (!superAdmin) {
    console.error('Fatal: Super Admin user not found.');
    process.exit(1);
  }

  const superAdminToken = signAccessToken({
    userId: superAdmin.id,
    email: superAdmin.email,
    roleId: superAdmin.roleId,
    isSuperAdmin: true,
    employeeId: superAdmin.employeeId ?? undefined,
  });

  // Track created entities for safe teardown
  const cleanupIds = {
    roles: [] as string[],
    users: [] as string[],
    employees: [] as string[],
    departments: [] as string[],
    leads: [] as string[],
    clients: [] as string[],
    projects: [] as string[],
    tasks: [] as string[],
    invoices: [] as string[],
    payments: [] as string[],
    folders: [] as string[],
    files: [] as string[],
    notifications: [] as string[],
    conversations: [] as string[],
  };

  try {
    // ========================================================================
    // TEST SECTION 1: HEALTH & SYSTEM
    // ========================================================================
    console.log('--- Testing System Health Endpoint ---');
    const healthRes = await fetch(`${SERVER_URL}/api/health`);
    const healthData = (await healthRes.json()) as any;
    assert(healthRes.status === 200, 'GET /api/health returns 200 OK');
    assert(healthData.status === 'healthy', 'Health check reports healthy status');
    assert(healthData.database === 'connected', 'Database connectivity verified without leaking secrets');

    // Unknown route 404 test
    const notFoundRes = await fetch(`${SERVER_URL}/api/non-existent-route-xyz`);
    const notFoundData = (await notFoundRes.json()) as any;
    assert(notFoundRes.status === 404, 'Unknown API route returns 404 Not Found');
    assert(notFoundData.success === false, '404 response follows standard JSON error envelope');

    // ========================================================================
    // TEST SECTION 2: WORKSPACE SETTINGS
    // ========================================================================
    console.log('\n--- Testing Workspace Settings ---');

    // Read workspace settings as Super Admin
    const getSettingsRes = await fetch(`${SERVER_URL}/api/settings/workspace`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    const getSettingsData = (await getSettingsRes.json()) as any;
    assert(getSettingsRes.status === 200, 'GET /api/settings/workspace returns 200 OK');
    assert(getSettingsData.data.companyName !== undefined, 'Settings contains companyName');
    assert(getSettingsData.data.timezone !== undefined, 'Settings contains timezone');

    // Update settings with valid IANA timezone and ISO currency
    const updateSettingsRes = await fetch(`${SERVER_URL}/api/settings/workspace`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        companyName: 'OfficeCRM Global Inc',
        timezone: 'Australia/Sydney',
        defaultCurrency: 'AUD',
        dateFormat: 'DD/MM/YYYY',
      }),
    });
    const updateSettingsData = (await updateSettingsRes.json()) as any;
    assert(updateSettingsRes.status === 200, 'PATCH /api/settings/workspace accepts valid IANA timezone & ISO currency');
    assert(updateSettingsData.data.timezone === 'Australia/Sydney', 'Timezone updated to Australia/Sydney');
    assert(updateSettingsData.data.defaultCurrency === 'AUD', 'Currency updated to AUD');

    // Negative Test: Invalid timezone rejected
    const invalidTzRes = await fetch(`${SERVER_URL}/api/settings/workspace`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        timezone: 'Mars/Phobos_Invalid_Timezone',
      }),
    });
    assert(invalidTzRes.status === 400, 'PATCH /api/settings/workspace rejects invalid IANA timezone');

    // Negative Test: Invalid currency code rejected
    const invalidCurrencyRes = await fetch(`${SERVER_URL}/api/settings/workspace`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        defaultCurrency: 'DOLLARS', // not 3 letters
      }),
    });
    assert(invalidCurrencyRes.status === 400, 'PATCH /api/settings/workspace rejects invalid currency format');

    // Revert settings cleanly
    await fetch(`${SERVER_URL}/api/settings/workspace`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        companyName: 'OfficeCRM',
        timezone: 'UTC',
        defaultCurrency: 'USD',
        dateFormat: 'YYYY-MM-DD',
      }),
    });

    // ========================================================================
    // TEST SECTION 3: ROLES & PERMISSIONS ADMINISTRATION
    // ========================================================================
    console.log('\n--- Testing Roles & Permissions Administration ---');

    // Permissions catalog
    const permCatalogRes = await fetch(`${SERVER_URL}/api/permissions`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    const permCatalogData = (await permCatalogRes.json()) as any;
    assert(permCatalogRes.status === 200, 'GET /api/permissions returns 200 OK');
    assert(permCatalogData.data.total > 40, 'Permissions catalog contains full suite of system permissions');
    assert(permCatalogData.data.modulesCount >= 10, 'Permissions catalog groups across core system modules');

    // Create custom role
    const customRoleName = `QA Specialist ${Date.now()}`;
    const createRoleRes = await fetch(`${SERVER_URL}/api/roles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        name: customRoleName,
        description: 'Test Custom Role for Step 15',
      }),
    });
    const createRoleData = (await createRoleRes.json()) as any;
    assert(createRoleRes.status === 201, 'POST /api/roles creates custom role');
    const createdRoleId = createRoleData.data.id;
    cleanupIds.roles.push(createdRoleId);

    // Configure permissions for custom role
    const updatePermsRes = await fetch(`${SERVER_URL}/api/roles/${createdRoleId}/permissions`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        permissions: [
          { permissionKey: 'tasks.view', allowed: true },
          { permissionKey: 'tasks.edit', allowed: true },
        ],
      }),
    });
    assert(updatePermsRes.status === 200, 'PUT /api/roles/:id/permissions updates role permissions');

    // Super Admin Role Protection Safeguards
    const superAdminRoleId = superAdmin.roleId;

    // Negative: Cannot delete Super Admin role
    const deleteSuperAdminRoleRes = await fetch(`${SERVER_URL}/api/roles/${superAdminRoleId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert(deleteSuperAdminRoleRes.status === 403, 'DELETE /api/roles/:id on Super Admin role strictly blocked (403)');

    // Negative: Cannot rename Super Admin role
    const renameSuperAdminRoleRes = await fetch(`${SERVER_URL}/api/roles/${superAdminRoleId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({ name: 'Hacked Admin' }),
    });
    assert(renameSuperAdminRoleRes.status === 403, 'PATCH /api/roles/:id renaming Super Admin role blocked (403)');

    // Clean delete custom role
    const deleteRoleRes = await fetch(`${SERVER_URL}/api/roles/${createdRoleId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert(deleteRoleRes.status === 200, 'DELETE /api/roles/:id deletes unassigned custom role');
    cleanupIds.roles = cleanupIds.roles.filter((id) => id !== createdRoleId);

    // ========================================================================
    // TEST SECTION 4: USER PERMISSION OVERRIDES
    // ========================================================================
    console.log('\n--- Testing User Permission Overrides (ALLOW / DENY) ---');

    // Create test role without projects.delete
    const staffRole = await prisma.role.create({
      data: {
        name: `Staff Tester ${Date.now()}`,
        description: 'Role for override tests',
      },
    });
    cleanupIds.roles.push(staffRole.id);

    // Add projects.view to role
    const projViewPerm = await prisma.permission.findUnique({ where: { key: 'projects.view' } });
    if (projViewPerm) {
      await prisma.rolePermission.create({
        data: { roleId: staffRole.id, permissionId: projViewPerm.id, allowed: true },
      });
    }

    const testEmp = await prisma.employee.create({
      data: {
        employeeCode: `EMP-T15-01-${Date.now()}`,
        firstName: 'Dave',
        lastName: 'OverrideTest',
        email: `dave.test.${Date.now()}@example.com`,
        jobTitle: 'Developer',
        joiningDate: new Date(),
        employmentStatus: 'ACTIVE',
      },
    });
    cleanupIds.employees.push(testEmp.id);

    const testUser = await prisma.user.create({
      data: {
        email: `dave.user.${Date.now()}@example.com`,
        passwordHash: 'dummy_hash',
        roleId: staffRole.id,
        employeeId: testEmp.id,
        accountStatus: 'ACTIVE',
      },
    });
    cleanupIds.users.push(testUser.id);

    // 1. Apply explicit ALLOW override for projects.delete
    const allowOverrideRes = await fetch(`${SERVER_URL}/api/users/${testUser.id}/permissions`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        permissions: [{ permissionKey: 'projects.delete', allowed: true }],
      }),
    });
    assert(allowOverrideRes.status === 200, 'PUT /api/users/:id/permissions sets ALLOW override');

    // Verify override in GET /api/users/:id/permissions
    const getUserPermsRes1 = await fetch(`${SERVER_URL}/api/users/${testUser.id}/permissions`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    const getUserPermsData1 = (await getUserPermsRes1.json()) as any;
    const projDeletePerm1 = getUserPermsData1.data.permissions.find((p: any) => p.key === 'projects.delete');
    assert(projDeletePerm1?.override === true, 'projects.delete has explicit override = true');
    assert(projDeletePerm1?.effective === true, 'projects.delete is effectively allowed via user override');

    // 2. Apply explicit DENY override for projects.view
    const denyOverrideRes = await fetch(`${SERVER_URL}/api/users/${testUser.id}/permissions`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        permissions: [{ permissionKey: 'projects.view', allowed: false }],
      }),
    });
    assert(denyOverrideRes.status === 200, 'PUT /api/users/:id/permissions sets DENY override');

    const getUserPermsRes2 = await fetch(`${SERVER_URL}/api/users/${testUser.id}/permissions`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    const getUserPermsData2 = (await getUserPermsRes2.json()) as any;
    const projViewPerm2 = getUserPermsData2.data.permissions.find((p: any) => p.key === 'projects.view');
    assert(projViewPerm2?.override === false, 'projects.view has explicit override = false (DENY)');
    assert(projViewPerm2?.effective === false, 'projects.view is effectively denied despite role grant');

    // 3. Clear override (allowed: null) -> reverts to role default
    await fetch(`${SERVER_URL}/api/users/${testUser.id}/permissions`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        permissions: [{ permissionKey: 'projects.view', allowed: null }],
      }),
    });
    const getUserPermsRes3 = await fetch(`${SERVER_URL}/api/users/${testUser.id}/permissions`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    const getUserPermsData3 = (await getUserPermsRes3.json()) as any;
    const projViewPerm3 = getUserPermsData3.data.permissions.find((p: any) => p.key === 'projects.view');
    assert(projViewPerm3?.override === null, 'projects.view override removed');
    assert(projViewPerm3?.effective === true, 'projects.view reverted to role default (true)');

    // ========================================================================
    // TEST SECTION 5: AUTH & /auth/me CONTRACT
    // ========================================================================
    console.log('\n--- Testing Auth & /auth/me Contract ---');

    const meRes = await fetch(`${SERVER_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    const meData = (await meRes.json()) as any;
    assert(meRes.status === 200, 'GET /api/auth/me returns 200 OK');
    assert(meData.data.user.id === superAdmin.id, 'User ID matches authenticated session');
    assert(!('passwordHash' in meData.data.user), 'User profile strictly omits passwordHash');
    assert(meData.data.role.isSuperAdmin === true, 'Role indicates isSuperAdmin = true');
    assert(Array.isArray(meData.data.permissions), 'Permissions returned as array');
    assert(Array.isArray(meData.data.effectivePermissions), 'effectivePermissions returned as array');

    // Negative: Unauthenticated request rejected
    const unauthRes = await fetch(`${SERVER_URL}/api/auth/me`);
    assert(unauthRes.status === 401, 'Request without Authorization header returns 401');

    // Negative: Invalid token rejected
    const invalidTokenRes = await fetch(`${SERVER_URL}/api/auth/me`, {
      headers: { Authorization: 'Bearer forged.invalid.token' },
    });
    assert(invalidTokenRes.status === 401, 'Forged JWT token returns 401');

    // ========================================================================
    // TEST SECTION 6: FULL BUSINESS LIFECYCLE SMOKE TEST
    // ========================================================================
    console.log('\n--- Testing Full Business Lifecycle Smoke Test ---');

    // 1. Create Department
    const dept = await prisma.department.create({
      data: { name: `Eng Dept ${Date.now()}` },
    });
    cleanupIds.departments.push(dept.id);

    // 2. Create Employee
    const emp = await prisma.employee.create({
      data: {
        employeeCode: `EMP-T15-02-${Date.now()}`,
        firstName: 'Elena',
        lastName: 'Engineer',
        email: `elena.${Date.now()}@example.com`,
        jobTitle: 'Lead Architect',
        departmentId: dept.id,
        joiningDate: new Date(),
        employmentStatus: 'ACTIVE',
      },
    });
    cleanupIds.employees.push(emp.id);

    // 3. Create Lead
    const lead = await prisma.lead.create({
      data: {
        leadCode: `LD-T15-01-${Date.now()}`,
        firstName: 'Mark',
        lastName: 'Prospect',
        email: `mark.prospect.${Date.now()}@example.com`,
        status: 'QUALIFIED',
        estimatedValue: 25000.0,
      },
    });
    cleanupIds.leads.push(lead.id);

    // 4. Convert Lead to Client (Transactional)
    const convertRes = await fetch(`${SERVER_URL}/api/leads/${lead.id}/convert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        company: 'Prospect Enterprises',
      }),
    });
    const convertData = (await convertRes.json()) as any;
    assert(convertRes.status === 201 || convertRes.status === 200, 'POST /api/leads/:id/convert converts lead to client');
    const clientId = convertData.data.client.id;
    cleanupIds.clients.push(clientId);

    // 5. Create Project for Client
    const project = await prisma.project.create({
      data: {
        projectCode: `PRJ-T15-01-${Date.now()}`,
        name: 'Enterprise Cloud Migration',
        clientId,
        managerId: emp.id,
        status: 'IN_PROGRESS',
        budget: 50000.0,
      },
    });
    cleanupIds.projects.push(project.id);

    // 6. Assign Member to Project
    const member = await prisma.projectMember.create({
      data: {
        projectId: project.id,
        employeeId: emp.id,
        projectRole: 'TECH_LEAD',
      },
    });

    // 7. Create Task in Project
    const task = await prisma.task.create({
      data: {
        taskCode: `TSK-T15-01-${Date.now()}`,
        title: 'Infrastructure Provisioning',
        projectId: project.id,
        status: 'TODO',
        priority: 'HIGH',
        assignees: {
          create: { employeeId: emp.id },
        },
      },
    });
    cleanupIds.tasks.push(task.id);

    // 8. Transition Task Status (Kanban move)
    const taskStatusRes = await fetch(`${SERVER_URL}/api/tasks/${task.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    });
    assert(taskStatusRes.status === 200, 'PATCH /api/tasks/:id/status transitions task to IN_PROGRESS');

    // 9. Create Invoice
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: `INV-T15-01-${Date.now()}`,
        clientId,
        projectId: project.id,
        status: 'SENT',
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        subtotal: 5000.0,
        total: 5000.0,
        amountPaid: 0.0,
        balanceDue: 5000.0,
      },
    });
    cleanupIds.invoices.push(invoice.id);

    // 10. Record Payment against Invoice
    const payment = await prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        amount: 2000.0,
        paymentMethod: 'STRIPE',
        paymentDate: new Date(),
        reference: 'ch_test_123',
      },
    });
    cleanupIds.payments.push(payment.id);

    // Update invoice balance
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        amountPaid: 2000.0,
        balanceDue: 3000.0,
        status: 'PARTIAL',
      },
    });

    // 11. Create File Folder & File Asset Metadata
    const folder = await prisma.fileFolder.create({
      data: {
        name: `Project Docs ${Date.now()}`,
        createdById: superAdmin.id,
      },
    });
    cleanupIds.folders.push(folder.id);

    const fileAsset = await prisma.fileAsset.create({
      data: {
        name: 'Architecture Spec.pdf',
        originalName: 'architecture_v1.pdf',
        mimeType: 'application/pdf',
        size: BigInt(1048576),
        storageKey: `test-${Date.now()}.pdf`,
        folderId: folder.id,
        relatedType: 'PROJECT',
        relatedId: project.id,
        uploadedById: superAdmin.id,
      },
    });
    cleanupIds.files.push(fileAsset.id);

    // 12. Create Internal Chat Conversation & Message
    const conversation = await prisma.chatConversation.create({
      data: {
        userOneId: superAdmin.id,
        userTwoId: testUser.id,
      },
    });
    cleanupIds.conversations.push(conversation.id);

    const message = await prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        senderId: superAdmin.id,
        content: 'Sprint kick-off completed!',
      },
    });

    // 13. Create Notification
    const notif = await prisma.notification.create({
      data: {
        userId: superAdmin.id,
        type: 'TASK_ASSIGNED',
        title: 'New Task Assigned',
        message: 'You have been assigned to Infrastructure Provisioning',
        entityType: 'TASK',
        entityId: task.id,
        actorId: superAdmin.id,
      },
    });
    cleanupIds.notifications.push(notif.id);

    // 14. Verify Dashboard Overview reflects real data
    const dashboardRes = await fetch(`${SERVER_URL}/api/dashboard/overview`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    const dashboardData = (await dashboardRes.json()) as any;
    assert(dashboardRes.status === 200, 'Dashboard overview succeeds after full lifecycle');
    assert(dashboardData.data.projects.total >= 1, 'Dashboard captures created project');
    assert(dashboardData.data.tasks.total >= 1, 'Dashboard captures created task');

    // 15. Verify Financial Report
    const finReportRes = await fetch(`${SERVER_URL}/api/reports/financial`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    const finReportData = (await finReportRes.json()) as any;
    assert(finReportRes.status === 200, 'Financial report succeeds after lifecycle');
    assert(parseFloat(finReportData.data.totalInvoiced) >= 5000.0, 'Financial report reflects billed invoice total');
    assert(parseFloat(finReportData.data.totalPaid) >= 2000.0, 'Financial report reflects recorded payment');

    // 16. Verify CSV Export
    const csvExportRes = await fetch(`${SERVER_URL}/api/reports/projects/export?format=csv`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert(csvExportRes.status === 200, 'CSV export succeeds for projects');
    const csvContent = await csvExportRes.text();
    assert(csvContent.includes('Project Code,Name,Client'), 'CSV export includes expected headers');

  } catch (error) {
    console.error('Unhandled verification error:', error);
    failed++;
  } finally {
    console.log('\n--- Cleaning up temporary test fixtures ---');
    try {
      if (cleanupIds.notifications.length > 0) {
        await prisma.notification.deleteMany({ where: { id: { in: cleanupIds.notifications } } });
      }
      if (cleanupIds.conversations.length > 0) {
        await prisma.chatMessage.deleteMany({ where: { conversationId: { in: cleanupIds.conversations } } });
        await prisma.chatConversation.deleteMany({ where: { id: { in: cleanupIds.conversations } } });
      }
      if (cleanupIds.files.length > 0) {
        await prisma.fileAsset.deleteMany({ where: { id: { in: cleanupIds.files } } });
      }
      if (cleanupIds.folders.length > 0) {
        await prisma.fileFolder.deleteMany({ where: { id: { in: cleanupIds.folders } } });
      }
      if (cleanupIds.payments.length > 0) {
        await prisma.payment.deleteMany({ where: { id: { in: cleanupIds.payments } } });
      }
      if (cleanupIds.invoices.length > 0) {
        await prisma.invoice.deleteMany({ where: { id: { in: cleanupIds.invoices } } });
      }
      if (cleanupIds.tasks.length > 0) {
        await prisma.taskAssignee.deleteMany({ where: { taskId: { in: cleanupIds.tasks } } });
        await prisma.task.deleteMany({ where: { id: { in: cleanupIds.tasks } } });
      }
      if (cleanupIds.projects.length > 0) {
        await prisma.projectMember.deleteMany({ where: { projectId: { in: cleanupIds.projects } } });
        await prisma.project.deleteMany({ where: { id: { in: cleanupIds.projects } } });
      }
      if (cleanupIds.clients.length > 0) {
        await prisma.client.deleteMany({ where: { id: { in: cleanupIds.clients } } });
      }
      if (cleanupIds.leads.length > 0) {
        await prisma.lead.deleteMany({ where: { id: { in: cleanupIds.leads } } });
      }
      if (cleanupIds.users.length > 0) {
        await prisma.userPermissionOverride.deleteMany({ where: { userId: { in: cleanupIds.users } } });
        await prisma.auditLog.deleteMany({ where: { userId: { in: cleanupIds.users } } });
        await prisma.user.deleteMany({ where: { id: { in: cleanupIds.users } } });
      }
      if (cleanupIds.employees.length > 0) {
        await prisma.employee.deleteMany({ where: { id: { in: cleanupIds.employees } } });
      }
      if (cleanupIds.roles.length > 0) {
        await prisma.rolePermission.deleteMany({ where: { roleId: { in: cleanupIds.roles } } });
        await prisma.role.deleteMany({ where: { id: { in: cleanupIds.roles } } });
      }
      if (cleanupIds.departments.length > 0) {
        await prisma.department.deleteMany({ where: { id: { in: cleanupIds.departments } } });
      }
      console.log(' All temporary test fixtures cleaned up cleanly.\n');
    } catch (cleanupErr) {
      console.error('Error during cleanup:', cleanupErr);
    }

    server.close();
  }

  console.log('====================================================');
  console.log(` Step 15 Verification Complete: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runStep15FinalVerification();
