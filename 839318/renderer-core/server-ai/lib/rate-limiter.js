/**
 * Rate limiter using token bucket algorithm
 */

/**
 * Token bucket implementation
 */
class TokenBucket {
  constructor(capacity, refillRate) {
    this.capacity = capacity; // Maximum tokens
    this.tokens = capacity; // Current tokens
    this.refillRate = refillRate; // Tokens per second
    this.lastRefill = Date.now();
  }

  /**
   * Try to consume a token
   * @returns {boolean} True if token was consumed, false if rate limited
   */
  consume() {
    this.refill();
    
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    
    return false;
  }

  /**
   * Refill tokens based on elapsed time
   */
  refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // Convert to seconds
    const tokensToAdd = elapsed * this.refillRate;
    
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Get time until next token is available (in milliseconds)
   * @returns {number} Milliseconds until next token
   */
  getTimeUntilNextToken() {
    this.refill();
    
    if (this.tokens >= 1) {
      return 0;
    }
    
    const tokensNeeded = 1 - this.tokens;
    return Math.ceil((tokensNeeded / this.refillRate) * 1000);
  }
}

// In-memory storage for buckets (keyed by identifier)
const buckets = new Map();

// Configuration
const MAX_REQUESTS_PER_MINUTE = parseInt(process.env.RATE_LIMIT_RPM || '10', 10);
const RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED !== 'false'; // Default enabled

// Cleanup old buckets periodically (every 5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;
const BUCKET_TTL = 10 * 60 * 1000; // Keep buckets for 10 minutes of inactivity

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    // Remove buckets that haven't been used in a while
    // (This is a simple cleanup - in production, you'd want more sophisticated tracking)
    if (now - bucket.lastRefill > BUCKET_TTL) {
      buckets.delete(key);
    }
  }
}, CLEANUP_INTERVAL);

/**
 * Get identifier for rate limiting (IP or API key)
 * @param {Object} request - Fastify request object
 * @returns {string} Identifier
 */
function getRateLimitKey(request) {
  // Prefer API key if available
  const apiKey = request.headers['x-api-key'] || request.query?.apiKey;
  if (apiKey) {
    return `api-key:${apiKey}`;
  }
  
  // Fall back to IP address
  const ip = request.ip || request.headers['x-forwarded-for'] || request.socket?.remoteAddress || 'unknown';
  return `ip:${ip}`;
}

/**
 * Get or create token bucket for a key
 * @param {string} key - Rate limit key
 * @returns {TokenBucket} Token bucket
 */
function getBucket(key) {
  if (!buckets.has(key)) {
    // Create bucket: capacity = max requests, refill rate = requests per second
    const refillRate = MAX_REQUESTS_PER_MINUTE / 60; // Convert to per second
    buckets.set(key, new TokenBucket(MAX_REQUESTS_PER_MINUTE, refillRate));
  }
  return buckets.get(key);
}

/**
 * Rate limiter middleware factory
 * @param {Object} options - Options
 * @param {number} options.maxRequestsPerMinute - Maximum requests per minute (default: 10)
 * @returns {Function} Fastify middleware function
 */
export function createRateLimiter(options = {}) {
  const maxRPM = options.maxRequestsPerMinute || MAX_REQUESTS_PER_MINUTE;
  const enabled = options.enabled !== false && RATE_LIMIT_ENABLED;

  return async (request, reply) => {
    if (!enabled) {
      return; // Rate limiting disabled
    }

    const key = getRateLimitKey(request);
    const bucket = getBucket(key);

    // Add rate limit headers (always add, even if rate limited)
    reply.header('X-RateLimit-Limit', maxRPM);
    
    if (!bucket.consume()) {
      const retryAfter = Math.ceil(bucket.getTimeUntilNextToken() / 1000);
      
      reply.header('X-RateLimit-Remaining', 0);
      reply.header('Retry-After', retryAfter);
      reply.code(429).send({
        error: 'Rate limit exceeded',
        message: `Maximum ${maxRPM} requests per minute allowed`,
        retryAfter: retryAfter
      });
      
      return reply; // Stop request processing
    }

    // Add remaining tokens header
    reply.header('X-RateLimit-Remaining', Math.floor(bucket.tokens));
    
    // Continue with request
  };
}

/**
 * Get rate limit status for a key (for debugging)
 * @param {string} key - Rate limit key
 * @returns {Object} Status information
 */
export function getRateLimitStatus(key) {
  const bucket = buckets.get(key);
  if (!bucket) {
    return { exists: false };
  }
  
  return {
    exists: true,
    tokens: bucket.tokens,
    capacity: bucket.capacity,
    refillRate: bucket.refillRate,
    timeUntilNextToken: bucket.getTimeUntilNextToken()
  };
}

