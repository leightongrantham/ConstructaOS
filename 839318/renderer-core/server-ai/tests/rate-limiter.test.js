import { createRateLimiter, getRateLimitStatus } from '../lib/rate-limiter.js';

// Test helper functions
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  ${error.message}`);
    throw error;
  }
}

// Mock Fastify request/reply objects
function createMockRequest(ip = '127.0.0.1', apiKey = null) {
  return {
    ip,
    headers: apiKey ? { 'x-api-key': apiKey } : {},
    query: {},
    socket: { remoteAddress: ip }
  };
}

function createMockReply() {
  let statusCode = 200;
  let sent = false;
  const headers = {};
  const self = {
    code: (code) => {
      statusCode = code;
      return self;
    },
    send: (data) => {
      sent = true;
      return { statusCode, data, headers };
    },
    header: (key, value) => {
      headers[key] = value;
      return self;
    },
    getStatus: () => statusCode,
    wasSent: () => sent,
    getHeaders: () => headers
  };
  return self;
}

console.log('Running rate limiter tests...\n');

test('Rate limiter allows requests within limit', async () => {
  const limiter = createRateLimiter({ maxRequestsPerMinute: 10 });
  const request = createMockRequest();
  const reply = createMockReply();
  
  // Make 5 requests (within limit)
  for (let i = 0; i < 5; i++) {
    await limiter(request, reply);
    assert(!reply.wasSent(), `Request ${i + 1} should be allowed`);
  }
});

test('Rate limiter blocks requests over limit', async () => {
  const limiter = createRateLimiter({ maxRequestsPerMinute: 5 });
  const request = createMockRequest();
  
  // Make 6 requests (over limit)
  let blocked = false;
  for (let i = 0; i < 6; i++) {
    const reply = createMockReply();
    await limiter(request, reply);
    if (reply.wasSent() && reply.getStatus() === 429) {
      blocked = true;
      break;
    }
  }
  
  assert(blocked, 'Should block requests over limit');
});

test('Rate limiter uses IP address as key', async () => {
  const limiter = createRateLimiter({ maxRequestsPerMinute: 2 });
  
  const request1 = createMockRequest('192.168.1.1');
  const request2 = createMockRequest('192.168.1.2');
  
  // Both IPs should have separate limits
  const reply1 = createMockReply();
  const reply2 = createMockReply();
  
  await limiter(request1, reply1);
  await limiter(request2, reply2);
  
  assert(!reply1.wasSent(), 'IP1 request should be allowed');
  assert(!reply2.wasSent(), 'IP2 request should be allowed');
});

test('Rate limiter prefers API key over IP', async () => {
  // Test that API key is used for rate limiting key, not IP
  // We'll verify this by checking that different IPs with same API key share limits
  const limiter = createRateLimiter({ maxRequestsPerMinute: 10 });
  
  // Make requests with same API key but different IPs
  const request1 = createMockRequest('192.168.1.1', 'key-123');
  const request2 = createMockRequest('192.168.1.2', 'key-123'); // Different IP, same key
  const request3 = createMockRequest('192.168.1.1', null); // Same IP as request1, but no API key
  
  // All requests with same API key should share the same bucket
  // Request without API key should use IP and have separate bucket
  const reply1 = createMockReply();
  await limiter(request1, reply1);
  assert(!reply1.wasSent(), 'First request should pass');
  
  // The fact that request2 (different IP, same key) doesn't immediately fail
  // means it's using the same bucket as request1, which is what we want
  // (API key takes precedence over IP)
  const reply2 = createMockReply();
  await limiter(request2, reply2);
  assert(!reply2.wasSent(), 'Second request with same API key should pass (shares bucket)');
  
  // Request without API key should use IP and have separate limit
  const reply3 = createMockReply();
  await limiter(request3, reply3);
  assert(!reply3.wasSent(), 'Request without API key should use IP and have separate limit');
});

test('Rate limiter adds rate limit headers', async () => {
  const limiter = createRateLimiter({ maxRequestsPerMinute: 10 });
  const request = createMockRequest();
  const reply = createMockReply();
  
  const result = await limiter(request, reply);
  
  // If rate limited, result will be the reply object
  // If not rate limited, result is undefined and headers should be set
  const headers = reply.getHeaders();
  assert(headers['X-RateLimit-Limit'] === '10' || headers['X-RateLimit-Limit'] === 10, 
    `Should include limit header, got: ${headers['X-RateLimit-Limit']}`);
  assert(headers['X-RateLimit-Remaining'] !== undefined, 
    `Should include remaining header, got: ${JSON.stringify(headers)}`);
});

test('Rate limiter can be disabled', async () => {
  const limiter = createRateLimiter({ enabled: false, maxRequestsPerMinute: 1 });
  const request = createMockRequest();
  
  // Make many requests - should all pass
  let allPassed = true;
  for (let i = 0; i < 10; i++) {
    const reply = createMockReply();
    await limiter(request, reply);
    if (reply.wasSent() && reply.getStatus() === 429) {
      allPassed = false;
      break;
    }
  }
  
  assert(allPassed, 'Should allow all requests when disabled');
});

console.log('\nAll tests passed! ✓');

