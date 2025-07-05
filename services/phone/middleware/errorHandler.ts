import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        message: err.message,
        status: err.statusCode,
      },
    });
  }

  // Log unexpected errors
  logger.error('Unexpected error:', err);

  // Don't expose internal errors in production
  const message =
    process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : err.message;

  res.status(500).json({
    error: {
      message,
      status: 500,
    },
  });
};