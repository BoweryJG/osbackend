# RepSpheres Email Setup Guide

## Your RepSpheres Email Suite

All emails forward to → **jgolden@bowerycreativeagency.com**

### 📧 Email Addresses to Set Up:

1. **jgolden@repspheres.com** - Your main professional email
2. **jason@repspheres.com** - Friendly version
3. **support@repspheres.com** - Customer support
4. **hello@repspheres.com** - General inquiries
5. **canvas@repspheres.com** - Canvas-specific
6. **noreply@repspheres.com** - Automated emails
7. **info@repspheres.com** - General information
8. **team@repspheres.com** - Team communications
9. **sales@repspheres.com** - Sales inquiries
10. **demo@repspheres.com** - Demo requests

## Setup Options

### Option 1: ForwardEmail.net (FREE - Recommended)

1. **Go to [ForwardEmail.net](https://forwardemail.net)**

2. **Add Domain**: repspheres.com

3. **Create Aliases**:
   ```
   jgolden@repspheres.com → jgolden@bowerycreativeagency.com
   jason@repspheres.com → jgolden@bowerycreativeagency.com
   support@repspheres.com → jgolden@bowerycreativeagency.com
   hello@repspheres.com → jgolden@bowerycreativeagency.com
   canvas@repspheres.com → jgolden@bowerycreativeagency.com
   noreply@repspheres.com → jgolden@bowerycreativeagency.com
   info@repspheres.com → jgolden@bowerycreativeagency.com
   team@repspheres.com → jgolden@bowerycreativeagency.com
   sales@repspheres.com → jgolden@bowerycreativeagency.com
   demo@repspheres.com → jgolden@bowerycreativeagency.com
   ```

4. **Add DNS Records** (they'll give you these):
   ```
   MX Records:
   Priority 10: mx1.forwardemail.net
   Priority 20: mx2.forwardemail.net

   TXT Records:
   forward-email=jgolden@bowerycreativeagency.com
   v=spf1 include:spf.forwardemail.net ~all
   ```

### Option 2: Google Workspace ($6/month)

1. Sign up at workspace.google.com
2. Create user: jgolden@repspheres.com
3. Add all others as free aliases
4. Forward all to jgolden@bowerycreativeagency.com

### Option 3: Cloudflare Email Routing (FREE)

1. Use Cloudflare for DNS
2. Go to Email → Email Routing
3. Add each address → forward to jgolden@bowerycreativeagency.com

## Configure Gmail to Send As RepSpheres

1. **In Gmail** (jgolden@bowerycreativeagency.com):
   - Settings → Accounts → Send mail as
   - Add: jgolden@repspheres.com
   - Add: support@repspheres.com
   - Add: canvas@repspheres.com
   - etc.

2. **SMTP Settings** (when Gmail asks):
   ```
   SMTP Server: smtp.gmail.com
   Port: 587
   Username: jgolden@bowerycreativeagency.com
   Password: [your app password]
   ```

## DNS Records Summary

Add these to your domain registrar:

```
Type    Name    Value                           Priority
MX      @       mx1.forwardemail.net           10
MX      @       mx2.forwardemail.net           20
TXT     @       forward-email=jgolden@bowerycreativeagency.com
TXT     @       v=spf1 include:spf.forwardemail.net include:_spf.google.com ~all
```

## Test Your Setup

Once configured, test each address:
- Send test email to jason@repspheres.com
- Should arrive at jgolden@bowerycreativeagency.com
- Reply should show as coming from @repspheres.com

## Use in Your Code

```javascript
import { repspheresEmails } from './services/repspheresEmails.js';

// Send as different personas
await sendEmail({
  from: repspheresEmails.getFromAddress('jgolden'), // Professional
  from: repspheresEmails.getFromAddress('support'), // Support team
  from: repspheresEmails.getFromAddress('canvas'),  // Product-specific
});
```

All replies come to your jgolden@bowerycreativeagency.com inbox!