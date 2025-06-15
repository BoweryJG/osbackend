// RepSpheres Email Configuration
export const repspheresEmails = {
  // Domain
  domain: '@repspheres.com',
  
  // Email addresses (configure based on your setup)
  addresses: {
    // Leadership
    jgolden: {
      email: 'jgolden@repspheres.com',
      name: 'Jason Golden',
      title: 'Founder & CEO',
      actualSender: 'jgolden@bowerycreativeagency.com'
    },
    jason: {
      email: 'jason@repspheres.com',
      name: 'Jason Golden',
      title: 'Founder & CEO',
      actualSender: 'jgolden@bowerycreativeagency.com'
    },
    sarah: {
      email: 'sarah@repspheres.com',
      name: 'Sarah Chen',
      title: 'VP of Customer Success',
      actualSender: 'jgolden@bowerycreativeagency.com'
    },
    scarlett: {
      email: 'scarlett@repspheres.com',
      name: 'Scarlett Chen',
      title: 'Head of Customer Success',
      actualSender: 'jgolden@bowerycreativeagency.com'
    },
    
    // Department Emails
    support: {
      email: 'support@repspheres.com',
      name: 'RepSpheres Support',
      title: 'Customer Success',
      actualSender: 'jgolden@bowerycreativeagency.com'
    },
    sales: {
      email: 'sales@repspheres.com',
      name: 'RepSpheres Sales',
      title: 'Sales Team',
      actualSender: 'jgolden@bowerycreativeagency.com'
    },
    success: {
      email: 'success@repspheres.com',
      name: 'Customer Success Team',
      title: 'Customer Success',
      actualSender: 'jgolden@bowerycreativeagency.com'
    },
    partnerships: {
      email: 'partnerships@repspheres.com',
      name: 'RepSpheres Partnerships',
      title: 'Partnership Development',
      actualSender: 'jgolden@bowerycreativeagency.com'
    },
    
    // Product-Specific
    canvas: {
      email: 'canvas@repspheres.com',
      name: 'Canvas by RepSpheres',
      title: 'AI Sales Intelligence',
      actualSender: 'jgolden@bowerycreativeagency.com'
    },
    ai: {
      email: 'ai@repspheres.com',
      name: 'RepSpheres AI Team',
      title: 'AI Research & Development',
      actualSender: 'jgolden@bowerycreativeagency.com'
    },
    
    // General Communications
    hello: {
      email: 'hello@repspheres.com',
      name: 'RepSpheres Team',
      title: 'General Inquiries',
      actualSender: 'jgolden@bowerycreativeagency.com'
    },
    info: {
      email: 'info@repspheres.com',
      name: 'RepSpheres',
      title: 'Information',
      actualSender: 'jgolden@bowerycreativeagency.com'
    },
    team: {
      email: 'team@repspheres.com',
      name: 'The RepSpheres Team',
      title: 'Team Update',
      actualSender: 'jgolden@bowerycreativeagency.com'
    },
    
    // Automated & Special Purpose
    noreply: {
      email: 'noreply@repspheres.com',
      name: 'RepSpheres',
      title: 'Automated Message',
      actualSender: 'jgolden@bowerycreativeagency.com'
    },
    demo: {
      email: 'demo@repspheres.com',
      name: 'RepSpheres Demo Team',
      title: 'Product Demo',
      actualSender: 'jgolden@bowerycreativeagency.com'
    },
    onboarding: {
      email: 'onboarding@repspheres.com',
      name: 'RepSpheres Onboarding',
      title: 'Customer Onboarding',
      actualSender: 'jgolden@bowerycreativeagency.com'
    },
    billing: {
      email: 'billing@repspheres.com',
      name: 'RepSpheres Billing',
      title: 'Billing & Subscriptions',
      actualSender: 'jgolden@bowerycreativeagency.com'
    },
    careers: {
      email: 'careers@repspheres.com',
      name: 'RepSpheres Careers',
      title: 'Talent Acquisition',
      actualSender: 'jgolden@bowerycreativeagency.com'
    },
    press: {
      email: 'press@repspheres.com',
      name: 'RepSpheres Press',
      title: 'Media Relations',
      actualSender: 'jgolden@bowerycreativeagency.com'
    }
  },
  
  // Get formatted from address
  getFromAddress(addressKey) {
    const addr = this.addresses[addressKey];
    if (!addr) return '"RepSpheres" <noreply@repspheres.com>';
    return `"${addr.name}" <${addr.email}>`;
  },
  
  // Get the actual Gmail account to send through
  getSenderAccount(addressKey) {
    const addr = this.addresses[addressKey];
    return addr?.actualSender || 'jgolden@bowerycreativeagency.com';
  },
  
  // Email signatures
  getSignature(addressKey) {
    const addr = this.addresses[addressKey];
    if (!addr) return 'The RepSpheres Team';
    
    return `
      <div style="margin-top: 30px; font-family: Arial, sans-serif;">
        <div style="font-weight: bold; color: #333;">${addr.name}</div>
        <div style="color: #666; font-size: 14px;">${addr.title}</div>
        <div style="color: #00ff88; font-weight: bold; margin-top: 5px;">RepSpheres</div>
        <div style="color: #999; font-size: 12px; margin-top: 5px;">
          AI-Powered Sales Intelligence for Medical Device Reps
        </div>
      </div>
    `;
  }
};

// Usage:
// await sendEmail({
//   from: repspheresEmails.getFromAddress('jason'),
//   to: 'doctor@hospital.com',
//   subject: 'Canvas AI Analysis Ready',
//   html: content + repspheresEmails.getSignature('jason')
// });