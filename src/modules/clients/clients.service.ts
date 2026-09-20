import { ClientStatus, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { AuditService } from '../../services/audit.service';
import { AuthenticatedUser } from '../../types/auth.types';
import { AppError } from '../../utils/api-response';
import {
  AssignClientDTO,
  ClientCounts,
  ClientFilterQuery,
  CompactClientOption,
  CreateClientDTO,
  SafeAssignedEmployee,
  SafeClientResponse,
  SafeSourceLeadSummary,
  UpdateClientDTO,
} from './clients.types';

export class ClientsService {
  /**
   * Collision-safe unique client code generator (e.g. CL-0001, CL-0002)
   * Recognizes existing CL- and CLI- prefixes and finds the true sequential max.
   */
  public static async generateNextClientCode(): Promise<string> {
    const clients = await prisma.client.findMany({
      select: { clientCode: true },
    });

    let maxNum = 0;
    for (const client of clients) {
      const match = client.clientCode.match(/(?:CL|CLI)-(\d+)/i);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }

    return `CL-${String(maxNum + 1).padStart(4, '0')}`;
  }

  /**
   * Formats a raw Prisma Client record into a safe API response
   */
  private static formatClient(
    client: any,
    additionalCounts?: Partial<ClientCounts>
  ): SafeClientResponse {
    let assignedTo: SafeAssignedEmployee | null = null;
    if (client.assignedTo) {
      assignedTo = {
        id: client.assignedTo.id,
        employeeCode: client.assignedTo.employeeCode,
        firstName: client.assignedTo.firstName,
        lastName: client.assignedTo.lastName,
        jobTitle: client.assignedTo.jobTitle,
        profileImage: client.assignedTo.profileImage,
      };
    }

    let sourceLead: SafeSourceLeadSummary | null = null;
    if (client.sourceLead) {
      sourceLead = {
        id: client.sourceLead.id,
        leadCode: client.sourceLead.leadCode,
        firstName: client.sourceLead.firstName,
        lastName: client.sourceLead.lastName,
        company: client.sourceLead.company,
        email: client.sourceLead.email,
        status: client.sourceLead.status,
        createdAt: client.sourceLead.createdAt,
      };
    }

    let counts: ClientCounts | undefined = undefined;
    if (client._count || additionalCounts) {
      counts = {
        projects: client._count?.projects ?? 0,
        openProjects: additionalCounts?.openProjects ?? 0,
        tasks: client._count?.tasks ?? 0,
        invoices: client._count?.invoices ?? 0,
        outstandingInvoices: additionalCounts?.outstandingInvoices ?? 0,
      };
    }

    return {
      id: client.id,
      clientCode: client.clientCode,
      name: client.name,
      company: client.company,
      email: client.email,
      phone: client.phone,
      website: client.website,
      addressLine1: client.addressLine1,
      addressLine2: client.addressLine2,
      city: client.city,
      state: client.state,
      country: client.country,
      postalCode: client.postalCode,
      status: client.status,
      assignedToId: client.assignedToId,
      sourceLeadId: client.sourceLeadId,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
      assignedTo,
      sourceLead,
      counts,
    };
  }

  /**
   * GET /api/clients
   * List clients with filtering, search, pagination, sorting, or compact mode
   */
  public static async listClients(query: ClientFilterQuery) {
    // 1. Lightweight compact mode for form dropdowns / pickers
    if (query.compact) {
      const where: Prisma.ClientWhereInput = {};
      if (query.status) {
        where.status = query.status;
      }
      if (query.search) {
        where.OR = [
          { name: { contains: query.search, mode: 'insensitive' } },
          { company: { contains: query.search, mode: 'insensitive' } },
          { clientCode: { contains: query.search, mode: 'insensitive' } },
        ];
      }

      const clients = await prisma.client.findMany({
        where,
        select: {
          id: true,
          clientCode: true,
          name: true,
          company: true,
          status: true,
        },
        orderBy: { name: 'asc' },
      });

      return { clients: clients as CompactClientOption[] };
    }

    // 2. Standard paginated list mode
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ClientWhereInput = {};

    // Multi-field search
    if (query.search) {
      where.OR = [
        { clientCode: { contains: query.search, mode: 'insensitive' } },
        { name: { contains: query.search, mode: 'insensitive' } },
        { company: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.assignedToId) {
      where.assignedToId = query.assignedToId;
    }

    if (query.isConverted !== undefined) {
      where.sourceLeadId = query.isConverted ? { not: null } : null;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = query.startDate;
      if (query.endDate) where.createdAt.lte = query.endDate;
    }

    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const [total, clients] = await Promise.all([
      prisma.client.count({ where }),
      prisma.client.findMany({
        where,
        include: {
          assignedTo: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              jobTitle: true,
              profileImage: true,
            },
          },
          sourceLead: {
            select: {
              id: true,
              leadCode: true,
              firstName: true,
              lastName: true,
              company: true,
              email: true,
              status: true,
              createdAt: true,
            },
          },
          _count: {
            select: {
              projects: true,
              tasks: true,
              invoices: true,
            },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      clients: clients.map((c) => this.formatClient(c)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * GET /api/clients/:id
   * Detailed client record with related counts
   */
  public static async getClientById(id: string): Promise<SafeClientResponse> {
    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        assignedTo: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            jobTitle: true,
            profileImage: true,
          },
        },
        sourceLead: {
          select: {
            id: true,
            leadCode: true,
            firstName: true,
            lastName: true,
            company: true,
            email: true,
            status: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            projects: true,
            tasks: true,
            invoices: true,
          },
        },
      },
    });

    if (!client) {
      throw new AppError('Client not found', 404);
    }

    // Calculate open projects and outstanding invoices counts
    const [openProjects, outstandingInvoices] = await Promise.all([
      prisma.project.count({
        where: {
          clientId: id,
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
      }),
      prisma.invoice.count({
        where: {
          clientId: id,
          status: { in: ['SENT', 'PARTIAL', 'OVERDUE'] },
        },
      }),
    ]);

    return this.formatClient(client, { openProjects, outstandingInvoices });
  }

  /**
   * POST /api/clients
   * Directly create a client without a lead
   */
  public static async createClient(
    data: CreateClientDTO,
    actor: AuthenticatedUser
  ): Promise<SafeClientResponse> {
    // 1. Verify assigned employee if specified
    if (data.assignedToId) {
      const employee = await prisma.employee.findUnique({
        where: { id: data.assignedToId },
      });

      if (!employee) {
        throw new AppError('Assigned employee not found', 400);
      }

      if (employee.employmentStatus !== 'ACTIVE') {
        throw new AppError('Cannot assign client to an inactive or terminated employee', 400);
      }
    }

    // 2. Generate sequential client code
    const clientCode = await this.generateNextClientCode();

    // 3. Create Client record
    const client = await prisma.client.create({
      data: {
        clientCode,
        name: data.name,
        company: data.company?.trim() || null,
        email: data.email,
        phone: data.phone?.trim() || null,
        website: data.website?.trim() || null,
        addressLine1: data.addressLine1?.trim() || null,
        addressLine2: data.addressLine2?.trim() || null,
        city: data.city?.trim() || null,
        state: data.state?.trim() || null,
        country: data.country?.trim() || null,
        postalCode: data.postalCode?.trim() || null,
        status: data.status || ClientStatus.ACTIVE,
        assignedToId: data.assignedToId || null,
        sourceLeadId: null, // Explicit direct client
      },
      include: {
        assignedTo: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            jobTitle: true,
            profileImage: true,
          },
        },
      },
    });

    // 4. Record audit event
    AuditService.log({
      userId: actor.userId,
      action: 'CLIENT_CREATED',
      entityType: 'CLIENT',
      entityId: client.id,
      metadata: {
        clientCode: client.clientCode,
        name: client.name,
        company: client.company,
        email: client.email,
        isDirect: true,
      },
    });

    return this.formatClient(client);
  }

  /**
   * PATCH /api/clients/:id
   * Update client business fields
   */
  public static async updateClient(
    id: string,
    data: UpdateClientDTO,
    actor: AuthenticatedUser
  ): Promise<SafeClientResponse> {
    const client = await prisma.client.findUnique({
      where: { id },
    });

    if (!client) {
      throw new AppError('Client not found', 404);
    }

    // Validate assigned employee if provided
    if (data.assignedToId !== undefined && data.assignedToId !== null) {
      const employee = await prisma.employee.findUnique({
        where: { id: data.assignedToId },
      });

      if (!employee) {
        throw new AppError('Assigned employee not found', 400);
      }

      if (employee.employmentStatus !== 'ACTIVE') {
        throw new AppError('Cannot assign client to an inactive or terminated employee', 400);
      }
    }

    const updateData: Prisma.ClientUpdateInput = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.company !== undefined) updateData.company = data.company ? data.company.trim() : null;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) updateData.phone = data.phone ? data.phone.trim() : null;
    if (data.website !== undefined) updateData.website = data.website ? data.website.trim() : null;
    if (data.addressLine1 !== undefined)
      updateData.addressLine1 = data.addressLine1 ? data.addressLine1.trim() : null;
    if (data.addressLine2 !== undefined)
      updateData.addressLine2 = data.addressLine2 ? data.addressLine2.trim() : null;
    if (data.city !== undefined) updateData.city = data.city ? data.city.trim() : null;
    if (data.state !== undefined) updateData.state = data.state ? data.state.trim() : null;
    if (data.country !== undefined) updateData.country = data.country ? data.country.trim() : null;
    if (data.postalCode !== undefined)
      updateData.postalCode = data.postalCode ? data.postalCode.trim() : null;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.assignedToId !== undefined) {
      updateData.assignedTo = data.assignedToId
        ? { connect: { id: data.assignedToId } }
        : { disconnect: true };
    }

    const updatedClient = await prisma.client.update({
      where: { id },
      data: updateData,
      include: {
        assignedTo: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            jobTitle: true,
            profileImage: true,
          },
        },
        sourceLead: {
          select: {
            id: true,
            leadCode: true,
            firstName: true,
            lastName: true,
            company: true,
            email: true,
            status: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            projects: true,
            tasks: true,
            invoices: true,
          },
        },
      },
    });

    // Check if status changed for dedicated audit event
    if (data.status && data.status !== client.status) {
      AuditService.log({
        userId: actor.userId,
        action: 'CLIENT_STATUS_CHANGED',
        entityType: 'CLIENT',
        entityId: id,
        metadata: {
          clientCode: client.clientCode,
          previousStatus: client.status,
          newStatus: data.status,
        },
      });
    }

    AuditService.log({
      userId: actor.userId,
      action: 'CLIENT_UPDATED',
      entityType: 'CLIENT',
      entityId: id,
      metadata: {
        clientCode: client.clientCode,
        updatedFields: Object.keys(data),
      },
    });

    return this.formatClient(updatedClient);
  }

  /**
   * PATCH /api/clients/:id/assign
   * Dedicated endpoint for client assignment
   */
  public static async assignClient(
    id: string,
    data: AssignClientDTO,
    actor: AuthenticatedUser
  ): Promise<SafeClientResponse> {
    const client = await prisma.client.findUnique({
      where: { id },
    });

    if (!client) {
      throw new AppError('Client not found', 404);
    }

    const targetEmployee = await prisma.employee.findUnique({
      where: { id: data.employeeId },
    });

    if (!targetEmployee) {
      throw new AppError('Target employee not found', 400);
    }

    if (targetEmployee.employmentStatus !== 'ACTIVE') {
      throw new AppError('Cannot assign client to an inactive or terminated employee', 400);
    }

    const updatedClient = await prisma.client.update({
      where: { id },
      data: {
        assignedTo: { connect: { id: data.employeeId } },
      },
      include: {
        assignedTo: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            jobTitle: true,
            profileImage: true,
          },
        },
        sourceLead: {
          select: {
            id: true,
            leadCode: true,
            firstName: true,
            lastName: true,
            company: true,
            email: true,
            status: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            projects: true,
            tasks: true,
            invoices: true,
          },
        },
      },
    });

    AuditService.log({
      userId: actor.userId,
      action: 'CLIENT_ASSIGNED',
      entityType: 'CLIENT',
      entityId: id,
      metadata: {
        clientCode: client.clientCode,
        previousAssigneeId: client.assignedToId,
        newAssigneeId: data.employeeId,
      },
    });

    return this.formatClient(updatedClient);
  }

  /**
   * DELETE /api/clients/:id
   * Safe archive / deletion behavior:
   * - If client has historical relationships (sourceLead, projects, tasks, invoices):
   *   Archives/deactivates client (sets status to INACTIVE) without cascade deleting records.
   * - If client has no historical records:
   *   Safely hard-deletes client record.
   */
  public static async deleteClient(id: string, actor: AuthenticatedUser) {
    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        sourceLead: true,
        _count: {
          select: {
            projects: true,
            tasks: true,
            invoices: true,
          },
        },
      },
    });

    if (!client) {
      throw new AppError('Client not found', 404);
    }

    const hasHistoricalRecords =
      client.sourceLeadId !== null ||
      client._count.projects > 0 ||
      client._count.tasks > 0 ||
      client._count.invoices > 0;

    if (hasHistoricalRecords) {
      // Archive/deactivate client rather than destructive deletion
      const updatedClient = await prisma.client.update({
        where: { id },
        data: { status: ClientStatus.INACTIVE },
        include: {
          assignedTo: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              jobTitle: true,
              profileImage: true,
            },
          },
          sourceLead: {
            select: {
              id: true,
              leadCode: true,
              firstName: true,
              lastName: true,
              company: true,
              email: true,
              status: true,
              createdAt: true,
            },
          },
          _count: {
            select: {
              projects: true,
              tasks: true,
              invoices: true,
            },
          },
        },
      });

      AuditService.log({
        userId: actor.userId,
        action: 'CLIENT_ARCHIVED',
        entityType: 'CLIENT',
        entityId: id,
        metadata: {
          clientCode: client.clientCode,
          reason: 'Client has historical business records; archived as INACTIVE',
        },
      });

      return {
        archived: true,
        client: this.formatClient(updatedClient),
        message: `Client ${client.clientCode} has historical records and was archived (status set to INACTIVE).`,
      };
    }

    // Clean client without historical links can be safely deleted
    await prisma.client.delete({ where: { id } });

    AuditService.log({
      userId: actor.userId,
      action: 'CLIENT_DELETED',
      entityType: 'CLIENT',
      entityId: id,
      metadata: { clientCode: client.clientCode },
    });

    return {
      deleted: true,
      message: `Client ${client.clientCode} deleted successfully.`,
    };
  }
}
