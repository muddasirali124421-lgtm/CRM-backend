import fs from 'fs';
import path from 'path';
import { FileAccessLevel } from '@prisma/client';
import prisma from '../src/config/database';
import { FilesService } from '../src/modules/files/files.service';
import { ClientsService } from '../src/modules/clients/clients.service';
import { ProjectsService } from '../src/modules/projects/projects.service';
import { TasksService } from '../src/modules/tasks/tasks.service';
import { storageProvider } from '../src/services/storage';
import { AuthenticatedUser } from '../src/types/auth.types';
import { PermissionString } from '../src/types/permissions.types';
import { AppError } from '../src/utils/api-response';

async function main() {
  console.log('====================================================');
  console.log(' Starting OfficeCRM Files & Storage Tests');
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

  // Setup fixtures
  const testClient = await ClientsService.createClient(
    {
      name: 'Cyberdyne Systems Research',
      company: 'Cyberdyne Files Lab',
      email: `test.files.client.${Date.now()}@cyberdyne.example.com`,
    },
    superAdminActor
  );

  const testProject = await ProjectsService.createProject(
    {
      name: 'Skynet Files Integration Project',
      clientId: testClient.id,
    },
    superAdminActor
  );

  const testTask = await TasksService.createTask(
    {
      title: 'Analyze Neural Hardware Schematics',
      projectId: testProject.id,
      clientId: testClient.id,
    },
    superAdminActor
  );

  let folderId1 = '';
  let folderId2 = '';
  let fileId1 = '';
  let fileId2 = '';
  let fileId3 = '';

  try {
    // ----------------------------------------------------
    // Test 1: Folder Management (CRUD & Hierarchy)
    // ----------------------------------------------------
    console.log('\n--- 1. Folder Management ---');
    const folder1 = await FilesService.createFolder(
      { name: 'Engineering Schematics' },
      superAdminActor
    );
    folderId1 = folder1.id;
    assert(folder1.name === 'Engineering Schematics', 'Created root folder "Engineering Schematics"');
    assert(folder1.parentId === null, 'Root folder has null parentId');

    const folder2 = await FilesService.createFolder(
      { name: 'Architecture Diagrams', parentId: folderId1 },
      superAdminActor
    );
    folderId2 = folder2.id;
    assert(folder2.parentId === folderId1, 'Created subfolder linked to parent folder');

    const folderList = await FilesService.listFolders(superAdminActor);
    assert(folderList.length >= 2, 'Folder list retrieves created folders');

    // Update folder
    const updatedFolder = await FilesService.updateFolder(
      folderId1,
      { name: 'Core Engineering Docs' },
      superAdminActor
    );
    assert(updatedFolder.name === 'Core Engineering Docs', 'Folder name updated successfully');

    // ----------------------------------------------------
    // Test 2: File Upload with Local Storage & Safe Metadata
    // ----------------------------------------------------
    console.log('\n--- 2. File Upload & Safe Key Generation ---');
    // Minimal valid PDF binary: %PDF-1.5 ...
    const samplePdfBuffer = Buffer.from(
      '%PDF-1.5\n%\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF'
    );

    const uploadedPdf = await FilesService.uploadFile(
      samplePdfBuffer,
      'schematic-blueprint.pdf',
      'application/pdf',
      samplePdfBuffer.length,
      {
        name: 'Neural Core v1 Schematic',
        folderId: folderId1,
        relatedType: 'PROJECT',
        relatedId: testProject.id,
        accessLevel: FileAccessLevel.EVERYONE,
      },
      superAdminActor
    );
    fileId1 = uploadedPdf.id;

    assert(uploadedPdf.id !== undefined, 'File uploaded with valid UUID ID');
    assert(uploadedPdf.name === 'Neural Core v1 Schematic', 'Display name assigned correctly');
    assert(uploadedPdf.originalName === 'schematic-blueprint.pdf', 'Original filename preserved');
    assert(uploadedPdf.mimeType === 'application/pdf', 'MIME type is application/pdf');
    assert(uploadedPdf.size === samplePdfBuffer.length, 'Size in bytes stored correctly');
    assert(uploadedPdf.folderId === folderId1, 'File associated with folderId1');
    assert(uploadedPdf.relatedType === 'PROJECT', 'File relatedType is PROJECT');
    assert(uploadedPdf.relatedId === testProject.id, 'File relatedId matches testProject.id');
    assert(uploadedPdf.storageProvider === 'local', 'Storage provider is local');
    assert((uploadedPdf as any).storageKey === undefined, 'Raw storage key NOT leaked in SafeFileResponse');

    // Verify storage object physically exists
    const dbFile1 = await prisma.fileAsset.findUnique({ where: { id: fileId1 } });
    assert(dbFile1 !== null, 'File record present in database');
    const physicalExists = await storageProvider.exists(dbFile1!.storageKey);
    assert(physicalExists === true, 'Uploaded binary physically exists on disk in storage/');

    // ----------------------------------------------------
    // Test 3: Task Attachment Integration
    // ----------------------------------------------------
    console.log('\n--- 3. Task Attachment Integration ---');
    const taskTxtBuffer = Buffer.from('System specs and checklist details for neural interface.');
    const uploadedTaskFile = await FilesService.uploadFile(
      taskTxtBuffer,
      'task-spec.txt',
      'text/plain',
      taskTxtBuffer.length,
      {
        name: 'Task Specs Document',
        relatedType: 'TASK',
        relatedId: testTask.id,
        accessLevel: FileAccessLevel.EVERYONE,
      },
      superAdminActor
    );
    fileId2 = uploadedTaskFile.id;

    // Verify task details returns attachment metadata
    const taskDetails = await TasksService.getTaskById(testTask.id);
    assert(
      taskDetails.attachments.some((att) => att.id === fileId2),
      'Task details endpoint reflects uploaded attachment metadata'
    );

    // ----------------------------------------------------
    // Test 4: Client File Integration
    // ----------------------------------------------------
    console.log('\n--- 4. Client File Integration ---');
    const clientCsvBuffer = Buffer.from('id,name,role\n1,Sarah,Commander');
    const uploadedClientFile = await FilesService.uploadFile(
      clientCsvBuffer,
      'client-roster.csv',
      'text/csv',
      clientCsvBuffer.length,
      {
        name: 'Client Staff Roster',
        relatedType: 'CLIENT',
        relatedId: testClient.id,
        accessLevel: FileAccessLevel.EVERYONE,
      },
      superAdminActor
    );
    fileId3 = uploadedClientFile.id;
    assert(uploadedClientFile.relatedType === 'CLIENT', 'File linked to Client');

    // ----------------------------------------------------
    // Test 5: Inconsistent / Invalid Entity Relations
    // ----------------------------------------------------
    console.log('\n--- 5. Invalid Relation Validation ---');
    let invalidRelationBlocked = false;
    try {
      await FilesService.uploadFile(
        samplePdfBuffer,
        'orphan.pdf',
        'application/pdf',
        samplePdfBuffer.length,
        {
          relatedType: 'PROJECT',
          relatedId: '00000000-0000-0000-0000-000000000000', // Non-existent project UUID
        },
        superAdminActor
      );
    } catch (err: any) {
      if (err instanceof AppError && err.statusCode === 404) {
        invalidRelationBlocked = true;
      }
    }
    assert(invalidRelationBlocked, 'Linking file to non-existent project rejected with 404');

    // ----------------------------------------------------
    // Test 6: Security - Path Traversal & Injection Prevention
    // ----------------------------------------------------
    console.log('\n--- 6. Security & Path Traversal Prevention ---');
    let pathTraversalBlocked = false;
    try {
      await storageProvider.getDownload('../../../../../../../windows/system32/cmd.exe');
    } catch (err: any) {
      if (err instanceof AppError && err.statusCode === 400 && err.message.includes('traversal')) {
        pathTraversalBlocked = true;
      }
    }
    assert(pathTraversalBlocked, 'Storage key path traversal attempt blocked safely');

    // ----------------------------------------------------
    // Test 7: Security - Magic Bytes Validation
    // ----------------------------------------------------
    console.log('\n--- 7. Security: Magic Bytes & MIME-Spoofing ---');
    let magicByteMismatchBlocked = false;
    try {
      // Send plain text string but claim it's application/pdf
      const fakePdfBuffer = Buffer.from('echo "malicious payload";');
      await FilesService.uploadFile(
        fakePdfBuffer,
        'fake.pdf',
        'application/pdf',
        fakePdfBuffer.length,
        {},
        superAdminActor
      );
    } catch (err: any) {
      if (err instanceof AppError && err.statusCode === 400 && err.message.includes('File header')) {
        magicByteMismatchBlocked = true;
      }
    }
    assert(magicByteMismatchBlocked, 'MIME-spoofed file (non-PDF bytes claiming application/pdf) blocked');

    // ----------------------------------------------------
    // Test 8: List Files & Filtering
    // ----------------------------------------------------
    console.log('\n--- 8. File List Filtering & Search ---');
    const allFiles = await FilesService.listFiles({}, superAdminActor);
    assert(allFiles.items.length >= 3, 'List files returns multiple items');

    const projectFilter = await FilesService.listFiles({ projectId: testProject.id }, superAdminActor);
    assert(
      projectFilter.items.some((f) => f.id === fileId1) &&
        !projectFilter.items.some((f) => f.id === fileId3),
      'Filter by projectId correctly isolates project files'
    );

    const taskFilter = await FilesService.listFiles({ taskId: testTask.id }, superAdminActor);
    assert(
      taskFilter.items.some((f) => f.id === fileId2),
      'Filter by taskId correctly isolates task files'
    );

    const searchFilter = await FilesService.listFiles({ search: 'Schematic' }, superAdminActor);
    assert(
      searchFilter.items.some((f) => f.id === fileId1),
      'Search query across file names returns matched file'
    );

    // ----------------------------------------------------
    // Test 9: Secure Download
    // ----------------------------------------------------
    console.log('\n--- 9. Secure Download Stream ---');
    const download = await FilesService.getDownloadStream(fileId1, superAdminActor);
    assert(download.stream !== undefined, 'Download returns valid Readable stream');
    assert(download.mimeType === 'application/pdf', 'Download returns correct MIME type');
    assert(download.filename === 'schematic-blueprint.pdf', 'Download returns sanitized original filename');
    assert(download.size === samplePdfBuffer.length, 'Download returns accurate byte length');

    // Read stream content into buffer to confirm data integrity
    const chunks: Buffer[] = [];
    for await (const chunk of download.stream) {
      chunks.push(Buffer.from(chunk));
    }
    const downloadedBuffer = Buffer.concat(chunks);
    assert(downloadedBuffer.equals(samplePdfBuffer), 'Downloaded binary content matches uploaded content exactly');

    // ----------------------------------------------------
    // Test 10: Update File Metadata
    // ----------------------------------------------------
    console.log('\n--- 10. Update File Metadata ---');
    const updatedFile = await FilesService.updateFile(
      fileId1,
      {
        name: 'Neural Core v2 Final Blueprint',
        starred: true,
      },
      superAdminActor
    );
    assert(updatedFile.name === 'Neural Core v2 Final Blueprint', 'File display name updated');
    assert(updatedFile.starred === true, 'File starred status updated to true');

    // ----------------------------------------------------
    // Test 11: Folder Safety on Deletion
    // ----------------------------------------------------
    console.log('\n--- 11. Folder Deletion Safety ---');
    let folderDeleteBlocked = false;
    try {
      // folder1 contains file1 and subfolder2! Deleting folder1 must be prevented
      await FilesService.deleteFolder(folderId1, superAdminActor);
    } catch (err: any) {
      if (err instanceof AppError && err.statusCode === 400 && err.message.includes('Please move or delete')) {
        folderDeleteBlocked = true;
      }
    }
    assert(folderDeleteBlocked, 'Folder deletion blocked when folder contains files or subfolders');

    // ----------------------------------------------------
    // Test 12: Coordinated File Deletion (DB + Storage)
    // ----------------------------------------------------
    console.log('\n--- 12. Coordinated File Deletion ---');
    const delResult = await FilesService.deleteFile(fileId3, superAdminActor);
    assert(delResult.message.includes('deleted successfully'), 'File deleted successfully');

    const dbFile3 = await prisma.fileAsset.findUnique({ where: { id: fileId3 } });
    assert(dbFile3 === null, 'File record removed from database');

    // Verify AuditLog for file operations
    const fileAudit = await prisma.auditLog.findFirst({
      where: { entityType: 'FILE', entityId: fileId3, action: 'FILE_DELETED' },
    });
    assert(fileAudit !== null, 'FILE_DELETED action logged in AuditLog');
  } finally {
    // ----------------------------------------------------
    // Safe Cleanup: Remove temporary test files and DB records
    // ----------------------------------------------------
    console.log('\n--- Cleaning up temporary test fixtures ---');
    const filesToClean = [fileId1, fileId2, fileId3].filter(Boolean);
    for (const fId of filesToClean) {
      const f = await prisma.fileAsset.findUnique({ where: { id: fId } }).catch(() => null);
      if (f) {
        await storageProvider.delete(f.storageKey).catch(() => {});
        await prisma.auditLog.deleteMany({ where: { entityId: fId } }).catch(() => {});
        await prisma.fileShare.deleteMany({ where: { fileId: fId } }).catch(() => {});
        await prisma.fileAsset.delete({ where: { id: fId } }).catch(() => {});
      }
    }

    if (folderId2) {
      await prisma.auditLog.deleteMany({ where: { entityId: folderId2 } }).catch(() => {});
      await prisma.fileFolder.delete({ where: { id: folderId2 } }).catch(() => {});
    }
    if (folderId1) {
      await prisma.auditLog.deleteMany({ where: { entityId: folderId1 } }).catch(() => {});
      await prisma.fileFolder.delete({ where: { id: folderId1 } }).catch(() => {});
    }

    if (testTask.id) {
      await prisma.taskAssignee.deleteMany({ where: { taskId: testTask.id } }).catch(() => {});
      await prisma.taskActivity.deleteMany({ where: { taskId: testTask.id } }).catch(() => {});
      await prisma.auditLog.deleteMany({ where: { entityId: testTask.id } }).catch(() => {});
      await prisma.task.delete({ where: { id: testTask.id } }).catch(() => {});
    }

    if (testProject.id) {
      await prisma.projectMember.deleteMany({ where: { projectId: testProject.id } }).catch(() => {});
      await prisma.auditLog.deleteMany({ where: { entityId: testProject.id } }).catch(() => {});
      await prisma.project.delete({ where: { id: testProject.id } }).catch(() => {});
    }

    if (testClient.id) {
      await prisma.auditLog.deleteMany({ where: { entityId: testClient.id } }).catch(() => {});
      await prisma.client.delete({ where: { id: testClient.id } }).catch(() => {});
    }

    console.log('Cleanup completed successfully.');
  }

  console.log('\n====================================================');
  console.log(` Files Verification Summary: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('Files verification failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
