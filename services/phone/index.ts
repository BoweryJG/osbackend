import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from 'dotenv';
import { AppDataSource } from './database/data-source';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';
import { BillingService } from './services/BillingService';
import * as cron from 'node-cron';

// Load environment variables
config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Routes
app.use('/api', routes);

// Error handling
app.use(errorHandler);

// Initialize database and start server
AppDataSource.initialize()
  .then(async () => {
    logger.info('Database connected successfully');

    // Start cron jobs
    startCronJobs();

    app.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
    });
  })
  .catch((error) => {
    logger.error('Error during Data Source initialization:', error);
    process.exit(1);
  });

// Cron jobs
function startCronJobs() {
  const billingService = new BillingService();

  // Check for overdue invoices daily at 2 AM
  cron.schedule('0 2 * * *', async () => {
    logger.info('Running daily overdue invoice check');
    try {
      await billingService.checkOverdueInvoices();
    } catch (error) {
      logger.error('Error checking overdue invoices:', error);
    }
  });

  // Generate monthly invoices on the 1st of each month at 3 AM
  cron.schedule('0 3 1 * *', async () => {
    logger.info('Running monthly invoice generation');
    // Implementation would iterate through active clients and generate invoices
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  app.listen().close(() => {
    logger.info('HTTP server closed');
    AppDataSource.destroy().then(() => {
      logger.info('Database connection closed');
      process.exit(0);
    });
  });
});