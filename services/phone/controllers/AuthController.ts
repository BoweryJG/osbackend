import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/AuthService';
import { ValidationError } from '../utils/errors';

const authService = new AuthService();

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password, firstName, lastName, role, clientId } = req.body;

      if (!email || !password || !firstName || !lastName) {
        throw new ValidationError('All fields are required');
      }

      if (password.length < 8) {
        throw new ValidationError('Password must be at least 8 characters long');
      }

      const result = await authService.register({
        email,
        password,
        firstName,
        lastName,
        role,
        clientId,
      });

      res.status(201).json({
        message: 'User registered successfully',
        user: result.user,
        token: result.token,
      });
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        throw new ValidationError('Email and password are required');
      }

      const result = await authService.login(email, password);

      res.json({
        message: 'Login successful',
        user: result.user,
        token: result.token,
      });
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.userId;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        throw new ValidationError('Current and new passwords are required');
      }

      if (newPassword.length < 8) {
        throw new ValidationError('New password must be at least 8 characters long');
      }

      await authService.changePassword(userId, currentPassword, newPassword);

      res.json({
        message: 'Password changed successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = req.body;

      if (!email) {
        throw new ValidationError('Email is required');
      }

      const message = await authService.resetPassword(email);

      res.json({
        message,
      });
    } catch (error) {
      next(error);
    }
  }

  async confirmPasswordReset(req: Request, res: Response, next: NextFunction) {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        throw new ValidationError('Token and new password are required');
      }

      if (newPassword.length < 8) {
        throw new ValidationError('New password must be at least 8 characters long');
      }

      await authService.confirmPasswordReset(token, newPassword);

      res.json({
        message: 'Password reset successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;

      res.json({
        user: {
          id: user.userId,
          email: user.email,
          role: user.role,
          clientId: user.clientId,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}