/**
 * PropertyData valuation service – server-side only.
 * Fetches indicative sale valuation, caches in Redis (24h TTL), returns a
 * sanitized shape. All valuation output is indicative, not a formal valuation.
 */

const VALUATION_CACHE_TTL_SEC = 24 * 60 * 60; // 24 hours
const PROPERTYDATA_BASE = 'https://api.propertydata.co.uk';

/** Public shape for frontend – never expose raw API response. */
export interface IndicativeValuation {
  /** Indicative estimate in GBP; null if unavailable. */
  indicativeValueGbp: number | null;
  /** Low end of indicative range in GBP; null if not provided. */
  rangeLowGbp: number | null;
  /** High end of indicative range in GBP; null if not provided. */
  rangeHighGbp: number | null;
  /** Must be shown wherever valuation is displayed. */
  disclaimer: string;
}

const INDICATIVE_DISCLAIMER =
  'This is an indicative estimate only, not a formal valuation. Do not rely on it for legal, lending or purchase decisions.';

/** UK full postcode pattern (e.g. OX4 1YB, SW1A 1AA). */
const UK_POSTCODE_REGEX = /[A-Z]{1,2}[0-9][0-9A-Z]?\s*[0-9][A-Z]{2}/i;

/**
 * Extract a full UK postcode from address text (e.g. displayName or query).
 * Returns null if none found. Used to decide whether to call PropertyData (requires full postcode).
 */
export function extractUKPostcode(text: string | null | undefined): string | null {
  if (text == null || typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const match = trimmed.match(UK_POSTCODE_REGEX);
  if (!match) return null;
  const raw = match[0];
  if (!raw) return null;
  return raw.replace(/\s+/g, ' ').trim();
}

/** Inputs derived from site lookup baseline for the valuation-sale API. */
export interface ValuationInputs {
  postcode: string;
  propertyType: 'semi-detached_house' | 'terraced_house' | 'detached_house' | 'flat';
  constructionDate: '2000_onwards' | '1914_2000' | 'pre_1914';
  internalAreaSqFt: number;
  bedrooms: number;
  bathrooms: number;
  finishQuality: 'unmodernised' | 'below_average' | 'average' | 'high' | 'very_high';
  outdoorSpace: 'garden_very_large' | 'garden' | 'balcony_terrace' | 'none';
  offStreetParking: number;
}

type RedisClient = { get: (key: string) => Promise<string | null>; set: (key: string, value: string, options?: { ex: number }) => Promise<unknown> };

async function getRedisClient(): Promise<RedisClient | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token || url.trim() === '' || token.trim() === '') {
    return null;
  }
  try {
    const { Redis } = await import('@upstash/redis');
    return new Redis({ url, token }) as RedisClient;
  } catch {
    return null;
  }
}

function cacheKey(inputs: ValuationInputs): string {
  const str = JSON.stringify({
    p: inputs.postcode.replace(/\s/g, '').toUpperCase(),
    t: inputs.propertyType,
    c: inputs.constructionDate,
    a: inputs.internalAreaSqFt,
    b: inputs.bedrooms,
    ba: inputs.bathrooms,
    f: inputs.finishQuality,
    o: inputs.outdoorSpace,
    pk: inputs.offStreetParking,
  });
  return `pd:val:${Buffer.from(str, 'utf8').toString('base64url').slice(0, 120)}`;
}

function safeNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Parse PropertyData response into our public shape; never expose raw response. */
function parseValuationResponse(body: unknown): IndicativeValuation {
  const value = safeNumber(
    (body as { result?: { value?: unknown } })?.result?.value ??
    (body as { value?: unknown })?.value
  );
  const rangeLow = safeNumber(
    (body as { result?: { range_low?: unknown } })?.result?.range_low ??
    (body as { result?: { rangeLow?: unknown } })?.result?.rangeLow ??
    (body as { range_low?: unknown })?.range_low
  );
  const rangeHigh = safeNumber(
    (body as { result?: { range_high?: unknown } })?.result?.range_high ??
    (body as { result?: { rangeHigh?: unknown } })?.result?.rangeHigh ??
    (body as { range_high?: unknown })?.range_high
  );

  return {
    indicativeValueGbp: value,
    rangeLowGbp: rangeLow ?? null,
    rangeHighGbp: rangeHigh ?? null,
    disclaimer: INDICATIVE_DISCLAIMER,
  };
}

