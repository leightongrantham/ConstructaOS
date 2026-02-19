/**
 * GET /api/debug-env - Debug environment (no sensitive values)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
    nodeVersion: process.version,
    vercelRuntime: process.env.VERCEL_RUNTIME ?? 'unknown',
    envKeys: Object.keys(process.env).filter(k =>
      k.includes('OPENAI') || k.includes('VERCEL')
    ),
  });
}
