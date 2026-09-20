import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 1. Default Departments
 */
const DEPARTMENTS_DATA = [
  { name: 'Management', description: 'Executive and general management' },
  { name: 'Sales', description: 'Sales, lead acquisition, and client accounts' },
  { name: 'Development', description: 'Software engineering and technical operations' },
  { name: 'Design', description: 'UI/UX design, branding, and creative deliverables' },
  { name: 'Accounts', description: 'Finance, billing, invoicing, and accounting' },
  { name: 'QA', description: 'Quality assurance, review, and software testing' },
];

/**
 * 2. Standard System Roles
 *
 * IMPORTANT ARCHITECTURAL RULES:
 * - Only Super Admin has `isSuperAdmin: true` (unrestricted system access).
 * - Admin has `isSuperAdmin: false` (subject to configurable capability permissions).
 * - All other roles have `isSuperAdmin: false`.
 */
const SYSTEM_ROLES = [
  {
    name: 'Super Admin',
    description: 'Root system administrator with unrestricted access',
    isSystem: true,
    isSuperAdmin: true,
  },
  {
    name: 'Admin',
    description: 'General system administrator with configurable permissions',
    isSystem: true,
    isSuperAdmin: false,
  },
  {
    name: 'Manager',
    description: 'Project and department manager',
    isSystem: true,
    isSuperAdmin: false,
  },
  {
    name: 'Sales Admin',
    description: 'Sales operations and pipeline manager',
    isSystem: true,
    isSuperAdmin: false,
  },
  {
    name: 'Sales Executive',
    description: 'Sales representative managing leads and customer accounts',
    isSystem: true,
    isSuperAdmin: false,
  },
  {
    name: 'Developer',
    description: 'Engineering team member handling tasks and development',
    isSystem: true,
    isSuperAdmin: false,
  },
  {
    name: 'Designer',
    description: 'Design and creative team member',
    isSystem: true,
    isSuperAdmin: false,
  },
  {
    name: 'Accounts',
    description: 'Financial officer handling payments and invoices',
    isSystem: true,
    isSuperAdmin: false,
  },
];

/**
 * 3. Complete Capability Permission Catalog (60 Permissions across 11 Modules)
 */
