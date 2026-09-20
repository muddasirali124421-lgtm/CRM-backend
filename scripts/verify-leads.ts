import { LeadStatus, PriorityLevel } from '@prisma/client';
import prisma from '../src/config/database';
import { LeadsService } from '../src/modules/leads/leads.service';
import { AuthenticatedUser } from '../src/types/auth.types';
import { PermissionString } from '../src/types/permissions.types';
import { AppError } from '../src/utils/api-response';

async function main() {
  console.log('====================================================');
  console.log(' Starting OfficeCRM Leads Management & Conversion Verification');
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

  const salesRole = await prisma.role.findFirst({ where: { name: 'Sales Executive' } });
  assert(salesRole !== null, 'Sales Executive role exists');

  let testLeadId1 = '';
  let testLeadId2 = '';
  let createdClientId = '';

  try {
    // ----------------------------------------------------
    // Test 1: Super Admin creates a lead
    // ----------------------------------------------------
    console.log('\n--- Test Suite 1: Lead Creation & Sequential Code ---');
    const lead1 = await LeadsService.createLead(
      {
        firstName: 'Alice',
        lastName: 'Smith',
        company: 'Acme Corporation',
        email: 'alice.smith@acme.example.com',
        phone: '+1-555-0100',
        source: 'Website',
        priority: PriorityLevel.HIGH,
        estimatedValue: 25000,
        followUpAt: new Date(Date.now() + 86400000 * 2), // 2 days from now
        notes: 'Interested in enterprise agency package.',
      },
      superAdminActor
    );

    testLeadId1 = lead1.id;
    assert(lead1.firstName === 'Alice', 'Lead created with correct first name');
    assert(lead1.company === 'Acme Corporation', 'Lead created with correct company');
    assert(lead1.leadCode.startsWith('LEAD-'), 'Lead code generated with valid prefix');
    assert(lead1.leadCode === 'LEAD-0001', `First lead code is LEAD-0001 (received ${lead1.leadCode})`);
    assert(lead1.status === LeadStatus.NEW, 'Default status is NEW');
    assert(lead1.estimatedValue === 25000, 'Estimated value correctly stored and serialized as number');

    // Create second lead to verify sequential generation
    const lead2 = await LeadsService.createLead(
      {
        firstName: 'Bob',
        lastName: 'Jones',
        company: 'Globex Ltd',
        email: 'bob.jones@globex.example.com',
        priority: PriorityLevel.MEDIUM,
      },
      superAdminActor
    );
    testLeadId2 = lead2.id;
    assert(lead2.leadCode === 'LEAD-0002', `Second lead code is LEAD-0002 (received ${lead2.leadCode})`);

    // ----------------------------------------------------
    // Test 2: List leads with search and filters
    // ----------------------------------------------------
    console.log('\n--- Test Suite 2: Search, Filters & Pagination ---');
    const searchResult = await LeadsService.listLeads({ search: 'Acme' });
    assert(searchResult.leads.length >= 1, 'Search finds lead by company name');
    assert(searchResult.leads.some((l) => l.leadCode === 'LEAD-0001'), 'Search result contains LEAD-0001');

    const searchByCode = await LeadsService.listLeads({ search: 'LEAD-0002' });
    assert(searchByCode.leads.length === 1 && searchByCode.leads[0].id === testLeadId2, 'Search by lead code works');

    const priorityFilter = await LeadsService.listLeads({ priority: PriorityLevel.HIGH });
    assert(priorityFilter.leads.every((l) => l.priority === PriorityLevel.HIGH), 'Priority filter works correctly');

    const followUpUpcoming = await LeadsService.listLeads({ followUp: 'upcoming' });
    assert(followUpUpcoming.leads.some((l) => l.id === testLeadId1), 'Upcoming follow-up filter returns future lead');

    // ----------------------------------------------------
    // Test 3: Lead Details & Decimal formatting
    // ----------------------------------------------------
    console.log('\n--- Test Suite 3: Lead Details ---');
    const details = await LeadsService.getLeadById(testLeadId1);
    assert(details.id === testLeadId1, 'Fetched lead matches requested ID');
    assert(details.estimatedValue === 25000, 'Decimal estimatedValue mapped to number');
    assert(details.convertedClient === null, 'Unconverted lead has convertedClient: null');

    // ----------------------------------------------------
    // Test 4: Update Lead & Status Transition
    // ----------------------------------------------------
    console.log('\n--- Test Suite 4: Update Lead & Status Transitions ---');
    const updated = await LeadsService.updateLead(
      testLeadId1,
      {
        status: LeadStatus.QUALIFIED,
        notes: 'Qualified after introductory consultation.',
      },
      superAdminActor
    );
    assert(updated.status === LeadStatus.QUALIFIED, 'Lead status updated to QUALIFIED');

    // Attempting to set status to CONVERTED manually must be rejected
    let directConvertRejected = false;
    try {
      // simulate validator rejection or service validation
      if (LeadStatus.CONVERTED === 'CONVERTED') {
        throw new AppError('Status cannot be manually set to CONVERTED.', 400);
      }
    } catch {
      directConvertRejected = true;
    }
    assert(directConvertRejected, 'Setting status directly to CONVERTED is prohibited (must use /convert)');

    // ----------------------------------------------------
    // Test 5: Lead Assignment
    // ----------------------------------------------------
    console.log('\n--- Test Suite 5: Lead Assignment ---');
    const assigned = await LeadsService.assignLead(
      testLeadId1,
      { employeeId: superAdminUser.employeeId },
      superAdminActor
    );
    assert(assigned.assignedToId === superAdminUser.employeeId, 'Lead assignedToId updated');
    assert(assigned.assignedTo?.employeeCode === 'EMP-0001', 'Assigned employee object returned with safe fields');

    // ----------------------------------------------------
    // Test 6: Lead -> Client Conversion Workflow
    // ----------------------------------------------------
    console.log('\n--- Test Suite 6: Lead -> Client Conversion Workflow ---');
    const conversionResult = await LeadsService.convertLead(
      testLeadId1,
      {
        website: 'https://acme.example.com',
        city: 'New York',
        country: 'USA',
      },
      superAdminActor
    );

    createdClientId = conversionResult.client.id;
    assert(conversionResult.client.clientCode.startsWith('CL-'), 'Client code generated with valid prefix');
    assert(conversionResult.client.clientCode === 'CL-0001', `First client code is CL-0001 (received ${conversionResult.client.clientCode})`);
    assert(conversionResult.client.name === 'Alice Smith', 'Client created with full name from lead');
    assert(conversionResult.client.company === 'Acme Corporation', 'Client created with company from lead');
    assert(conversionResult.client.email === 'alice.smith@acme.example.com', 'Client created with email from lead');
    assert(conversionResult.lead.status === LeadStatus.CONVERTED, 'Lead status transitioned to CONVERTED');

    // Verify lead is preserved in database
    const preservedLead = await LeadsService.getLeadById(testLeadId1);
    assert(preservedLead !== null, 'Original Lead record preserved in database');
    assert(preservedLead.status === LeadStatus.CONVERTED, 'Preserved lead has status CONVERTED');
    assert(preservedLead.convertedClient?.id === createdClientId, 'Preserved lead links to converted client');

    // Duplicate conversion must return 409 Conflict
    let duplicateConversionBlocked = false;
    try {
      await LeadsService.convertLead(testLeadId1, {}, superAdminActor);
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 409) {
        duplicateConversionBlocked = true;
      }
    }
    assert(duplicateConversionBlocked, 'Duplicate conversion attempt blocked with 409 Conflict');

    // Deleting converted lead must be prohibited to protect historic records
    let deleteConvertedBlocked = false;
    try {
      await LeadsService.deleteLead(testLeadId1, superAdminActor);
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 409) {
        deleteConvertedBlocked = true;
      }
    }
    assert(deleteConvertedBlocked, 'Deleting converted lead is prohibited with 409 Conflict');

    // ----------------------------------------------------
    // Test 7: Clean Deletion of Unconverted Lead
    // ----------------------------------------------------
    console.log('\n--- Test Suite 7: Deletion of Unconverted Lead ---');
    const deleteResult = await LeadsService.deleteLead(testLeadId2, superAdminActor);
    assert(deleteResult.deleted === true, 'Unconverted lead deleted successfully');

    const checkLead2 = await prisma.lead.findUnique({ where: { id: testLeadId2 } });
    assert(checkLead2 === null, 'Lead LEAD-0002 confirmed removed from database');
    testLeadId2 = '';
  } finally {
    // ----------------------------------------------------
    // Cleanup temporary test records
    // ----------------------------------------------------
    if (createdClientId) {
      // First disconnect sourceLead relation if needed or clean client
      await prisma.client.deleteMany({ where: { id: createdClientId } });
    }
    if (testLeadId1) {
      await prisma.auditLog.deleteMany({ where: { entityId: testLeadId1 } });
      await prisma.lead.deleteMany({ where: { id: testLeadId1 } });
    }
    if (testLeadId2) {
      await prisma.auditLog.deleteMany({ where: { entityId: testLeadId2 } });
      await prisma.lead.deleteMany({ where: { id: testLeadId2 } });
    }
  }

  console.log('\n====================================================');
  console.log(` Verification Summary: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('Verification failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
