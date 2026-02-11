/**
 * API client for site lookup - calls POST /api/site-lookup
 */

import type { SiteLookupResponse } from './types';

export async function fetchSiteLookup(
  apiBaseUrl: string,
  query: string
): Promise<SiteLookupResponse> {
  const url = `${apiBaseUrl.replace(/\/$/, '')}/api/site-lookup`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Site lookup failed: ${res.status}`);
  }

  return res.json() as Promise<SiteLookupResponse>;
}
