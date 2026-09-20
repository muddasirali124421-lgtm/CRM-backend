import prisma from '../src/config/database';
import { AuthService } from '../src/modules/auth/auth.service';
import { PermissionService } from '../src/services/permission.service';
import { AppError } from '../src/utils/api-response';
import { generateRefreshTokenString, hashRefreshToken, signAccessToken, verifyAccessToken } from '../src/utils/jwt';
import { hashPassword, verifyPassword } from '../src/utils/password';

async function runTests() {
  console.log('====================================================');
  console.log(' Starting OfficeCRM Authentication & Permission Verification');
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

  // ----------------------------------------------------
  // 1. Password Hashing & Verification
  // ----------------------------------------------------
  console.log('--- Test Suite 1: Password Utilities ---');
  const rawPw = 'SuperSecret123!';
  const hashed = await hashPassword(rawPw);
  assert(hashed !== rawPw, 'Password is hashed and not plain text');
  assert(hashed.startsWith('$2'), 'Bcrypt hash format is valid');
  assert(await verifyPassword(rawPw, hashed), 'Valid password verification returns true');
  assert(!(await verifyPassword('IncorrectPassword!', hashed)), 'Invalid password verification returns false');

  // ----------------------------------------------------
  // 2. JWT Access Token Signing & Verification
  // ----------------------------------------------------
  console.log('\n--- Test Suite 2: JWT Access Tokens ---');
  const tokenPayload = {
    userId: 'test-user-id-001',
    email: 'test@officecrm.internal',
    roleId: 'test-role-id-001',
    isSuperAdmin: true,
  };
  const token = signAccessToken(tokenPayload);
  const decoded = verifyAccessToken(token);
  assert(decoded.userId === tokenPayload.userId, 'Decoded token matches user ID');
  assert(decoded.isSuperAdmin === true, 'Decoded token contains isSuperAdmin flag');
  let tokenRejected = false;
  try {
    verifyAccessToken(token + 'tampered');
  } catch {
    tokenRejected = true;
  }
  assert(tokenRejected, 'Tampered token is rejected');

  // ----------------------------------------------------
  // 3. Refresh Token Hashing & Opaque String Generation
  // ----------------------------------------------------
  console.log('\n--- Test Suite 3: Refresh Token Hashing ---');
  const rawRefreshToken = generateRefreshTokenString();
  const tokenHash = hashRefreshToken(rawRefreshToken);
  assert(rawRefreshToken.length === 80, 'Refresh token has 80 hex characters (40 bytes entropy)');
  assert(tokenHash.length === 64, 'SHA-256 hash has 64 hex characters');
  assert(hashRefreshToken(rawRefreshToken) === tokenHash, 'Refresh token hashing is deterministic');

  // ----------------------------------------------------
  // 4. Permission Service & Role Hierarchy
  // ----------------------------------------------------
  console.log('\n--- Test Suite 4: Effective Permission Engine ---');
  const superAdminRole = await prisma.role.findFirst({ where: { isSuperAdmin: true } });
  const adminRole = await prisma.role.findFirst({ where: { name: 'Admin' } });
  const developerRole = await prisma.role.findFirst({ where: { name: 'Developer' } });

  assert(superAdminRole !== null && superAdminRole.isSuperAdmin === true, 'Super Admin role exists with isSuperAdmin=true');
  assert(adminRole !== null && adminRole.isSuperAdmin === false, 'Admin role has isSuperAdmin=false');
  assert(developerRole !== null && developerRole.isSuperAdmin === false, 'Developer role has isSuperAdmin=false');

  // Setup temporary test user to verify permission calculation and overrides
  const testEmail = `test.verify.${Date.now()}@officecrm.internal`;
  const testPwHash = await hashPassword('TestVerification123!');

  const testUser = await prisma.user.create({
    data: {
      email: testEmail,
      passwordHash: testPwHash,
      roleId: developerRole!.id,
      accountStatus: 'ACTIVE',
    },
  });

  try {
    // A: Check baseline permissions for developer (initially empty or role-based)
    const basePerms = await PermissionService.getEffectivePermissions(testUser.id);
    assert(Array.isArray(basePerms), 'Returns array of effective permissions');

    // B: Test ALLOW Override
    const paymentsViewPerm = await prisma.permission.findUnique({ where: { key: 'payments.view' } });
    if (paymentsViewPerm) {
      await prisma.userPermissionOverride.create({
        data: {
          userId: testUser.id,
          permissionId: paymentsViewPerm.id,
          allowed: true, // EXPLICIT ALLOW
        },
      });

      const overriddenPerms = await PermissionService.getEffectivePermissions(testUser.id);
      assert(overriddenPerms.includes('payments.view'), 'ALLOW user override successfully grants capability');
    }

    // C: Test DENY Override
    const projectsViewPerm = await prisma.permission.findUnique({ where: { key: 'projects.view' } });
    if (projectsViewPerm) {
      // First ensure role has projects.view
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: developerRole!.id, permissionId: projectsViewPerm.id } },
        update: { allowed: true },
        create: { roleId: developerRole!.id, permissionId: projectsViewPerm.id, allowed: true },
      });

      // Now set DENY override on user
      await prisma.userPermissionOverride.upsert({
        where: { userId_permissionId: { userId: testUser.id, permissionId: projectsViewPerm.id } },
        update: { allowed: false },
        create: { userId: testUser.id, permissionId: projectsViewPerm.id, allowed: false }, // EXPLICIT DENY
      });

      const deniedPerms = await PermissionService.getEffectivePermissions(testUser.id);
      assert(!deniedPerms.includes('projects.view'), 'DENY user override successfully revokes capability');
    }

    // D: Test Super Admin bypass returns complete catalog
    await prisma.user.update({
      where: { id: testUser.id },
      data: { roleId: superAdminRole!.id },
    });
    const superAdminPerms = await PermissionService.getEffectivePermissions(testUser.id);
    const totalPermissions = await prisma.permission.count();
    assert(
      superAdminPerms.length === totalPermissions,
      `Super Admin receives complete catalog (${superAdminPerms.length}/${totalPermissions})`
    );

    // ----------------------------------------------------
    // 5. Authentication Flow & Status Verification
    // ----------------------------------------------------
    console.log('\n--- Test Suite 5: Authentication Flow ---');

    // A: Successful login
    const loginResult = await AuthService.login(testEmail, 'TestVerification123!');
    assert(loginResult.user.email === testEmail, 'Login succeeds for valid credentials');
    assert(!!loginResult.accessToken, 'Access token is issued');
    assert(!!loginResult.refreshToken, 'Refresh token is issued');

    // B: Refresh token flow
    const refreshResult = await AuthService.refresh(loginResult.refreshToken);
    assert(!!refreshResult.accessToken, 'Refresh token rotation issues new access token');
    assert(refreshResult.refreshToken !== loginResult.refreshToken, 'Refresh token is rotated');

    // C: Logout revokes session
    await AuthService.logout(refreshResult.refreshToken, testUser.id);
    let reuseRejected = false;
    try {
      await AuthService.refresh(refreshResult.refreshToken);
    } catch {
      reuseRejected = true;
    }
    assert(reuseRejected, 'Revoked refresh token is rejected on reuse');

    // D: Invalid password fails generically
    let wrongPwFailed = false;
    try {
      await AuthService.login(testEmail, 'WrongPassword123!');
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 401 && err.message === 'Invalid email or password.') {
        wrongPwFailed = true;
      }
    }
    assert(wrongPwFailed, 'Wrong password returns generic 401 error');

    // E: Non-existent email fails generically
    let unknownEmailFailed = false;
    try {
      await AuthService.login('unknown.nonexistent@officecrm.internal', 'AnyPassword123!');
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 401 && err.message === 'Invalid email or password.') {
        unknownEmailFailed = true;
      }
    }
    assert(unknownEmailFailed, 'Non-existent email returns generic 401 error (no email enumeration)');

    // F: Suspended account rejection
    await prisma.user.update({
      where: { id: testUser.id },
      data: { accountStatus: 'SUSPENDED' },
    });
    let suspendedRejected = false;
    try {
      await AuthService.login(testEmail, 'TestVerification123!');
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 403) {
        suspendedRejected = true;
      }
    }
    assert(suspendedRejected, 'Suspended account is blocked from login with 403');
  } finally {
    // Clean up temporary test fixtures so database remains in original state
    await prisma.refreshSession.deleteMany({ where: { userId: testUser.id } });
    await prisma.userPermissionOverride.deleteMany({ where: { userId: testUser.id } });
    await prisma.auditLog.deleteMany({ where: { userId: testUser.id } });
    await prisma.user.delete({ where: { id: testUser.id } });
  }

  console.log('\n====================================================');
  console.log(` Test Results: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests()
  .catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
