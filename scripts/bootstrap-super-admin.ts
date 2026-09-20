import readline from 'readline';
import prisma from '../src/config/database';
import { AuditService } from '../src/services/audit.service';
import { hashPassword } from '../src/utils/password';

/**
 * Prompt terminal with masked input for sensitive fields like password
 */
function askQuestion(query: string, isPassword = false): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    if (!isPassword) {
      rl.question(query, (ans) => {
        rl.close();
        resolve(ans.trim());
      });
      return;
    }

    // Masked password input
    process.stdout.write(query);
    const stdin = process.stdin;
    const oldRaw = stdin.isRaw;
    if (stdin.isTTY && stdin.setRawMode) {
      stdin.setRawMode(true);
    }
    stdin.resume();

    let password = '';
    const onData = (ch: Buffer) => {
      const char = ch.toString('utf8');

      // Handle Enter (CR/LF)
      if (char === '\n' || char === '\r' || char === '\u0004') {
        stdin.removeListener('data', onData);
        if (stdin.isTTY && stdin.setRawMode) {
          stdin.setRawMode(oldRaw || false);
        }
        process.stdout.write('\n');
        rl.close();
        resolve(password);
        return;
      }

      // Handle Ctrl+C
      if (char === '\u0003') {
        process.stdout.write('\nOperation cancelled by user.\n');
        process.exit(1);
      }

      // Handle Backspace
      if (char === '\u0008' || char === '\x7f') {
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.write('\b \b');
        }
        return;
      }

      // Append character and echo asterisk
      password += char;
      process.stdout.write('*');
    };

    stdin.on('data', onData);
  });
}

function validatePasswordPolicy(password: string): string | null {
  if (password.length < 10) {
    return 'Password must be at least 10 characters long.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter.';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter.';
  }
  if (!/[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    return 'Password must contain at least one number or special character.';
  }
  return null;
}

async function generateNextEmployeeCode(): Promise<string> {
  const employees = await prisma.employee.findMany({
    select: { employeeCode: true },
    where: { employeeCode: { startsWith: 'EMP-' } },
  });

  let maxNum = 0;
  for (const emp of employees) {
    const num = parseInt(emp.employeeCode.replace('EMP-', ''), 10);
    if (!isNaN(num) && num > maxNum) {
      maxNum = num;
    }
  }

  const nextNum = maxNum + 1;
  return `EMP-${String(nextNum).padStart(4, '0')}`;
}

async function main() {
  console.log('====================================================');
  console.log(' OfficeCRM — Secure Super Admin Bootstrap');
  console.log('====================================================\n');

  // 1. Check if a Super Admin User already exists
  const existingSuperAdmin = await prisma.user.findFirst({
    where: {
      role: {
        isSuperAdmin: true,
      },
    },
    include: {
      role: true,
    },
  });

  if (existingSuperAdmin) {
    console.log('[SECURITY ALERT] A Super Admin account already exists:');
    console.log(`- Email      : ${existingSuperAdmin.email}`);
    console.log(`- Role       : ${existingSuperAdmin.role.name}`);
    console.log(`- Status     : ${existingSuperAdmin.accountStatus}`);
    console.log(`- Created At : ${existingSuperAdmin.createdAt.toISOString()}`);
    console.log('\nBootstrap halted: Duplicate Super Admin creation is blocked for security.');
    process.exit(0);
  }

  // 2. Fetch Super Admin Role
  const superAdminRole = await prisma.role.findFirst({
    where: { isSuperAdmin: true },
  });

  if (!superAdminRole) {
    console.error('[ERROR] No role with isSuperAdmin=true found in database.');
    console.error('Please run "npm run prisma:seed" first to initialize system roles.');
    process.exit(1);
  }

  // 3. Fetch Management Department
  const managementDept = await prisma.department.findUnique({
    where: { name: 'Management' },
  });

  // 4. Securely collect bootstrap inputs
  const firstName =
    process.env.SUPERADMIN_FIRST_NAME || (await askQuestion('Enter First Name: '));
  if (!firstName.trim()) {
    console.error('Error: First Name is required.');
    process.exit(1);
  }

  const lastName =
    process.env.SUPERADMIN_LAST_NAME || (await askQuestion('Enter Last Name: '));
  if (!lastName.trim()) {
    console.error('Error: Last Name is required.');
    process.exit(1);
  }

  const emailRaw =
    process.env.SUPERADMIN_EMAIL || (await askQuestion('Enter Login Email: '));
  const email = emailRaw.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    console.error('Error: Invalid email format.');
    process.exit(1);
  }

  // Check if email is already taken by any user
  const emailTaken = await prisma.user.findUnique({ where: { email } });
  if (emailTaken) {
    console.error(`Error: A user account with email "${email}" already exists.`);
    process.exit(1);
  }

  let password = process.env.SUPERADMIN_PASSWORD;
  if (!password) {
    password = await askQuestion('Enter Secure Password: ', true);
    const confirmPassword = await askQuestion('Confirm Password: ', true);

    if (password !== confirmPassword) {
      console.error('\nError: Passwords do not match.');
      process.exit(1);
    }
  }

  const passwordError = validatePasswordPolicy(password);
  if (passwordError) {
    console.error(`\nError: ${passwordError}`);
    process.exit(1);
  }

  // 5. Generate employeeCode and hash password
  const employeeCode = await generateNextEmployeeCode();
  const passwordHash = await hashPassword(password);

  console.log('\nCreating Super Admin account and linked Employee record...');

  // 6. Execute atomic creation in database transaction
  const result = await prisma.$transaction(async (tx) => {
    const employee = await tx.employee.create({
      data: {
        employeeCode,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email,
        jobTitle: 'Super Admin',
        departmentId: managementDept?.id ?? null,
        joiningDate: new Date(),
        employmentStatus: 'ACTIVE',
      },
    });

    const user = await tx.user.create({
      data: {
        employeeId: employee.id,
        email,
        passwordHash,
        roleId: superAdminRole.id,
        accountStatus: 'ACTIVE',
      },
    });

    return { employee, user };
  });

  // 7. Record Audit Log
  await AuditService.log({
    userId: result.user.id,
    action: 'SUPER_ADMIN_CREATED',
    entityType: 'USER',
    entityId: result.user.id,
    metadata: {
      email: result.user.email,
      employeeCode: result.employee.employeeCode,
    },
  });

  console.log('\n====================================================');
  console.log(' Super Admin Bootstrapped Successfully! ');
  console.log('====================================================');
  console.log(`- User ID       : ${result.user.id}`);
  console.log(`- Name          : ${result.employee.firstName} ${result.employee.lastName}`);
  console.log(`- Email         : ${result.user.email}`);
  console.log(`- Employee Code : ${result.employee.employeeCode}`);
  console.log(`- Job Title     : ${result.employee.jobTitle}`);
  console.log(`- Role          : ${superAdminRole.name} (isSuperAdmin: true)`);
  console.log(`- Status        : ACTIVE`);
  console.log('====================================================\n');
}

main()
  .catch((err) => {
    console.error('[ERROR] Bootstrap failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
