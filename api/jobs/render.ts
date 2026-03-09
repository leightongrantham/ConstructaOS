/**
 * POST /api/jobs/render - Create render job
 * Proxies to Express app (used when project root is repo root; ai-render-service has the same file)
 */

import 'dotenv/config';
import { createServer } from '../../ai-render-service/src/server.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

let app: ReturnType<typeof createServer> | null = null;

function getApp() {
  if (!app) app = createServer();
  return app;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  const modifiedReq = Object.assign(req, {
    url: '/api/jobs/render',
    originalUrl: req.url || '/api/jobs/render',
  });
  getApp()(modifiedReq, res);
}
