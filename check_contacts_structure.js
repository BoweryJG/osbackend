import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function checkContactsStructure() {
  console.log('🔍 Checking contacts table structure...\n');

  try {
    // First, let's get one contact to see the structure
    const { data: sampleContact, error: sampleError } = await supabase
      .from('contacts')
      .select('*')
      .limit(1);

    if (sampleError) {
      console.error('Error fetching sample contact:', sampleError);
      return;
    }

    if (sampleContact && sampleContact.length > 0) {
      console.log('Sample contact structure:');
      console.log(JSON.stringify(sampleContact[0], null, 2));
      console.log('\nColumns:', Object.keys(sampleContact[0]));
    }

    // Now get all contacts to check for duplicates
    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('*')
      .order('created_at');

    if (error) {
      console.error('Error fetching contacts:', error);
      return;
    }

    console.log(`\nTotal contacts: ${contacts.length}\n`);

    // Check for duplicates based on available fields
    const phoneMap = new Map();
    const phoneDuplicates = [];

    contacts.forEach(contact => {
      // Try different possible field names
      const phone = contact.phone || contact.phone_number || contact.phoneNumber;
      const name = contact.first_name 
        ? `${contact.first_name} ${contact.last_name || ''}`.trim()
        : contact.name || contact.display_name || 'Unknown';

      if (phone) {
        const normalizedPhone = phone.replace(/\D/g, ''); // Remove non-digits
        const key = normalizedPhone;
        
        if (phoneMap.has(key)) {
          const existing = phoneMap.get(key);
          phoneDuplicates.push({
            phone: phone,
            contacts: [existing, { ...contact, display_name: name }]
          });
        } else {
          phoneMap.set(key, { ...contact, display_name: name });
        }
      }
    });

    // Report findings
    console.log('📱 Duplicate Phone Numbers:');
    if (phoneDuplicates.length === 0) {
      console.log('   None found\n');
    } else {
      phoneDuplicates.forEach(dup => {
        console.log(`\n   Phone: ${dup.phone}`);
        dup.contacts.forEach(c => {
          console.log(`   - ${c.display_name} (ID: ${c.id})`);
          if (c.email) console.log(`     Email: ${c.email}`);
          if (c.company) console.log(`     Company: ${c.company}`);
          console.log(`     Created: ${new Date(c.created_at).toLocaleDateString()}`);
        });
      });
    }

    console.log(`\n📊 Summary: Found ${phoneDuplicates.length} duplicate phone numbers`);

  } catch (error) {
    console.error('Error:', error);
  }
}

checkContactsStructure();