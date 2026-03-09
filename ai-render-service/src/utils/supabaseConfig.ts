/**
 * Shared Supabase configuration resolver.
 * Allows per-request credentials (from Lovable or other clients)
 * with fallback to environment variables.
 */

export interface SupabaseConfig {
  url: string;
  key: string;
  bucket: string;
}

export interface SupabaseClientConfig {
  supabaseUrl?: string | undefined;
  supabaseKey?: string | undefined;
  supabaseBucket?: string | undefined;
}

/**
 * Resolves Supabase config from client-provided values or environment variables.
 * Returns null when neither source provides credentials.
 */
export function resolveSupabaseConfig(clientConfig?: SupabaseClientConfig): SupabaseConfig | null {
  const url = clientConfig?.supabaseUrl || process.env.SUPABASE_URL;
  const key = clientConfig?.supabaseKey || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = clientConfig?.supabaseBucket || process.env.SUPABASE_STORAGE_BUCKET || 'concepts';

  if (!url || !key) return null;
  return { url, key, bucket };
}

/**
 * Extracts SupabaseClientConfig from a request body object.
 * Accepts either a nested `supabase` object or flat fields.
 */
export function extractSupabaseConfig(body: Record<string, unknown>): SupabaseClientConfig | undefined {
  const sb = body.supabase as Record<string, unknown> | undefined;
  if (sb && typeof sb === 'object') {
    return {
      supabaseUrl: typeof sb.url === 'string' ? sb.url : undefined,
      supabaseKey: typeof sb.anonKey === 'string' ? sb.anonKey : undefined,
      supabaseBucket: typeof sb.bucket === 'string' ? sb.bucket : undefined,
    };
  }
  if (typeof body.supabaseUrl === 'string' || typeof body.supabaseKey === 'string') {
    return {
      supabaseUrl: typeof body.supabaseUrl === 'string' ? body.supabaseUrl : undefined,
      supabaseKey: typeof body.supabaseKey === 'string' ? body.supabaseKey : undefined,
      supabaseBucket: typeof body.supabaseBucket === 'string' ? body.supabaseBucket : undefined,
    };
  }
  return undefined;
}
