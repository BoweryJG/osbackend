import { WebSocketServer } from 'ws';
import HarveyVoiceService from './harveyVoiceService.js';

class HarveyWebSocketService {
  constructor() {
    this.connections = new Map(); // Map of userId to WebSocket connection
    this.battleRooms = new Map(); // Map of roomId to battle participants
    this.activeCalls = new Map(); // Map of callId to call session
    this.harveyVoice = new HarveyVoiceService();
  }

  initialize(server) {
    // Create WebSocket server for Harvey
    this.wss = new WebSocketServer({ 
      server,
      path: '/harvey-ws'
    });

    this.wss.on('connection', (ws, request) => {
      console.log('Harvey WebSocket connection established');
      
      let userId = null;
      let currentRoom = null;

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          
          switch (data.type) {
            case 'join':
              userId = data.userId || 'demo-user';
              this.connections.set(userId, ws);
              
              ws.send(JSON.stringify({
                type: 'connected',
                userId,
                message: 'Connected to Harvey AI'
              }));
              break;

            case 'offer':
            case 'answer':
            case 'ice-candidate':
              // WebRTC signaling - forward to other participants
              if (currentRoom) {
                this.broadcastToRoom(currentRoom, data, userId);
              }
              break;

            case 'voice-analysis':
              // Handle voice analysis data
              this.handleVoiceAnalysis(data.analysis, userId);
              break;

            case 'voice-command':
              // Process voice commands
              this.processVoiceCommand(data.command, userId, ws);
              break;

            case 'enter-battle':
              // Enter battle mode
              currentRoom = this.enterBattleMode(userId, data.opponentId);
              ws.send(JSON.stringify({
                type: 'battle-mode',
                roomId: currentRoom,
                status: 'waiting-for-opponent'
              }));
              break;

            case 'start-listening':
              ws.send(JSON.stringify({
                type: 'listening-started',
                message: 'Harvey is now listening'
              }));
              break;

            case 'stop-listening':
              ws.send(JSON.stringify({
                type: 'listening-stopped',
                message: 'Harvey stopped listening'
              }));
              break;

            case 'harvey-message':
              // Handle different Harvey message types
              this.handleHarveyMessage(data.message, userId, ws);
              break;

            default:
              console.log('Unknown message type:', data.type);
          }
        } catch (error) {
          console.error('Error processing Harvey WebSocket message:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Failed to process message',
            error: error.message
          }));
        }
      });

      ws.on('close', () => {
        console.log('Harvey WebSocket connection closed');
        if (userId) {
          this.connections.delete(userId);
          // Remove from any battle rooms
          this.leaveBattleMode(userId);
        }
      });

      ws.on('error', (error) => {
        console.error('Harvey WebSocket error:', error);
      });
    });
  }

  async handleVoiceAnalysis(analysis, userId) {
    // Process voice analysis and provide coaching feedback
    const feedback = this.generateCoachingFeedback(analysis);
    
    // Generate audio coaching if urgency is high
    if (feedback.urgent) {
      const coachingAudio = await this.harveyVoice.generateCoachingAudio(analysis);
      feedback.audio = coachingAudio.audio;
      feedback.audioText = coachingAudio.text;
    }
    
    const ws = this.connections.get(userId);
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'coaching',
        feedback,
        analysis,
        timestamp: new Date().toISOString()
      }));
    }
  }

  generateCoachingFeedback(analysis) {
    const feedback = {
      type: 'real-time',
      urgent: false,
      message: '',
      tips: []
    };

    // Analyze voice metrics and provide Harvey-style feedback
    if (analysis.confidence < 50) {
      feedback.urgent = true;
      feedback.message = "Your confidence is wavering. Winners don't stutter.";
      feedback.tips.push("Square your shoulders, lower your voice");
    }

    if (analysis.pace === 'fast') {
      feedback.message = "Slow down. Power comes from presence, not speed.";
      feedback.tips.push("Take deliberate pauses between points");
    }

    if (analysis.tone === 'nervous') {
      feedback.urgent = true;
      feedback.message = "I hear fear in your voice. Fear doesn't close deals.";
      feedback.tips.push("Breathe deeply, speak from your diaphragm");
    }

    if (analysis.tone === 'aggressive') {
      feedback.message = "Aggression without strategy is just noise.";
      feedback.tips.push("Channel that energy into conviction, not volume");
    }

    if (analysis.confidence > 80 && analysis.tone === 'confident') {
      feedback.message = "That's the Harvey Specter way. Keep that energy.";
      feedback.tips.push("Now go for the close");
    }

    return feedback;
  }

  processVoiceCommand(command, userId, ws) {
    const lowerCommand = command.toLowerCase();
    let response = {
      type: 'voice-response',
      command,
      processed: true
    };

    // Process different voice commands
    if (lowerCommand.includes('battle mode')) {
      response.action = 'enter-battle';
      response.message = "Battle mode initiated. Show me what you've got.";
    } else if (lowerCommand.includes('status')) {
      response.action = 'show-status';
      response.message = "Your status is displayed. Now stop asking and start closing.";
    } else if (lowerCommand.includes('help')) {
      response.action = 'show-help';
      response.message = "Help? Winners don't need help. They need results.";
      response.commands = [
        'status', 'battle mode', 'coaching on/off', 
        'metrics', 'leaderboard', 'verdict'
      ];
    } else if (lowerCommand.includes('coaching off')) {
      response.action = 'disable-coaching';
      response.message = "Flying solo? Don't come crying when you crash.";
    } else if (lowerCommand.includes('coaching on')) {
      response.action = 'enable-coaching';
      response.message = "Smart choice. I'll keep you from embarrassing yourself.";
    } else {
      response.message = "I don't have time for unclear commands. Be specific or be quiet.";
      response.processed = false;
    }

    ws.send(JSON.stringify(response));
  }

  handleHarveyMessage(message, userId, ws) {
    switch (message.type) {
      case 'whisper':
        // Harvey's tactical advice during calls
        ws.send(JSON.stringify({
          type: 'harvey-whisper',
          audio: message.audio,
          text: message.text,
          volume: 0.3 // Whisper volume
        }));
        break;

      case 'verdict':
        // Post-call analysis
        ws.send(JSON.stringify({
          type: 'harvey-verdict',
          audio: message.audio,
          text: message.text,
          tone: message.tone
        }));
        break;

      case 'coaching':
        // Real-time coaching feedback
        ws.send(JSON.stringify({
          type: 'harvey-coaching',
          feedback: message.feedback,
          urgent: message.urgent
        }));
        break;
    }
  }

  enterBattleMode(userId, opponentId) {
    const roomId = `battle-${Date.now()}`;
    const room = {
      id: roomId,
      participants: [userId],
      created: new Date(),
      status: 'waiting'
    };

    if (opponentId) {
      room.participants.push(opponentId);
      room.status = 'ready';
      
      // Notify opponent
      const opponentWs = this.connections.get(opponentId);
      if (opponentWs && opponentWs.readyState === opponentWs.OPEN) {
        opponentWs.send(JSON.stringify({
          type: 'battle-invite',
          from: userId,
          roomId
        }));
      }
    }

    this.battleRooms.set(roomId, room);
    return roomId;
  }

  leaveBattleMode(userId) {
    // Find and remove user from any battle rooms
    for (const [roomId, room] of this.battleRooms.entries()) {
      const index = room.participants.indexOf(userId);
      if (index > -1) {
        room.participants.splice(index, 1);
        
        // Notify other participants
        room.participants.forEach(participantId => {
          const ws = this.connections.get(participantId);
          if (ws && ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
              type: 'opponent-left',
              userId
            }));
          }
        });

        // Remove empty rooms
        if (room.participants.length === 0) {
          this.battleRooms.delete(roomId);
        }
      }
    }
  }

  broadcastToRoom(roomId, data, senderId) {
    const room = this.battleRooms.get(roomId);
    if (!room) return;

    room.participants.forEach(participantId => {
      if (participantId !== senderId) {
        const ws = this.connections.get(participantId);
        if (ws && ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify(data));
        }
      }
    });
  }

  // Send Harvey audio response
  sendHarveyAudio(userId, audioData, type = 'verdict') {
    const ws = this.connections.get(userId);
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'harvey-audio',
        audioType: type,
        audio: audioData,
        timestamp: new Date().toISOString()
      }));
    }
  }

  // Broadcast to all connected users
  broadcast(message) {
    this.connections.forEach((ws, userId) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(message));
      }
    });
  }
}

export default HarveyWebSocketService;