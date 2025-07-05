import { Between, In } from 'typeorm';
import { AppDataSource } from '../database/data-source';
import { UsageRecord, UsageType } from '../entities/UsageRecord';
import { PhoneNumber } from '../entities/PhoneNumber';
import { Client } from '../entities/Client';
import { ActivityLog, ActivityType } from '../entities/ActivityLog';

export interface UsageStats {
  totalCalls: number;
  totalMinutes: number;
  totalSms: number;
  totalMms: number;
  totalCost: number;
  byType: Record<UsageType, {
    count: number;
    duration?: number;
    cost: number;
  }>;
  byPhoneNumber: Array<{
    phoneNumber: string;
    displayName?: string;
    calls: number;
    minutes: number;
    sms: number;
    mms: number;
    cost: number;
  }>;
}

export class UsageService {
  private usageRepo = AppDataSource.getRepository(UsageRecord);
  private phoneRepo = AppDataSource.getRepository(PhoneNumber);
  private clientRepo = AppDataSource.getRepository(Client);
  private activityRepo = AppDataSource.getRepository(ActivityLog);

  async recordUsage(data: {
    phoneNumberId: string;
    type: UsageType;
    from?: string;
    to?: string;
    duration?: number;
    quantity?: number;
    cost: number;
    twilioCallSid?: string;
    metadata?: any;
  }): Promise<UsageRecord> {
    const phoneNumber = await this.phoneRepo.findOne({
      where: { id: data.phoneNumberId },
    });

    if (!phoneNumber) {
      throw new Error('Phone number not found');
    }

    const usage = this.usageRepo.create({
      ...data,
      clientId: phoneNumber.clientId,
    });

    const savedUsage = await this.usageRepo.save(usage);

    // Update client balance
    await this.clientRepo.update(
      { id: phoneNumber.clientId },
      { currentBalance: () => `current_balance - ${data.cost}` }
    );

    // Check for usage alerts
    await this.checkUsageAlerts(phoneNumber.clientId);

    return savedUsage;
  }

  async getClientUsageStats(
    clientId: string,
    startDate: Date,
    endDate: Date
  ): Promise<UsageStats> {
    const usageRecords = await this.usageRepo.find({
      where: {
        clientId,
        createdAt: Between(startDate, endDate),
      },
      relations: ['phoneNumber'],
    });

    const stats: UsageStats = {
      totalCalls: 0,
      totalMinutes: 0,
      totalSms: 0,
      totalMms: 0,
      totalCost: 0,
      byType: {} as any,
      byPhoneNumber: [],
    };

    // Initialize byType
    Object.values(UsageType).forEach((type) => {
      stats.byType[type] = { count: 0, cost: 0 };
    });

    // Group by phone number
    const phoneNumberMap = new Map<string, any>();

    for (const record of usageRecords) {
      stats.totalCost += Number(record.cost);

      // Update type stats
      stats.byType[record.type].count += 1;
      stats.byType[record.type].cost += Number(record.cost);

      if (record.type.includes('CALL')) {
        stats.totalCalls += 1;
        stats.totalMinutes += Math.ceil(record.duration / 60);
        stats.byType[record.type].duration = 
          (stats.byType[record.type].duration || 0) + record.duration;
      } else if (record.type.includes('SMS')) {
        stats.totalSms += record.quantity;
      } else if (record.type.includes('MMS')) {
        stats.totalMms += record.quantity;
      }

      // Update phone number stats
      if (!phoneNumberMap.has(record.phoneNumberId)) {
        phoneNumberMap.set(record.phoneNumberId, {
          phoneNumber: record.phoneNumber.phoneNumber,
          displayName: record.phoneNumber.displayName,
          calls: 0,
          minutes: 0,
          sms: 0,
          mms: 0,
          cost: 0,
        });
      }

      const phoneStats = phoneNumberMap.get(record.phoneNumberId);
      phoneStats.cost += Number(record.cost);

      if (record.type.includes('CALL')) {
        phoneStats.calls += 1;
        phoneStats.minutes += Math.ceil(record.duration / 60);
      } else if (record.type.includes('SMS')) {
        phoneStats.sms += record.quantity;
      } else if (record.type.includes('MMS')) {
        phoneStats.mms += record.quantity;
      }
    }

    stats.byPhoneNumber = Array.from(phoneNumberMap.values());

    return stats;
  }

  async getPhoneNumberUsage(
    phoneNumberId: string,
    startDate: Date,
    endDate: Date,
    options?: {
      limit?: number;
      offset?: number;
      type?: UsageType;
    }
  ): Promise<{ records: UsageRecord[]; total: number }> {
    const query = this.usageRepo.createQueryBuilder('usage')
      .where('usage.phoneNumberId = :phoneNumberId', { phoneNumberId })
      .andWhere('usage.createdAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });

    if (options?.type) {
      query.andWhere('usage.type = :type', { type: options.type });
    }

    const [records, total] = await query
      .skip(options?.offset || 0)
      .take(options?.limit || 100)
      .orderBy('usage.createdAt', 'DESC')
      .getManyAndCount();

    return { records, total };
  }

  private async checkUsageAlerts(clientId: string): Promise<void> {
    const client = await this.clientRepo.findOne({ where: { id: clientId } });
    if (!client) return;

    // Check for low balance
    if (
      client.settings?.notifications?.lowBalance &&
      client.currentBalance < 50
    ) {
      await this.activityRepo.save({
        type: ActivityType.USAGE_ALERT,
        description: `Low balance alert: $${client.currentBalance.toFixed(2)}`,
        clientId,
        metadata: {
          alertType: 'low_balance',
          balance: client.currentBalance,
        },
      });
    }

    // Check for high usage (example: more than $100 in last 24 hours)
    if (client.settings?.notifications?.highUsage) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const recentUsage = await this.usageRepo
        .createQueryBuilder('usage')
        .select('SUM(usage.cost)', 'total')
        .where('usage.clientId = :clientId', { clientId })
        .andWhere('usage.createdAt > :yesterday', { yesterday })
        .getRawOne();

      if (recentUsage.total > 100) {
        await this.activityRepo.save({
          type: ActivityType.USAGE_ALERT,
          description: `High usage alert: $${recentUsage.total} in last 24 hours`,
          clientId,
          metadata: {
            alertType: 'high_usage',
            amount: recentUsage.total,
            period: '24_hours',
          },
        });
      }
    }
  }
}