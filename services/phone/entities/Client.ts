import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { PhoneNumber } from './PhoneNumber';
import { Invoice } from './Invoice';
import { Payment } from './Payment';
import { ActivityLog } from './ActivityLog';

export enum ClientStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  INACTIVE = 'inactive',
}

export enum BillingCycle {
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  ANNUAL = 'annual',
}

@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @Index()
  clientCode: string; // e.g., "DRPEDRO001"

  @Column()
  name: string;

  @Column()
  businessName: string;

  @Column({ nullable: true })
  contactEmail: string;

  @Column({ nullable: true })
  contactPhone: string;

  @Column({ type: 'text', nullable: true })
  address: string;

  @Column({
    type: 'enum',
    enum: ClientStatus,
    default: ClientStatus.ACTIVE,
  })
  status: ClientStatus;

  @Column({
    type: 'enum',
    enum: BillingCycle,
    default: BillingCycle.MONTHLY,
  })
  billingCycle: BillingCycle;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  creditLimit: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  currentBalance: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  settings: {
    autoRecharge?: boolean;
    autoRechargeAmount?: number;
    autoRechargeThreshold?: number;
    notifications?: {
      email?: boolean;
      sms?: boolean;
      lowBalance?: boolean;
      highUsage?: boolean;
    };
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  stripeCustomerId: string;

  @OneToMany(() => PhoneNumber, (phoneNumber) => phoneNumber.client)
  phoneNumbers: PhoneNumber[];

  @OneToMany(() => Invoice, (invoice) => invoice.client)
  invoices: Invoice[];

  @OneToMany(() => Payment, (payment) => payment.client)
  payments: Payment[];

  @OneToMany(() => ActivityLog, (log) => log.client)
  activityLogs: ActivityLog[];
}