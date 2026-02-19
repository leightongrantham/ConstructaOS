/**
 * POST /api/site-lookup - Lightweight handler that avoids loading full Express/canvas.
 * Proxies to ai-render-service site-lookup handler.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  try {
    const { default: siteLookupHandler } = await import(
      '../ai-render-service/api/site-lookup'
    );
    return siteLookupHandler(req, res);
  } catch (error) {
    console.error('Site-lookup proxy error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Failed to load site-lookup handler',
      });
    }
  }
}
