import crypto from 'crypto';
import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { JwtAccessTokenPayload } from '../types/auth.types';

/**
 * Sign JWT Access Token (short-lived)
 */
export function signAccessToken(payload: JwtAccessTokenPayload): string {
  const options: SignOptions = {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
    subject: payload.userId,
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
}

/**
 * Verify and decode JWT Access Token
 */
export function verifyAccessToken(token: string): JwtAccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtAccessTokenPayload;
}

/**
 * Generate a cryptographically secure random opaque refresh token string
 */
export function generateRefreshTokenString(): string {
  return crypto.randomBytes(40).toString('hex');
}

/**
 * Compute SHA-256 hash of a refresh token string for safe database storage
 */
export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
