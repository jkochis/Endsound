import dotenv from 'dotenv';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

// ES module dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Configuration
const PORT = process.env.PORT || 666;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:666';

// Initialize Express app
const app = express();
const httpServer = createServer(app);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "ajax.googleapis.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "ws:", "wss:"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true
}));

// Compression middleware
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// Serve static files with proper caching
// In production, serve from dist folder; in development, serve from root
const staticPath = NODE_ENV === 'production' ? path.join(__dirname, 'dist') : __dirname;
app.use(express.static(staticPath, {
  maxAge: NODE_ENV === 'production' ? '1h' : 0,
  etag: true,
  lastModified: true,
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).send('404 - File not found');
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).send('500 - Internal server error');
});

// Initialize Socket.IO with modern API
const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Session and message storage
const sessions = new Map();
const messageBuffer = [];
const MAX_BUFFER_SIZE = 15;

// Validation functions
function validateMessage(message) {
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
      volume: Math.max(0, Math.min(1, volume))
    };
  }

  if (message.stop && typeof message.stop === 'object') {
    validatedMsg.stop = {
      keyId: String(message.stop.keyId || '').substring(0, 100)
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
      volume: Math.max(0, Math.min(1, volume))
    };
  }

  return Object.keys(validatedMsg).length > 0 ? validatedMsg : null;
}

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

// Start server
httpServer.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   Endsound Server                      ║
╠════════════════════════════════════════╣
║   Environment: ${NODE_ENV.padEnd(24)} ║
║   Port:        ${PORT.toString().padEnd(24)} ║
║   URL:         http://localhost:${PORT.toString().padEnd(7)}║
╚════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  httpServer.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  httpServer.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});
