import axios from 'axios';

async function testEndpoint() {
  try {
    console.log('Testing endpoint...');
    
    const response = await axios.post('http://localhost:3001/api/private-practice-intelligence', {
      doctor: {
        npi: '1234567890',
        displayName: 'Dr. John Smith',
        firstName: 'John',
        lastName: 'Smith',
        specialty: 'Dentistry',
        city: 'Buffalo',
        state: 'NY'
      },
      product: 'iTero Scanner',
      userId: 'test'
    }, {
      timeout: 30000
    });
    
    console.log('Success! Response received:', response.status);
    console.log('Processing time:', response.data.processingTime, 'ms');
    console.log('Sales rep brief preview:', response.data.salesRepBrief.substring(0, 200));
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

testEndpoint();