// Mediasoup configuration for WebRTC voice agents
export const mediasoupConfig = {
  // Worker settings
  worker: {
    rtcMinPort: 10000,
    rtcMaxPort: 10100,
    logLevel: 'warn',
    logTags: [
      'info',
      'ice',
      'dtls',
      'rtp',
      'srtp',
      'rtcp',
    ],
  },
  
  // Router settings
  router: {
    mediaCodecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
        parameters: {
          'sprop-stereo': 1,
          'useinbandfec': 1,
          'usedtx': 1,
        }
      },
    ],
  },
  
  // WebRTC transport settings
  webRtcTransport: {
    listenIps: [
      {
        ip: '0.0.0.0',
        announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || null, // Public IP for production
      }
    ],
    maxIncomingBitrate: 1500000,
    initialAvailableOutgoingBitrate: 1000000,
    minimumAvailableOutgoingBitrate: 600000,
    maxSctpMessageSize: 262144,
    // Additional options from the transport
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  },
  
  // Plain transport settings for server-side audio processing
  plainTransport: {
    listenIp: {
      ip: '127.0.0.1',
      announcedIp: null,
    },
    maxSctpMessageSize: 262144,
    // RTP/RTCP port range for internal audio routing
    rtcpMux: false,
    comedia: true,
  }
};

// Audio processing settings
export const audioConfig = {
  // Opus codec settings for voice
  opus: {
    channels: 1, // Mono for voice
    clockRate: 48000,
    sampleRate: 48000,
  },
  
  // Target format for STT/TTS services
  processing: {
    sampleRate: 16000, // Deepgram/Whisper prefer 16kHz
    channels: 1,
    bitDepth: 16,
  },
  
  // Voice activity detection
  vad: {
    threshold: -50, // dB threshold for voice detection
    debounceTime: 300, // ms to wait before considering silence
  }
};