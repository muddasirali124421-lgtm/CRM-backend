import { z } from 'zod';

/**
 * Validates that a string is a recognized IANA time zone identifier.
 */
export function isValidIanaTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const updateWorkspaceSettingSchema = z
  .object({
    companyName: z
      .string()
      .trim()
      .min(1, 'Company name cannot be empty')
      .max(100, 'Company name cannot exceed 100 characters')
      .optional(),
    companyEmail: z
      .string()
      .trim()
      .email('Invalid email address')
      .nullable()
      .or(z.literal(''))
      .optional(),
    phone: z
      .string()
      .trim()
      .max(30, 'Phone number cannot exceed 30 characters')
      .nullable()
      .or(z.literal(''))
      .optional(),
    website: z
      .string()
      .trim()
      .url('Website must be a valid URL')
      .nullable()
      .or(z.literal(''))
      .optional(),
    address: z
      .string()
      .trim()
      .max(255, 'Address cannot exceed 255 characters')
      .nullable()
      .or(z.literal(''))
      .optional(),
    country: z
      .string()
      .trim()
      .max(100, 'Country cannot exceed 100 characters')
      .nullable()
      .or(z.literal(''))
      .optional(),
    timezone: z
      .string()
      .trim()
      .refine((val) => isValidIanaTimezone(val), {
        message: 'Invalid IANA timezone identifier (e.g. "UTC", "Asia/Karachi", "Australia/Sydney")',
      })
      .optional(),
    defaultCurrency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter ISO code (e.g. USD, AUD, PKR, EUR, GBP)')
      .optional(),
    dateFormat: z
      .string()
      .trim()
      .min(4, 'Date format must be at least 4 characters')
      .max(20, 'Date format cannot exceed 20 characters')
      .optional(),
    logoUrl: z
      .string()
      .trim()
      .url('Logo URL must be a valid URL')
      .nullable()
      .or(z.literal(''))
      .optional(),
  })
  .strict();
