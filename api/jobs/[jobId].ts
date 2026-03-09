/**
 * GET /api/jobs/:jobId - Check job status
 * Proxies to Express app (used when project root is repo root)
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
  let jobId = (req.query?.jobId as string) || '';
  if (!jobId && typeof req.url === 'string') {
    const match = req.url.match(/\/api\/jobs\/([^/?]+)/);
    jobId = match?.[1] ?? '';
  }
  const path = jobId ? `/api/jobs/${jobId}` : '/api/jobs';
  const query = (typeof req.url === 'string' && req.url.includes('?')) ? req.url.slice(req.url.indexOf('?')) : '';
  const originalUrl = path + query;
  const modifiedReq = Object.assign(req, {
    url: originalUrl,
    originalUrl: originalUrl,
  });
  getApp()(modifiedReq, res);
}
