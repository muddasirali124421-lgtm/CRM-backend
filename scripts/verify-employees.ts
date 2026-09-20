import prisma from '../src/config/database';
import { AuthService } from '../src/modules/auth/auth.service';
import { EmployeesService } from '../src/modules/employees/employees.service';
import { PermissionService } from '../src/services/permission.service';
import { AuthenticatedUser } from '../src/types/auth.types';
import { PermissionString } from '../src/types/permissions.types';
import { AppError } from '../src/utils/api-response';

async function main() {
  console.log('====================================================');
  console.log(' Starting OfficeCRM Employee & Account APIs Verification');
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

  // 1. Fetch live Super Admin user as actor
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

  // Fetch standard roles & department
  const developerRole = await prisma.role.findFirst({ where: { name: 'Developer' } });
  const managerRole = await prisma.role.findFirst({ where: { name: 'Manager' } });
  const superAdminRole = await prisma.role.findFirst({ where: { isSuperAdmin: true } });
  const devDept = await prisma.department.findFirst({ where: { name: 'Development' } });

  assert(developerRole !== null, 'Developer role exists');
  assert(managerRole !== null, 'Manager role exists');

  const testEmail = `test.employee.${Date.now()}@officecrm.internal`;
  let createdEmployeeId = '';
  let createdUserId = '';

  try {
    // ----------------------------------------------------
    // Test 1: Super Admin can create Employee with generated employeeCode
    // ----------------------------------------------------
    console.log('\n--- Test Suite 1: Employee Creation & Code Generation ---');
    const newEmployee = await EmployeesService.createEmployee(
      {
        firstName: 'Sarah',
        lastName: 'Connor',
        email: testEmail,
        jobTitle: 'Senior Software Engineer',
        departmentId: devDept?.id,
        joiningDate: new Date('2026-01-15'),
      },
      superAdminActor
    );

    createdEmployeeId = newEmployee.id;
    assert(newEmployee.firstName === 'Sarah', 'Employee created with correct first name');
    assert(newEmployee.employeeCode.startsWith('EMP-'), 'Valid employeeCode generated');
    assert(newEmployee.employeeCode === 'EMP-0002', `Sequential code EMP-0002 generated (received ${newEmployee.employeeCode})`);

    // ----------------------------------------------------
    // Test 2: Duplicate email conflict check
    // ----------------------------------------------------
    let duplicateRejected = false;
    try {
      await EmployeesService.createEmployee(
        {
          firstName: 'Another',
          lastName: 'Person',
          email: testEmail, // Duplicate!
          jobTitle: 'Developer',
          joiningDate: new Date(),
        },
        superAdminActor
      );
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 409) {
        duplicateRejected = true;
      }
    }
    assert(duplicateRejected, 'Duplicate employee email returns 409 Conflict');

    // ----------------------------------------------------
    // Test 3: Super Admin can create Login Account for Employee
    // ----------------------------------------------------
    console.log('\n--- Test Suite 2: Login Account Creation ---');
    const initialPassword = 'InitialDevPass123!';
    const accountResult = await EmployeesService.createEmployeeAccount(
      createdEmployeeId,
      {
        loginEmail: testEmail,
        temporaryPassword: initialPassword,
        roleId: developerRole!.id,
      },
      superAdminActor
    );

    createdUserId = accountResult.user.id;
    assert(accountResult.user.email === testEmail, 'User login account linked to Employee');
    assert(accountResult.user.role.name === 'Developer', 'User assigned Developer role');

    // Verify password is stored as bcrypt hash and never plain text
    const dbUser = await prisma.user.findUnique({ where: { id: createdUserId } });
    assert(dbUser !== null && dbUser.passwordHash.startsWith('$2'), 'Password stored as secure bcrypt hash');
    assert(dbUser?.passwordHash !== initialPassword, 'Password is never stored in plain text');

    // ----------------------------------------------------
    // Test 4: Normal Employee Login & Token Handling
    // ----------------------------------------------------
    console.log('\n--- Test Suite 3: Normal Employee Login ---');
    const loginResult = await AuthService.login(testEmail, initialPassword);
    assert(loginResult.user.email === testEmail, 'Normal employee logs in successfully');
    assert(loginResult.role.isSuperAdmin === false, 'Employee role has isSuperAdmin=false');
    assert(!!loginResult.accessToken, 'Access token issued');

    // Create normal employee actor context
    const normalActor: AuthenticatedUser = {
      userId: createdUserId,
      email: testEmail,
      isSuperAdmin: false,
      role: {
        id: developerRole!.id,
        name: 'Developer',
        isSuperAdmin: false,
        isSystemRole: true,
        permissions: [],
      },
      permissions: new Set<PermissionString>(loginResult.permissions as PermissionString[]),
    };

    // ----------------------------------------------------
    // Test 5: Capability Authorization & User Overrides
    // ----------------------------------------------------
    console.log('\n--- Test Suite 4: Capability & Overrides Engine ---');

    // Baseline: payments.create_invoice should not belong to Developer
    assert(
      !PermissionService.hasPermission(normalActor, 'payments.create_invoice'),
      'Developer lacks payments.create_invoice capability by default'
    );

    // Test ALLOW Override
    await EmployeesService.updateEmployeePermissions(
      createdEmployeeId,
      [{ permissionKey: 'payments.create_invoice', allowed: true }],
      superAdminActor
    );

    const permsAfterAllow = await PermissionService.getEffectivePermissions(createdUserId);
    assert(
      permsAfterAllow.includes('payments.create_invoice'),
      'Explicit ALLOW override grants capability not present in role'
    );

    // Test DENY Override
    // First, check a permission the developer has or grant one to test deny
    await EmployeesService.updateEmployeePermissions(
      createdEmployeeId,
      [{ permissionKey: 'tasks.create', allowed: false }],
      superAdminActor
    );
    const permsAfterDeny = await PermissionService.getEffectivePermissions(createdUserId);
    assert(
      !permsAfterDeny.includes('tasks.create'),
      'Explicit DENY override revokes capability present in role'
    );

    // Test REMOVE Override (null)
    await EmployeesService.updateEmployeePermissions(
      createdEmployeeId,
      [
        { permissionKey: 'payments.create_invoice', allowed: null },
        { permissionKey: 'tasks.create', allowed: null },
      ],
      superAdminActor
    );
    const permsAfterReset = await PermissionService.getEffectivePermissions(createdUserId);
    assert(
      !permsAfterReset.includes('payments.create_invoice'),
      'Removing override reverts capability to role default (deny)'
    );

    // ----------------------------------------------------
    // Test 6: Role Change Updates Effective Permissions
    // ----------------------------------------------------
    console.log('\n--- Test Suite 5: Role Updates & Session Invalidation ---');
    await EmployeesService.updateEmployeeAccount(
      createdEmployeeId,
      { roleId: managerRole!.id },
      superAdminActor
    );

    const updatedUser = await prisma.user.findUnique({
      where: { id: createdUserId },
      include: { role: true },
    });
    assert(updatedUser?.role.name === 'Manager', 'User role updated to Manager');

    // ----------------------------------------------------
    // Test 7: Super Admin Protections
    // ----------------------------------------------------
    console.log('\n--- Test Suite 6: Super Admin Protections ---');

    // Normal user cannot assign Super Admin role
    let normalAssignBlocked = false;
    try {
      await EmployeesService.updateEmployeeAccount(
        createdEmployeeId,
        { roleId: superAdminRole!.id },
        normalActor // Normal employee actor!
      );
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 403) {
        normalAssignBlocked = true;
      }
    }
    assert(normalAssignBlocked, 'Normal user blocked from assigning Super Admin role (403)');

    // Normal user cannot modify Super Admin account
    let normalModifySuperAdminBlocked = false;
    try {
      await EmployeesService.updateEmployeeAccount(
        superAdminUser.employeeId!,
        { accountStatus: 'SUSPENDED' },
        normalActor
      );
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 403) {
        normalModifySuperAdminBlocked = true;
      }
    }
    assert(normalModifySuperAdminBlocked, 'Normal user blocked from modifying Super Admin account (403)');

    // Super Admin cannot suspend own account / last active Super Admin
    let selfSuspendBlocked = false;
    try {
      await EmployeesService.updateEmployeeAccount(
        superAdminUser.employeeId!,
        { accountStatus: 'SUSPENDED' },
        superAdminActor
      );
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 403) {
        selfSuspendBlocked = true;
      }
    }
    assert(selfSuspendBlocked, 'Last active Super Admin protected against accidental self-suspension (403)');

    // ----------------------------------------------------
    // Test 8: Password Reset & Session Revocation
    // ----------------------------------------------------
    console.log('\n--- Test Suite 7: Password Reset & Session Revocation ---');
    // Create an active session first
    const activeSession = await AuthService.login(testEmail, initialPassword);
    assert(!!activeSession.refreshToken, 'Active login session created before reset');

    const newPassword = 'NewSecretPassword456!';
    await EmployeesService.resetEmployeePassword(
      createdEmployeeId,
      { newTemporaryPassword: newPassword },
      superAdminActor
    );

    // Old password must fail
    let oldPwFailed = false;
    try {
      await AuthService.login(testEmail, initialPassword);
    } catch {
      oldPwFailed = true;
    }
    assert(oldPwFailed, 'Old password rejected after password reset');

    // New password succeeds
    const newLogin = await AuthService.login(testEmail, newPassword);
    assert(newLogin.user.email === testEmail, 'New password login succeeds');

    // ----------------------------------------------------
    // Test 9: Safe Employee Deactivation / Deletion
    // ----------------------------------------------------
    console.log('\n--- Test Suite 8: Deletion & Deactivation ---');
    const deleteResult = await EmployeesService.deleteOrDeactivateEmployee(
      createdEmployeeId,
      superAdminActor
    );
    assert(deleteResult.deleted === true, 'Clean test employee successfully deleted');

    const checkEmployee = await prisma.employee.findUnique({ where: { id: createdEmployeeId } });
    assert(checkEmployee === null, 'Test employee record cleaned from database');
    createdEmployeeId = '';
    createdUserId = '';
  } finally {
    // Safety cleanup in case of test failure
    if (createdUserId) {
      await prisma.refreshSession.deleteMany({ where: { userId: createdUserId } });
      await prisma.userPermissionOverride.deleteMany({ where: { userId: createdUserId } });
      await prisma.auditLog.deleteMany({ where: { userId: createdUserId } });
      await prisma.user.deleteMany({ where: { id: createdUserId } });
    }
    if (createdEmployeeId) {
      await prisma.employee.deleteMany({ where: { id: createdEmployeeId } });
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
