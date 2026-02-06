import { Server } from 'socket.io';

// Session and message storage
const MAX_BUFFER_SIZE = 15;

export function validateMessage(message) {
  if (!message || typeof message !== 'object') {
    return null;
  }

  const validatedMsg = {};

  if (message.play && typeof message.play === 'object') {
    const hz = parseFloat(message.play.hz);
    const volume = parseFloat(message.play.volume);

    // Validate ranges
    if (isNaN(hz) || hz < 20 || hz > 20000) return null;
    if (isNaN(volume) || volume < 0 || volume > 1) return null;

    validatedMsg.play = {
      keyId: String(message.play.keyId || '').substring(0, 100),
      hz: hz,
      volume: Math.max(0, Math.min(1, volume)),
    };
  }

  if (message.stop && typeof message.stop === 'object') {
    validatedMsg.stop = {
      keyId: String(message.stop.keyId || '').substring(0, 100),
    };
  }

  if (message.sustain && typeof message.sustain === 'object') {
    const hz = parseFloat(message.sustain.hz);
    const volume = parseFloat(message.sustain.volume);

    if (isNaN(hz) || hz < 20 || hz > 20000) return null;
    if (isNaN(volume) || volume < 0 || volume > 1) return null;

    validatedMsg.sustain = {
      keyId: String(message.sustain.keyId || '').substring(0, 100),
      hz: hz,
      volume: Math.max(0, Math.min(1, volume)),
    };
  }

  return Object.keys(validatedMsg).length > 0 ? validatedMsg : null;
}

export function attachSocketServer(httpServer, {
  corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:666',
} = {}) {
  // Initialize Socket.IO with modern API
  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigin,
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  const sessions = new Map();
  const messageBuffer = [];

  // Socket.IO connection handling
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Store session
    sessions.set(socket.id, {
      id: socket.id,
      connectedAt: new Date(),
    });

    // Send welcome message with current sessions
    socket.emit('welcome', {
      sessionId: socket.id,
      activeSessions: Array.from(sessions.keys()),
      messageHistory: messageBuffer,
    });

    // Broadcast new session to others
    socket.broadcast.emit('session:joined', {
      sessionId: socket.id,
    });

    // Handle note play events
    socket.on('note:play', (data) => {
      const validated = validateMessage({ play: data });
      if (!validated || !validated.play) {
        console.warn(`Invalid play message from ${socket.id}`);
        return;
      }

      const message = {
        type: 'note:play',
        sessionId: socket.id,
        data: validated.play,
        timestamp: Date.now(),
      };

      // Add to buffer
      messageBuffer.push(message);
      if (messageBuffer.length > MAX_BUFFER_SIZE) {
        messageBuffer.shift();
      }

      // Broadcast to all other clients
      socket.broadcast.emit('note:play', message);
    });

    // Handle note stop events
    socket.on('note:stop', (data) => {
      const validated = validateMessage({ stop: data });
      if (!validated || !validated.stop) {
        console.warn(`Invalid stop message from ${socket.id}`);
        return;
      }

      const message = {
        type: 'note:stop',
        sessionId: socket.id,
        data: validated.stop,
        timestamp: Date.now(),
      };

      socket.broadcast.emit('note:stop', message);
    });

    // Handle sustain events
    socket.on('note:sustain', (data) => {
      const validated = validateMessage({ sustain: data });
      if (!validated || !validated.sustain) {
        console.warn(`Invalid sustain message from ${socket.id}`);
        return;
      }

      const message = {
        type: 'note:sustain',
        sessionId: socket.id,
        data: validated.sustain,
        timestamp: Date.now(),
      };

      socket.broadcast.emit('note:sustain', message);
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`Client disconnected: ${socket.id} (${reason})`);
      sessions.delete(socket.id);

      // Notify others
      socket.broadcast.emit('session:left', {
        sessionId: socket.id,
      });
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`Socket error for ${socket.id}:`, error);
    });
  });

  return io;
}
