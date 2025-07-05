import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { Client } from '../entities/Client';
import { User } from '../entities/User';
import { PhoneNumber } from '../entities/PhoneNumber';
import { UsageRecord } from '../entities/UsageRecord';
import { Invoice } from '../entities/Invoice';
import { Payment } from '../entities/Payment';
import { ActivityLog } from '../entities/ActivityLog';

config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'bowery_user',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE || 'bowery_platform',
  synchronize: process.env.NODE_ENV === 'development',
  logging: process.env.NODE_ENV === 'development',
  entities: [Client, User, PhoneNumber, UsageRecord, Invoice, Payment, ActivityLog],
  migrations: ['src/database/migrations/*.ts'],
  subscribers: [],
});