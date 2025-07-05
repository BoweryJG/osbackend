import { AppDataSource } from '../database/data-source';
import { PhoneNumber, PhoneNumberStatus, PhoneNumberType } from '../entities/PhoneNumber';
import { Client } from '../entities/Client';
import { ActivityLog, ActivityType } from '../entities/ActivityLog';
import { TwilioService } from './TwilioService';
import { NotFoundError, ValidationError } from '../utils/errors';

export class PhoneNumberService {
  private phoneRepo = AppDataSource.getRepository(PhoneNumber);
  private clientRepo = AppDataSource.getRepository(Client);
  private activityRepo = AppDataSource.getRepository(ActivityLog);
  private twilioService = new TwilioService();

  async searchAvailableNumbers(options: {
    areaCode?: string;
    contains?: string;
    country?: string;
    type?: PhoneNumberType;
    limit?: number;
  }): Promise<any[]> {
    return this.twilioService.searchAvailableNumbers(options);
  }

  async provisionNumber(data: {
    clientId: string;
    phoneNumber: string;
    displayName?: string;
    description?: string;
    configuration?: any;
  }): Promise<PhoneNumber> {
    // Verify client exists and is active
    const client = await this.clientRepo.findOne({
      where: { id: data.clientId },
    });

    if (!client) {
      throw new NotFoundError('Client not found');
    }

    if (client.status !== 'active') {
      throw new ValidationError('Client is not active');
    }

    // Purchase number from Twilio
    const twilioNumber = await this.twilioService.purchaseNumber(
      data.phoneNumber,
      {
        friendlyName: `${client.businessName} - ${data.displayName || data.phoneNumber}`,
        ...data.configuration,
      }
    );

    // Create phone number record
    const phoneNumber = this.phoneRepo.create({
      phoneNumber: twilioNumber.phoneNumber,
      twilioPhoneSid: twilioNumber.sid,
      clientId: data.clientId,
      displayName: data.displayName,
      description: data.description,
      type: this.detectPhoneNumberType(twilioNumber.phoneNumber),
      capabilities: {
        voice: twilioNumber.capabilities.voice,
        sms: twilioNumber.capabilities.sms,
        mms: twilioNumber.capabilities.mms,
        fax: twilioNumber.capabilities.fax,
      },
      configuration: data.configuration,
      monthlyFee: this.calculateMonthlyFee(twilioNumber),
    });

    const savedNumber = await this.phoneRepo.save(phoneNumber);

    // Log activity
    await this.activityRepo.save({
      type: ActivityType.PHONE_PROVISIONED,
      description: `Phone number ${savedNumber.phoneNumber} provisioned`,
      clientId: data.clientId,
      metadata: {
        phoneNumber: savedNumber.phoneNumber,
        displayName: savedNumber.displayName,
      },
    });

    return savedNumber;
  }

  async updateConfiguration(
    id: string,
    configuration: any
  ): Promise<PhoneNumber> {
    const phoneNumber = await this.phoneRepo.findOne({ where: { id } });
    if (!phoneNumber) {
      throw new NotFoundError('Phone number not found');
    }

    // Update Twilio configuration
    await this.twilioService.updatePhoneNumber(
      phoneNumber.twilioPhoneSid,
      configuration
    );

    // Update local record
    phoneNumber.configuration = {
      ...phoneNumber.configuration,
      ...configuration,
    };

    const updated = await this.phoneRepo.save(phoneNumber);

    // Log activity
    await this.activityRepo.save({
      type: ActivityType.PHONE_CONFIGURED,
      description: `Phone number ${phoneNumber.phoneNumber} configuration updated`,
      clientId: phoneNumber.clientId,
      metadata: { configuration },
    });

    return updated;
  }

  async releaseNumber(id: string): Promise<void> {
    const phoneNumber = await this.phoneRepo.findOne({ where: { id } });
    if (!phoneNumber) {
      throw new NotFoundError('Phone number not found');
    }

    // Release from Twilio
    await this.twilioService.releasePhoneNumber(phoneNumber.twilioPhoneSid);

    // Update status
    phoneNumber.status = PhoneNumberStatus.RELEASED;
    phoneNumber.releasedAt = new Date();
    await this.phoneRepo.save(phoneNumber);

    // Log activity
    await this.activityRepo.save({
      type: ActivityType.PHONE_RELEASED,
      description: `Phone number ${phoneNumber.phoneNumber} released`,
      clientId: phoneNumber.clientId,
      metadata: { phoneNumber: phoneNumber.phoneNumber },
    });
  }

  async listClientNumbers(
    clientId: string
  ): Promise<PhoneNumber[]> {
    return this.phoneRepo.find({
      where: { clientId, status: PhoneNumberStatus.ACTIVE },
      order: { provisionedAt: 'DESC' },
    });
  }

  async getPhoneNumber(id: string): Promise<PhoneNumber> {
    const phoneNumber = await this.phoneRepo.findOne({
      where: { id },
      relations: ['client'],
    });

    if (!phoneNumber) {
      throw new NotFoundError('Phone number not found');
    }

    return phoneNumber;
  }

  private detectPhoneNumberType(phoneNumber: string): PhoneNumberType {
    if (phoneNumber.match(/^\+1(800|888|877|866|855|844|833)/)) {
      return PhoneNumberType.TOLL_FREE;
    }
    return PhoneNumberType.LOCAL;
  }

  private calculateMonthlyFee(twilioNumber: any): number {
    // Base rates (can be configured)
    const rates = {
      local: 1.00,
      toll_free: 2.00,
      mobile: 1.50,
    };

    const type = this.detectPhoneNumberType(twilioNumber.phoneNumber);
    return rates[type] || rates.local;
  }
}