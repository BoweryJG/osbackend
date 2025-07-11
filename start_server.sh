#!/bin/bash
cd /Users/jasonsmacbookpro2022/osbackend
npm start &> server.log &
echo $! > server.pid
echo "Server started with PID $(cat server.pid)"
echo "Logs are being written to server.log"
sleep 5
echo "Checking if server is running..."
if ps -p $(cat server.pid) > /dev/null; then
    echo "✅ Server is running"
else
    echo "❌ Server failed to start. Check server.log for errors"
    tail -20 server.log
fi