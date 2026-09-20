import { CookieOptions, Request, Response } from 'express';
import { env } from '../../config/env';
import { AuthenticatedRequest } from '../../types/auth.types';
import { sendSuccess } from '../../utils/api-response';
import { AuthService } from './auth.service';

const REFRESH_COOKIE_NAME = 'officecrm_refresh_token';

function getCookieOptions(): CookieOptions {
  const isProduction = env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };
}

export class AuthController {
  /**
   * POST /api/auth/login
   */
  public static async login(req: Request, res: Response): Promise<void> {
    const { email, password } = req.body;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await AuthService.login(email, password, { ipAddress, userAgent });

    // Set secure HttpOnly cookie for refresh token
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, getCookieOptions());

    sendSuccess(
      res,
      {
        user: result.user,
        employee: result.employee,
        role: result.role,
        permissions: result.permissions,
        accessToken: result.accessToken,
      },
      'Login successful'
    );
  }

  /**
   * POST /api/auth/refresh
   */
  public static async refresh(req: Request, res: Response): Promise<void> {
    // Read from HttpOnly cookie first, fall back to body
    const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await AuthService.refresh(rawRefreshToken, { ipAddress, userAgent });

    // Rotate HttpOnly cookie
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, getCookieOptions());

    sendSuccess(
      res,
      {
        accessToken: result.accessToken,
      },
      'Token refreshed successfully'
    );
  }

  /**
   * POST /api/auth/logout
   */
  public static async logout(req: AuthenticatedRequest, res: Response): Promise<void> {
    const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
    const userId = req.user?.userId;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    await AuthService.logout(rawRefreshToken, userId, { ipAddress, userAgent });

    // Clear HttpOnly cookie
    res.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/api/auth',
    });

    sendSuccess(res, null, 'Logged out successfully');
  }

  /**
   * GET /api/auth/me
   */
  public static async getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user!.userId;
    const result = await AuthService.getMe(userId);

    sendSuccess(res, result, 'Current user profile retrieved');
  }
}
