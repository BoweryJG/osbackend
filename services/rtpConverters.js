import { Transform } from 'stream';
import dgram from 'dgram';

/**
 * Converts RTP packets to audio stream
 */
export class RTPToStreamConverter extends Transform {
  constructor(options) {
    super();
    this.rtpPort = options.rtpPort;
    this.rtcpPort = options.rtcpPort;
    this.payloadType = options.payloadType;
    this.sampleRate = options.sampleRate;
    this.channels = options.channels;
    
    this.socket = dgram.createSocket('udp4');
    this.setupSocket();
    
    this.sequenceNumber = 0;
    this.timestamp = 0;
    this.ssrc = Math.floor(Math.random() * 0xFFFFFFFF);
  }
  
  setupSocket() {
    this.socket.on('message', (msg) => {
      // Parse RTP header
      const version = (msg[0] >> 6) & 0x03;
      const padding = (msg[0] >> 5) & 0x01;
      const extension = (msg[0] >> 4) & 0x01;
      const cc = msg[0] & 0x0F;
      const marker = (msg[1] >> 7) & 0x01;
      const pt = msg[1] & 0x7F;
      const seq = msg.readUInt16BE(2);
      const timestamp = msg.readUInt32BE(4);
      const ssrc = msg.readUInt32BE(8);
      
      // Skip to payload
      let offset = 12 + (cc * 4);
      if (extension) {
        const extLength = msg.readUInt16BE(offset + 2) * 4;
        offset += 4 + extLength;
      }
      
      // Extract audio payload
      const payload = msg.slice(offset);
      
      // Emit as stream
      this.push(payload);
    });
    
    this.socket.bind(this.rtpPort);
  }
  
  getOutputStream() {
    return this;
  }
}

/**
 * Converts audio stream to RTP packets
 */
export class StreamToRTPConverter extends Transform {
  constructor(options) {
    super();
    this.payloadType = options.payloadType;
    this.sampleRate = options.sampleRate;
    this.channels = options.channels;
    
    this.sequenceNumber = 0;
    this.timestamp = 0;
    this.ssrc = Math.floor(Math.random() * 0xFFFFFFFF);
    
    this.targetSocket = null;
    this.targetPort = null;
    this.targetAddress = null;
  }
  
  setTarget(address, port) {
    this.targetAddress = address;
    this.targetPort = port;
    this.targetSocket = dgram.createSocket('udp4');
  }
  
  _transform(chunk, encoding, callback) {
    // Create RTP packet
    const header = Buffer.allocUnsafe(12);
    
    // V=2, P=0, X=0, CC=0, M=0, PT=payloadType
    header[0] = 0x80;
    header[1] = this.payloadType;
    
    // Sequence number
    header.writeUInt16BE(this.sequenceNumber++, 2);
    
    // Timestamp
    header.writeUInt32BE(this.timestamp, 4);
    this.timestamp += chunk.length / (this.channels * 2); // 16-bit samples
    
    // SSRC
    header.writeUInt32BE(this.ssrc, 8);
    
    // Combine header and payload
    const packet = Buffer.concat([header, chunk]);
    
    // Send if we have a target
    if (this.targetSocket && this.targetAddress && this.targetPort) {
      this.targetSocket.send(packet, this.targetPort, this.targetAddress);
    }
    
    callback();
  }
  
  getInputStream() {
    return this;
  }
}