import prisma from '../src/config/database';
import { ClientsService } from '../src/modules/clients/clients.service';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { PermissionService } from '../src/services/permission.service';
import { AuthenticatedUser } from '../src/types/auth.types';
import { PermissionString } from '../src/types/permissions.types';
import { AppError } from '../src/utils/api-response';

async function main() {
  console.log('====================================================');
  console.log(' Testing Payments & Invoices Permissions');
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

  // User 1: Designer (no payments permissions by default)
  const testDesignerEmail = `test.designer.pay.${Date.now()}@officecrm.internal`;
  const designerEmployee = await prisma.employee.create({
    data: {
      employeeCode: `EMP-PD${Date.now().toString().slice(-4)}`,
      firstName: 'Cassandra',
      lastName: 'Cain',
      email: testDesignerEmail,
      jobTitle: 'Visual Artist',
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

  // User 2: Admin (has payments permissions)
  const testAdminEmail = `test.admin.pay.${Date.now()}@officecrm.internal`;
  const adminEmployee = await prisma.employee.create({
    data: {
      employeeCode: `EMP-PA${Date.now().toString().slice(-4)}`,
      firstName: 'Stephanie',
      lastName: 'Brown',
      email: testAdminEmail,
      jobTitle: 'Finance Administrator',
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

  // Setup test client
  const testClient = await ClientsService.createClient(
    {
      name: 'Wayne Enterprises Holdings',
      company: 'Wayne Corp',
      email: `test.pay.perm.${Date.now()}@wayne.example.com`,
    },
    superAdminActor
  );

  let invoiceId = '';

  try {
    // -----------------------------------------------------------------
    // Suite 1: Designer role lacks payments capabilities
    // -----------------------------------------------------------------
    console.log('--- Suite 1: User without payments permissions ---');
    const designerPermList = await PermissionService.getEffectivePermissions(designerUser.id);
    const designerPerms = new Set(designerPermList as PermissionString[]);

    assert(!designerPerms.has('payments.view'), 'Designer user lacks payments.view');
    assert(!designerPerms.has('payments.create_invoice'), 'Designer user lacks payments.create_invoice');
    assert(!designerPerms.has('payments.edit_invoice'), 'Designer user lacks payments.edit_invoice');
    assert(!designerPerms.has('payments.record_payment'), 'Designer user lacks payments.record_payment');
    assert(!designerPerms.has('payments.cancel_invoice'), 'Designer user lacks payments.cancel_invoice');
    assert(!designerPerms.has('payments.export'), 'Designer user lacks payments.export');

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
      !PermissionService.hasPermission(designerActor, 'payments.view'),
      'PermissionService blocks payments.view for designer user'
    );
    assert(
      !PermissionService.hasPermission(designerActor, 'payments.create_invoice'),
      'PermissionService blocks payments.create_invoice for designer user'
    );
    assert(
      !PermissionService.hasPermission(designerActor, 'payments.record_payment'),
      'PermissionService blocks payments.record_payment for designer user'
    );

    // -----------------------------------------------------------------
    // Suite 2: Admin role has payments capabilities
    // -----------------------------------------------------------------
    console.log('\n--- Suite 2: Admin user payments permissions ---');
    const adminPermList = await PermissionService.getEffectivePermissions(adminUser.id);
    const adminPerms = new Set(adminPermList as PermissionString[]);

    assert(adminPerms.has('payments.view'), 'Admin role has payments.view');
    assert(adminPerms.has('payments.create_invoice'), 'Admin role has payments.create_invoice');
    assert(adminPerms.has('payments.edit_invoice'), 'Admin role has payments.edit_invoice');
    assert(adminPerms.has('payments.record_payment'), 'Admin role has payments.record_payment');
    assert(adminPerms.has('payments.cancel_invoice'), 'Admin role has payments.cancel_invoice');

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
      PermissionService.hasPermission(adminActor, 'payments.view'),
      'PermissionService grants payments.view to admin user'
    );
    assert(
      PermissionService.hasPermission(adminActor, 'payments.create_invoice'),
      'PermissionService grants payments.create_invoice to admin user'
    );
    assert(
      PermissionService.hasPermission(adminActor, 'payments.record_payment'),
      'PermissionService grants payments.record_payment to admin user'
    );

    // Super Admin unconditionally bypasses all permission checks
    assert(
      PermissionService.hasPermission(superAdminActor, 'payments.create_invoice'),
      'Super Admin unconditionally bypasses all permission checks'
    );

    // -----------------------------------------------------------------
    // Suite 3: Admin creates invoice and records payment
    // -----------------------------------------------------------------
    console.log('\n--- Suite 3: Admin functional execution ---');
    const invoice = await PaymentsService.createInvoice(
      {
        clientId: testClient.id,
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 86400000),
        items: [{ description: 'Security audit', quantity: 1, unitPrice: 500 }],
      },
      adminActor
    );
    invoiceId = invoice.id;
    assert(invoice.total === '500.00', 'Admin created invoice with total 500.00');

    const payment = await PaymentsService.recordPayment(
      invoiceId,
      {
        amount: 250.0,
        paymentMethod: 'CHECK',
      },
      adminActor
    );
    assert(payment.amount === '250.00', 'Admin recorded partial payment');

    // -----------------------------------------------------------------
    // Suite 4: Individual Permission Overrides (DENY and ALLOW)
    // -----------------------------------------------------------------
    console.log('\n--- Suite 4: Individual Permission Overrides ---');
    const createInvoicePerm = await prisma.permission.findUnique({
      where: { key: 'payments.create_invoice' },
    });
    assert(createInvoicePerm !== null, 'payments.create_invoice permission exists');

    if (createInvoicePerm) {
      // Apply DENY override on Admin user
      const denyOverride = await prisma.userPermissionOverride.create({
        data: {
          userId: adminUser.id,
          permissionId: createInvoicePerm.id,
          allowed: false, // DENY
        },
      });

      const updatedAdminPerms = new Set(
        (await PermissionService.getEffectivePermissions(adminUser.id)) as PermissionString[]
      );
      assert(
        !updatedAdminPerms.has('payments.create_invoice'),
        'DENY override removes payments.create_invoice from admin user'
      );
      adminActor.permissions = updatedAdminPerms;
      assert(
        !PermissionService.hasPermission(adminActor, 'payments.create_invoice'),
        'PermissionService blocks payments.create_invoice with DENY override'
      );

      // Clean up override
      await prisma.userPermissionOverride.delete({ where: { id: denyOverride.id } });
      adminActor.permissions = new Set(
        (await PermissionService.getEffectivePermissions(adminUser.id)) as PermissionString[]
      );
    }

    const viewPaymentsPerm = await prisma.permission.findUnique({
      where: { key: 'payments.view' },
    });
    if (viewPaymentsPerm) {
      // Apply ALLOW override on Designer user
      const allowOverride = await prisma.userPermissionOverride.create({
        data: {
          userId: designerUser.id,
          permissionId: viewPaymentsPerm.id,
          allowed: true, // ALLOW
        },
      });

      const updatedDesignerPerms = new Set(
        (await PermissionService.getEffectivePermissions(designerUser.id)) as PermissionString[]
      );
      assert(
        updatedDesignerPerms.has('payments.view'),
        'ALLOW override grants payments.view to designer user'
      );
      designerActor.permissions = updatedDesignerPerms;
      assert(
        PermissionService.hasPermission(designerActor, 'payments.view'),
        'PermissionService grants payments.view with ALLOW override'
      );

      // Clean up override
      await prisma.userPermissionOverride.delete({ where: { id: allowOverride.id } });
    }
  } finally {
    console.log('\n--- Cleaning up temporary test fixtures ---');
    if (invoiceId) {
      await prisma.payment.deleteMany({ where: { invoiceId } });
      await prisma.invoiceItem.deleteMany({ where: { invoiceId } });
      await prisma.auditLog.deleteMany({ where: { entityId: invoiceId } });
      await prisma.invoice.deleteMany({ where: { id: invoiceId } });
    }

    await prisma.auditLog.deleteMany({ where: { entityId: testClient.id } });
    await prisma.client.deleteMany({ where: { id: testClient.id } });

    await prisma.user.deleteMany({ where: { id: { in: [designerUser.id, adminUser.id] } } });
    await prisma.employee.deleteMany({ where: { id: { in: [designerEmployee.id, adminEmployee.id] } } });
    console.log('Permissions cleanup completed successfully.');
  }

  console.log('\n====================================================');
  console.log(` Payments Permissions Summary: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('Payments permissions verification failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
