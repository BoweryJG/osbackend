
# Backend Deployment Checklist

## 1. Install Dependencies
```bash
cd /home/jgolden/osbackend
npm install twilio node-fetch
```

## 2. Update Your Main Server File
- Open server-update.js and follow the instructions
- Add the route imports and app.use() statements

## 3. Update Environment Variables on Render
Add these variables:
- OPENAI_API_KEY
- TWILIO_AUTH_TOKEN (from Twilio console)
- FORWARD_TO_PHONE (your phone number to forward calls to)
- BACKEND_URL (should be https://osbackend-zl1h.onrender.com)

## 4. Deploy to Render
```bash
git add .
git commit -m "Add call summary and Twilio webhook routes"
git push origin main
```

## 5. Update Twilio Webhooks
Go to Twilio Console > Phone Numbers > Your Number

Set these webhooks:
- Voice & Fax > A call comes in: 
  Webhook: https://osbackend-zl1h.onrender.com/api/twilio/incoming-call
  Method: HTTP POST

- Call Status Changes:
  Status Callback URL: https://osbackend-zl1h.onrender.com/api/twilio/call-status
  
## 6. Test the Integration
- Make a test call to your Twilio number
- Check backend logs on Render
- Verify call summary generation works

## 7. Update Frontend
The frontend is already updated to use backend URLs.
Just ensure REACT_APP_BACKEND_URL is set correctly.
