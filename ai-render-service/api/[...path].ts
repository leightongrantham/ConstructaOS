/**
 * Vercel serverless function - catch-all route for Express app
 * Handles all routes: /health, /api/*, /render, etc.
 */

import 'dotenv/config';
import { createServer } from '../src/server.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const ALLOWED_ORIGINS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /\.vercel\.app$/,
  /lovableproject\.com$/,
  /lovable\.app$/,
  /lovable\.dev$/,
];

function setCorsHeaders(req: VercelRequest, res: VercelResponse): void {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.some((re) => re.test(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

// Catch unhandled promise rejections at the process level
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Create Express app instance (reused across invocations)
let app: ReturnType<typeof createServer> | null = null;

function getApp() {
  if (!app) {
    try {
      app = createServer();
      console.log('Express app initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Express app:', error);
      throw error;
    }
  }
  return app;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  // Handle preflight OPTIONS immediately (no Express/canvas load)
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const originalUrl = req.url || '';

  // Early return for /health - avoid loading full server (canvas, etc.) for health checks
  const pathname = originalUrl.split('?')[0] || '';
  if (pathname === '/health' || pathname === '/api/health') {
    res.status(200).json({ status: 'ok' });
    return;
  }

  // Add logging to debug routing issues
  console.log(`[${req.method}] ${originalUrl}`, {
    path: originalUrl,
    method: req.method,
  });

  try {
    const expressApp = getApp();
    
    // Some rewrites send /api/... -> /api/api/...; strip leading /api to get Express path
    let expressUrl = originalUrl;
    if (expressUrl.startsWith('/api/api')) {
      expressUrl = expressUrl.slice(4) || '/'; // /api/api/... -> /api/... or /test/...
    }
    // Express test routes are /test/concept/* not /api/test/concept/*
    if (expressUrl.startsWith('/api/test')) {
      expressUrl = '/test' + expressUrl.slice(9); // /api/test/... -> /test/...
    }
    const [pathname, queryString] = expressUrl.split('?');
    const urlWithQuery = queryString ? `${pathname}?${queryString}` : pathname;

    const modifiedReq = Object.assign(req, {
      url: urlWithQuery,
      originalUrl: originalUrl,
    });
    
    // Call Express handler with modified request
    expressApp(modifiedReq, res);
  } catch (error) {
    console.error('Error in Vercel handler:', error);
    
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  }
}