const PERMISSIONS_DATA = [
  // Employees (4)
  { module: 'employees', action: 'view', key: 'employees.view', description: 'View employee records' },
  { module: 'employees', action: 'create', key: 'employees.create', description: 'Create new employees' },
  { module: 'employees', action: 'edit', key: 'employees.edit', description: 'Edit existing employees' },
  { module: 'employees', action: 'delete', key: 'employees.delete', description: 'Delete employee records' },

  // Leads (6)
  { module: 'leads', action: 'view', key: 'leads.view', description: 'View CRM leads' },
  { module: 'leads', action: 'create', key: 'leads.create', description: 'Create new leads' },
  { module: 'leads', action: 'edit', key: 'leads.edit', description: 'Edit lead records' },
  { module: 'leads', action: 'delete', key: 'leads.delete', description: 'Delete lead records' },
  { module: 'leads', action: 'assign', key: 'leads.assign', description: 'Assign leads to sales staff' },
  { module: 'leads', action: 'export', key: 'leads.export', description: 'Export leads data' },

  // Clients (6)
  { module: 'clients', action: 'view', key: 'clients.view', description: 'View clients' },
  { module: 'clients', action: 'create', key: 'clients.create', description: 'Create new clients' },
  { module: 'clients', action: 'edit', key: 'clients.edit', description: 'Edit client profiles' },
  { module: 'clients', action: 'delete', key: 'clients.delete', description: 'Delete client records' },
  { module: 'clients', action: 'assign', key: 'clients.assign', description: 'Assign clients' },
  { module: 'clients', action: 'export', key: 'clients.export', description: 'Export client lists' },

  // Projects (7)
  { module: 'projects', action: 'view', key: 'projects.view', description: 'View projects' },
  { module: 'projects', action: 'create', key: 'projects.create', description: 'Create projects' },
  { module: 'projects', action: 'edit', key: 'projects.edit', description: 'Edit projects' },
  { module: 'projects', action: 'delete', key: 'projects.delete', description: 'Delete projects' },
  { module: 'projects', action: 'assign', key: 'projects.assign', description: 'Assign project members' },
  { module: 'projects', action: 'approve', key: 'projects.approve', description: 'Approve project milestones' },
  { module: 'projects', action: 'export', key: 'projects.export', description: 'Export project details' },

  // Tasks (6)
  { module: 'tasks', action: 'view', key: 'tasks.view', description: 'View tasks' },
  { module: 'tasks', action: 'create', key: 'tasks.create', description: 'Create tasks' },
  { module: 'tasks', action: 'edit', key: 'tasks.edit', description: 'Edit tasks' },
  { module: 'tasks', action: 'delete', key: 'tasks.delete', description: 'Delete tasks' },
  { module: 'tasks', action: 'assign', key: 'tasks.assign', description: 'Assign tasks to team members' },
  { module: 'tasks', action: 'approve', key: 'tasks.approve', description: 'Approve completed tasks' },

  // Chat (6)
  { module: 'chat', action: 'view', key: 'chat.view', description: 'Access internal chat' },
  { module: 'chat', action: 'send_messages', key: 'chat.send_messages', description: 'Send chat messages' },
  { module: 'chat', action: 'create_channels', key: 'chat.create_channels', description: 'Create chat channels' },
  { module: 'chat', action: 'manage_channels', key: 'chat.manage_channels', description: 'Manage channel settings' },
  { module: 'chat', action: 'delete_messages', key: 'chat.delete_messages', description: 'Moderate/delete messages' },
  { module: 'chat', action: 'upload_files', key: 'chat.upload_files', description: 'Share files in chat' },

  // Payments & Invoices (6)
  { module: 'payments', action: 'view', key: 'payments.view', description: 'View invoices and payments' },
  { module: 'payments', action: 'create_invoice', key: 'payments.create_invoice', description: 'Generate invoices' },
  { module: 'payments', action: 'edit_invoice', key: 'payments.edit_invoice', description: 'Update invoices' },
  { module: 'payments', action: 'record_payment', key: 'payments.record_payment', description: 'Record payment transactions' },
  { module: 'payments', action: 'cancel_invoice', key: 'payments.cancel_invoice', description: 'Cancel invoices' },
  { module: 'payments', action: 'export', key: 'payments.export', description: 'Export financial logs' },

  // Reports (6)
  { module: 'reports', action: 'view', key: 'reports.view', description: 'View standard reports' },
  { module: 'reports', action: 'view_sales', key: 'reports.view_sales', description: 'View sales pipeline reports' },
  { module: 'reports', action: 'view_projects', key: 'reports.view_projects', description: 'View project analytics' },
  { module: 'reports', action: 'view_team', key: 'reports.view_team', description: 'View team performance reports' },
  { module: 'reports', action: 'view_financial', key: 'reports.view_financial', description: 'View financial statements' },
  { module: 'reports', action: 'export', key: 'reports.export', description: 'Export report data' },

  // Files (6)
  { module: 'files', action: 'view', key: 'files.view', description: 'View and browse files' },
  { module: 'files', action: 'upload', key: 'files.upload', description: 'Upload file assets' },
  { module: 'files', action: 'download', key: 'files.download', description: 'Download files' },
  { module: 'files', action: 'share', key: 'files.share', description: 'Share files with users' },
  { module: 'files', action: 'delete', key: 'files.delete', description: 'Delete file assets' },
  { module: 'files', action: 'manage_folders', key: 'files.manage_folders', description: 'Create and manage folders' },

  // Notifications (2)
  { module: 'notifications', action: 'view', key: 'notifications.view', description: 'View notifications' },
  { module: 'notifications', action: 'manage_preferences', key: 'notifications.manage_preferences', description: 'Configure notification alerts' },

  // Settings (5)
  { module: 'settings', action: 'view', key: 'settings.view', description: 'View system settings' },
  { module: 'settings', action: 'edit_general', key: 'settings.edit_general', description: 'Modify workspace settings' },
  { module: 'settings', action: 'manage_users', key: 'settings.manage_users', description: 'Manage user accounts' },
  { module: 'settings', action: 'manage_roles', key: 'settings.manage_roles', description: 'Create and configure roles' },
  { module: 'settings', action: 'manage_permissions', key: 'settings.manage_permissions', description: 'Assign capability permissions' },
];

