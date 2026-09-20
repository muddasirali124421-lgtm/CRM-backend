import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Standard System Modules and Capabilities
 */
const PERMISSIONS_DATA: Array<{ module: string; action: string; key: string; description: string }> = [
  // Employees
  { module: 'employees', action: 'view', key: 'employees.view', description: 'View employee records' },
  { module: 'employees', action: 'create', key: 'employees.create', description: 'Create new employees' },
  { module: 'employees', action: 'edit', key: 'employees.edit', description: 'Edit existing employees' },
  { module: 'employees', action: 'delete', key: 'employees.delete', description: 'Delete employee records' },

  // Leads
  { module: 'leads', action: 'view', key: 'leads.view', description: 'View CRM leads' },
  { module: 'leads', action: 'create', key: 'leads.create', description: 'Create new leads' },
  { module: 'leads', action: 'edit', key: 'leads.edit', description: 'Edit lead records' },
  { module: 'leads', action: 'delete', key: 'leads.delete', description: 'Delete lead records' },
  { module: 'leads', action: 'assign', key: 'leads.assign', description: 'Assign leads to sales staff' },
  { module: 'leads', action: 'export', key: 'leads.export', description: 'Export leads data' },

  // Clients
  { module: 'clients', action: 'view', key: 'clients.view', description: 'View clients' },
  { module: 'clients', action: 'create', key: 'clients.create', description: 'Create new clients' },
  { module: 'clients', action: 'edit', key: 'clients.edit', description: 'Edit client profiles' },
  { module: 'clients', action: 'delete', key: 'clients.delete', description: 'Delete client records' },
  { module: 'clients', action: 'assign', key: 'clients.assign', description: 'Assign clients' },
  { module: 'clients', action: 'export', key: 'clients.export', description: 'Export client lists' },

  // Projects
  { module: 'projects', action: 'view', key: 'projects.view', description: 'View projects' },
  { module: 'projects', action: 'create', key: 'projects.create', description: 'Create projects' },
  { module: 'projects', action: 'edit', key: 'projects.edit', description: 'Edit projects' },
  { module: 'projects', action: 'delete', key: 'projects.delete', description: 'Delete projects' },
  { module: 'projects', action: 'assign', key: 'projects.assign', description: 'Assign project members' },
  { module: 'projects', action: 'approve', key: 'projects.approve', description: 'Approve project milestones' },
  { module: 'projects', action: 'export', key: 'projects.export', description: 'Export project details' },

  // Tasks
  { module: 'tasks', action: 'view', key: 'tasks.view', description: 'View tasks' },
  { module: 'tasks', action: 'create', key: 'tasks.create', description: 'Create tasks' },
  { module: 'tasks', action: 'edit', key: 'tasks.edit', description: 'Edit tasks' },
  { module: 'tasks', action: 'delete', key: 'tasks.delete', description: 'Delete tasks' },
  { module: 'tasks', action: 'assign', key: 'tasks.assign', description: 'Assign tasks to team members' },
  { module: 'tasks', action: 'approve', key: 'tasks.approve', description: 'Approve completed tasks' },

  // Chat
  { module: 'chat', action: 'view', key: 'chat.view', description: 'Access internal chat' },
  { module: 'chat', action: 'send_messages', key: 'chat.send_messages', description: 'Send chat messages' },
  { module: 'chat', action: 'create_channels', key: 'chat.create_channels', description: 'Create chat channels' },
  { module: 'chat', action: 'manage_channels', key: 'chat.manage_channels', description: 'Manage channel settings' },
  { module: 'chat', action: 'delete_messages', key: 'chat.delete_messages', description: 'Moderate/delete messages' },
  { module: 'chat', action: 'upload_files', key: 'chat.upload_files', description: 'Share files in chat' },

  // Payments & Invoices
  { module: 'payments', action: 'view', key: 'payments.view', description: 'View invoices and payments' },
  { module: 'payments', action: 'create_invoice', key: 'payments.create_invoice', description: 'Generate invoices' },
  { module: 'payments', action: 'edit_invoice', key: 'payments.edit_invoice', description: 'Update invoices' },
  { module: 'payments', action: 'record_payment', key: 'payments.record_payment', description: 'Record payment transactions' },
  { module: 'payments', action: 'cancel_invoice', key: 'payments.cancel_invoice', description: 'Cancel invoices' },
  { module: 'payments', action: 'export', key: 'payments.export', description: 'Export financial logs' },

  // Reports
  { module: 'reports', action: 'view', key: 'reports.view', description: 'View standard reports' },
  { module: 'reports', action: 'view_sales', key: 'reports.view_sales', description: 'View sales pipeline reports' },
  { module: 'reports', action: 'view_projects', key: 'reports.view_projects', description: 'View project analytics' },
  { module: 'reports', action: 'view_team', key: 'reports.view_team', description: 'View team performance reports' },
  { module: 'reports', action: 'view_financial', key: 'reports.view_financial', description: 'View financial statements' },
  { module: 'reports', action: 'export', key: 'reports.export', description: 'Export report data' },

  // Files
  { module: 'files', action: 'view', key: 'files.view', description: 'View and browse files' },
  { module: 'files', action: 'upload', key: 'files.upload', description: 'Upload file assets' },
  { module: 'files', action: 'download', key: 'files.download', description: 'Download files' },
  { module: 'files', action: 'share', key: 'files.share', description: 'Share files with users' },
  { module: 'files', action: 'delete', key: 'files.delete', description: 'Delete file assets' },
  { module: 'files', action: 'manage_folders', key: 'files.manage_folders', description: 'Create and manage folders' },

  // Notifications
  { module: 'notifications', action: 'view', key: 'notifications.view', description: 'View notifications' },
  { module: 'notifications', action: 'manage_preferences', key: 'notifications.manage_preferences', description: 'Configure notification alerts' },

  // Settings
  { module: 'settings', action: 'view', key: 'settings.view', description: 'View system settings' },
  { module: 'settings', action: 'edit_general', key: 'settings.edit_general', description: 'Modify workspace settings' },
  { module: 'settings', action: 'manage_users', key: 'settings.manage_users', description: 'Manage user accounts' },
  { module: 'settings', action: 'manage_roles', key: 'settings.manage_roles', description: 'Create and configure roles' },
  { module: 'settings', action: 'manage_permissions', key: 'settings.manage_permissions', description: 'Assign capability permissions' },
];

