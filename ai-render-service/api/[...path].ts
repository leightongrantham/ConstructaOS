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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  // Handle preflight OPTIONS immediately (no Express/canvas load)
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const originalUrl = req.url || '';
  const pathname = originalUrl.split('?')[0] || '';
  const queryString = originalUrl.includes('?') ? originalUrl.slice(originalUrl.indexOf('?') + 1) : '';

  // Early return for /health - avoid loading full server (canvas, etc.) for health checks
  if (pathname === '/health' || pathname === '/api/health') {
    const openaiSet = Boolean(process.env.OPENAI_API_KEY?.trim());
    const gatewaySet = Boolean(process.env.AI_GATEWAY_API_KEY?.trim());
    res.status(200).json({
      status: 'ok',
      keys: {
        openai: openaiSet,
        gateway: gatewaySet,
        imageReady: openaiSet || gatewaySet,
      },
      ...(gatewaySet && { hint: 'Image generation uses gateway. Ensure OpenAI key is added in Vercel AI Gateway → Bring Your Own Key (BYOK).' }),
    });
    return;
  }

  // Early return for /api/health/keys or /api/api/health/keys or /health/keys (key check + optional validate)
  const isHealthKeys = req.method === 'GET' && (
    pathname === '/api/health/keys' ||
    pathname === '/api/api/health/keys' ||
    pathname === '/health/keys'
  );
  if (isHealthKeys) {
    const openaiSet = Boolean(process.env.OPENAI_API_KEY?.trim());
    const gatewaySet = Boolean(process.env.AI_GATEWAY_API_KEY?.trim());
    const imageReady = openaiSet || gatewaySet;
    const out: Record<string, unknown> = {
      keys: { openai: { set: openaiSet }, gateway: { set: gatewaySet }, imageReady },
    };
    const validate = queryString.includes('validate=1') || queryString.includes('validate=true');
    if (validate && imageReady) {
      try {
        const base = process.env.AI_GATEWAY_API_KEY ? 'https://ai-gateway.vercel.sh/v1' : 'https://api.openai.com/v1';
        const key = (process.env.AI_GATEWAY_API_KEY || process.env.OPENAI_API_KEY || '').trim();
        const model = process.env.AI_GATEWAY_API_KEY ? 'openai/gpt-4o-mini' : 'gpt-4o-mini';
        const start = Date.now();
        const r = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply OK' }], max_tokens: 5 }),
        });
        const raw = await r.text();
        const body = (() => { try { return JSON.parse(raw) as { choices?: Array<{ message?: unknown }> }; } catch { return null; } })();
        const ok = r.ok && body?.choices?.[0]?.message != null;
        out.validated = true;
        out.valid = ok;
        out.durationMs = Date.now() - start;
        if (!ok) (out as Record<string, unknown>).error = raw.slice(0, 200);
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
      const msg = error instanceof Error ? error.message : 'Unknown error occurred';
      const msgLower = msg.toLowerCase();
      const isConnectionError =
        msgLower.includes('connection') ||
        msgLower.includes('econnrefused') ||
        msgLower.includes('enotfound') ||
        msgLower.includes('fetch failed') ||
        msgLower.includes('failed to connect to openai') ||
        msgLower.includes('failed to generate concept image');
      if (isConnectionError) {
        res.status(503).json({
          error: 'OPENAI_CONNECTION_FAILED',
          message: msg,
          hint: 'Set AI_GATEWAY_API_KEY in Vercel and add your OpenAI key in AI Gateway → Bring Your Own Key. Or use the jobs API (POST /api/jobs/render then poll /api/jobs/:id).',
        });
        return;
      }
      res.status(500).json({
        error: 'Internal server error',
        message: msg,
      });
    }
  }
}
