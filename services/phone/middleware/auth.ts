import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/AuthService';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import { UserRole } from '../entities/User';

interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: UserRole;
    clientId?: string;
  };
}

const authService = new AuthService();

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = extractToken(req);

    if (!token) {
      throw new UnauthorizedError('No token provided');
    }

    const payload = await authService.verifyToken(token);
    req.user = payload;

    next();
  } catch (error) {
    next(error);
  }
};

export const authorize = (...allowedRoles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Not authenticated'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError('You do not have permission to access this resource')
      );
    }

    next();
  };
};

export const authorizeClientAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return next(new UnauthorizedError('Not authenticated'));
  }

  // Admins and managers can access any client
  if ([UserRole.ADMIN, UserRole.MANAGER].includes(req.user.role)) {
    return next();
  }

  // Client users can only access their own client data
  const requestedClientId = req.params.clientId || req.body.clientId;

  if (req.user.role === UserRole.CLIENT && req.user.clientId !== requestedClientId) {
    return next(new ForbiddenError('You can only access your own client data'));
  }

  next();
};

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Also check for token in cookies
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }

  return null;
}