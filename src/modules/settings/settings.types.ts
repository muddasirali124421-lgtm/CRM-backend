/**
 * Workspace Settings Types & DTOs
 */

export interface WorkspaceSettingResponse {
  id: string;
  companyName: string;
  companyEmail: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  country: string | null;
  timezone: string;
  defaultCurrency: string;
  dateFormat: string;
  logoUrl: string | null;
  updatedAt: Date;
}

export interface UpdateWorkspaceSettingDTO {
  companyName?: string;
  companyEmail?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  country?: string | null;
  timezone?: string;
  defaultCurrency?: string;
  dateFormat?: string;
  logoUrl?: string | null;
}
