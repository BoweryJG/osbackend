import { AppDataSource } from '../database/data-source';
import { Client, ClientStatus, BillingCycle } from '../entities/Client';
import { ActivityLog, ActivityType } from '../entities/ActivityLog';
import { StripeService } from './StripeService';
import { NotFoundError, ValidationError } from '../utils/errors';

export class ClientService {
  private clientRepo = AppDataSource.getRepository(Client);
  private activityRepo = AppDataSource.getRepository(ActivityLog);
  private stripeService = new StripeService();

  async createClient(data: {
    name: string;
    businessName: string;
    contactEmail?: string;
    contactPhone?: string;
    address?: string;
    billingCycle?: BillingCycle;
    creditLimit?: number;
    metadata?: Record<string, any>;
  }): Promise<Client> {
    // Generate unique client code
    const clientCode = await this.generateClientCode(data.businessName);

    // Create Stripe customer
    const stripeCustomer = await this.stripeService.createCustomer({
      name: data.businessName,
      email: data.contactEmail,
      metadata: {
        clientCode,
        platform: 'bowery',
      },
    });

    // Create client
    const client = this.clientRepo.create({
      ...data,
      clientCode,
      stripeCustomerId: stripeCustomer.id,
      status: ClientStatus.ACTIVE,
      currentBalance: 0,
      settings: {
        notifications: {
          email: true,
          sms: false,
          lowBalance: true,
          highUsage: true,
        },
      },
    });

    const savedClient = await this.clientRepo.save(client);

    // Log activity
    await this.activityRepo.save({
      type: ActivityType.CLIENT_CREATED,
      description: `Client ${savedClient.businessName} created`,
      clientId: savedClient.id,
      metadata: { clientCode: savedClient.clientCode },
    });

    return savedClient;
  }

  async updateClient(
    id: string,
    data: Partial<Client>
  ): Promise<Client> {
    const client = await this.clientRepo.findOne({ where: { id } });
    if (!client) {
      throw new NotFoundError('Client not found');
    }

    const previousStatus = client.status;
    Object.assign(client, data);
    const updatedClient = await this.clientRepo.save(client);

    // Log status changes
    if (data.status && data.status !== previousStatus) {
      let activityType: ActivityType;
      if (data.status === ClientStatus.SUSPENDED) {
        activityType = ActivityType.CLIENT_SUSPENDED;
      } else if (data.status === ClientStatus.ACTIVE) {
        activityType = ActivityType.CLIENT_ACTIVATED;
      } else {
        activityType = ActivityType.CLIENT_UPDATED;
      }

      await this.activityRepo.save({
        type: activityType,
        description: `Client status changed from ${previousStatus} to ${data.status}`,
        clientId: id,
      });
    }

    return updatedClient;
  }

  async getClient(id: string): Promise<Client> {
    const client = await this.clientRepo.findOne({
      where: { id },
      relations: ['phoneNumbers'],
    });

    if (!client) {
      throw new NotFoundError('Client not found');
    }

    return client;
  }

  async getClientByCode(clientCode: string): Promise<Client> {
    const client = await this.clientRepo.findOne({
      where: { clientCode },
      relations: ['phoneNumbers'],
    });

    if (!client) {
      throw new NotFoundError('Client not found');
    }

    return client;
  }

  async listClients(options: {
    status?: ClientStatus;
    limit?: number;
    offset?: number;
    search?: string;
  }): Promise<{ clients: Client[]; total: number }> {
    const query = this.clientRepo.createQueryBuilder('client');

    if (options.status) {
      query.andWhere('client.status = :status', { status: options.status });
    }

    if (options.search) {
      query.andWhere(
        '(client.name ILIKE :search OR client.businessName ILIKE :search OR client.clientCode ILIKE :search)',
        { search: `%${options.search}%` }
      );
    }

    const [clients, total] = await query
      .skip(options.offset || 0)
      .take(options.limit || 20)
      .orderBy('client.createdAt', 'DESC')
      .getManyAndCount();

    return { clients, total };
  }

  async updateBalance(
    clientId: string,
    amount: number,
    description: string
  ): Promise<void> {
    await this.clientRepo.update(
      { id: clientId },
      { currentBalance: () => `current_balance + ${amount}` }
    );

    await this.activityRepo.save({
      type: ActivityType.CREDIT_ADDED,
      description,
      clientId,
      metadata: { amount },
    });
  }

  private async generateClientCode(businessName: string): Promise<string> {
    const prefix = businessName
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .substring(0, 6)
      .padEnd(3, 'X');

    let counter = 1;
    let code: string;

    do {
      code = `${prefix}${counter.toString().padStart(3, '0')}`;
      const existing = await this.clientRepo.findOne({
        where: { clientCode: code },
      });
      if (!existing) break;
      counter++;
    } while (counter < 1000);

    return code;
  }
}