/**
 * Standard System Roles
 */
const SYSTEM_ROLES = [
  { name: 'Super Admin', description: 'Unrestricted root administrator', isSystem: true, isSuperAdmin: true },
  { name: 'Admin', description: 'Standard administrator with configurable permissions', isSystem: true, isSuperAdmin: false },
  { name: 'Manager', description: 'Department or project manager', isSystem: true, isSuperAdmin: false },
  { name: 'Sales Admin', description: 'Sales operations and pipeline administrator', isSystem: true, isSuperAdmin: false },
  { name: 'Sales Executive', description: 'Sales agent handling leads and client contacts', isSystem: true, isSuperAdmin: false },
  { name: 'Developer', description: 'Engineering team member handling project tasks', isSystem: true, isSuperAdmin: false },
  { name: 'Designer', description: 'Design team member handling creative tasks', isSystem: true, isSuperAdmin: false },
  { name: 'Accounts', description: 'Finance and billing officer handling payments and invoices', isSystem: true, isSuperAdmin: false },
];

async function main() {
  console.log('--- Starting OfficeCRM Database Seed ---');

  // 1. Seed Permissions
  console.log('Seeding capability permissions...');
  for (const perm of PERMISSIONS_DATA) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: { description: perm.description, module: perm.module, action: perm.action },
      create: perm,
    });
  }
  console.log(`Seeded ${PERMISSIONS_DATA.length} capability permissions.`);

  // 2. Seed Predefined Roles
  console.log('Seeding predefined roles...');
  for (const roleData of SYSTEM_ROLES) {
    await prisma.role.upsert({
      where: { name: roleData.name },
      update: { description: roleData.description, isSuperAdmin: roleData.isSuperAdmin, isSystem: roleData.isSystem },
      create: roleData,
    });
  }
  console.log(`Seeded ${SYSTEM_ROLES.length} predefined roles.`);

  // 3. Optional Environment-driven Super Admin Bootstrap
  // Never hardcode credentials. Super Admin account is only bootstrapped if env variables are explicitly provided.
  const adminEmail = process.env.SUPER_ADMIN_EMAIL;
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD;

  if (adminEmail && adminPassword) {
    console.log(`Bootstrapping Super Admin account for ${adminEmail}...`);
    const superAdminRole = await prisma.role.findUnique({ where: { name: 'Super Admin' } });
    if (superAdminRole) {
      const passwordHash = await bcrypt.hash(adminPassword, 12);
      await prisma.user.upsert({
        where: { email: adminEmail },
        update: { roleId: superAdminRole.id },
        create: {
          email: adminEmail,
          passwordHash,
          roleId: superAdminRole.id,
          accountStatus: 'ACTIVE',
        },
      });
      console.log('Super Admin account successfully bootstrapped.');
    }
  } else {
    console.log('Notice: SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD not set. Skipping admin user creation.');
  }

  // 4. Seed Default Workspace Setting if none exists
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
    console.log('Default WorkspaceSetting created.');
  }

  console.log('--- OfficeCRM Database Seed Completed Successfully ---');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
