import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import prisma from '../config/database';
import { env } from '../config/env';
import { PermissionService } from '../services/permission.service';
import { AuthenticatedUser } from '../types/auth.types';
import { PermissionString } from '../types/permissions.types';
import { verifyAccessToken } from '../utils/jwt';
import { registerChatSocketHandlers, setupChatEventSubscriptions } from './chat.socket';
import { setupNotificationEventSubscriptions } from './notification.socket';
import { AuthenticatedSocket } from './socket.types';

let io: SocketIOServer | null = null;

export function initSocketIO(httpServer: HTTPServer): SocketIOServer {
  if (io) return io;

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: [env.FRONTEND_URL, 'http://localhost:5173'],
      credentials: true,
      methods: ['GET', 'POST'],
    },
    pingTimeout: 30000,
    pingInterval: 25000,
  });

  // --------------------------------------------------------------------------
  // Socket Authentication Middleware
  // --------------------------------------------------------------------------
  io.use(async (socket, next) => {
    try {
      const authHeader = socket.handshake.auth?.token || socket.handshake.headers?.authorization;

      if (!authHeader) {
        return next(new Error('Authentication error: Token missing in handshake'));
      }

      const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : authHeader.trim();
      if (!token) {
        return next(new Error('Authentication error: Token invalid'));
      }

      // 1. Verify token signature & expiry
      const payload = verifyAccessToken(token);

      // 2. Fetch fresh user account from DB
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        include: {
          role: true,
          employee: true,
        },
      });

      if (!user) {
        return next(new Error('Authentication error: User account not found'));
      }

      // 3. Status checks
      if (user.accountStatus !== 'ACTIVE') {
        return next(new Error(`Authentication error: Account is ${user.accountStatus.toLowerCase()}`));
      }

      if (user.employee && user.employee.employmentStatus === 'INACTIVE') {
        return next(new Error('Authentication error: Linked employee is inactive'));
      }

      // 4. Calculate effective permissions
      const effectivePermissionKeys = await PermissionService.getEffectivePermissions(user.id);

      // 5. Attach safe authenticated user context (DO NOT ATTACH passwordHash or internal secrets)
      const authenticatedUser: AuthenticatedUser = {
        userId: user.id,
        email: user.email,
        role: {
          id: user.role.id,
          name: user.role.name,
          isSuperAdmin: user.role.isSuperAdmin,
          isSystemRole: user.role.isSystem,
          permissions: effectivePermissionKeys as PermissionString[],
        },
        isSuperAdmin: user.role.isSuperAdmin,
        employeeId: user.employeeId ?? undefined,
        permissions: new Set<PermissionString>(effectivePermissionKeys as PermissionString[]),
      };

      (socket as AuthenticatedSocket).user = authenticatedUser;
      next();
    } catch (error: any) {
      return next(new Error('Authentication error: ' + (error.message || 'Unauthorized')));
    }
  });

  // Setup Chat real-time event listener to rooms
  setupChatEventSubscriptions(io);

  // Setup Notification real-time event listener to user rooms
  setupNotificationEventSubscriptions(io);

  // Handle connected authenticated sockets
  io.on('connection', (socket) => {
    registerChatSocketHandlers(io!, socket as AuthenticatedSocket);
  });

  return io;
}

export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error('Socket.io has not been initialized yet!');
  }
  return io;
}