/**
 * Main Idempotent Seed Function
 *
 * Guarantees:
 * - Zero hardcoded passwords or user accounts.
 * - Upsert-based idempotency on all records.
 * - No deletion or resetting of business data.
 */
async function main() {
  console.log('=== OfficeCRM Database Seed: Starting ===');

  // 1. Seed Departments
  console.log('Seeding departments...');
  for (const dept of DEPARTMENTS_DATA) {
    await prisma.department.upsert({
      where: { name: dept.name },
      update: { description: dept.description },
      create: dept,
    });
  }
  console.log(`[OK] ${DEPARTMENTS_DATA.length} departments ensured.`);

  // 2. Seed Roles
  console.log('Seeding roles...');
  const roleRecordMap = new Map<string, string>();
  for (const roleData of SYSTEM_ROLES) {
    const role = await prisma.role.upsert({
      where: { name: roleData.name },
      update: {
        description: roleData.description,
        isSuperAdmin: roleData.isSuperAdmin,
        isSystem: roleData.isSystem,
      },
      create: roleData,
    });
    roleRecordMap.set(role.name, role.id);
  }
  console.log(`[OK] ${SYSTEM_ROLES.length} roles ensured.`);

  // 3. Seed Permissions
  console.log('Seeding capability permissions...');
  const permissionRecordMap = new Map<string, string>();
  for (const perm of PERMISSIONS_DATA) {
    const p = await prisma.permission.upsert({
      where: { key: perm.key },
      update: {
        description: perm.description,
        module: perm.module,
        action: perm.action,
      },
      create: perm,
    });
    permissionRecordMap.set(p.key, p.id);
  }
  console.log(`[OK] ${PERMISSIONS_DATA.length} permissions ensured.`);

  // 4. Seed Default Role Permissions for Admin role
  // Note: Admin is NOT Super Admin. Admin relies on explicitly granted RolePermissions.
  // Super Admin does not need RolePermission records as the authorization engine bypasses checks when isSuperAdmin = true.
  console.log('Configuring default RolePermissions for Admin role...');
  const adminRoleId = roleRecordMap.get('Admin');
  if (adminRoleId) {
    for (const perm of PERMISSIONS_DATA) {
      const permissionId = permissionRecordMap.get(perm.key);
      if (permissionId) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: adminRoleId,
              permissionId,
            },
          },
          update: { allowed: true },
          create: {
            roleId: adminRoleId,
            permissionId,
            allowed: true,
          },
        });
      }
    }
    console.log(`[OK] ${PERMISSIONS_DATA.length} permissions assigned to Admin role.`);
  }

  // 5. Seed Workspace Settings if not yet present
  const existingSetting = await prisma.workspaceSetting.findFirst();
  if (!existingSetting) {
    await prisma.workspaceSetting.create({
      data: {
        companyName: 'OfficeCRM',
        defaultCurrency: 'USD',
        timezone: 'UTC',
        dateFormat: 'YYYY-MM-DD',
      },
    });
    console.log('[OK] Default WorkspaceSetting created.');
  } else {
    console.log('[OK] Existing WorkspaceSetting preserved.');
  }

  console.log('=== OfficeCRM Database Seed: Completed Successfully ===');
}

main()
  .catch((e) => {
    console.error('Seed execution error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
