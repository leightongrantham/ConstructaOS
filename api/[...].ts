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

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // Add logging to debug routing issues
  console.log(`[${req.method}] ${req.url}`, {
    path: req.url,
    method: req.method,
    headers: req.headers,
  });

  try {
    const expressApp = getApp();
    
    // Strip /api prefix from URL for Express routing
    // Vercel catch-all api/[...].ts receives paths with /api prefix
    // but Express routes are defined without /api prefix
    const originalUrl = req.url || '';
    let strippedUrl = originalUrl;
    
    // Handle path-only URLs (no protocol/host)
    if (originalUrl.startsWith('/api')) {
      // Split path and query string
      const [pathname, queryString] = originalUrl.split('?');
      strippedUrl = (pathname ?? '').slice(4) || '/';
      // Preserve query string if present
      if (queryString) {
        strippedUrl += `?${queryString}`;
      }
    }
    
    // Create a modified request object with stripped URL
    // Express uses req.url for routing, so we need to modify it
    const modifiedReq = Object.assign(req, {
      url: strippedUrl,
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
