import http from 'http';
import { app } from '../src/app';
import prisma from '../src/config/database';
import { signAccessToken } from '../src/utils/jwt';
import { sanitizeCsvCell } from '../src/utils/csv';

async function runReportsVerification() {
  console.log('====================================================');
  console.log(' Starting OfficeCRM Step 14: Dashboard & Reports Verification');
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

  // 1. Start HTTP test server on port 5088
  const server = http.createServer(app);
  const TEST_PORT = 5088;
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
    console.error('Fatal: Super Admin not found.');
    process.exit(1);
  }

  const superAdminToken = signAccessToken({
    userId: superAdmin.id,
    email: superAdmin.email,
    roleId: superAdmin.roleId,
    isSuperAdmin: true,
    employeeId: superAdmin.employeeId ?? undefined,
  });

  // Track created test IDs for safe cleanup
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
  };

  try {
    // 3. Create Test Department
    const testDept = await prisma.department.create({
      data: {
        name: `Test Dept ${Date.now()}`,
        description: 'Test Department for Step 14',
      },
    });
    cleanupIds.departments.push(testDept.id);

    // 4. Create Roles
    // Role A: Standard Reports (reports.view, reports.export, NO payments view)
    const reportsViewPerm = await prisma.permission.findUnique({ where: { key: 'reports.view' } });
    const reportsExportPerm = await prisma.permission.findUnique({ where: { key: 'reports.export' } });
    const reportsSalesPerm = await prisma.permission.findUnique({ where: { key: 'reports.view_sales' } });
    const reportsProjectsPerm = await prisma.permission.findUnique({ where: { key: 'reports.view_projects' } });
    const reportsTeamPerm = await prisma.permission.findUnique({ where: { key: 'reports.view_team' } });
    const reportsFinancialPerm = await prisma.permission.findUnique({ where: { key: 'reports.view_financial' } });
    const paymentsViewPerm = await prisma.permission.findUnique({ where: { key: 'payments.view' } });

    const standardStaffRole = await prisma.role.create({
      data: {
        name: `Standard Staff Role ${Date.now()}`,
        description: 'Can view standard reports but no financial reports',
        isSystem: false,
        isSuperAdmin: false,
      },
    });
    cleanupIds.roles.push(standardStaffRole.id);

    // Assign report permissions (excluding financial)
    const staffPermIds = [reportsViewPerm?.id, reportsExportPerm?.id, reportsSalesPerm?.id, reportsProjectsPerm?.id, reportsTeamPerm?.id].filter(Boolean) as string[];
    for (const pid of staffPermIds) {
      await prisma.rolePermission.create({
        data: { roleId: standardStaffRole.id, permissionId: pid, allowed: true },
      });
    }

    // Role B: Accounts Role (includes financial reports)
    const accountsRole = await prisma.role.create({
      data: {
        name: `Accounts Role ${Date.now()}`,
        description: 'Can view financial reports and payments',
        isSystem: false,
        isSuperAdmin: false,
      },
    });
    cleanupIds.roles.push(accountsRole.id);

    const accountsPermIds = [reportsViewPerm?.id, reportsExportPerm?.id, reportsFinancialPerm?.id, paymentsViewPerm?.id].filter(Boolean) as string[];
    for (const pid of accountsPermIds) {
      await prisma.rolePermission.create({
        data: { roleId: accountsRole.id, permissionId: pid, allowed: true },
      });
    }

    // Role C: Restricted Role (NO reports permissions at all)
    const restrictedRole = await prisma.role.create({
      data: {
        name: `Restricted Role ${Date.now()}`,
        description: 'No report permissions',
        isSystem: false,
        isSuperAdmin: false,
      },
    });
    cleanupIds.roles.push(restrictedRole.id);

    // 5. Create Test Employees & Users
    // Employee 1 & User 1 (Standard Staff)
    const emp1 = await prisma.employee.create({
      data: {
        employeeCode: `EMP-T14-01-${Date.now()}`,
        firstName: 'Alice',
        lastName: 'Reports',
        email: `alice.reports.${Date.now()}@example.com`,
        jobTitle: 'Developer',
        departmentId: testDept.id,
        joiningDate: new Date(),
        employmentStatus: 'ACTIVE',
      },
    });
    cleanupIds.employees.push(emp1.id);

    const user1 = await prisma.user.create({
      data: {
        email: `user1.${Date.now()}@example.com`,
        passwordHash: 'dummy_hash',
        roleId: standardStaffRole.id,
        employeeId: emp1.id,
        accountStatus: 'ACTIVE',
      },
    });
    cleanupIds.users.push(user1.id);

    const user1Token = signAccessToken({
      userId: user1.id,
      email: user1.email,
      roleId: user1.roleId,
      isSuperAdmin: false,
      employeeId: emp1.id,
    });

    // Employee 2 & User 2 (Restricted - No report perms)
    const emp2 = await prisma.employee.create({
      data: {
        employeeCode: `EMP-T14-02-${Date.now()}`,
        firstName: 'Bob',
        lastName: 'Restricted',
        email: `bob.restricted.${Date.now()}@example.com`,
        jobTitle: 'Designer',
        departmentId: testDept.id,
        joiningDate: new Date(),
        employmentStatus: 'ACTIVE',
      },
    });
    cleanupIds.employees.push(emp2.id);

    const user2 = await prisma.user.create({
      data: {
        email: `user2.${Date.now()}@example.com`,
        passwordHash: 'dummy_hash',
        roleId: restrictedRole.id,
        employeeId: emp2.id,
        accountStatus: 'ACTIVE',
      },
    });
    cleanupIds.users.push(user2.id);

    const user2Token = signAccessToken({
      userId: user2.id,
      email: user2.email,
      roleId: user2.roleId,
      isSuperAdmin: false,
      employeeId: emp2.id,
    });

    // Employee 3 & User 3 (Accounts - Has financial perms)
    const emp3 = await prisma.employee.create({
      data: {
        employeeCode: `EMP-T14-03-${Date.now()}`,
        firstName: 'Carol',
        lastName: 'Finance',
        email: `carol.finance.${Date.now()}@example.com`,
        jobTitle: 'Accountant',
        departmentId: testDept.id,
        joiningDate: new Date(),
        employmentStatus: 'ACTIVE',
      },
    });
    cleanupIds.employees.push(emp3.id);

    const user3 = await prisma.user.create({
      data: {
        email: `user3.${Date.now()}@example.com`,
        passwordHash: 'dummy_hash',
        roleId: accountsRole.id,
        employeeId: emp3.id,
        accountStatus: 'ACTIVE',
      },
    });
    cleanupIds.users.push(user3.id);

    const user3Token = signAccessToken({
      userId: user3.id,
      email: user3.email,
      roleId: user3.roleId,
      isSuperAdmin: false,
      employeeId: emp3.id,
    });

    // 6. Create Controlled Fixtures for Metrics Verification
    // A. Leads: 1 CONVERTED, 1 QUALIFIED, 1 NEW
    const lead1 = await prisma.lead.create({
      data: {
        leadCode: `LD-T14-01-${Date.now()}`,
        firstName: 'John',
        lastName: 'LeadConverted',
        email: `lead1.${Date.now()}@example.com`,
        status: 'CONVERTED',
        source: 'Google Ads',
        estimatedValue: 10000.0,
      },
    });
    cleanupIds.leads.push(lead1.id);

    const lead2 = await prisma.lead.create({
      data: {
        leadCode: `LD-T14-02-${Date.now()}`,
        firstName: 'Sarah',
        lastName: 'LeadQualified',
        email: `lead2.${Date.now()}@example.com`,
        status: 'QUALIFIED',
        source: 'Referral',
        estimatedValue: 5000.0,
      },
    });
    cleanupIds.leads.push(lead2.id);

    const lead3 = await prisma.lead.create({
      data: {
        leadCode: `LD-T14-03-${Date.now()}`,
        firstName: '=FormulaInjectionLead',
        lastName: 'TestSanitization',
        email: `lead3.${Date.now()}@example.com`,
        status: 'NEW',
        source: 'Website',
        estimatedValue: 2000.0,
      },
    });
    cleanupIds.leads.push(lead3.id);

    // B. Clients: 1 Converted from Lead, 1 Direct
    const client1 = await prisma.client.create({
      data: {
        clientCode: `CL-T14-01-${Date.now()}`,
        name: 'Acme Converted Corp',
        email: `client1.${Date.now()}@example.com`,
        status: 'ACTIVE',
        sourceLeadId: lead1.id,
      },
    });
    cleanupIds.clients.push(client1.id);

    const client2 = await prisma.client.create({
      data: {
        clientCode: `CL-T14-02-${Date.now()}`,
        name: 'Beta Direct LLC',
        email: `client2.${Date.now()}@example.com`,
        status: 'ACTIVE',
      },
    });
    cleanupIds.clients.push(client2.id);

    // C. Projects: 1 Managed by emp1, 1 Managed by emp2
    const project1 = await prisma.project.create({
      data: {
        projectCode: `PRJ-T14-01-${Date.now()}`,
        name: 'Alpha Redesign',
        clientId: client1.id,
        managerId: emp1.id,
        status: 'IN_PROGRESS',
        budget: 15000.0,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    cleanupIds.projects.push(project1.id);

    const project2 = await prisma.project.create({
      data: {
        projectCode: `PRJ-T14-02-${Date.now()}`,
        name: 'Beta Launch',
        clientId: client2.id,
        managerId: emp2.id,
        status: 'COMPLETED',
        budget: 8000.0,
        completedAt: new Date(),
      },
    });
    cleanupIds.projects.push(project2.id);

    // D. Tasks:
    // Task 1: Assigned to emp1, status IN_PROGRESS, due today
    const now = new Date();
    const task1 = await prisma.task.create({
      data: {
        taskCode: `TSK-T14-01-${Date.now()}`,
        title: 'Task Due Today For Emp1',
        projectId: project1.id,
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        dueDate: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0),
        assignees: {
          create: { employeeId: emp1.id },
        },
      },
    });
    cleanupIds.tasks.push(task1.id);

    // Task 2: Assigned to emp1, status TODO, OVERDUE (due yesterday)
    const task2 = await prisma.task.create({
      data: {
        taskCode: `TSK-T14-02-${Date.now()}`,
        title: 'Overdue Task For Emp1',
        projectId: project1.id,
        status: 'TODO',
        priority: 'URGENT',
        dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        assignees: {
          create: { employeeId: emp1.id },
        },
      },
    });
    cleanupIds.tasks.push(task2.id);

    // Task 3: Assigned to emp2, status COMPLETED
    const task3 = await prisma.task.create({
      data: {
        taskCode: `TSK-T14-03-${Date.now()}`,
        title: 'Completed Task For Emp2',
        projectId: project2.id,
        status: 'COMPLETED',
        priority: 'MEDIUM',
        completedAt: new Date(),
        assignees: {
          create: { employeeId: emp2.id },
        },
      },
    });
    cleanupIds.tasks.push(task3.id);

    // E. Invoices & Payments:
    const invoice1 = await prisma.invoice.create({
      data: {
        invoiceNumber: `INV-T14-01-${Date.now()}`,
        clientId: client1.id,
        projectId: project1.id,
        status: 'PARTIAL',
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        subtotal: 1000.0,
        total: 1000.0,
        amountPaid: 400.0,
        balanceDue: 600.0,
      },
    });
    cleanupIds.invoices.push(invoice1.id);

    const payment1 = await prisma.payment.create({
      data: {
        invoiceId: invoice1.id,
        amount: 400.0,
        paymentMethod: 'BANK_TRANSFER',
        paymentDate: new Date(),
        reference: 'TXN-001',
      },
    });
    cleanupIds.payments.push(payment1.id);

    // Overdue invoice with remaining balance
    const invoice2 = await prisma.invoice.create({
      data: {
        invoiceNumber: `INV-T14-02-${Date.now()}`,
        clientId: client2.id,
        status: 'OVERDUE',
        issueDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        dueDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        subtotal: 500.0,
        total: 500.0,
        amountPaid: 0.0,
        balanceDue: 500.0,
      },
    });
    cleanupIds.invoices.push(invoice2.id);

    console.log(' Test fixtures created successfully.\n');

    // ========================================================================
    // SECTION 1: DASHBOARD TESTS
    // ========================================================================
    console.log('--- Testing Dashboard Endpoints ---');

    // Test 1: GET /api/dashboard/overview as Super Admin
    const overviewAdminRes = await fetch(`${SERVER_URL}/api/dashboard/overview`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    const overviewAdminData = (await overviewAdminRes.json()) as any;
    assert(overviewAdminRes.status === 200, 'GET /api/dashboard/overview returns 200 OK for Super Admin');
    assert(overviewAdminData.success === true, 'Dashboard overview response indicates success');
    assert(typeof overviewAdminData.data.employees.totalActive === 'number', 'Overview contains totalActive employees count');
    assert(overviewAdminData.data.leads.total >= 3, 'Overview leads.total reflects real DB count');
    assert(overviewAdminData.data.clients.total >= 2, 'Overview clients.total reflects real DB count');
    assert(overviewAdminData.data.projects.total >= 2, 'Overview projects.total reflects real DB count');
    assert(overviewAdminData.data.tasks.total >= 3, 'Overview tasks.total reflects real DB count');
    assert(overviewAdminData.data.tasks.overdue >= 1, 'Overview tasks.overdue correctly detects overdue tasks');
    assert(overviewAdminData.data.financial !== null, 'Overview financial section is visible for Super Admin');
    assert(typeof overviewAdminData.data.financial.totalInvoiced === 'string', 'Financial totalInvoiced is serialized as Decimal string');
    assert(parseFloat(overviewAdminData.data.financial.totalInvoiced) >= 1500.0, 'Financial totalInvoiced sum is accurate');

    // Test 2: GET /api/dashboard/overview as Standard Staff (NO financial permission)
    const overviewStaffRes = await fetch(`${SERVER_URL}/api/dashboard/overview`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const overviewStaffData = (await overviewStaffRes.json()) as any;
    assert(overviewStaffRes.status === 200, 'GET /api/dashboard/overview returns 200 OK for Standard Staff');
    assert(overviewStaffData.data.financial === null, 'Financial metrics are strictly NULL for staff without financial permission');
    assert(overviewStaffData.data.tasks.total >= 3, 'Staff still sees non-confidential operational task counts');

    // Test 3: GET /api/dashboard/activity
    const activityRes = await fetch(`${SERVER_URL}/api/dashboard/activity?limit=10`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const activityData = (await activityRes.json()) as any;
    assert(activityRes.status === 200, 'GET /api/dashboard/activity returns 200 OK');
    assert(Array.isArray(activityData.data), 'Activity data is an array');
    if (activityData.data.length > 0) {
      const firstAct = activityData.data[0];
      assert('id' in firstAct && 'action' in firstAct && 'createdAt' in firstAct, 'Activity items contain standard audit fields');
      assert(!('passwordHash' in (firstAct.actor ?? {})), 'Actor summary does NOT leak passwordHash');
    }

    // Test 4: GET /api/dashboard/my-work as Alice (emp1)
    const myWorkRes1 = await fetch(`${SERVER_URL}/api/dashboard/my-work`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const myWorkData1 = (await myWorkRes1.json()) as any;
    assert(myWorkRes1.status === 200, 'GET /api/dashboard/my-work returns 200 OK for Alice');
    assert(myWorkData1.data.summary.assignedProjectsCount >= 1, 'Alice sees her assigned project');
    assert(myWorkData1.data.summary.assignedTasksCount >= 2, 'Alice sees her assigned tasks');
    assert(myWorkData1.data.summary.dueTodayCount >= 1, 'Alice dueTodayCount is accurately calculated');
    assert(myWorkData1.data.summary.overdueCount >= 1, 'Alice overdueCount is accurately calculated');
    assert(myWorkData1.data.summary.inProgressCount >= 1, 'Alice inProgressCount is accurately calculated');
    const hasBobTaskInAlice = myWorkData1.data.assignedTasks.some((t: any) => t.id === task3.id);
    assert(!hasBobTaskInAlice, "Alice's my-work strictly excludes tasks assigned to other employees");

    // Test 5: GET /api/dashboard/my-work as Bob (emp2)
    const myWorkRes2 = await fetch(`${SERVER_URL}/api/dashboard/my-work`, {
      headers: { Authorization: `Bearer ${user2Token}` },
    });
    const myWorkData2 = (await myWorkRes2.json()) as any;
    assert(myWorkRes2.status === 200, 'GET /api/dashboard/my-work returns 200 OK for Bob');
    const hasAliceTaskInBob = myWorkData2.data.assignedTasks.some((t: any) => t.id === task1.id || t.id === task2.id);
    assert(!hasAliceTaskInBob, "Bob's my-work strictly excludes tasks assigned to Alice");

    // ========================================================================
    // SECTION 2: REPORTS ENDPOINTS
    // ========================================================================
    console.log('\n--- Testing Reports Endpoints ---');

    // Test 6: GET /api/reports/leads
    const leadsReportRes = await fetch(`${SERVER_URL}/api/reports/leads?preset=30d`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const leadsReportData = (await leadsReportRes.json()) as any;
    assert(leadsReportRes.status === 200, 'GET /api/reports/leads returns 200 OK');
    assert(leadsReportData.data.totalLeads >= 3, 'Leads report totalLeads count matches real DB data');
    assert(leadsReportData.data.statusCounts.CONVERTED >= 1, 'Leads report detects CONVERTED status');
    assert(leadsReportData.data.statusCounts.QUALIFIED >= 1, 'Leads report detects QUALIFIED status');
    assert(typeof leadsReportData.data.conversionRate.rate === 'number', 'conversionRate.rate is a valid number');
    assert(leadsReportData.data.conversionRate.percentage.includes('%'), 'conversionRate.percentage is formatted with %');
    assert(leadsReportData.data.conversionRate.formula === 'converted / total leads in period', 'conversionRate formula is explicitly documented');
    assert(Array.isArray(leadsReportData.data.leadSources), 'leadSources is an array');
    assert(Array.isArray(leadsReportData.data.trend), 'trend is an array of timeline periods');

    // Test 7: GET /api/reports/clients
    const clientsReportRes = await fetch(`${SERVER_URL}/api/reports/clients`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const clientsReportData = (await clientsReportRes.json()) as any;
    assert(clientsReportRes.status === 200, 'GET /api/reports/clients returns 200 OK');
    assert(clientsReportData.data.totalClients >= 2, 'Clients report totalClients count is correct');
    assert(clientsReportData.data.sourceBreakdown.convertedFromLead >= 1, 'sourceBreakdown correctly identifies lead-converted clients');
    assert(clientsReportData.data.sourceBreakdown.direct >= 1, 'sourceBreakdown correctly identifies direct clients');

    // Test 8: GET /api/reports/projects
    const projectsReportRes = await fetch(`${SERVER_URL}/api/reports/projects?clientId=${client1.id}`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const projectsReportData = (await projectsReportRes.json()) as any;
    assert(projectsReportRes.status === 200, 'GET /api/reports/projects returns 200 OK with client filter');
    assert(projectsReportData.data.totalProjects === 1, 'Projects report correctly filtered by clientId');
    assert(projectsReportData.data.active === 1, 'Projects report detects active project');
    assert(projectsReportData.data.totalBudget === '15000.00', 'Projects report totalBudget matches decimal string');

    // Test 9: GET /api/reports/tasks
    const tasksReportRes = await fetch(`${SERVER_URL}/api/reports/tasks?employeeId=${emp1.id}`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const tasksReportData = (await tasksReportRes.json()) as any;
    assert(tasksReportRes.status === 200, 'GET /api/reports/tasks returns 200 OK with employeeId filter');
    assert(tasksReportData.data.totalTasks === 2, 'Tasks report accurately filters tasks by employeeId');
    assert(tasksReportData.data.overdue === 1, 'Tasks report accurately flags overdue task');
    assert(tasksReportData.data.pending === 2, 'Tasks report accurately computes pending tasks');

    // Test 10: GET /api/reports/employees (Operational performance)
    const empReportRes = await fetch(`${SERVER_URL}/api/reports/employees?departmentId=${testDept.id}`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const empReportData = (await empReportRes.json()) as any;
    assert(empReportRes.status === 200, 'GET /api/reports/employees returns 200 OK');
    assert(empReportData.data.totalEmployees === 3, 'Employee operational report contains all 3 department employees');
    const aliceReport = empReportData.data.employees.find((e: any) => e.id === emp1.id);
    assert(aliceReport !== undefined, 'Alice found in employee operational report');
    assert(aliceReport.assignedTasksCount === 2, 'Alice assignedTasksCount is factual (2)');
    assert(aliceReport.overdueTasksCount === 1, 'Alice overdueTasksCount is factual (1)');
    assert(aliceReport.activeProjectsCount === 1, 'Alice activeProjectsCount is factual (1)');
    assert(!('passwordHash' in aliceReport) && !('email' in aliceReport), 'Employee operational report does NOT leak auth or password credentials');
    assert(!('score' in aliceReport) && !('ranking' in aliceReport), 'Employee operational report does NOT invent subjective scoring');

    // Test 11: GET /api/reports/financial as Accounts User
    const finReportRes = await fetch(`${SERVER_URL}/api/reports/financial`, {
      headers: { Authorization: `Bearer ${user3Token}` },
    });
    const finReportData = (await finReportRes.json()) as any;
    assert(finReportRes.status === 200, 'GET /api/reports/financial returns 200 OK for Accounts user');
    assert(parseFloat(finReportData.data.totalInvoiced) >= 1500.0, 'Financial report totalInvoiced matches DB');
    assert(parseFloat(finReportData.data.totalPaid) >= 400.0, 'Financial report totalPaid matches DB');
    assert(parseFloat(finReportData.data.totalOutstanding) >= 1100.0, 'Financial report totalOutstanding matches DB');
    assert(parseFloat(finReportData.data.overdueAmount) >= 500.0, 'Financial report overdueAmount includes overdue invoice');
    assert(finReportData.data.paymentCounts >= 1, 'Financial report paymentCounts is accurate');
    const bankTransfer = finReportData.data.paymentsByMethod.find((m: any) => m.method === 'BANK_TRANSFER');
    assert(bankTransfer !== undefined && parseFloat(bankTransfer.totalAmount) >= 400.0, 'Financial report paymentsByMethod accurately groups payments');

    // Test 12: GET /api/reports/financial as Standard Staff (NO financial permission) -> 403 Forbidden
    const finDeniedRes = await fetch(`${SERVER_URL}/api/reports/financial`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert(finDeniedRes.status === 403, 'GET /api/reports/financial returns 403 Forbidden for user without financial permission');

    // Test 13: GET /api/reports/leads as Restricted User (NO reports permission) -> 403 Forbidden
    const reportsDeniedRes = await fetch(`${SERVER_URL}/api/reports/leads`, {
      headers: { Authorization: `Bearer ${user2Token}` },
    });
    assert(reportsDeniedRes.status === 403, 'GET /api/reports/leads returns 403 Forbidden for user without reports.view permission');

    // ========================================================================
    // SECTION 3: CSV EXPORT & SECURITY
    // ========================================================================
    console.log('\n--- Testing CSV Export & Formula Injection Security ---');

    // Test 14: CSV Export unit test for formula injection
    const formulaCell = sanitizeCsvCell('=1+2');
    assert(formulaCell === "'=1+2", 'sanitizeCsvCell mitigates formula injection by prefixing = with single quote');
    const cmdCell = sanitizeCsvCell('+cmd|');
    assert(cmdCell === "'+cmd|", 'sanitizeCsvCell mitigates formula injection by prefixing + with single quote');
    const commaCell = sanitizeCsvCell('Acme, Inc.');
    assert(commaCell === '"Acme, Inc."', 'sanitizeCsvCell wraps cells with commas in double quotes');

    // Test 15: GET /api/reports/leads/export?format=csv
    const leadsExportRes = await fetch(`${SERVER_URL}/api/reports/leads/export?format=csv`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert(leadsExportRes.status === 200, 'GET /api/reports/leads/export returns 200 OK');
    const contentType = leadsExportRes.headers.get('content-type');
    assert(contentType?.includes('text/csv') === true, 'Export Content-Type is text/csv');
    const disposition = leadsExportRes.headers.get('content-disposition');
    assert(disposition?.includes('attachment') === true && disposition?.includes('.csv') === true, 'Export Content-Disposition has attachment filename');
    const csvBody = await leadsExportRes.text();
    assert(csvBody.includes('Lead Code,Name,Company'), 'CSV export includes expected headers');
    assert(csvBody.includes("'=FormulaInjectionLead"), 'CSV export neutralizes = formula injection in lead name');

    // Test 16: GET /api/reports/financial/export as Standard Staff (Denied)
    const finExportDeniedRes = await fetch(`${SERVER_URL}/api/reports/financial/export?format=csv`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert(finExportDeniedRes.status === 403, 'Financial CSV export returns 403 Forbidden for user without financial permission');

    // Test 17: GET /api/reports/financial/export as Accounts User (Allowed)
    const finExportAllowedRes = await fetch(`${SERVER_URL}/api/reports/financial/export?format=csv`, {
      headers: { Authorization: `Bearer ${user3Token}` },
    });
    assert(finExportAllowedRes.status === 200, 'Financial CSV export returns 200 OK for Accounts user');
    const finCsvBody = await finExportAllowedRes.text();
    assert(finCsvBody.includes('Invoice Number,Client,Status'), 'Financial CSV export contains invoice headers');

    // Test 18: Audit Log verification for REPORT_EXPORTED
    const exportAudit = await prisma.auditLog.findFirst({
      where: {
        action: 'REPORT_EXPORTED',
        userId: user1.id,
      },
      orderBy: { createdAt: 'desc' },
    });
    assert(exportAudit !== null, 'Audit log recorded REPORT_EXPORTED event');
    assert((exportAudit?.metadata as any)?.reportType === 'leads', 'Audit log metadata captured reportType');

  } catch (error) {
    console.error('Unhandled verification error:', error);
    failed++;
  } finally {
    // Teardown: safely remove created test entities
    console.log('\n--- Cleaning up temporary test fixtures ---');
    try {
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
  console.log(` Verification Complete: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runReportsVerification();
