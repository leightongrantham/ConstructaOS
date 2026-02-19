/**
 * POST /api/jobs/:jobId/process - Process render job
 * Proxies to Express app
 */

import 'dotenv/config';
import { createServer } from '../../../src/server.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

let app: ReturnType<typeof createServer> | null = null;

function getApp() {
  if (!app) app = createServer();
  return app;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  const jobId = (req.query?.jobId as string) || '';
  const path = jobId ? `/api/jobs/${jobId}/process` : '/api/jobs/process';
  const query = (typeof req.url === 'string' && req.url.includes('?')) ? req.url.slice(req.url.indexOf('?')) : '';
  const originalUrl = path + query;
  const modifiedReq = Object.assign(req, {
    url: originalUrl,
    originalUrl: originalUrl,
  });
  getApp()(modifiedReq, res);
}
