import mediasoup from 'mediasoup';

import { mediasoupConfig, audioConfig } from '../config/mediasoup.config.js';

class MediasoupService {
  constructor() {
    this.workers = [];
    this.routers = new Map();
    this.transports = new Map();
    this.producers = new Map();
    this.consumers = new Map();
    this.rooms = new Map(); // agentId -> room data
    this.nextWorkerIdx = 0;
  }

  async initialize(numWorkers = 1) {
    console.log('Initializing Mediasoup service...');
    
    // Create workers
    for (let i = 0; i < numWorkers; i++) {
      const worker = await mediasoup.createWorker(mediasoupConfig.worker);
      
      worker.on('died', () => {
        console.error(`Mediasoup worker died, exiting in 2 seconds... [pid:${worker.pid}]`);
        setTimeout(() => process.exit(1), 2000);
      });
      
      this.workers.push(worker);
    }
    
    console.log(`Created ${numWorkers} mediasoup workers`);
  }

  async createRoom(roomId) {
    // Get next worker (round-robin)
    const worker = this.getNextWorker();
    
    // Create router with audio codecs
    const router = await worker.createRouter({
      mediaCodecs: mediasoupConfig.router.mediaCodecs
    });
    
    this.routers.set(roomId, router);
    this.rooms.set(roomId, {
      id: roomId,
      router,
      peers: new Map(),
      audioProcessor: null
    });
    
    return router;
  }

  async createWebRtcTransport(roomId, peerId, direction) {
    const router = this.routers.get(roomId);
    if (!router) throw new Error('Room not found');
    
    const transport = await router.createWebRtcTransport({
      ...mediasoupConfig.webRtcTransport,
      appData: { peerId, direction }
    });
    
    // Store transport
    const transportId = transport.id;
    this.transports.set(transportId, transport);
    
    // Add to room peer data
    const room = this.rooms.get(roomId);
    if (!room.peers.has(peerId)) {
      room.peers.set(peerId, {
        id: peerId,
        transports: new Map(),
        producers: new Map(),
        consumers: new Map()
      });
    }
    room.peers.get(peerId).transports.set(transportId, transport);
    
    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
      sctpParameters: transport.sctpParameters
    };
  }

  async connectTransport(transportId, dtlsParameters) {
    const transport = this.transports.get(transportId);
    if (!transport) throw new Error('Transport not found');
    
    await transport.connect({ dtlsParameters });
  }

  async createProducer(transportId, rtpParameters, kind, appData) {
    const transport = this.transports.get(transportId);
    if (!transport) throw new Error('Transport not found');
    
    const producer = await transport.produce({
      kind,
      rtpParameters,
      appData
    });
    
    this.producers.set(producer.id, producer);
    
    // Add to peer data
    const { peerId } = transport.appData;
    const roomId = this.findRoomByPeerId(peerId);
    if (roomId) {
      const room = this.rooms.get(roomId);
      const peer = room.peers.get(peerId);
      if (peer) {
        peer.producers.set(producer.id, producer);
      }
    }
    
    return {
      id: producer.id,
      kind: producer.kind,
      rtpParameters: producer.rtpParameters
    };
  }

  async createConsumer(roomId, consumerPeerId, producerId, rtpCapabilities) {
    const router = this.routers.get(roomId);
    const producer = this.producers.get(producerId);
    
    if (!router || !producer) {
      throw new Error('Router or producer not found');
    }
    
    // Check if router can consume
    if (!router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error('Cannot consume');
    }
    
    // Get consumer transport
    const room = this.rooms.get(roomId);
    const peer = room.peers.get(consumerPeerId);
    const transport = Array.from(peer.transports.values())
      .find(t => t.appData.direction === 'recv');
    
    if (!transport) {
      throw new Error('No receive transport for consumer');
    }
    
    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: false,
      appData: { consumerPeerId }
    });
    
    this.consumers.set(consumer.id, consumer);
    peer.consumers.set(consumer.id, consumer);
    
    return {
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters
    };
  }

  // Create plain transport for server-side audio processing
  async createPlainTransport(roomId) {
    const router = this.routers.get(roomId);
    if (!router) throw new Error('Room not found');
    
    const transport = await router.createPlainTransport({
      ...mediasoupConfig.plainTransport,
      rtcpMux: false,
      comedia: true
    });
    
    return {
      id: transport.id,
      ip: transport.tuple.localIp,
      port: transport.tuple.localPort,
      rtcpPort: transport.rtcpTuple?.localPort
    };
  }

  // Helper methods
  getNextWorker() {
    const worker = this.workers[this.nextWorkerIdx];
    this.nextWorkerIdx = (this.nextWorkerIdx + 1) % this.workers.length;
    return worker;
  }

  findRoomByPeerId(peerId) {
    for (const [roomId, room] of this.rooms) {
      if (room.peers.has(peerId)) {
        return roomId;
      }
    }
    return null;
  }

  async closeRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    
    // Close all transports
    for (const peer of room.peers.values()) {
      for (const transport of peer.transports.values()) {
        transport.close();
      }
    }
    
    // Close router
    room.router.close();
    
    // Clean up
    this.rooms.delete(roomId);
    this.routers.delete(roomId);
  }
}

// Singleton instance
let mediasoupService = null;

export function getMediasoupService() {
  if (!mediasoupService) {
    mediasoupService = new MediasoupService();
  }
  return mediasoupService;
}

export default MediasoupService;