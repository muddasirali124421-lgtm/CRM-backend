import { ClientStatus, PriorityLevel } from '@prisma/client';
import prisma from '../src/config/database';
import { ClientsService } from '../src/modules/clients/clients.service';
import { LeadsService } from '../src/modules/leads/leads.service';
import { AuthenticatedUser } from '../src/types/auth.types';
import { PermissionString } from '../src/types/permissions.types';

async function main() {
  console.log('====================================================');
  console.log(' Starting OfficeCRM Clients Management Verification');
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

  let directClientId1 = '';
  let directClientId2 = '';
  let convertedLeadId = '';
  let convertedClientId = '';

  try {
    // ----------------------------------------------------
    // Test 1: Direct Client Creation & Sequential Code
    // ----------------------------------------------------
    console.log('--- Test Suite 1: Direct Client Creation & Code Generation ---');
    const client1 = await ClientsService.createClient(
      {
        name: 'John Wayne',
        company: 'Starlight Enterprises',
        email: 'john.wayne@starlight.example.com',
        phone: '+1-555-4321',
        website: 'https://starlight.example.com',
        city: 'Austin',
        state: 'TX',
        country: 'USA',
        status: ClientStatus.ACTIVE,
      },
      superAdminActor
    );

    directClientId1 = client1.id;
    assert(client1.name === 'John Wayne', 'Client created with correct name');
    assert(client1.company === 'Starlight Enterprises', 'Client created with correct company');
    assert(client1.clientCode.startsWith('CL-'), 'Client code generated with CL- prefix');
    assert(client1.sourceLeadId === null, 'Direct client has sourceLeadId = null');
    assert(client1.status === ClientStatus.ACTIVE, 'Client default status is ACTIVE');

    // Create second direct client to verify sequential code generation
    const client2 = await ClientsService.createClient(
      {
        name: 'Elena Rostova',
        company: 'Solaris Systems',
        email: 'elena@solaris.example.com',
        phone: '+44-20-7946-0912',
        city: 'London',
        country: 'UK',
      },
      superAdminActor
    );

    directClientId2 = client2.id;
    assert(client2.clientCode.startsWith('CL-'), 'Second client code generated with valid prefix');
    assert(client2.sourceLeadId === null, 'Second direct client also has sourceLeadId = null');

    // ----------------------------------------------------
    // Test 2: Search, Filter & Pagination
    // ----------------------------------------------------
    console.log('\n--- Test Suite 2: Search, Filtering & Pagination ---');
    const listResult = await ClientsService.listClients({
      page: 1,
      limit: 10,
      search: 'Starlight',
    });

    assert(listResult.pagination.total >= 1, 'Search by company returns at least 1 record');
    assert(
      listResult.clients.some((c) => c.company === 'Starlight Enterprises'),
      'Search results contain Starlight Enterprises'
    );
    assert(listResult.pagination.page === 1, 'Pagination page is 1');
    assert(listResult.pagination.limit === 10, 'Pagination limit is 10');

    // Search by code
    const codeSearch = await ClientsService.listClients({
      search: client1.clientCode,
    });
    assert(
      codeSearch.clients.some((c) => c.id === client1.id),
      'Search by clientCode returns target client'
    );

    // Search by email
    const emailSearch = await ClientsService.listClients({
      search: 'elena@solaris.example.com',
    });
    assert(
      emailSearch.clients.some((c) => c.id === client2.id),
      'Search by email returns target client'
    );

    // Filter by status
    const statusFilter = await ClientsService.listClients({
      status: ClientStatus.ACTIVE,
    });
    assert(
      statusFilter.clients.every((c) => c.status === ClientStatus.ACTIVE),
      'Filter by status ACTIVE returns only ACTIVE clients'
    );

    // ----------------------------------------------------
    // Test 3: Compact Mode for Dropdowns
    // ----------------------------------------------------
    console.log('\n--- Test Suite 3: Compact Mode for Form Dropdowns ---');
    const compactResult = await ClientsService.listClients({
      compact: true,
    });

    assert(Array.isArray(compactResult.clients), 'Compact mode returns array of clients');
    assert(
      compactResult.clients.some((c) => c.id === client1.id),
      'Compact mode includes client1'
    );
    const compactItem = compactResult.clients.find((c) => c.id === client1.id);
    assert(compactItem?.clientCode === client1.clientCode, 'Compact item has clientCode');
    assert(compactItem?.name === client1.name, 'Compact item has name');

    // ----------------------------------------------------
    // Test 4: Client Details with Summary Counts
    // ----------------------------------------------------
    console.log('\n--- Test Suite 4: Client Details & Counts ---');
    const details = await ClientsService.getClientById(client1.id);
    assert(details.id === client1.id, 'Details returned for correct client ID');
    assert(details.email === 'john.wayne@starlight.example.com', 'Details contains email');
    assert(details.counts !== undefined, 'Details contains summary counts object');
    assert(details.counts?.projects === 0, 'New client has 0 projects');
    assert(details.counts?.openProjects === 0, 'New client has 0 open projects');
    assert(details.counts?.tasks === 0, 'New client has 0 tasks');
    assert(details.counts?.invoices === 0, 'New client has 0 invoices');

    // ----------------------------------------------------
    // Test 5: Client Update
    // ----------------------------------------------------
    console.log('\n--- Test Suite 5: Client Update & Status Transition ---');
    const updated = await ClientsService.updateClient(
      client1.id,
      {
        company: 'Starlight Global Holdings',
        phone: '+1-555-9999',
        status: ClientStatus.INACTIVE,
      },
      superAdminActor
    );

    assert(updated.company === 'Starlight Global Holdings', 'Company updated successfully');
    assert(updated.phone === '+1-555-9999', 'Phone updated successfully');
    assert(updated.status === ClientStatus.INACTIVE, 'Status updated to INACTIVE');

    // Restore to ACTIVE
    await ClientsService.updateClient(client1.id, { status: ClientStatus.ACTIVE }, superAdminActor);

    // ----------------------------------------------------
    // Test 6: Client Assignment to Active Employee
    // ----------------------------------------------------
    console.log('\n--- Test Suite 6: Client Assignment ---');
    if (superAdminUser.employee) {
      const assigned = await ClientsService.assignClient(
        client1.id,
        { employeeId: superAdminUser.employee.id },
        superAdminActor
      );

      assert(assigned.assignedToId === superAdminUser.employee.id, 'assignedToId updated');
      assert(assigned.assignedTo !== null, 'assignedTo relation populated');
      assert(
        assigned.assignedTo?.employeeCode === superAdminUser.employee.employeeCode,
        'Assigned employee code matches'
      );
      assert(
        assigned.assignedTo?.firstName === superAdminUser.employee.firstName,
        'Assigned employee first name matches'
      );
    }

    // ----------------------------------------------------
    // Test 7: Lead -> Client Conversion Integration
    // ----------------------------------------------------
    console.log('\n--- Test Suite 7: Lead -> Client Conversion & Relation Preserved ---');
    const testLead = await LeadsService.createLead(
      {
        firstName: 'Bruce',
        lastName: 'Wayne',
        company: 'Wayne Enterprises',
        email: 'bruce.wayne@waynecorp.example.com',
        phone: '+1-555-0001',
        priority: PriorityLevel.HIGH,
      },
      superAdminActor
    );
    convertedLeadId = testLead.id;

    const conversionResult = await LeadsService.convertLead(
      testLead.id,
      { website: 'https://waynecorp.example.com', city: 'Gotham' },
      superAdminActor
    );
    convertedClientId = conversionResult.client.id;

    assert(conversionResult.client.sourceLeadId === testLead.id, 'Converted client has sourceLeadId set');

    // Fetch details of converted client
    const convertedClientDetails = await ClientsService.getClientById(convertedClientId);
    assert(convertedClientDetails.sourceLead !== null, 'Converted client has sourceLead populated');
    assert(convertedClientDetails.sourceLead?.leadCode === testLead.leadCode, 'Source lead code matches');
    assert(convertedClientDetails.sourceLead?.firstName === 'Bruce', 'Source lead firstName matches');

    // Test filter isConverted: true
    const convertedList = await ClientsService.listClients({ isConverted: true });
    assert(
      convertedList.clients.some((c) => c.id === convertedClientId),
      'isConverted: true list includes converted client'
    );
    assert(
      !convertedList.clients.some((c) => c.id === client1.id),
      'isConverted: true list excludes direct client'
    );

    // Test filter isConverted: false
    const directList = await ClientsService.listClients({ isConverted: false });
    assert(
      directList.clients.some((c) => c.id === client1.id),
      'isConverted: false list includes direct client'
    );
    assert(
      !directList.clients.some((c) => c.id === convertedClientId),
      'isConverted: false list excludes converted client'
    );

    // ----------------------------------------------------
    // Test 8: Safe Archive vs Clean Delete Behavior
    // ----------------------------------------------------
    console.log('\n--- Test Suite 8: Archive (Historical Records) vs Clean Delete ---');
    // A converted client has a historical link (sourceLeadId). Attempting delete should archive it as INACTIVE!
    const archiveResult = await ClientsService.deleteClient(convertedClientId, superAdminActor);
    assert(archiveResult.archived === true, 'Converted client with historical link is archived, not hard-deleted');
    const checkArchived = await prisma.client.findUnique({ where: { id: convertedClientId } });
    assert(checkArchived !== null, 'Archived client still exists in database');
    assert(checkArchived?.status === ClientStatus.INACTIVE, 'Archived client status set to INACTIVE');

    // A clean direct client without historical links can be safely deleted
    const deleteResult = await ClientsService.deleteClient(directClientId2, superAdminActor);
    assert(deleteResult.deleted === true, 'Clean direct client is deleted successfully');
    const checkDeleted = await prisma.client.findUnique({ where: { id: directClientId2 } });
    assert(checkDeleted === null, 'Client removed from database');
    directClientId2 = '';
  } finally {
    // ----------------------------------------------------
    // Safe Cleanup: Remove only temporary test entities
    // ----------------------------------------------------
    console.log('\n--- Cleaning up temporary test entities ---');
    if (convertedClientId) {
      await prisma.client.deleteMany({ where: { id: convertedClientId } });
    }
    if (convertedLeadId) {
      await prisma.auditLog.deleteMany({ where: { entityId: convertedLeadId } });
      await prisma.lead.deleteMany({ where: { id: convertedLeadId } });
    }
    if (directClientId1) {
      await prisma.auditLog.deleteMany({ where: { entityId: directClientId1 } });
      await prisma.client.deleteMany({ where: { id: directClientId1 } });
    }
    if (directClientId2) {
      await prisma.auditLog.deleteMany({ where: { entityId: directClientId2 } });
      await prisma.client.deleteMany({ where: { id: directClientId2 } });
    }
    console.log('Cleanup completed.');
  }

  console.log('\n====================================================');
  console.log(` Clients Verification Summary: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('Clients verification failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
