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

async function checkDuplicateContacts() {
  console.log('🔍 Checking for duplicate contacts...\n');

  try {
    // Get all contacts
    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error fetching contacts:', error);
      return;
    }

    console.log(`Total contacts: ${contacts.length}\n`);

    // Check for duplicates by phone number
    const phoneMap = new Map();
    const phoneDuplicates = [];

    contacts.forEach(contact => {
      if (contact.phone) {
        const normalizedPhone = contact.phone.replace(/\D/g, ''); // Remove non-digits
        if (phoneMap.has(normalizedPhone)) {
          phoneDuplicates.push({
            phone: contact.phone,
            contacts: [phoneMap.get(normalizedPhone), contact]
          });
        } else {
          phoneMap.set(normalizedPhone, contact);
        }
      }
    });

    // Check for duplicates by email
    const emailMap = new Map();
    const emailDuplicates = [];

    contacts.forEach(contact => {
      if (contact.email) {
        const normalizedEmail = contact.email.toLowerCase().trim();
        if (emailMap.has(normalizedEmail)) {
          emailDuplicates.push({
            email: contact.email,
            contacts: [emailMap.get(normalizedEmail), contact]
          });
        } else {
          emailMap.set(normalizedEmail, contact);
        }
      }
    });

    // Check for duplicates by name (exact match)
    const nameMap = new Map();
    const nameDuplicates = [];

    contacts.forEach(contact => {
      if (contact.name) {
        const normalizedName = contact.name.toLowerCase().trim();
        if (nameMap.has(normalizedName)) {
          nameDuplicates.push({
            name: contact.name,
            contacts: [nameMap.get(normalizedName), contact]
          });
        } else {
          nameMap.set(normalizedName, contact);
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
          console.log(`   - ${c.name} (ID: ${c.id}, Created: ${new Date(c.created_at).toLocaleDateString()})`);
        });
      });
      console.log('');
    }

    console.log('📧 Duplicate Email Addresses:');
    if (emailDuplicates.length === 0) {
      console.log('   None found\n');
    } else {
      emailDuplicates.forEach(dup => {
        console.log(`\n   Email: ${dup.email}`);
        dup.contacts.forEach(c => {
          console.log(`   - ${c.name} (ID: ${c.id}, Phone: ${c.phone || 'N/A'})`);
        });
      });
      console.log('');
    }

    console.log('👤 Duplicate Names (exact match):');
    if (nameDuplicates.length === 0) {
      console.log('   None found\n');
    } else {
      nameDuplicates.forEach(dup => {
        console.log(`\n   Name: ${dup.name}`);
        dup.contacts.forEach(c => {
          console.log(`   - ID: ${c.id}, Phone: ${c.phone || 'N/A'}, Email: ${c.email || 'N/A'}`);
        });
      });
      console.log('');
    }

    // Summary
    console.log('📊 Summary:');
    console.log(`   Total contacts: ${contacts.length}`);
    console.log(`   Duplicate phone numbers: ${phoneDuplicates.length}`);
    console.log(`   Duplicate emails: ${emailDuplicates.length}`);
    console.log(`   Duplicate names: ${nameDuplicates.length}`);

    // Optional: Show contacts with missing information
    const missingPhone = contacts.filter(c => !c.phone).length;
    const missingEmail = contacts.filter(c => !c.email).length;
    
    console.log(`\n   Contacts without phone: ${missingPhone}`);
    console.log(`   Contacts without email: ${missingEmail}`);

  } catch (error) {
    console.error('Error:', error);
  }
}

checkDuplicateContacts();