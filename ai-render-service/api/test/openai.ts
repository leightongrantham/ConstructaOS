/**
 * GET /api/test/openai - OpenAI connectivity test
 * Explicit Vercel route (avoids catch-all routing issues)
 */

import 'dotenv/config';
import { createServer } from '../../src/server.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

let app: ReturnType<typeof createServer> | null = null;

function getApp() {
  if (!app) app = createServer();
  return app;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  const modifiedReq = Object.assign(req, {
    url: '/test/openai',
    originalUrl: req.url || '/api/test/openai',
  });
  getApp()(modifiedReq, res);
}
