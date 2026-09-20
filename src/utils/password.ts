import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

/**
 * Hash plain-text password using bcrypt
 * @param password Plain-text password to hash
 * @returns Hashed password string
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify plain-text password against stored bcrypt hash
 * @param password Plain-text password candidate
 * @param hash Stored bcrypt hash
 * @returns Boolean indicating whether password matches
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
