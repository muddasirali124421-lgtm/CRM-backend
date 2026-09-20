import { ClientStatus, EmploymentStatus, LeadStatus, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { AuditService } from '../../services/audit.service';
import { AuthenticatedUser } from '../../types/auth.types';
import { AppError } from '../../utils/api-response';
import { ClientsService } from '../clients/clients.service';
import {
  AssignLeadDTO,
  ConvertLeadDTO,
  CreateLeadDTO,
  LeadFilterQuery,
  SafeLeadResponse,
  UpdateLeadDTO,
} from './leads.types';

export class LeadsService {
  /**
   * Generate next sequential lead code (e.g. LEAD-0001, LEAD-0002)
   */
  public static async generateNextLeadCode(): Promise<string> {
    const leads = await prisma.lead.findMany({
      select: { leadCode: true },
      where: { leadCode: { startsWith: 'LEAD-' } },
    });

    let maxNum = 0;
    for (const lead of leads) {
      const num = parseInt(lead.leadCode.replace('LEAD-', ''), 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }

    return `LEAD-${String(maxNum + 1).padStart(4, '0')}`;
  }

  /**
   * Generate next sequential client code (e.g. CL-0001, CL-0002)
   */
  public static async generateNextClientCode(): Promise<string> {
    return ClientsService.generateNextClientCode();
  }

  /**
   * Map raw Prisma Lead to safe API response with serialized Decimal
   */
  private static formatLead(lead: any): SafeLeadResponse {
    return {
      id: lead.id,
      leadCode: lead.leadCode,
      firstName: lead.firstName,
      lastName: lead.lastName,
      company: lead.company,
      email: lead.email,
      phone: lead.phone,
      source: lead.source,
      status: lead.status,
      priority: lead.priority,
      assignedToId: lead.assignedToId,
      estimatedValue: lead.estimatedValue ? Number(lead.estimatedValue) : null,
      followUpAt: lead.followUpAt,
      notes: lead.notes,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
      assignedTo: lead.assignedTo
        ? {
            id: lead.assignedTo.id,
            employeeCode: lead.assignedTo.employeeCode,
            firstName: lead.assignedTo.firstName,
            lastName: lead.assignedTo.lastName,
            jobTitle: lead.assignedTo.jobTitle,
            profileImage: lead.assignedTo.profileImage,
          }
        : null,
      convertedClient: lead.convertedClient
        ? {
            id: lead.convertedClient.id,
            clientCode: lead.convertedClient.clientCode,
            name: lead.convertedClient.name,
            company: lead.convertedClient.company,
            createdAt: lead.convertedClient.createdAt,
          }
        : null,
    };
  }

  /**
   * GET /api/leads
   * List leads with search, filters, pagination, and sorting
   */
  public static async listLeads(query: LeadFilterQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.LeadWhereInput = {};

    // 1. Status and Priority
    if (query.status) {
      where.status = query.status;
    }
    if (query.priority) {
      where.priority = query.priority;
    }

    // 2. Source
    if (query.source) {
      where.source = { contains: query.source.trim(), mode: 'insensitive' };
    }

    // 3. Assigned employee
    if (query.assignedToId) {
      where.assignedToId = query.assignedToId;
    }

    // 4. Follow-up filters
    const now = new Date();
    if (query.followUp === 'overdue') {
      where.followUpAt = { lt: now };
      where.status = { notIn: [LeadStatus.CONVERTED, LeadStatus.LOST] };
    } else if (query.followUp === 'today') {
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      where.followUpAt = { gte: startOfToday, lte: endOfToday };
    } else if (query.followUp === 'upcoming') {
      where.followUpAt = { gt: now };
    }

    // 5. Date range for creation
    if (query.startDate || query.endDate) {
      where.createdAt = {
        ...(query.startDate ? { gte: query.startDate } : {}),
        ...(query.endDate ? { lte: query.endDate } : {}),
      };
    }

    // 6. Search across code, names, company, email, phone
    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { leadCode: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';
    const orderBy: Prisma.LeadOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [total, leads] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        skip,
        take: limit,
        orderBy,
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
          convertedClient: {
            select: {
              id: true,
              clientCode: true,
              name: true,
              company: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);

    return {
      leads: leads.map((l) => this.formatLead(l)),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * GET /api/leads/:id
   * Get lead details
   */
  public static async getLeadById(id: string): Promise<SafeLeadResponse> {
    const lead = await prisma.lead.findUnique({
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
        convertedClient: {
          select: {
            id: true,
            clientCode: true,
            name: true,
            company: true,
            createdAt: true,
          },
        },
      },
    });

    if (!lead) {
      throw new AppError('Lead not found', 404);
    }

    return this.formatLead(lead);
  }

  /**
   * POST /api/leads
   * Create a new lead
   */
  public static async createLead(data: CreateLeadDTO, actor: AuthenticatedUser): Promise<SafeLeadResponse> {
    // Validate assigned employee if provided
    if (data.assignedToId) {
      const employee = await prisma.employee.findUnique({ where: { id: data.assignedToId } });
      if (!employee) {
        throw new AppError('Assigned employee not found.', 404);
      }
      if (employee.employmentStatus !== EmploymentStatus.ACTIVE) {
        throw new AppError('Cannot assign lead to an inactive employee.', 400);
      }
    }

    const leadCode = await this.generateNextLeadCode();

    const lead = await prisma.lead.create({
      data: {
        leadCode,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        company: data.company?.trim() || null,
        email: data.email.trim().toLowerCase(),
        phone: data.phone?.trim() || null,
        source: data.source?.trim() || null,
        status: data.status ?? LeadStatus.NEW,
        priority: data.priority,
        assignedToId: data.assignedToId || null,
        estimatedValue: data.estimatedValue !== undefined ? new Prisma.Decimal(data.estimatedValue) : null,
        followUpAt: data.followUpAt || null,
        notes: data.notes?.trim() || null,
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
        convertedClient: true,
      },
    });

    AuditService.log({
      userId: actor.userId,
      action: 'LEAD_CREATED',
      entityType: 'LEAD',
      entityId: lead.id,
      metadata: { leadCode: lead.leadCode, email: lead.email },
    });

    return this.formatLead(lead);
  }

  /**
   * PATCH /api/leads/:id
   * Update lead details
   */
  public static async updateLead(
    id: string,
    data: UpdateLeadDTO,
    actor: AuthenticatedUser
  ): Promise<SafeLeadResponse> {
    const existing = await prisma.lead.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Lead not found', 404);
    }

    // Validate assigned employee if updating
    if (data.assignedToId !== undefined && data.assignedToId !== null) {
      const employee = await prisma.employee.findUnique({ where: { id: data.assignedToId } });
      if (!employee) {
        throw new AppError('Assigned employee not found.', 404);
      }
      if (employee.employmentStatus !== EmploymentStatus.ACTIVE) {
        throw new AppError('Cannot assign lead to an inactive employee.', 400);
      }
    }

    const statusChanged = data.status && data.status !== existing.status;

    const updated = await prisma.lead.update({
      where: { id },
      data: {
        ...(data.firstName !== undefined ? { firstName: data.firstName.trim() } : {}),
        ...(data.lastName !== undefined ? { lastName: data.lastName.trim() } : {}),
        ...(data.company !== undefined ? { company: data.company?.trim() || null } : {}),
        ...(data.email !== undefined ? { email: data.email.trim().toLowerCase() } : {}),
        ...(data.phone !== undefined ? { phone: data.phone?.trim() || null } : {}),
        ...(data.source !== undefined ? { source: data.source?.trim() || null } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
        ...(data.assignedToId !== undefined ? { assignedToId: data.assignedToId } : {}),
        ...(data.estimatedValue !== undefined
          ? { estimatedValue: data.estimatedValue !== null ? new Prisma.Decimal(data.estimatedValue) : null }
          : {}),
        ...(data.followUpAt !== undefined ? { followUpAt: data.followUpAt } : {}),
        ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
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
        convertedClient: true,
      },
    });

    if (statusChanged) {
      AuditService.log({
        userId: actor.userId,
        action: 'LEAD_STATUS_CHANGED',
        entityType: 'LEAD',
        entityId: updated.id,
        metadata: { oldStatus: existing.status, newStatus: updated.status },
      });
    }

    AuditService.log({
      userId: actor.userId,
      action: 'LEAD_UPDATED',
      entityType: 'LEAD',
      entityId: updated.id,
      metadata: { leadCode: updated.leadCode },
    });

    return this.formatLead(updated);
  }

  /**
   * PATCH /api/leads/:id/assign
   * Assign lead to an employee
   */
  public static async assignLead(
    id: string,
    data: AssignLeadDTO,
    actor: AuthenticatedUser
  ): Promise<SafeLeadResponse> {
    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) {
      throw new AppError('Lead not found', 404);
    }

    if (data.employeeId) {
      const employee = await prisma.employee.findUnique({ where: { id: data.employeeId } });
      if (!employee) {
        throw new AppError('Employee not found.', 404);
      }
      if (employee.employmentStatus !== EmploymentStatus.ACTIVE) {
        throw new AppError('Cannot assign lead to an inactive employee.', 400);
      }
    }

    const updated = await prisma.lead.update({
      where: { id },
      data: { assignedToId: data.employeeId },
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
        convertedClient: true,
      },
    });

    AuditService.log({
      userId: actor.userId,
      action: 'LEAD_ASSIGNED',
      entityType: 'LEAD',
      entityId: lead.id,
      metadata: { leadCode: lead.leadCode, assignedToId: data.employeeId },
    });

    return this.formatLead(updated);
  }

  /**
   * DELETE /api/leads/:id
   * Delete a lead (prohibits deleting converted leads)
   */
  public static async deleteLead(id: string, actor: AuthenticatedUser) {
    const lead = await prisma.lead.findUnique({
      where: { id },
      include: { convertedClient: true },
    });

    if (!lead) {
      throw new AppError('Lead not found', 404);
    }

    // Retain converted leads for business & audit history
    if (lead.convertedClient !== null || lead.status === LeadStatus.CONVERTED) {
      throw new AppError(
        'Cannot delete a lead that has been converted to a client. Converted leads must be retained for business history.',
        409
      );
    }

    await prisma.lead.delete({ where: { id } });

    AuditService.log({
      userId: actor.userId,
      action: 'LEAD_DELETED',
      entityType: 'LEAD',
      entityId: id,
      metadata: { leadCode: lead.leadCode },
    });

    return {
      deleted: true,
      message: `Lead ${lead.leadCode} deleted successfully.`,
    };
  }

  /**
   * POST /api/leads/:id/convert
   * Atomic conversion of Lead into a Client
   */
  public static async convertLead(id: string, data: ConvertLeadDTO, actor: AuthenticatedUser) {
    const lead = await prisma.lead.findUnique({
      where: { id },
      include: { convertedClient: true },
    });

    if (!lead) {
      throw new AppError('Lead not found', 404);
    }

    if (lead.status === LeadStatus.CONVERTED || lead.convertedClient !== null) {
      throw new AppError('Lead has already been converted to a client.', 409);
    }

    const clientCode = await this.generateNextClientCode();
    const fullName = `${lead.firstName} ${lead.lastName}`.trim();
    const company = data.company?.trim() || lead.company || null;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Client record
      const client = await tx.client.create({
        data: {
          clientCode,
          name: fullName,
          company,
          email: lead.email,
          phone: lead.phone || null,
          website: data.website?.trim() || null,
          addressLine1: data.addressLine1?.trim() || null,
          addressLine2: data.addressLine2?.trim() || null,
          city: data.city?.trim() || null,
          state: data.state?.trim() || null,
          country: data.country?.trim() || null,
          postalCode: data.postalCode?.trim() || null,
          status: ClientStatus.ACTIVE,
          assignedToId: lead.assignedToId || null,
          sourceLeadId: lead.id,
        },
      });

      // 2. Update Lead status to CONVERTED
      const updatedLead = await tx.lead.update({
        where: { id: lead.id },
        data: { status: LeadStatus.CONVERTED },
      });

      return { client, updatedLead };
    });

    // 3. Record Audit Log
    AuditService.log({
      userId: actor.userId,
      action: 'LEAD_CONVERTED',
      entityType: 'LEAD',
      entityId: lead.id,
      metadata: {
        leadCode: lead.leadCode,
        clientId: result.client.id,
        clientCode: result.client.clientCode,
      },
    });

    return {
      client: {
        id: result.client.id,
        clientCode: result.client.clientCode,
        name: result.client.name,
        company: result.client.company,
        email: result.client.email,
        phone: result.client.phone,
        status: result.client.status,
        sourceLeadId: result.client.sourceLeadId,
        createdAt: result.client.createdAt,
      },
      lead: {
        id: result.updatedLead.id,
        leadCode: result.updatedLead.leadCode,
        status: result.updatedLead.status,
      },
      message: `Lead ${lead.leadCode} converted successfully to Client ${result.client.clientCode}`,
    };
  }
}