/** Minimal baseline fields needed to build valuation inputs. */
export interface BaselineForValuation {
  footprintAreaM2: number;
  buildingForm: string;
  storeys: string;
}

/**
 * Build ValuationInputs from postcode and site baseline. Returns null if inputs are invalid.
 */
export function buildValuationInputs(
  postcode: string | null,
  baseline: BaselineForValuation | null | undefined
): ValuationInputs | null {
  if (!postcode || postcode.trim() === '') return null;
  const base = baseline;
  if (!base || base.footprintAreaM2 == null) return null;

  const form = (base.buildingForm ?? '').toLowerCase();
  let propertyType: ValuationInputs['propertyType'] = 'semi-detached_house';
  if (form.includes('detached') && !form.includes('semi')) propertyType = 'detached_house';
  else if (form.includes('semi')) propertyType = 'semi-detached_house';
  else if (form.includes('terrac') || form.includes('infill')) propertyType = 'terraced_house';
  else if (form.includes('flat')) propertyType = 'flat';

  const storeys = (base.storeys ?? '').toString();
  const storeyFactor = storeys === '1' ? 1 : storeys === '2' ? 2 : storeys === '3+' ? 2.5 : 1.5;
  const areaM2 = Number(base.footprintAreaM2);
  const internalAreaSqFt = Math.max(300, Math.round((Number.isFinite(areaM2) ? areaM2 : 0) * 10.764 * storeyFactor));

  const bedrooms = storeys === '1' ? 1 : storeys === '2' ? 2 : storeys === '3+' ? 3 : 2;

  return {
    postcode: postcode.replace(/\s/g, ' ').trim(),
    propertyType,
    constructionDate: '1914_2000',
    internalAreaSqFt,
    bedrooms: Math.min(5, Math.max(0, bedrooms)),
    bathrooms: 1,
    finishQuality: 'average',
    outdoorSpace: 'garden',
    offStreetParking: 0,
  };
}

/**
 * Fetch indicative sale valuation from PropertyData (or cache).
 * Returns a sanitized shape only. API key must be set server-side.
 */
export async function getIndicativeValuation(
  apiKey: string | undefined,
  inputs: ValuationInputs
): Promise<IndicativeValuation | null> {
  const key = apiKey?.trim();
  if (!key) return null;

  const area = inputs?.internalAreaSqFt;
  if (area == null || area < 300) return null;

  const redis = await getRedisClient();
  const ck = cacheKey(inputs);

  if (redis != null) {
    try {
      const cached = await redis.get(ck);
      if (cached != null && typeof cached === 'string') {
        const parsed = JSON.parse(cached) as unknown;
        if (parsed && typeof parsed === 'object' && 'disclaimer' in parsed) {
          return parsed as IndicativeValuation;
        }
      }
    } catch {
      // ignore cache read errors; proceed to API
    }
  }

  const params = new URLSearchParams({
    key,
    postcode: inputs.postcode.replace(/\s/g, '').toUpperCase(),
    property_type: inputs.propertyType,
    construction_date: inputs.constructionDate,
    internal_area: String(Math.round(area)),
    bedrooms: String(Math.min(5, Math.max(0, inputs.bedrooms ?? 2))),
    bathrooms: String(Math.min(5, Math.max(0, inputs.bathrooms ?? 1))),
    finish_quality: inputs.finishQuality ?? 'average',
    outdoor_space: inputs.outdoorSpace ?? 'garden',
    off_street_parking: String(Math.min(3, Math.max(0, inputs.offStreetParking ?? 0))),
  });

  let res: Response;
  try {
    res = await fetch(`${PROPERTYDATA_BASE}/valuation-sale?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
  } catch (err) {
    console.error('PropertyData valuation request failed:', err);
    return null;
  }

  let body: unknown;
  try {
    const text = await res.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    return null;
  }

  if (!res.ok) {
    const code = (body as { code?: string })?.code ?? (body as { error?: string })?.error;
    if (code !== undefined) console.warn('PropertyData valuation error:', res.status, code);
    return null;
  }

  const result = parseValuationResponse(body);
  if (result.indicativeValueGbp == null && result.rangeLowGbp == null && result.rangeHighGbp == null) {
    return null;
  }

  if (redis) {
    try {
      await redis.set(ck, JSON.stringify(result), { ex: VALUATION_CACHE_TTL_SEC });
    } catch {
      // ignore cache write errors
    }
  }

  return result;
}
