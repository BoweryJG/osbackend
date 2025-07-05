import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '../database/data-source';
import { User, UserRole } from '../entities/User';
import { UnauthorizedError, ValidationError } from '../utils/errors';

interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  clientId?: string;
}

export class AuthService {
  private userRepo = AppDataSource.getRepository(User);

  async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role?: UserRole;
    clientId?: string;
  }): Promise<{ user: User; token: string }> {
    // Check if user already exists
    const existingUser = await this.userRepo.findOne({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new ValidationError('User with this email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, 10);

    // Create user
    const user = this.userRepo.create({
      email: data.email,
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role || UserRole.CLIENT,
      clientId: data.clientId,
    });

    const savedUser = await this.userRepo.save(user);

    // Generate token
    const token = this.generateToken(savedUser);

    // Remove password hash from response
    delete (savedUser as any).passwordHash;

    return { user: savedUser, token };
  }

  async login(
    email: string,
    password: string
  ): Promise<{ user: User; token: string }> {
    // Find user
    const user = await this.userRepo.findOne({ where: { email } });

    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);

    if (!isValidPassword) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new UnauthorizedError('Account is deactivated');
    }

    // Update last login
    user.lastLoginAt = new Date();
    await this.userRepo.save(user);

    // Generate token
    const token = this.generateToken(user);

    // Remove password hash from response
    delete (user as any).passwordHash;

    return { user, token };
  }

  async verifyToken(token: string): Promise<JwtPayload> {
    try {
      const payload = jwt.verify(
        token,
        process.env.JWT_SECRET!
      ) as JwtPayload;
      return payload;
    } catch (error) {
      throw new UnauthorizedError('Invalid token');
    }
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(
      currentPassword,
      user.passwordHash
    );

    if (!isValidPassword) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    user.passwordHash = newPasswordHash;
    await this.userRepo.save(user);
  }

  async resetPassword(email: string): Promise<string> {
    const user = await this.userRepo.findOne({ where: { email } });

    if (!user) {
      // Don't reveal if user exists
      return 'If the email exists, a reset link has been sent';
    }

    // Generate reset token
    const resetToken = jwt.sign(
      { userId: user.id, type: 'reset' },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );

    // In production, send email with reset link
    // For now, return token (in production, don't return this)
    return resetToken;
  }

  async confirmPasswordReset(
    resetToken: string,
    newPassword: string
  ): Promise<void> {
    try {
      const payload = jwt.verify(resetToken, process.env.JWT_SECRET!) as any;

      if (payload.type !== 'reset') {
        throw new UnauthorizedError('Invalid reset token');
      }

      const user = await this.userRepo.findOne({
        where: { id: payload.userId },
      });

      if (!user) {
        throw new UnauthorizedError('User not found');
      }

      // Hash new password
      const passwordHash = await bcrypt.hash(newPassword, 10);

      // Update password
      user.passwordHash = passwordHash;
      await this.userRepo.save(user);
    } catch (error) {
      throw new UnauthorizedError('Invalid or expired reset token');
    }
  }

  private generateToken(user: User): string {
    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      clientId: user.clientId,
    };

    return jwt.sign(payload, process.env.JWT_SECRET!, {
      expiresIn: process.env.JWT_EXPIRATION || '7d',
    });
  }
}