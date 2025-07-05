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
import { UsageRecord } from './UsageRecord';

export enum PhoneNumberStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  RELEASED = 'released',
}

export enum PhoneNumberType {
  LOCAL = 'local',
  TOLL_FREE = 'toll_free',
  MOBILE = 'mobile',
}

@Entity('phone_numbers')
export class PhoneNumber {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @Index()
  phoneNumber: string;

  @Column({
    type: 'enum',
    enum: PhoneNumberType,
    default: PhoneNumberType.LOCAL,
  })
  type: PhoneNumberType;

  @Column({
    type: 'enum',
    enum: PhoneNumberStatus,
    default: PhoneNumberStatus.ACTIVE,
  })
  status: PhoneNumberStatus;

  @Column({ nullable: true })
  twilioPhoneSid: string;

  @Column({ nullable: true })
  displayName: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  monthlyFee: number;

  @Column({ type: 'jsonb', nullable: true })
  capabilities: {
    voice?: boolean;
    sms?: boolean;
    mms?: boolean;
    fax?: boolean;
  };

  @Column({ type: 'jsonb', nullable: true })
  configuration: {
    voiceUrl?: string;
    smsUrl?: string;
    voiceFallbackUrl?: string;
    smsFallbackUrl?: string;
    statusCallbackUrl?: string;
  };

  @CreateDateColumn()
  provisionedAt: Date;

  @Column({ nullable: true })
  releasedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Client, (client) => client.phoneNumbers)
  client: Client;

  @Column()
  clientId: string;

  @OneToMany(() => UsageRecord, (usage) => usage.phoneNumber)
  usageRecords: UsageRecord[];
}