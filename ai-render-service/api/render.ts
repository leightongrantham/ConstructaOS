/**
 * POST /api/render - Direct render endpoint
 * Proxies to Express app (Vercel requires explicit file for this route)
 */

import 'dotenv/config';
import { createServer } from '../src/server.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

let app: ReturnType<typeof createServer> | null = null;

function getApp() {
  if (!app) app = createServer();
  return app;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  const originalUrl = req.url || '/api/render';
  const modifiedReq = Object.assign(req, {
    url: '/api/render',
    originalUrl: originalUrl,
  });
  getApp()(modifiedReq, res);
}
