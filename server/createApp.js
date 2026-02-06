import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

export function createApp({
  nodeEnv = process.env.NODE_ENV || 'development',
  corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:666',
  rateLimitWindowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  rateLimitMaxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
} = {}) {
  const app = express();

  // Trust proxy (nginx) for correct client IP in rate limiting
  app.set('trust proxy', 1);

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'ajax.googleapis.com'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
      },
    },
  }));

  // CORS configuration
  app.use(cors({
    origin: corsOrigin,
    credentials: true,
  }));

  // Compression middleware
  app.use(compression());

  // Rate limiting
  const limiter = rateLimit({
    windowMs: rateLimitWindowMs,
    max: rateLimitMaxRequests,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(limiter);

  // Serve static files with proper caching
  // In production, serve from dist folder; in development, serve from repo root
  const staticPath = nodeEnv === 'production'
    ? path.join(projectRoot, 'dist')
    : projectRoot;

  app.use(express.static(staticPath, {
    maxAge: nodeEnv === 'production' ? '1h' : 0,
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
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).send('500 - Internal server error');
  });

  return app;
}
