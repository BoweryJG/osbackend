// Bowery Creative Email Aliases Configuration
export const emailAliases = {
  // Main account
  primary: 'jgolden@bowerycreativeagency.com',
  
  // Aliases (all route to primary)
  aliases: {
    john: {
      email: 'john@bowerycreativeagency.com',
      name: 'John from Bowery Creative',
      signature: 'John\nBowery Creative Agency'
    },
    jon: {
      email: 'jon@bowerycreativeagency.com', 
      name: 'Jon',
      signature: 'Jon\nCreative Director'
    },
    support: {
      email: 'support@bowerycreativeagency.com',
      name: 'Bowery Creative Support',
      signature: 'Bowery Creative Support Team'
    },
    info: {
      email: 'info@bowerycreativeagency.com',
      name: 'Bowery Creative',
      signature: 'The Bowery Creative Team'
    },
    hello: {
      email: 'hello@bowerycreativeagency.com',
      name: 'Bowery Creative',
      signature: 'Cheers,\nBowery Creative'
    }
  },
  
  // Get formatted from address
  getFromAddress(aliasKey) {
    const alias = this.aliases[aliasKey];
    if (!alias) return `"Bowery Creative" <${this.primary}>`;
    return `"${alias.name}" <${alias.email}>`;
  },
  
  // Generate campaign-specific email
  getCampaignEmail(campaignId) {
    return {
      email: `campaign-${campaignId}@bowerycreativeagency.com`,
      from: `"Bowery Creative" <campaign-${campaignId}@bowerycreativeagency.com>`,
      replyTo: `campaign-${campaignId}@bowerycreativeagency.com`
    };
  }
};

// Usage examples:
// await sendEmail({
//   from: emailAliases.getFromAddress('john'),
//   to: 'client@example.com',
//   subject: 'Your project update'
// });

// Or for campaigns:
// const campaign = emailAliases.getCampaignEmail('new-client-2024');
// await sendEmail({
//   from: campaign.from,
//   replyTo: campaign.replyTo
// });