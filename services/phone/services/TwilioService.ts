import twilio from 'twilio';
import { PhoneNumberType } from '../entities/PhoneNumber';

export class TwilioService {
  private client: twilio.Twilio;

  constructor() {
    this.client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }

  async searchAvailableNumbers(options: {
    areaCode?: string;
    contains?: string;
    country?: string;
    type?: PhoneNumberType;
    limit?: number;
  }): Promise<any[]> {
    const country = options.country || 'US';
    const searchParams: any = {
      limit: options.limit || 20,
    };

    if (options.areaCode) {
      searchParams.areaCode = options.areaCode;
    }

    if (options.contains) {
      searchParams.contains = options.contains;
    }

    let results: any[] = [];

    if (options.type === PhoneNumberType.TOLL_FREE) {
      const tollFreeNumbers = await this.client
        .availablePhoneNumbers(country)
        .tollFree.list(searchParams);
      results = tollFreeNumbers;
    } else if (options.type === PhoneNumberType.MOBILE) {
      const mobileNumbers = await this.client
        .availablePhoneNumbers(country)
        .mobile.list(searchParams);
      results = mobileNumbers;
    } else {
      const localNumbers = await this.client
        .availablePhoneNumbers(country)
        .local.list(searchParams);
      results = localNumbers;
    }

    return results.map((number) => ({
      phoneNumber: number.phoneNumber,
      friendlyName: number.friendlyName,
      locality: number.locality,
      region: number.region,
      postalCode: number.postalCode,
      capabilities: number.capabilities,
      beta: number.beta,
      addressRequirements: number.addressRequirements,
    }));
  }

  async purchaseNumber(
    phoneNumber: string,
    options?: {
      friendlyName?: string;
      voiceUrl?: string;
      smsUrl?: string;
      voiceFallbackUrl?: string;
      smsFallbackUrl?: string;
      statusCallbackUrl?: string;
    }
  ): Promise<any> {
    return this.client.incomingPhoneNumbers.create({
      phoneNumber,
      ...options,
    });
  }

  async updatePhoneNumber(
    phoneSid: string,
    options: {
      friendlyName?: string;
      voiceUrl?: string;
      smsUrl?: string;
      voiceFallbackUrl?: string;
      smsFallbackUrl?: string;
      statusCallbackUrl?: string;
    }
  ): Promise<any> {
    return this.client.incomingPhoneNumbers(phoneSid).update(options);
  }

  async releasePhoneNumber(phoneSid: string): Promise<void> {
    await this.client.incomingPhoneNumbers(phoneSid).remove();
  }

  async getPhoneNumber(phoneSid: string): Promise<any> {
    return this.client.incomingPhoneNumbers(phoneSid).fetch();
  }

  async sendSms(
    from: string,
    to: string,
    body: string,
    mediaUrl?: string[]
  ): Promise<any> {
    const message: any = {
      from,
      to,
      body,
    };

    if (mediaUrl && mediaUrl.length > 0) {
      message.mediaUrl = mediaUrl;
    }

    return this.client.messages.create(message);
  }

  async makeCall(
    from: string,
    to: string,
    url: string,
    options?: {
      statusCallback?: string;
      statusCallbackMethod?: string;
      record?: boolean;
    }
  ): Promise<any> {
    return this.client.calls.create({
      from,
      to,
      url,
      ...options,
    });
  }

  async getCallDetails(callSid: string): Promise<any> {
    return this.client.calls(callSid).fetch();
  }

  async getMessageDetails(messageSid: string): Promise<any> {
    return this.client.messages(messageSid).fetch();
  }

  async listCalls(options: {
    from?: string;
    to?: string;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
  }): Promise<any[]> {
    const params: any = {};

    if (options.from) params.from = options.from;
    if (options.to) params.to = options.to;
    if (options.startTime) params.startTimeAfter = options.startTime;
    if (options.endTime) params.startTimeBefore = options.endTime;
    if (options.limit) params.limit = options.limit;

    return this.client.calls.list(params);
  }

  async listMessages(options: {
    from?: string;
    to?: string;
    dateSent?: Date;
    dateSentBefore?: Date;
    dateSentAfter?: Date;
    limit?: number;
  }): Promise<any[]> {
    const params: any = {};

    if (options.from) params.from = options.from;
    if (options.to) params.to = options.to;
    if (options.dateSent) params.dateSent = options.dateSent;
    if (options.dateSentBefore) params.dateSentBefore = options.dateSentBefore;
    if (options.dateSentAfter) params.dateSentAfter = options.dateSentAfter;
    if (options.limit) params.limit = options.limit;

    return this.client.messages.list(params);
  }
}