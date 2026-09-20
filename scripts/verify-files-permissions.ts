import prisma from '../src/config/database';
import { FilesService } from '../src/modules/files/files.service';
import { storageProvider } from '../src/services/storage';
import { AuthenticatedUser } from '../src/types/auth.types';
import { PermissionString } from '../src/types/permissions.types';
import { AppError } from '../src/utils/api-response';

async function main() {
  console.log('====================================================');
  console.log(' Starting OfficeCRM Files Permissions Verification');
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
    console.error('Super Admin user not found. Please bootstrap first.');
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

  // 2. Setup standard test employee & user
  const testRole = await prisma.role.findFirst({
    where: { name: 'Developer', isSuperAdmin: false },
  });

  if (!testRole) {
    console.error('Developer role not found in database.');
    process.exit(1);
  }

  const uniqueSuffix = Date.now();
  const testEmp = await prisma.employee.create({
    data: {
      employeeCode: `EMP-FP-${uniqueSuffix.toString().slice(-4)}`,
      firstName: 'Alan',
      lastName: 'Turing',
      email: `turing.${uniqueSuffix}@agency.example.com`,
      jobTitle: 'Cryptographer',
      joiningDate: new Date(),
    },
  });

  const testUser = await prisma.user.create({
    data: {
      email: `turing.${uniqueSuffix}@agency.example.com`,
      passwordHash: 'dummy_hash',
      roleId: testRole.id,
      employeeId: testEmp.id,
    },
    include: { role: true },
  });

  // User with files.view only
  const standardUserActor: AuthenticatedUser = {
    userId: testUser.id,
    email: testUser.email,
    isSuperAdmin: false,
    role: {
      id: testRole.id,
      name: testRole.name,
      isSuperAdmin: false,
      isSystemRole: testRole.isSystem,
      permissions: ['files.view'],
    },
    employeeId: testEmp.id,
    permissions: new Set<PermissionString>(['files.view']),
  };

  // User with files.view + files.upload
  const uploaderUserActor: AuthenticatedUser = {
    ...standardUserActor,
    permissions: new Set<PermissionString>(['files.view', 'files.upload', 'files.download']),
  };

  let fileId1 = '';
  let fileId2 = '';

  try {
    // ----------------------------------------------------
    // Test 1: Upload with permissions
    // ----------------------------------------------------
    console.log('\n--- 1. Upload Permission Enforcement ---');
    const pdfBuffer = Buffer.from('%PDF-1.5\n%test\n%%EOF');

    const file1 = await FilesService.uploadFile(
      pdfBuffer,
      'turing-notes.pdf',
      'application/pdf',
      pdfBuffer.length,
      { name: 'Turing Notes' },
      uploaderUserActor
    );
    fileId1 = file1.id;
    assert(file1.uploadedById === testUser.id, 'User with files.upload uploaded file successfully');

    // ----------------------------------------------------
    // Test 2: Access control - Private file ownership check
    // ----------------------------------------------------
    console.log('\n--- 2. Access Control on Private File ---');
    // Uploader can view own file
    const viewOwn = await FilesService.getFileById(fileId1, uploaderUserActor);
    assert(viewOwn.id === fileId1, 'Uploader can access their own uploaded file');

    // Super Admin can access any file
    const superAdminView = await FilesService.getFileById(fileId1, superAdminActor);
    assert(superAdminView.id === fileId1, 'Super Admin can access file regardless of accessLevel');

    // Another user without sharing cannot access private file
    const otherUserActor: AuthenticatedUser = {
      userId: '00000000-1111-2222-3333-444444444444',
      email: 'outsider@agency.example.com',
      isSuperAdmin: false,
      role: {
        id: testRole.id,
        name: testRole.name,
        isSuperAdmin: false,
        isSystemRole: testRole.isSystem,
        permissions: ['files.view'],
      },
      permissions: new Set<PermissionString>(['files.view']),
    };

    let outsiderBlocked = false;
    try {
      await FilesService.getFileById(fileId1, otherUserActor);
    } catch (err: any) {
      if (err instanceof AppError && err.statusCode === 403) {
        outsiderBlocked = true;
      }
    }
    assert(outsiderBlocked, 'Outsider accessing private file by ID is blocked with 403 Forbidden');

    // ----------------------------------------------------
    // Test 3: Download authorization check
    // ----------------------------------------------------
    console.log('\n--- 3. Secure Download Authorization ---');
    let downloadBlocked = false;
    try {
      await FilesService.getDownloadStream(fileId1, otherUserActor);
    } catch (err: any) {
      if (err instanceof AppError && err.statusCode === 403) {
        downloadBlocked = true;
      }
    }
    assert(downloadBlocked, 'Outsider downloading unauthorized file blocked with 403');

    const downloadStream = await FilesService.getDownloadStream(fileId1, uploaderUserActor);
    assert(downloadStream.stream !== undefined, 'Authorized user gets secure download stream');

    // ----------------------------------------------------
    // Test 4: Delete permission check
    // ----------------------------------------------------
    console.log('\n--- 4. Delete Permission Check ---');
    let deleteBlocked = false;
    try {
      // otherUserActor tries to delete uploader's file
      await FilesService.deleteFile(fileId1, otherUserActor);
    } catch (err: any) {
      if (err instanceof AppError && err.statusCode === 403) {
        deleteBlocked = true;
      }
    }
    assert(deleteBlocked, 'Non-owner non-admin blocked from deleting file with 403');

    // Super Admin can delete any file
    const superAdminDel = await FilesService.deleteFile(fileId1, superAdminActor);
    assert(superAdminDel.message.includes('deleted successfully'), 'Super Admin can delete file');
    fileId1 = ''; // Cleaned up
  } finally {
    console.log('\n--- Cleaning up temporary permission test fixtures ---');
    if (fileId1) {
      const f = await prisma.fileAsset.findUnique({ where: { id: fileId1 } }).catch(() => null);
      if (f) {
        await storageProvider.delete(f.storageKey).catch(() => {});
        await prisma.fileAsset.delete({ where: { id: fileId1 } }).catch(() => {});
      }
    }
    if (fileId2) {
      const f = await prisma.fileAsset.findUnique({ where: { id: fileId2 } }).catch(() => null);
      if (f) {
        await storageProvider.delete(f.storageKey).catch(() => {});
        await prisma.fileAsset.delete({ where: { id: fileId2 } }).catch(() => {});
      }
    }

    await prisma.auditLog.deleteMany({ where: { userId: testUser.id } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: testUser.id } }).catch(() => {});
    await prisma.employee.deleteMany({ where: { id: testEmp.id } }).catch(() => {});

    console.log('Permission fixtures cleaned up successfully.');
  }

  console.log('\n====================================================');
  console.log(` Files Permissions Summary: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('Permissions verification failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
