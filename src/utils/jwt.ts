import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { JwtAccessTokenPayload, JwtRefreshTokenPayload } from '../types/auth.types';

/**
 * Sign JWT Access Token
 */
export function signAccessToken(payload: JwtAccessTokenPayload): string {
  const options: SignOptions = {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
}

/**
 * Sign JWT Refresh Token
 */
export function signRefreshToken(payload: JwtRefreshTokenPayload): string {
  const options: SignOptions = {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, options);
}

/**
 * Verify and decode JWT Access Token
 */
export function verifyAccessToken(token: string): JwtAccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtAccessTokenPayload;
}

/**
 * Verify and decode JWT Refresh Token
 */
export function verifyRefreshToken(token: string): JwtRefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtRefreshTokenPayload;
}
