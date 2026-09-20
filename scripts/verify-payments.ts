import { InvoiceStatus, PriorityLevel, Prisma } from '@prisma/client';
import prisma from '../src/config/database';
import { ClientsService } from '../src/modules/clients/clients.service';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { ProjectsService } from '../src/modules/projects/projects.service';
import { AuthenticatedUser } from '../src/types/auth.types';
import { PermissionString } from '../src/types/permissions.types';
import { AppError } from '../src/utils/api-response';

async function main() {
  console.log('====================================================');
  console.log(' Starting OfficeCRM Payments & Invoices Tests');
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

  // Setup test client 1
  const testClient1 = await ClientsService.createClient(
    {
      name: 'Cyberdyne Systems',
      company: 'Cyberdyne AI & Defense',
      email: `test.pay.client1.${Date.now()}@cyberdyne.example.com`,
    },
    superAdminActor
  );

  // Setup test client 2 (for cross-client mismatch checks)
  const testClient2 = await ClientsService.createClient(
    {
      name: 'Soylent Corporation',
      company: 'Soylent Industries',
      email: `test.pay.client2.${Date.now()}@soylent.example.com`,
    },
    superAdminActor
  );

  // Setup test project for client 1
  const testProject1 = await ProjectsService.createProject(
    {
      name: 'Neural Net Architecture Project',
      clientId: testClient1.id,
    },
    superAdminActor
  );

  let invoiceId1 = '';
  let invoiceId2 = '';
  let paymentId1 = '';
  let paymentId2 = '';

  try {
    // ----------------------------------------------------
    // Test 1: Collision-safe invoice number generation
    // ----------------------------------------------------
    console.log('\n--- 1. Invoice Code Generation ---');
    const invCode = await PaymentsService.generateNextInvoiceNumber();
    assert(/^INV-\d{4}$/.test(invCode), `Generated invoice code '${invCode}' matches INV-XXXX format`);

    // ----------------------------------------------------
    // Test 2: Server-side Calculation & Exact Decimal Safety
    // ----------------------------------------------------
    console.log('\n--- 2. Create Invoice & Server Calculation ---');
    const pastDueDate = new Date(Date.now() - 3600 * 48 * 1000); // 2 days ago
    const pastIssueDate = new Date(Date.now() - 3600 * 72 * 1000); // 3 days ago

    // Line items:
    // Item 1: 5 x 100.00 = 500.00
    // Item 2: 2.5 x 200.00 = 500.00
    // Subtotal = 1000.00
    // Discount = 50.00
    // Tax = 100.00
    // Expected Total = 1000.00 - 50.00 + 100.00 = 1050.00
    const invoice1 = await PaymentsService.createInvoice(
      {
        clientId: testClient1.id,
        projectId: testProject1.id,
        issueDate: pastIssueDate,
        dueDate: pastDueDate,
        currency: 'USD',
        notes: 'Initial milestone payment schedule',
        discount: 50.0,
        tax: 100.0,
        status: InvoiceStatus.SENT,
        items: [
          {
            description: 'Core Architecture Consultation',
            quantity: 5,
            unitPrice: 100.0,
          },
          {
            description: 'Sub-system Simulation Modules',
            quantity: '2.50',
            unitPrice: '200.00',
          },
        ],
      },
      superAdminActor
    );
    invoiceId1 = invoice1.id;

    assert(invoice1.subtotal === '1000.00', 'Subtotal calculated correctly server-side (1000.00)');
    assert(invoice1.discount === '50.00', 'Discount set correctly (50.00)');
    assert(invoice1.tax === '100.00', 'Tax set correctly (100.00)');
    assert(invoice1.total === '1050.00', 'Total calculated correctly server-side (1050.00)');
    assert(invoice1.amountPaid === '0.00', 'Initial amountPaid is 0.00');
    assert(invoice1.balanceDue === '1050.00', 'Initial balanceDue equals total (1050.00)');
    assert(invoice1.items.length === 2, 'Two relational InvoiceItems created');
    assert(invoice1.isOverdue === true, 'Unpaid invoice with past due date is marked overdue');

    // ----------------------------------------------------
    // Test 3: Client & Project Validation
    // ----------------------------------------------------
    console.log('\n--- 3. Client & Project Validation ---');
    let mismatchRejected = false;
    try {
      await PaymentsService.createInvoice(
        {
          clientId: testClient2.id, // Client 2
          projectId: testProject1.id, // Project belongs to Client 1!
          issueDate: new Date(),
          dueDate: new Date(Date.now() + 86400000),
          items: [{ description: 'Test', quantity: 1, unitPrice: 100 }],
        },
        superAdminActor
      );
    } catch (err: any) {
      if (err instanceof AppError && err.statusCode === 400 && err.message.includes('does not belong to the specified client')) {
        mismatchRejected = true;
      }
    }
    assert(mismatchRejected, 'Mismatched Client + Project is rejected with 400 Bad Request');

    // ----------------------------------------------------
    // Test 4: Partial Payment 1 (1050.00 total, pay 350.00)
    // ----------------------------------------------------
    console.log('\n--- 4. Partial Payment 1 ---');
    const payment1 = await PaymentsService.recordPayment(
      invoiceId1,
      {
        amount: 350.0,
        paymentMethod: 'BANK_TRANSFER',
        reference: 'WIRE-CYBER-001',
        notes: 'First tranche deposit',
      },
      superAdminActor
    );
    paymentId1 = payment1.id;

    assert(payment1.amount === '350.00', 'Payment 1 amount formatted as 350.00');

    const invAfterP1 = await PaymentsService.getInvoiceById(invoiceId1);
    assert(invAfterP1.amountPaid === '350.00', 'Invoice amountPaid updated to 350.00');
    assert(invAfterP1.balanceDue === '700.00', 'Invoice balanceDue updated to 700.00 (1050 - 350)');
    assert(invAfterP1.status === InvoiceStatus.PARTIAL, 'Invoice status transitioned to PARTIAL');

    // ----------------------------------------------------
    // Test 5: Partial Payment 2 (pay 400.00)
    // ----------------------------------------------------
    console.log('\n--- 5. Partial Payment 2 ---');
    const payment2 = await PaymentsService.recordPayment(
      invoiceId1,
      {
        amount: '400.00',
        paymentMethod: 'STRIPE',
        reference: 'ch_test_stripe_002',
      },
      superAdminActor
    );
    paymentId2 = payment2.id;

    const invAfterP2 = await PaymentsService.getInvoiceById(invoiceId1);
    assert(invAfterP2.amountPaid === '750.00', 'Cumulative amountPaid updated to 750.00 (350 + 400)');
    assert(invAfterP2.balanceDue === '300.00', 'Invoice balanceDue updated to 300.00');
    assert(invAfterP2.status === InvoiceStatus.PARTIAL, 'Invoice status remains PARTIAL');

    // ----------------------------------------------------
    // Test 6: Overpayment Prevention
    // ----------------------------------------------------
    console.log('\n--- 6. Overpayment Prevention ---');
    let overpaymentBlocked = false;
    try {
      // Remaining balance is 300.00, attempting to pay 350.00
      await PaymentsService.recordPayment(
        invoiceId1,
        {
          amount: 350.0,
          paymentMethod: 'CASH',
        },
        superAdminActor
      );
    } catch (err: any) {
      if (err instanceof AppError && err.statusCode === 400 && err.message.includes('exceeds outstanding balance')) {
        overpaymentBlocked = true;
      }
    }
    assert(overpaymentBlocked, 'Overpayment beyond outstanding balance (350 > 300) blocked with 400');

    // ----------------------------------------------------
    // Test 7: Full Payment (pay remaining 300.00)
    // ----------------------------------------------------
    console.log('\n--- 7. Full Payment ---');
    const payment3 = await PaymentsService.recordPayment(
      invoiceId1,
      {
        amount: 300.0,
        paymentMethod: 'CHECK',
        reference: 'CHK-998811',
      },
      superAdminActor
    );

    const invAfterFull = await PaymentsService.getInvoiceById(invoiceId1);
    assert(invAfterFull.amountPaid === '1050.00', 'Invoice amountPaid equals total (1050.00)');
    assert(invAfterFull.balanceDue === '0.00', 'Invoice balanceDue is 0.00');
    assert(invAfterFull.status === InvoiceStatus.PAID, 'Invoice status transitioned to PAID');
    assert(invAfterFull.isOverdue === false, 'Fully paid invoice is never marked overdue');

    // ----------------------------------------------------
    // Test 8: List Invoices & Filtering
    // ----------------------------------------------------
    console.log('\n--- 8. List Invoices & Search ---');
    const invList = await PaymentsService.listInvoices({
      clientId: testClient1.id,
      page: 1,
      limit: 10,
    });
    assert(invList.items.length >= 1, 'Invoices list returns items');
    assert(invList.pagination.total >= 1, 'Pagination metadata calculated correctly');

    const searchRes = await PaymentsService.listInvoices({
      search: 'Cyberdyne',
    });
    assert(searchRes.items.some((i) => i.id === invoiceId1), 'Search by client company finds invoice');

    // ----------------------------------------------------
    // Test 9: List Payments & Filtering
    // ----------------------------------------------------
    console.log('\n--- 9. List Payments ---');
    const paymentsList = await PaymentsService.listPayments({
      invoiceId: invoiceId1,
    });
    assert(paymentsList.items.length === 3, 'Found all 3 recorded payments for invoice');

    // ----------------------------------------------------
    // Test 10: Payment Details API
    // ----------------------------------------------------
    console.log('\n--- 10. Payment Details Payload ---');
    const pmDetails = await PaymentsService.getPaymentById(paymentId1);
    assert(pmDetails.id === paymentId1, 'Payment details retrieved by ID');
    assert(pmDetails.amount === '350.00', 'Payment amount verified');
    assert(pmDetails.invoiceNumber !== undefined, 'Payment includes invoiceNumber');

    // ----------------------------------------------------
    // Test 11: Edit Payment inside Transaction
    // ----------------------------------------------------
    console.log('\n--- 11. Edit Payment & Auto-Recalculate ---');
    // First, delete payment 3 so there is headroom to edit payment 2
    await PaymentsService.deletePayment(payment3.id, superAdminActor);

    // Current state: P1 = 350, P2 = 400. Total paid = 750, balanceDue = 300.
    // Edit P2 from 400 to 500: Total paid = 850, balanceDue = 200.
    const editedP2 = await PaymentsService.updatePayment(
      paymentId2,
      { amount: 500.0, notes: 'Adjusted tranche 2 amount' },
      superAdminActor
    );
    assert(editedP2.amount === '500.00', 'Payment 2 amount updated to 500.00');

    const invAfterEdit = await PaymentsService.getInvoiceById(invoiceId1);
    assert(invAfterEdit.amountPaid === '850.00', 'Invoice amountPaid recalculated to 850.00 (350 + 500)');
    assert(invAfterEdit.balanceDue === '200.00', 'Invoice balanceDue recalculated to 200.00');
    assert(invAfterEdit.status === InvoiceStatus.PARTIAL, 'Invoice status is PARTIAL');

    // ----------------------------------------------------
    // Test 12: Delete Payment inside Transaction
    // ----------------------------------------------------
    console.log('\n--- 12. Delete Payment & Auto-Recalculate ---');
    // Delete payment 2 (500.00). Only P1 (350.00) remains.
    const delPmRes = await PaymentsService.deletePayment(paymentId2, superAdminActor);
    assert(delPmRes.message.includes('successfully'), 'Payment deleted successfully');

    const invAfterDelPm = await PaymentsService.getInvoiceById(invoiceId1);
    assert(invAfterDelPm.amountPaid === '350.00', 'Invoice amountPaid rolled back to 350.00');
    assert(invAfterDelPm.balanceDue === '700.00', 'Invoice balanceDue rolled back to 700.00');

    // ----------------------------------------------------
    // Test 13: Safe Invoice Cancellation vs Hard Delete
    // ----------------------------------------------------
    console.log('\n--- 13. Safe Invoice Cancellation ---');
    // Attempt to delete Invoice 1 (has payment 1 history)
    const delInv1 = await PaymentsService.deleteInvoice(invoiceId1, superAdminActor);
    assert(delInv1.cancelled === true, 'Invoice with payment history was cancelled, not hard-deleted');

    const invAfterCancel = await PaymentsService.getInvoiceById(invoiceId1);
    assert(invAfterCancel.status === InvoiceStatus.CANCELLED, 'Invoice status set to CANCELLED');

    // Create Invoice 2 with no payments, then hard-delete it
    const invoice2 = await PaymentsService.createInvoice(
      {
        clientId: testClient1.id,
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 86400000),
        items: [{ description: 'One-off Consulting', quantity: 1, unitPrice: 250 }],
      },
      superAdminActor
    );
    invoiceId2 = invoice2.id;

    const delInv2 = await PaymentsService.deleteInvoice(invoiceId2, superAdminActor);
    assert(delInv2.deleted === true, 'Clean invoice without payments was hard-deleted');

    let fetchDelInvFailed = false;
    try {
      await PaymentsService.getInvoiceById(invoiceId2);
    } catch (err: any) {
      if (err instanceof AppError && err.statusCode === 404) {
        fetchDelInvFailed = true;
      }
    }
    assert(fetchDelInvFailed, 'Fetching hard-deleted invoice returns 404');

    // ----------------------------------------------------
    // Test 14: Financial Summary API
    // ----------------------------------------------------
    console.log('\n--- 14. Financial Summary ---');
    const summary = await PaymentsService.getFinancialSummary({ clientId: testClient1.id });
    assert(typeof summary.totalInvoiced === 'string', 'Financial summary returns totalInvoiced string');
    assert(typeof summary.totalPaid === 'string', 'Financial summary returns totalPaid string');
    assert(typeof summary.totalOutstanding === 'string', 'Financial summary returns totalOutstanding string');
    assert(summary.invoicesCount.total >= 0, 'Invoices breakdown returned');

    // ----------------------------------------------------
    // Test 15: AuditLog Verification
    // ----------------------------------------------------
    console.log('\n--- 15. AuditLog Trail ---');
    const invoiceAudit = await prisma.auditLog.findFirst({
      where: { entityType: 'INVOICE', entityId: invoiceId1, action: 'INVOICE_CREATED' },
    });
    assert(invoiceAudit !== null, 'INVOICE_CREATED event logged to AuditLog');

    const paymentAudit = await prisma.auditLog.findFirst({
      where: { entityType: 'PAYMENT', action: 'PAYMENT_RECORDED' },
    });
    assert(paymentAudit !== null, 'PAYMENT_RECORDED event logged to AuditLog');
  } finally {
    // ----------------------------------------------------
    // Safe Cleanup: Remove only temporary test fixtures
    // ----------------------------------------------------
    console.log('\n--- Cleaning up temporary test fixtures ---');
    if (invoiceId1) {
      await prisma.payment.deleteMany({ where: { invoiceId: invoiceId1 } });
      await prisma.invoiceItem.deleteMany({ where: { invoiceId: invoiceId1 } });
      await prisma.auditLog.deleteMany({ where: { entityId: invoiceId1 } });
      await prisma.invoice.deleteMany({ where: { id: invoiceId1 } });
    }
    if (invoiceId2) {
      await prisma.payment.deleteMany({ where: { invoiceId: invoiceId2 } });
      await prisma.invoiceItem.deleteMany({ where: { invoiceId: invoiceId2 } });
      await prisma.auditLog.deleteMany({ where: { entityId: invoiceId2 } });
      await prisma.invoice.deleteMany({ where: { id: invoiceId2 } });
    }

    if (testProject1.id) {
      await prisma.projectMember.deleteMany({ where: { projectId: testProject1.id } });
      await prisma.auditLog.deleteMany({ where: { entityId: testProject1.id } });
      await prisma.project.deleteMany({ where: { id: testProject1.id } });
    }

    await prisma.auditLog.deleteMany({ where: { entityId: { in: [testClient1.id, testClient2.id] } } });
    await prisma.client.deleteMany({ where: { id: { in: [testClient1.id, testClient2.id] } } });

    console.log('Cleanup completed successfully.');
  }

  console.log('\n====================================================');
  console.log(` Payments Verification Summary: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('Payments verification failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
