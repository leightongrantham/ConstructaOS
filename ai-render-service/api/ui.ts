/**
 * Serves the static demo shell (public/index.html) on Vercel.
 * Rewrites route non-API paths here because the build output does not place index.html on the static CDN root.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const ALLOWED_ORIGINS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /\.vercel\.app$/,
  /lovableproject\.com$/,
  /lovable\.app$/,
  /lovable\.dev$/,
];

function setCors(req: VercelRequest, res: VercelResponse): void {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.some((re) => re.test(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function resolvePublicIndexPath(): string | null {
  const cwd = process.cwd();
  const candidates = [
    join(cwd, 'public', 'index.html'),
    join(cwd, '..', 'public', 'index.html'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

export default function handler(req: VercelRequest, res: VercelResponse): void {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const htmlPath = resolvePublicIndexPath();
  if (!htmlPath) {
    res.status(503).setHeader('Content-Type', 'text/plain; charset=utf-8').send('Demo UI: public/index.html not found in deployment bundle.');
    return;
  }

  const html = readFileSync(htmlPath, 'utf8');
  res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').setHeader('Cache-Control', 'public, max-age=60');
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  res.send(html);
}
