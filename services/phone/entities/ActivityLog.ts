import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { Client } from './Client';

export enum ActivityType {
  CLIENT_CREATED = 'client_created',
  CLIENT_UPDATED = 'client_updated',
  CLIENT_SUSPENDED = 'client_suspended',
  CLIENT_ACTIVATED = 'client_activated',
  PHONE_PROVISIONED = 'phone_provisioned',
  PHONE_RELEASED = 'phone_released',
  PHONE_CONFIGURED = 'phone_configured',
  INVOICE_CREATED = 'invoice_created',
  INVOICE_SENT = 'invoice_sent',
  PAYMENT_RECEIVED = 'payment_received',
  PAYMENT_FAILED = 'payment_failed',
  CREDIT_ADDED = 'credit_added',
  USAGE_ALERT = 'usage_alert',
  SYSTEM_EVENT = 'system_event',
}

@Entity('activity_logs')
@Index(['clientId', 'createdAt'])
@Index(['type', 'createdAt'])
export class ActivityLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: ActivityType,
  })
  type: ActivityType;

  @Column()
  description: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ nullable: true })
  userId: string; // User who performed the action

  @Column({ nullable: true })
  ipAddress: string;

  @Column({ nullable: true })
  userAgent: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Client, (client) => client.activityLogs, { nullable: true })
  client: Client;

  @Column({ nullable: true })
  clientId: string;
}