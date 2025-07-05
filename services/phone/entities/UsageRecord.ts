import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { PhoneNumber } from './PhoneNumber';

export enum UsageType {
  INBOUND_CALL = 'inbound_call',
  OUTBOUND_CALL = 'outbound_call',
  INBOUND_SMS = 'inbound_sms',
  OUTBOUND_SMS = 'outbound_sms',
  INBOUND_MMS = 'inbound_mms',
  OUTBOUND_MMS = 'outbound_mms',
}

@Entity('usage_records')
@Index(['phoneNumberId', 'createdAt'])
@Index(['type', 'createdAt'])
export class UsageRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: UsageType,
  })
  type: UsageType;

  @Column({ nullable: true })
  twilioCallSid: string;

  @Column({ nullable: true })
  from: string;

  @Column({ nullable: true })
  to: string;

  @Column({ type: 'int', default: 0 })
  duration: number; // in seconds for calls

  @Column({ type: 'int', default: 1 })
  quantity: number; // number of messages for SMS/MMS

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  cost: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    status?: string;
    errorCode?: string;
    errorMessage?: string;
    recordingUrl?: string;
    transcriptionUrl?: string;
  };

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => PhoneNumber, (phoneNumber) => phoneNumber.usageRecords)
  phoneNumber: PhoneNumber;

  @Column()
  phoneNumberId: string;

  @Column()
  clientId: string; // Denormalized for faster queries
}