import { EmploymentStatus, Prisma, UserAccountStatus } from '@prisma/client';
import prisma from '../../config/database';
import { AuditService } from '../../services/audit.service';
import { PermissionService } from '../../services/permission.service';
import { AuthenticatedUser } from '../../types/auth.types';
import { AppError } from '../../utils/api-response';
import { hashPassword } from '../../utils/password';
import {
  CreateEmployeeAccountDTO,
  CreateEmployeeDTO,
  EmployeeDetailResponse,
  EmployeeFilterQuery,
  PermissionOverrideInput,
  SafeEmployeeListItem,
  UpdateEmployeeAccountDTO,
  UpdateEmployeeDTO,
} from './employees.types';

export class EmployeesService {
  /**
   * Helper to generate next sequential employee code
   */
  public static async generateNextEmployeeCode(): Promise<string> {
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

    return `EMP-${String(maxNum + 1).padStart(4, '0')}`;
  }

  /**
   * GET /api/employees
   * List employees with filtering, searching, sorting, and pagination
   */
  public static async listEmployees(query: EmployeeFilterQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.EmployeeWhereInput = {};

    // Status filter
    if (query.status) {
      where.employmentStatus = query.status;
    }

    // Department filter
    if (query.departmentId) {
      where.departmentId = query.departmentId;
    }

    // Role filter (via linked user)
    if (query.roleId) {
      where.user = {
        roleId: query.roleId,
      };
    }

    // Search on employeeCode, firstName, lastName, email, jobTitle
    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { employeeCode: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { jobTitle: { contains: search, mode: 'insensitive' } },
      ];
    }

    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';
    const orderBy: Prisma.EmployeeOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [total, employees] = await Promise.all([
      prisma.employee.count({ where }),
      prisma.employee.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          department: {
            select: { id: true, name: true },
          },
          user: {
            select: {
              id: true,
              email: true,
              accountStatus: true,
              role: {
                select: { id: true, name: true, isSuperAdmin: true },
              },
            },
          },
        },
      }),
    ]);

    const data: SafeEmployeeListItem[] = employees.map((emp) => ({
      id: emp.id,
      employeeCode: emp.employeeCode,
      firstName: emp.firstName,
      lastName: emp.lastName,
      email: emp.email,
      phone: emp.phone,
      jobTitle: emp.jobTitle,
      employmentStatus: emp.employmentStatus,
      joiningDate: emp.joiningDate,
      profileImage: emp.profileImage,
      createdAt: emp.createdAt,
      department: emp.department,
      user: emp.user,
    }));

    return {
      employees: data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * GET /api/employees/:id
   * Detailed employee profile with counts and linked user summary
   */
  public static async getEmployeeById(id: string): Promise<EmployeeDetailResponse> {
    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        department: {
          select: { id: true, name: true },
        },
        user: {
          select: {
            id: true,
            email: true,
            accountStatus: true,
            role: {
              select: { id: true, name: true, isSuperAdmin: true },
            },
          },
        },
        _count: {
          select: {
            managedProjects: true,
            projectMemberships: true,
            assignedTasks: true,
            assignedLeads: true,
          },
        },
      },
    });

    if (!employee) {
      throw new AppError('Employee not found', 404);
    }

    return {
      id: employee.id,
      employeeCode: employee.employeeCode,
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
      phone: employee.phone,
      jobTitle: employee.jobTitle,
      employmentStatus: employee.employmentStatus,
      joiningDate: employee.joiningDate,
      profileImage: employee.profileImage,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt,
      department: employee.department,
      user: employee.user,
      counts: employee._count,
    };
  }

  /**
   * POST /api/employees
   * Create a new employee profile with automatic employeeCode generation
   */
  public static async createEmployee(
    data: CreateEmployeeDTO,
    actor: AuthenticatedUser
  ): Promise<SafeEmployeeListItem> {
    const email = data.email.trim().toLowerCase();

    // Check for email collision across employees
    const existingEmployee = await prisma.employee.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (existingEmployee) {
      throw new AppError(`An employee with email "${email}" already exists.`, 409);
    }

    // Verify department exists if provided
    if (data.departmentId) {
      const dept = await prisma.department.findUnique({ where: { id: data.departmentId } });
      if (!dept) {
        throw new AppError('Specified department does not exist.', 404);
      }
    }

    const employeeCode = await this.generateNextEmployeeCode();

    const employee = await prisma.employee.create({
      data: {
        employeeCode,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        email,
        phone: data.phone?.trim() || null,
        jobTitle: data.jobTitle.trim(),
        departmentId: data.departmentId || null,
        joiningDate: data.joiningDate,
        employmentStatus: data.employmentStatus ?? EmploymentStatus.ACTIVE,
        profileImage: data.profileImage || null,
      },
      include: {
        department: { select: { id: true, name: true } },
        user: {
          select: {
            id: true,
            email: true,
            accountStatus: true,
            role: { select: { id: true, name: true, isSuperAdmin: true } },
          },
        },
      },
    });

    AuditService.log({
      userId: actor.userId,
      action: 'EMPLOYEE_CREATED',
      entityType: 'EMPLOYEE',
      entityId: employee.id,
      metadata: { employeeCode: employee.employeeCode, email: employee.email },
    });

    return {
      id: employee.id,
      employeeCode: employee.employeeCode,
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
      phone: employee.phone,
      jobTitle: employee.jobTitle,
      employmentStatus: employee.employmentStatus,
      joiningDate: employee.joiningDate,
      profileImage: employee.profileImage,
      createdAt: employee.createdAt,
      department: employee.department,
      user: employee.user,
    };
  }

  /**
   * PATCH /api/employees/:id
   * Update an employee's business profile
   */
  public static async updateEmployee(
    id: string,
    data: UpdateEmployeeDTO,
    actor: AuthenticatedUser
  ): Promise<SafeEmployeeListItem> {
    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        user: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!employee) {
      throw new AppError('Employee not found', 404);
    }

    // Verify department if updated
    if (data.departmentId !== undefined && data.departmentId !== null) {
      const dept = await prisma.department.findUnique({ where: { id: data.departmentId } });
      if (!dept) {
        throw new AppError('Specified department does not exist.', 404);
      }
    }

    // If changing to INACTIVE, apply sensible security logic
    if (data.employmentStatus === EmploymentStatus.INACTIVE && employee.employmentStatus !== EmploymentStatus.INACTIVE) {
      if (employee.user?.role.isSuperAdmin) {
        const activeSuperAdminCount = await prisma.user.count({
          where: {
            role: { isSuperAdmin: true },
            accountStatus: UserAccountStatus.ACTIVE,
          },
        });
        if (activeSuperAdminCount <= 1) {
          throw new AppError('Cannot deactivate the last active Super Admin.', 403);
        }
      }

      // Deactivate linked user login account and revoke sessions
      if (employee.user) {
        await prisma.user.update({
          where: { id: employee.user.id },
          data: { accountStatus: UserAccountStatus.INACTIVE },
        });
        await prisma.refreshSession.updateMany({
          where: { userId: employee.user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    }

    const updated = await prisma.employee.update({
      where: { id },
      data: {
        ...(data.firstName !== undefined ? { firstName: data.firstName.trim() } : {}),
        ...(data.lastName !== undefined ? { lastName: data.lastName.trim() } : {}),
        ...(data.phone !== undefined ? { phone: data.phone?.trim() || null } : {}),
        ...(data.jobTitle !== undefined ? { jobTitle: data.jobTitle.trim() } : {}),
        ...(data.departmentId !== undefined ? { departmentId: data.departmentId } : {}),
        ...(data.joiningDate !== undefined ? { joiningDate: data.joiningDate } : {}),
        ...(data.employmentStatus !== undefined ? { employmentStatus: data.employmentStatus } : {}),
        ...(data.profileImage !== undefined ? { profileImage: data.profileImage || null } : {}),
      },
      include: {
        department: { select: { id: true, name: true } },
        user: {
          select: {
            id: true,
            email: true,
            accountStatus: true,
            role: { select: { id: true, name: true, isSuperAdmin: true } },
          },
        },
      },
    });

    AuditService.log({
      userId: actor.userId,
      action: data.employmentStatus === EmploymentStatus.INACTIVE ? 'EMPLOYEE_DEACTIVATED' : 'EMPLOYEE_UPDATED',
      entityType: 'EMPLOYEE',
      entityId: updated.id,
      metadata: { employeeCode: updated.employeeCode },
    });

    return {
      id: updated.id,
      employeeCode: updated.employeeCode,
      firstName: updated.firstName,
      lastName: updated.lastName,
      email: updated.email,
      phone: updated.phone,
      jobTitle: updated.jobTitle,
      employmentStatus: updated.employmentStatus,
      joiningDate: updated.joiningDate,
      profileImage: updated.profileImage,
      createdAt: updated.createdAt,
      department: updated.department,
      user: updated.user,
    };
  }

  /**
   * DELETE /api/employees/:id
   * Safe deactivation or deletion preventing historic data breakage and Super Admin lockout
   */
  public static async deleteOrDeactivateEmployee(id: string, actor: AuthenticatedUser) {
    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        user: {
          include: {
            role: true,
          },
        },
        _count: {
          select: {
            managedProjects: true,
            projectMemberships: true,
            assignedTasks: true,
            assignedLeads: true,
            assignedClients: true,
          },
        },
      },
    });

    if (!employee) {
      throw new AppError('Employee not found', 404);
    }

    // 1. Self-protection
    if (employee.user?.id === actor.userId) {
      throw new AppError('Cannot delete or deactivate your own account.', 403);
    }

    // 2. Last active Super Admin protection
    if (employee.user?.role.isSuperAdmin) {
      const activeSuperAdminCount = await prisma.user.count({
        where: {
          role: { isSuperAdmin: true },
          accountStatus: UserAccountStatus.ACTIVE,
        },
      });
      if (activeSuperAdminCount <= 1) {
        throw new AppError('Cannot delete or deactivate the last active Super Admin.', 403);
      }
    }

    const hasHistoricalRelations =
      employee._count.managedProjects > 0 ||
      employee._count.projectMemberships > 0 ||
      employee._count.assignedTasks > 0 ||
      employee._count.assignedLeads > 0 ||
      employee._count.assignedClients > 0;

    if (hasHistoricalRelations) {
      // Safe business deactivation
      await prisma.employee.update({
        where: { id },
        data: { employmentStatus: EmploymentStatus.INACTIVE },
      });

      if (employee.user) {
        await prisma.user.update({
          where: { id: employee.user.id },
          data: { accountStatus: UserAccountStatus.INACTIVE },
        });
        await prisma.refreshSession.updateMany({
          where: { userId: employee.user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      AuditService.log({
        userId: actor.userId,
        action: 'EMPLOYEE_DEACTIVATED',
        entityType: 'EMPLOYEE',
        entityId: employee.id,
        metadata: { reason: 'Has historical relations; safely deactivated' },
      });

      return {
        deactivated: true,
        deleted: false,
        message: 'Employee has historical assignments and was deactivated successfully.',
      };
    }

    // No historical relations: clean delete
    if (employee.user) {
      await prisma.refreshSession.deleteMany({ where: { userId: employee.user.id } });
      await prisma.userPermissionOverride.deleteMany({ where: { userId: employee.user.id } });
      await prisma.auditLog.deleteMany({ where: { userId: employee.user.id } });
      await prisma.user.delete({ where: { id: employee.user.id } });
    }

    await prisma.employee.delete({ where: { id } });

    AuditService.log({
      userId: actor.userId,
      action: 'EMPLOYEE_DELETED',
      entityType: 'EMPLOYEE',
      entityId: id,
    });

    return {
      deactivated: false,
      deleted: true,
      message: 'Employee deleted successfully.',
    };
  }

  /**
   * POST /api/employees/:id/account
   * Create a login User account linked to an existing Employee
   */
  public static async createEmployeeAccount(
    employeeId: string,
    data: CreateEmployeeAccountDTO,
    actor: AuthenticatedUser
  ) {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: true },
    });

    if (!employee) {
      throw new AppError('Employee not found', 404);
    }

    if (employee.user) {
      throw new AppError('This employee already has a linked login account.', 409);
    }

    const loginEmail = data.loginEmail.trim().toLowerCase();
    const existingUser = await prisma.user.findUnique({ where: { email: loginEmail } });
    if (existingUser) {
      throw new AppError(`A user account with email "${loginEmail}" already exists.`, 409);
    }

    const role = await prisma.role.findUnique({ where: { id: data.roleId } });
    if (!role) {
      throw new AppError('Role not found', 404);
    }

    // Super Admin Protection: Only Super Admin can assign a Super Admin role
    if (role.isSuperAdmin && !actor.isSuperAdmin) {
      throw new AppError('Only a Super Admin can assign the Super Admin role.', 403);
    }

    const passwordHash = await hashPassword(data.temporaryPassword);

    const newUser = await prisma.user.create({
      data: {
        employeeId: employee.id,
        email: loginEmail,
        passwordHash,
        roleId: role.id,
        accountStatus: UserAccountStatus.ACTIVE,
      },
      select: {
        id: true,
        email: true,
        accountStatus: true,
        role: { select: { id: true, name: true, isSuperAdmin: true } },
      },
    });

    AuditService.log({
      userId: actor.userId,
      action: 'USER_ACCOUNT_CREATED',
      entityType: 'USER',
      entityId: newUser.id,
      metadata: { email: newUser.email, employeeCode: employee.employeeCode, role: role.name },
    });

    return {
      user: newUser,
      message: 'Login account created successfully',
    };
  }

  /**
   * PATCH /api/employees/:id/account
   * Update login email, role, or account status
   */
  public static async updateEmployeeAccount(
    employeeId: string,
    data: UpdateEmployeeAccountDTO,
    actor: AuthenticatedUser
  ) {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        user: {
          include: { role: true },
        },
      },
    });

    if (!employee || !employee.user) {
      throw new AppError('Employee does not have a linked login account.', 404);
    }

    const targetUser = employee.user;

    // Super Admin Protection 1: Non-Super Admin cannot modify a Super Admin
    if (targetUser.role.isSuperAdmin && !actor.isSuperAdmin) {
      throw new AppError('Only a Super Admin can modify a Super Admin account.', 403);
    }

    // Super Admin Protection 2: Non-Super Admin cannot assign Super Admin role
    if (data.roleId) {
      const targetRole = await prisma.role.findUnique({ where: { id: data.roleId } });
      if (!targetRole) {
        throw new AppError('Role not found', 404);
      }
      if (targetRole.isSuperAdmin && !actor.isSuperAdmin) {
        throw new AppError('Only a Super Admin can grant the Super Admin role.', 403);
      }

      // Demoting Super Admin check: Cannot demote the last active Super Admin
      if (targetUser.role.isSuperAdmin && !targetRole.isSuperAdmin) {
        const activeSuperAdminCount = await prisma.user.count({
          where: { role: { isSuperAdmin: true }, accountStatus: UserAccountStatus.ACTIVE },
        });
        if (activeSuperAdminCount <= 1) {
          throw new AppError('Cannot remove the Super Admin role from the last active Super Admin.', 403);
        }
        if (targetUser.id === actor.userId) {
          throw new AppError('Cannot demote your own Super Admin account.', 403);
        }
      }
    }

    // Super Admin Protection 3: Suspending/deactivating last active Super Admin
    if (data.accountStatus && data.accountStatus !== UserAccountStatus.ACTIVE && targetUser.role.isSuperAdmin) {
      const activeSuperAdminCount = await prisma.user.count({
        where: { role: { isSuperAdmin: true }, accountStatus: UserAccountStatus.ACTIVE },
      });
      if (activeSuperAdminCount <= 1) {
        throw new AppError('Cannot suspend or deactivate the last active Super Admin.', 403);
      }
      if (targetUser.id === actor.userId) {
        throw new AppError('Cannot suspend your own account.', 403);
      }
    }

    // Check unique email if updated
    if (data.loginEmail) {
      const newEmail = data.loginEmail.trim().toLowerCase();
      if (newEmail !== targetUser.email) {
        const existing = await prisma.user.findUnique({ where: { email: newEmail } });
        if (existing) {
          throw new AppError(`A user with email "${newEmail}" already exists.`, 409);
        }
      }
    }

    const roleChanged = data.roleId && data.roleId !== targetUser.roleId;
    const statusChanged = data.accountStatus && data.accountStatus !== targetUser.accountStatus;

    const updatedUser = await prisma.user.update({
      where: { id: targetUser.id },
      data: {
        ...(data.loginEmail ? { email: data.loginEmail.trim().toLowerCase() } : {}),
        ...(data.roleId ? { roleId: data.roleId } : {}),
        ...(data.accountStatus ? { accountStatus: data.accountStatus } : {}),
      },
      select: {
        id: true,
        email: true,
        accountStatus: true,
        role: { select: { id: true, name: true, isSuperAdmin: true } },
      },
    });

    // Invalidate refresh sessions if role changed or account is no longer ACTIVE
    if (roleChanged || (data.accountStatus && data.accountStatus !== UserAccountStatus.ACTIVE)) {
      await prisma.refreshSession.updateMany({
        where: { userId: targetUser.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    if (roleChanged) {
      AuditService.log({
        userId: actor.userId,
        action: 'USER_ROLE_CHANGED',
        entityType: 'USER',
        entityId: targetUser.id,
        metadata: { newRoleId: data.roleId },
      });
    }

    if (statusChanged) {
      AuditService.log({
        userId: actor.userId,
        action: 'USER_ACCOUNT_STATUS_CHANGED',
        entityType: 'USER',
        entityId: targetUser.id,
        metadata: { newStatus: data.accountStatus },
      });
    }

    return {
      user: updatedUser,
      message: 'Account updated successfully',
    };
  }

  /**
   * POST /api/employees/:id/account/reset-password
   * Secure administrative password reset with session invalidation
   */
  public static async resetEmployeePassword(
    employeeId: string,
    data: { newTemporaryPassword: string },
    actor: AuthenticatedUser
  ) {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { include: { role: true } } },
    });

    if (!employee || !employee.user) {
      throw new AppError('Employee does not have a linked login account.', 404);
    }

    const targetUser = employee.user;

    // Super Admin protection: Only Super Admin can reset a Super Admin's password
    if (targetUser.role.isSuperAdmin && !actor.isSuperAdmin) {
      throw new AppError('Only a Super Admin can reset the password of a Super Admin account.', 403);
    }

    const passwordHash = await hashPassword(data.newTemporaryPassword);

    await prisma.user.update({
      where: { id: targetUser.id },
      data: { passwordHash },
    });

    // Revoke all existing sessions for this user so they must log in with the new password
    await prisma.refreshSession.updateMany({
      where: { userId: targetUser.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    AuditService.log({
      userId: actor.userId,
      action: 'USER_PASSWORD_RESET',
      entityType: 'USER',
      entityId: targetUser.id,
    });

    return {
      message: 'Password reset successfully. Active sessions have been invalidated.',
    };
  }

  /**
   * GET /api/employees/:id/permissions
   * Fetch role permissions, user overrides, and calculated effective permissions
   */
  public static async getEmployeePermissions(employeeId: string) {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        user: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: true },
                },
              },
            },
            permissionOverrides: {
              include: { permission: true },
            },
          },
        },
      },
    });

    if (!employee || !employee.user) {
      throw new AppError('Employee does not have a linked login account.', 404);
    }

    const user = employee.user;

    // Role default permissions dictionary: { [permissionKey]: boolean }
    const rolePermissions: Record<string, boolean> = {};
    for (const rp of user.role.rolePermissions) {
      rolePermissions[rp.permission.key] = rp.allowed;
    }

    // Individual user overrides dictionary: { [permissionKey]: boolean }
    const overrides: Record<string, boolean> = {};
    for (const override of user.permissionOverrides) {
      overrides[override.permission.key] = override.allowed;
    }

    // Calculated effective permissions list using central service
    const effectivePermissions = await PermissionService.getEffectivePermissions(user.id);

    return {
      userId: user.id,
      role: {
        id: user.role.id,
        name: user.role.name,
        isSuperAdmin: user.role.isSuperAdmin,
      },
      rolePermissions,
      overrides,
      effectivePermissions,
    };
  }

  /**
   * PUT /api/employees/:id/permissions
   * Update user permission overrides (explicit ALLOW, explicit DENY, or REMOVE override)
   */
  public static async updateEmployeePermissions(
    employeeId: string,
    overridesInput: PermissionOverrideInput[],
    actor: AuthenticatedUser
  ) {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { include: { role: true } } },
    });

    if (!employee || !employee.user) {
      throw new AppError('Employee does not have a linked login account.', 404);
    }

    const user = employee.user;

    // Super Admin protection: Cannot restrict or override Super Admin permissions
    if (user.role.isSuperAdmin) {
      throw new AppError('Super Admin permissions are unconditional and cannot be overridden.', 400);
    }

    // Execute updates inside an atomic transaction
    await prisma.$transaction(async (tx) => {
      for (const item of overridesInput) {
        const perm = await tx.permission.findUnique({ where: { key: item.permissionKey } });
        if (!perm) {
          throw new AppError(`Permission "${item.permissionKey}" not found.`, 404);
        }

        if (item.allowed === null) {
          // Remove override (revert to role default)
          await tx.userPermissionOverride.deleteMany({
            where: {
              userId: user.id,
              permissionId: perm.id,
            },
          });
        } else {
          // Upsert explicit ALLOW or DENY override
          await tx.userPermissionOverride.upsert({
            where: {
              userId_permissionId: {
                userId: user.id,
                permissionId: perm.id,
              },
            },
            update: { allowed: item.allowed },
            create: {
              userId: user.id,
              permissionId: perm.id,
              allowed: item.allowed,
            },
          });
        }
      }
    });

    AuditService.log({
      userId: actor.userId,
      action: 'USER_PERMISSION_OVERRIDE_CHANGED',
      entityType: 'USER',
      entityId: user.id,
      metadata: { count: overridesInput.length },
    });

    return this.getEmployeePermissions(employeeId);
  }
}
