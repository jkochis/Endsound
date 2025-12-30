// Socket.IO client - TypeScript version (no jQuery)
import { io } from 'socket.io-client';
import type { SocketMessage, WelcomeMessage, SessionJoinedMessage, SessionLeftMessage } from './types';

// Initialize Socket.IO client
window.socket = io({
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: Infinity,
});

// Track disconnect state
let trueDisconnect = false;

// Socket event handlers
window.socket.on('connect', () => {
  console.log('Connected to server with ID:', window.socket.id);
});

window.socket.on('welcome', (data: WelcomeMessage) => {
  console.log('Welcome! Session ID:', data.sessionId);
  console.log('Active sessions:', data.activeSessions.length);

  // Could display connected users here
});

window.socket.on('session:joined', (data: SessionJoinedMessage) => {
  console.log('New user joined:', data.sessionId);

  // Could update user list UI here
});

window.socket.on('session:left', (data: SessionLeftMessage) => {
  console.log('User left:', data.sessionId);

  // Could update user list UI here
});

// Handle incoming note play events
window.socket.on('note:play', (message: SocketMessage) => {
  if (message && message.data) {
    const event = message.data as any;
    if (window.audioWorkletNode) {
      window.audioWorkletNode.port.postMessage({
        type: 'play',
        noteStopId: event.keyId,
        frequency: event.hz,
        volume: event.volume,
      });
    }
  }
});

// Handle incoming note stop events
window.socket.on('note:stop', (message: SocketMessage) => {
  if (message && message.data) {
    const event = message.data as any;
    if (window.audioWorkletNode) {
      window.audioWorkletNode.port.postMessage({
        type: 'stop',
        noteStopId: event.keyId,
      });
    }
  }
});

// Handle incoming sustain events
window.socket.on('note:sustain', (message: SocketMessage) => {
  if (message && message.data) {
    const event = message.data as any;
    if (window.audioWorkletNode) {
      window.audioWorkletNode.port.postMessage({
        type: 'sustain',
        value: event,
      });
    }
  }
});

window.socket.on('disconnect', (reason: string) => {
  console.log('Disconnected:', reason);
  // Socket.IO 4.x handles reconnection automatically
});

window.socket.on('connect_error', (error: Error) => {
  console.error('Connection error:', error.message);
});

// Handle page unload
window.addEventListener('beforeunload', () => {
  trueDisconnect = true;
  window.socket.disconnect();
});

export { trueDisconnect };
