/**
 * Vercel serverless function - catch-all route for Express app
 * Handles all routes: /health, /api/*, /render, etc.
 */

import 'dotenv/config';
import { pathToFileURL } from 'url';
import { join } from 'path';
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const originalUrl = req.url || '';
  const [pathname, queryString] = originalUrl.split('?');
  const strippedPath = pathname?.startsWith('/api') ? (pathname.slice(4) || '/') : pathname || '/';

  // GET /health/keys (after strip: /api/health/keys -> /health/keys) - key presence and optional validation
  if (req.method === 'GET' && (strippedPath === '/health/keys' || strippedPath === 'health/keys')) {
    const openaiSet = Boolean(process.env.OPENAI_API_KEY?.trim());
    const gatewaySet = Boolean(process.env.AI_GATEWAY_API_KEY?.trim());
    const imageReady = openaiSet || gatewaySet;
    const out: Record<string, unknown> = {
      keys: { openai: { set: openaiSet }, gateway: { set: gatewaySet }, imageReady },
    };
    const validate = queryString?.includes('validate=1') || queryString?.includes('validate=true');
    if (validate && imageReady) {
      try {
        const base = process.env.AI_GATEWAY_API_KEY ? 'https://ai-gateway.vercel.sh/v1' : 'https://api.openai.com/v1';
        const key = process.env.AI_GATEWAY_API_KEY || process.env.OPENAI_API_KEY || '';
        const model = process.env.AI_GATEWAY_API_KEY ? 'openai/gpt-4o-mini' : 'gpt-4o-mini';
        const start = Date.now();
        const r = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply OK' }], max_tokens: 5 }),
        });
        const body = (await r.json()) as { choices?: Array<{ message?: unknown }> };
        const ok = r.ok && body?.choices?.[0]?.message != null;
        out.validated = true;
        out.valid = ok;
        out.durationMs = Date.now() - start;
        if (!ok) {
          const err = await r.text();
          (out as Record<string, unknown>).error = err.slice(0, 200);
        }
      } catch (e) {
        out.validated = true;
        out.valid = false;
        (out as Record<string, unknown>).error = e instanceof Error ? e.message : String(e);
      }
    } else if (validate && !imageReady) {
      out.validated = false;
      (out as Record<string, unknown>).error = 'No API key set (OPENAI_API_KEY or AI_GATEWAY_API_KEY)';
    }
    res.status(200).json(out);
    return;
  }

  // Add logging to debug routing issues
  console.log(`[${req.method}] ${req.url}`, {
    path: req.url,
    method: req.method,
  });

  const pathnameForRoute = (req.url || '').split('?')[0] || '';

  // Delegate /api/jobs/* to ai-render-service Express (root server has no jobs routes)
  if (pathnameForRoute.startsWith('/api/jobs')) {
    try {
      let createServerJobs: typeof createServer;
      try {
        ({ createServer: createServerJobs } = await import('../ai-render-service/src/server.js'));
      } catch {
        // Under vercel dev the relative import may fail; try path from cwd (project root)
        const serverPath = pathToFileURL(join(process.cwd(), 'ai-render-service', 'src', 'server.js')).href;
        ({ createServer: createServerJobs } = await import(serverPath));
      }
      const jobsApp = createServerJobs();
      const urlWithQuery = req.url || '/api/jobs/render';
      const modifiedReq = Object.assign(req, {
        url: urlWithQuery.startsWith('/api/api') ? urlWithQuery.slice(4) || '/' : urlWithQuery,
        originalUrl: req.url || urlWithQuery,
      });
      jobsApp(modifiedReq, res);
      return;
    } catch (err) {
      console.error('Jobs API (ai-render-service) failed:', err);
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'application/json');
        res.status(500).json({
          error: 'Jobs API unavailable',
          message: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }
  }

  try {
    const expressApp = getApp();
    
    // Strip /api prefix from URL for Express routing
    const originalUrl = req.url || '';
    let strippedUrl = originalUrl;
    
    if (originalUrl.startsWith('/api')) {
      const [pathname, queryString] = originalUrl.split('?');
      strippedUrl = (pathname ?? '').slice(4) || '/';
      if (queryString) {
        strippedUrl += `?${queryString}`;
      }
    }
    
    const modifiedReq = Object.assign(req, {
      url: strippedUrl,
      originalUrl: originalUrl,
    });
    
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
