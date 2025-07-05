import { Router, Request, Response } from 'express';
import { UsageService } from '../services/UsageService';
import { UsageType } from '../entities/UsageRecord';
import { AppDataSource } from '../database/data-source';
import { PhoneNumber } from '../entities/PhoneNumber';

const router = Router();
const usageService = new UsageService();
const phoneRepo = AppDataSource.getRepository(PhoneNumber);

// Twilio webhook for call status
router.post('/twilio/call-status', async (req: Request, res: Response) => {
  try {
    const {
      CallSid,
      From,
      To,
      CallStatus,
      Direction,
      Duration,
      Price,
      PriceUnit,
    } = req.body;

    // Find phone number
    const phoneNumber = await phoneRepo.findOne({
      where: { phoneNumber: Direction === 'inbound' ? To : From },
    });

    if (phoneNumber && CallStatus === 'completed') {
      await usageService.recordUsage({
        phoneNumberId: phoneNumber.id,
        type: Direction === 'inbound' ? UsageType.INBOUND_CALL : UsageType.OUTBOUND_CALL,
        from: From,
        to: To,
        duration: parseInt(Duration) || 0,
        cost: Math.abs(parseFloat(Price)) || 0,
        twilioCallSid: CallSid,
        metadata: {
          status: CallStatus,
          priceUnit: PriceUnit,
        },
      });
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing call webhook:', error);
    res.status(500).send('Error');
  }
});

// Twilio webhook for SMS status
router.post('/twilio/sms-status', async (req: Request, res: Response) => {
  try {
    const {
      MessageSid,
      From,
      To,
      MessageStatus,
      Direction,
      Price,
      PriceUnit,
      NumMedia,
    } = req.body;

    // Find phone number
    const phoneNumber = await phoneRepo.findOne({
      where: { phoneNumber: Direction === 'inbound' ? To : From },
    });

    if (phoneNumber && MessageStatus === 'delivered') {
      const isMMSType = parseInt(NumMedia) > 0;
      let usageType: UsageType;

      if (Direction === 'inbound') {
        usageType = isMMSType ? UsageType.INBOUND_MMS : UsageType.INBOUND_SMS;
      } else {
        usageType = isMMSType ? UsageType.OUTBOUND_MMS : UsageType.OUTBOUND_SMS;
      }

      await usageService.recordUsage({
        phoneNumberId: phoneNumber.id,
        type: usageType,
        from: From,
        to: To,
        quantity: 1,
        cost: Math.abs(parseFloat(Price)) || 0,
        twilioCallSid: MessageSid,
        metadata: {
          status: MessageStatus,
          priceUnit: PriceUnit,
          numMedia: NumMedia,
        },
      });
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing SMS webhook:', error);
    res.status(500).send('Error');
  }
});

// Stripe webhook
router.post('/stripe', async (req: Request, res: Response) => {
  try {
    const sig = req.headers['stripe-signature'];
    
    // In production, verify webhook signature
    // const event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);

    const event = req.body;

    switch (event.type) {
      case 'payment_intent.succeeded':
        // Handle successful payment
        break;
      case 'invoice.payment_succeeded':
        // Handle successful invoice payment
        break;
      case 'customer.subscription.updated':
        // Handle subscription updates
        break;
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error processing Stripe webhook:', error);
    res.status(400).send('Webhook Error');
  }
});

export { router as webhookRoutes };