/**
 * Serves public/site-lookup-demo.js (production build from npm run build:demo).
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse): void {
  const cwd = process.cwd();
  const p = join(cwd, 'public', 'site-lookup-demo.js');
  if (!existsSync(p)) {
    res
      .status(404)
      .setHeader('Content-Type', 'text/plain; charset=utf-8')
      .send('Run vite build (build:demo) to generate site-lookup-demo.js.');
    return;
  }
  const body = readFileSync(p, 'utf8');
  res
    .status(200)
    .setHeader('Content-Type', 'application/javascript; charset=utf-8')
    .setHeader('Cache-Control', 'public, max-age=3600')
    .send(body);
}
