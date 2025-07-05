import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  Index,
} from 'typeorm';
import { Client } from './Client';
import { Payment } from './Payment';

export enum InvoiceStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  PAID = 'paid',
  OVERDUE = 'overdue',
  CANCELLED = 'cancelled',
}

@Entity('invoices')
@Index(['clientId', 'createdAt'])
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  invoiceNumber: string; // e.g., "INV-2024-0001"

  @Column({
    type: 'enum',
    enum: InvoiceStatus,
    default: InvoiceStatus.DRAFT,
  })
  status: InvoiceStatus;

  @Column({ type: 'date' })
  billingPeriodStart: Date;

  @Column({ type: 'date' })
  billingPeriodEnd: Date;

  @Column({ type: 'date' })
  dueDate: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  taxAmount: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  taxRate: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  paidAmount: number;

  @Column({ type: 'jsonb' })
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    category: string; // 'phone_rental', 'usage', 'setup_fee', etc.
  }>;

  @Column({ type: 'jsonb', nullable: true })
  usageSummary: {
    totalCalls?: number;
    totalCallMinutes?: number;
    totalSms?: number;
    totalMms?: number;
    byPhoneNumber?: Array<{
      phoneNumber: string;
      calls: number;
      minutes: number;
      sms: number;
      mms: number;
      cost: number;
    }>;
  };

  @Column({ nullable: true })
  stripeInvoiceId: string;

  @Column({ nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  paidAt: Date;

  @ManyToOne(() => Client, (client) => client.invoices)
  client: Client;

  @Column()
  clientId: string;

  @OneToMany(() => Payment, (payment) => payment.invoice)
  payments: Payment[];
}