import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import Ajv from 'ajv';
import * as Sentry from '@sentry/node';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { callLLM } from './lib/llm.js';
import { recordMetric, getAggregatedMetrics } from './lib/telemetry.js';
import { createRateLimiter } from './lib/rate-limiter.js';

// Load environment variables
dotenv.config();

// Initialize Sentry (if DSN is provided)
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE 
      ? parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE) 
      : 0.1, // 10% of transactions
    beforeSend(event, hint) {
      // Filter out sensitive data
      if (event.request) {
        delete event.request.cookies;
        if (event.request.headers) {
          delete event.request.headers['x-api-key'];
          delete event.request.headers['authorization'];
        }
      }
      return event;
    }
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check if LLM should be used
const USE_LLM = process.env.USE_LLM === 'true';

// API key authentication (optional)
const API_KEYS = process.env.API_KEYS 
  ? process.env.API_KEYS.split(',').map(k => k.trim()).filter(Boolean)
  : [];
const API_KEY_REQUIRED = process.env.API_KEY_REQUIRED === 'true';

// Request logging configuration
const REQUEST_LOG_ENABLED = process.env.REQUEST_LOG_ENABLED === 'true';
const REQUEST_LOG_DIR = process.env.REQUEST_LOG_DIR || '/tmp/ai-requests';

// Create request log directory if enabled
if (REQUEST_LOG_ENABLED && !existsSync(REQUEST_LOG_DIR)) {
  mkdirSync(REQUEST_LOG_DIR, { recursive: true });
}

// Load JSON schemas
const schemaFile = readFileSync(join(__dirname, 'schemas', 'topology.schema.json'), 'utf-8');
const schemas = JSON.parse(schemaFile);

// Load response schema for LLM output validation
const responseSchemaFile = readFileSync(join(__dirname, 'prompts', 'topology.response.schema.json'), 'utf-8');
const responseSchema = JSON.parse(responseSchemaFile);

const ajv = new Ajv({ allErrors: true });

// Merge definitions into input and output schemas for compilation
const inputSchemaWithDefs = {
  ...schemas.inputSchema,
  definitions: schemas.definitions
};
const outputSchemaWithDefs = {
  ...schemas.outputSchema,
  definitions: schemas.definitions
};

// Compile validators
const validateRequest = ajv.compile(inputSchemaWithDefs);
const validateOutput = ajv.compile(outputSchemaWithDefs);
const validateLLMResponse = ajv.compile(responseSchema);

// Load prompts
const systemPrompt = readFileSync(join(__dirname, 'prompts', 'topology.system.txt'), 'utf-8');
const userTemplate = readFileSync(join(__dirname, 'prompts', 'topology.user.template.txt'), 'utf-8');

/**
 * Calculate polygon area using shoelace formula
 * @param {Array<[number, number]>} polygon - Array of [x, y] points
 * @returns {number} Area in square units
 */
function calculatePolygonArea(polygon) {
  if (polygon.length < 3) return 0;
  
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area += polygon[i][0] * polygon[j][1];
    area -= polygon[j][0] * polygon[i][1];
  }
  return Math.abs(area) / 2;
}

/**
 * Parse JSON from LLM response, handling markdown code blocks if present
 * @param {string} text - Raw text response from LLM
 * @returns {Object|null} Parsed JSON object or null if parsing fails
 */
function parseLLMResponse(text) {
  // Try to parse as-is first
  try {
    return JSON.parse(text.trim());
  } catch (e) {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch (e2) {
        // Fall through to return null
      }
    }
    return null;
  }
}

/**
 * Create repair prompt for invalid JSON response
 * @param {string} originalResponse - The invalid response from LLM
 * @param {Array} validationErrors - Validation errors from schema
 * @returns {string} Repair prompt
 */
function createRepairPrompt(originalResponse, validationErrors) {
  return `Your previous response was invalid JSON or did not match the required schema.

Your response was:
${originalResponse.substring(0, 500)}${originalResponse.length > 500 ? '...' : ''}

Validation errors:
${validationErrors.map(e => `- ${e.path}: ${e.message}`).join('\n')}

Please output ONLY valid JSON matching the schema. Do not include any markdown, code blocks, or explanatory text.`;
}

/**
 * Call LLM to clean topology with retry logic
 * @param {Array<{points: Array<[number, number]>, closed: boolean}>} polylines - Array of polylines to clean
 * @param {Object} metadata - Metadata with imageSize and optional pxToMeters
 * @param {Object} logContext - Fastify logger context
 * @returns {Promise<{result: Object, usedLLM: boolean, model?: string, tokens?: Object, latency?: number}>}
 */
async function cleanTopologyWithLLM(polylines, metadata, logContext) {
  const llmStartTime = Date.now();
  
  // Build user prompt
  const polylinesJson = JSON.stringify(polylines, null, 2);
  const metadataJson = JSON.stringify(metadata, null, 2);
  const userPrompt = userTemplate
    .replace('{{POLYLINES_JSON}}', polylinesJson)
    .replace('{{METADATA_JSON}}', metadataJson);

  // Prepare messages for LLM
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  const model = process.env.LLM_MODEL || 'gpt-4o-mini';

  try {
    // First attempt
    logContext.info('Calling LLM for topology cleaning', { model });
    const llmResponse = await callLLM(messages, { model });
    const responseText = llmResponse.content;
    const usage = llmResponse.usage;
    const llmLatency = Date.now() - llmStartTime;

    // Parse JSON response
    let parsed = parseLLMResponse(responseText);
    
    if (!parsed) {
      logContext.warn('Failed to parse LLM response as JSON, attempting repair');
      
      // Retry with repair prompt
      const repairPrompt = createRepairPrompt(
        responseText,
        [{ path: 'root', message: 'Invalid JSON format' }]
      );
      
      const repairMessages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: responseText },
        { role: 'user', content: repairPrompt }
      ];
      
      const repairResponse = await callLLM(repairMessages, { model });
      parsed = parseLLMResponse(repairResponse.content);
      
      if (!parsed) {
        throw new Error('Failed to parse LLM response after repair attempt');
      }
      
      // Update usage with repair attempt tokens
      if (repairResponse.usage) {
        usage.total_tokens = (usage?.total_tokens || 0) + (repairResponse.usage.total_tokens || 0);
        usage.prompt_tokens = (usage?.prompt_tokens || 0) + (repairResponse.usage.prompt_tokens || 0);
        usage.completion_tokens = (usage?.completion_tokens || 0) + (repairResponse.usage.completion_tokens || 0);
      }
    }

    // Validate against schema
    const isValid = validateLLMResponse(parsed);
    
    if (!isValid) {
      const errors = validateLLMResponse.errors.map(err => ({
        path: err.instancePath || err.schemaPath,
        message: err.message,
        params: err.params
      }));
      
      logContext.warn('LLM response failed schema validation, attempting repair', { errors });
      
      // Retry with repair prompt including validation errors
      const repairPrompt = createRepairPrompt(responseText, errors);
      const repairMessages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: responseText },
        { role: 'user', content: repairPrompt }
      ];
      
      const repairResponse = await callLLM(repairMessages, { model });
      const repairParsed = parseLLMResponse(repairResponse.content);
      
      if (repairParsed && validateLLMResponse(repairParsed)) {
        logContext.info('LLM repair attempt succeeded');
        
        // Update usage with repair attempt tokens
        if (repairResponse.usage) {
          usage.total_tokens = (usage?.total_tokens || 0) + (repairResponse.usage.total_tokens || 0);
          usage.prompt_tokens = (usage?.prompt_tokens || 0) + (repairResponse.usage.prompt_tokens || 0);
          usage.completion_tokens = (usage?.completion_tokens || 0) + (repairResponse.usage.completion_tokens || 0);
        }
        
        return {
          result: repairParsed,
          usedLLM: true,
          model,
          latency: Date.now() - llmStartTime,
          tokens: usage
        };
      } else {
        throw new Error('LLM response failed schema validation after repair attempt');
      }
    }

    // Success!
    logContext.info('LLM topology cleaning succeeded', {
      model,
      latency: `${llmLatency}ms`,
      tokens: usage,
      wallCount: parsed.walls?.length || 0,
      roomCount: parsed.rooms?.length || 0,
      openingCount: parsed.openings?.length || 0
    });

    return {
      result: parsed,
      usedLLM: true,
      model,
      latency: llmLatency,
      tokens: usage
    };

  } catch (error) {
    const llmLatency = Date.now() - llmStartTime;
    logContext.error('LLM topology cleaning failed, falling back to heuristic', {
      error: error.message,
      model,
      latency: `${llmLatency}ms`
    });
    
    // Capture error in Sentry
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(error, {
        tags: {
          component: 'llm-topology-cleaning',
          model,
          fallback: true
        },
        extra: {
          model,
          latency: llmLatency,
          polylineCount: polylines.length
        }
      });
    }
    
    // Fall back to mockClean
    return {
      result: mockClean(polylines, metadata),
      usedLLM: false,
      fallbackReason: error.message
    };
  }
}

/**
 * Mock AI cleaning function - returns deterministic mock response
 * @param {Array<{points: Array<[number, number]>, closed: boolean}>} polylines - Array of polylines to clean
 * @param {Object} metadata - Metadata with imageSize and optional pxToMeters
 * @returns {Object} Valid geometry JSON with walls, rooms, openings, meta
 */
function mockClean(polylines, metadata = {}) {
  // Extract points from all polylines
  const allPoints = polylines.flatMap(p => p.points || []);
  
  if (allPoints.length === 0) {
    const scale = metadata.pxToMeters || 0.01; // Default 1px = 0.01m
    return {
      walls: [],
      rooms: [],
      openings: [],
      meta: {
        scale,
        bounds: {
          minX: 0,
          maxX: 0,
          minY: 0,
          maxY: 0
        }
      }
    };
  }

  // Find bounding box
  const xs = allPoints.map(p => p[0]);
  const ys = allPoints.map(p => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  // Calculate scale (pixels to meters)
  const scale = metadata.pxToMeters || 0.01; // Default 1px = 0.01m

  // Create mock walls from bounding box
  const wallThickness = 0.2;
  const walls = [
    {
      id: 'wall-1',
      start: [minX, minY],
      end: [maxX, minY],
      thickness: wallThickness,
      type: 'exterior'
    },
    {
      id: 'wall-2',
      start: [maxX, minY],
      end: [maxX, maxY],
      thickness: wallThickness,
      type: 'exterior'
    },
    {
      id: 'wall-3',
      start: [maxX, maxY],
      end: [minX, maxY],
      thickness: wallThickness,
      type: 'exterior'
    },
    {
      id: 'wall-4',
      start: [minX, maxY],
      end: [minX, minY],
      thickness: wallThickness,
      type: 'exterior'
    }
  ];

  // Create mock room from bounding box
  const roomPolygon = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY]
  ];
  const roomArea = calculatePolygonArea(roomPolygon) * (scale * scale); // Convert to m²
  
  const rooms = [
    {
      id: 'room-1',
      polygon: roomPolygon,
      area_m2: roomArea
    }
  ];

  // Create mock opening (door) in the middle of first wall
  const openings = [
    {
      id: 'opening-1',
      wallId: 'wall-1',
      type: 'door',
      position: 0.5 // Middle of the wall
    }
  ];

  return {
    walls,
    rooms,
    openings,
    meta: {
      scale,
      bounds: {
        minX,
        maxX,
        minY,
        maxY
      }
    }
  };
}

// Create Fastify instance
const fastify = Fastify({
  logger: true
});

// Add global error handler with Sentry
fastify.setErrorHandler((error, request, reply) => {
  // Log error
  fastify.log.error(error);
  
  // Capture in Sentry
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(error, {
      tags: {
        component: 'fastify-error-handler',
        method: request.method,
        path: request.url
      },
      extra: {
        url: request.url,
        method: request.method,
        headers: request.headers
      }
    });
  }
  
  // Send error response
  reply.status(error.statusCode || 500).send({
    error: error.message || 'Internal Server Error',
    statusCode: error.statusCode || 500
  });
});

// Register CORS plugin
fastify.register(cors, {
  origin: process.env.CORS_ORIGIN || true, // Allow all origins by default, or set specific origin
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Use-LLM', 'X-Prefer-Deterministic', 'X-API-Key'],
  credentials: true
});

/**
 * API key authentication middleware (optional)
 * Checks X-API-Key header or apiKey query parameter
 */
async function authenticateAPIKey(request, reply) {
  // Skip if no API keys configured
  if (API_KEYS.length === 0 && !API_KEY_REQUIRED) {
    return; // No authentication required
  }

  const apiKey = request.headers['x-api-key'] || request.query?.apiKey;

  if (!apiKey) {
    if (API_KEY_REQUIRED) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'API key required. Provide X-API-Key header or apiKey query parameter.'
      });
    }
    return; // Optional auth, allow request
  }

  // Check if API key is valid
  if (!API_KEYS.includes(apiKey)) {
    return reply.code(403).send({
      error: 'Forbidden',
      message: 'Invalid API key'
    });
  }

  // Valid API key, continue
}

// Health check endpoint with telemetry summary
fastify.get('/health', async (request, reply) => {
  const metrics = getAggregatedMetrics({ windowMs: 5 * 60 * 1000 }); // Last 5 minutes
  
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    llm: {
      enabled: USE_LLM,
      apiKeySet: !!process.env.OPENAI_API_KEY,
      model: process.env.LLM_MODEL || 'gpt-4o-mini'
    },
    telemetry: {
      requestsLast5Min: metrics.totalRequests,
      successRate: metrics.successRate,
      avgLatency: metrics.avgLatency
    },
    uptime: process.uptime()
  };
});

// Metrics endpoint
fastify.get('/metrics', async (request, reply) => {
  const windowMs = request.query?.window 
    ? parseInt(request.query.window, 10) * 1000 // Convert seconds to ms
    : null;
  
  const metrics = getAggregatedMetrics({ windowMs });
  
  return {
    ...metrics,
    timestamp: new Date().toISOString()
  };
});

// AI topology cleaning endpoint with rate limiting and optional API key auth
fastify.post('/api/topology/ai-clean', {
  preHandler: [
    authenticateAPIKey,
    createRateLimiter({ maxRequestsPerMinute: 10 })
  ]
}, async (request, reply) => {
  const startTime = Date.now();
  const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const inputSize = JSON.stringify(request.body).length;
  
  // Get client identifier for telemetry
  const ip = request.ip || request.headers['x-forwarded-for'] || request.socket?.remoteAddress || 'unknown';
  const apiKey = request.headers['x-api-key'] || request.query?.apiKey || null;
  
  // Log request start
  fastify.log.info('AI clean request received', {
    timestamp: new Date().toISOString(),
    bodySize: JSON.stringify(request.body).length
  });

  // Validate input
  const valid = validateRequest(request.body);
  if (!valid) {
    const errors = validateRequest.errors.map(err => ({
      path: err.instancePath || err.schemaPath,
      message: err.message,
      params: err.params
    }));
    
    fastify.log.warn('Invalid request', { errors });
    
    // Record failed request
    recordMetric({
      requestId,
      latency: Date.now() - startTime,
      success: false,
      inputSize,
      ip,
      apiKey
    });
    
    return reply.code(400).send({
      error: 'Invalid input',
      details: errors
    });
  }

  const { polylines, metadata = {} } = request.body;

  // Check client headers for LLM preference
  const clientUseLLM = request.headers['x-use-llm'];
  const preferDeterministic = request.headers['x-prefer-deterministic'] === 'true';
  
  // Determine if LLM should be used:
  // 1. Client can override with X-Use-LLM header (if set to 'false', force heuristic)
  // 2. If X-Prefer-Deterministic is true, use heuristic
  // 3. Otherwise, use server's USE_LLM setting
  let shouldUseLLM = USE_LLM && process.env.OPENAI_API_KEY;
  
  if (clientUseLLM !== undefined) {
    shouldUseLLM = clientUseLLM === 'true' && process.env.OPENAI_API_KEY;
    fastify.log.info('Client requested LLM override', { 
      requested: clientUseLLM === 'true',
      available: !!process.env.OPENAI_API_KEY,
      willUse: shouldUseLLM 
    });
  }
  
  if (preferDeterministic) {
    shouldUseLLM = false;
    fastify.log.info('Client requested deterministic mode, using heuristic');
  }

  let result;
  let llmInfo = {};

  // Use LLM if enabled and API key is available
  if (shouldUseLLM) {
    const llmResult = await cleanTopologyWithLLM(polylines, metadata, fastify.log);
    result = llmResult.result;
    llmInfo = {
      usedLLM: llmResult.usedLLM,
      model: llmResult.model,
      latency: llmResult.latency,
      tokens: llmResult.tokens,
      fallbackReason: llmResult.fallbackReason
    };
  } else {
    // Use mock/heuristic cleaning
    if (!USE_LLM) {
      fastify.log.info('LLM disabled via USE_LLM=false, using heuristic');
    } else if (!process.env.OPENAI_API_KEY) {
      fastify.log.info('OPENAI_API_KEY not set, using heuristic fallback');
    } else if (preferDeterministic) {
      fastify.log.info('Using deterministic heuristic as requested');
    } else if (clientUseLLM === 'false') {
      fastify.log.info('Client requested heuristic mode');
    }
    result = mockClean(polylines, metadata);
    llmInfo = { usedLLM: false };
  }

  // Validate output before returning
  const outputValid = validateOutput(result);
  if (!outputValid) {
    const errors = validateOutput.errors.map(err => ({
      path: err.instancePath || err.schemaPath,
      message: err.message,
      params: err.params
    }));
    
    fastify.log.error('Invalid output generated', { errors, llmInfo });
    
    // Capture error in Sentry
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(new Error('Invalid output generated'), {
        tags: {
          component: 'output-validation',
          usedLLM: llmInfo.usedLLM
        },
        extra: {
          errors,
          llmInfo,
          requestId
        }
      });
    }
    
    // Record failed request
    recordMetric({
      requestId,
      model: llmInfo.model,
      latency: Date.now() - startTime,
      tokens_in: llmInfo.tokens?.prompt_tokens || null,
      tokens_out: llmInfo.tokens?.completion_tokens || null,
      success: false,
      inputSize,
      ip,
      apiKey
    });
    
    return reply.code(500).send({
      error: 'Internal server error: invalid output format',
      details: errors
    });
  }

  const endTime = Date.now();
  const duration = endTime - startTime;

  // Record successful request
  recordMetric({
    requestId,
    model: llmInfo.model,
    latency: duration,
    tokens_in: llmInfo.tokens?.prompt_tokens || null,
    tokens_out: llmInfo.tokens?.completion_tokens || null,
    success: true,
    inputSize,
    ip,
    apiKey
  });

  // Log request for replay (if enabled)
  if (REQUEST_LOG_ENABLED) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const logDir = join(REQUEST_LOG_DIR, today);
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
      }
      
      const logFile = join(logDir, `request-${requestId}.json`);
      const logEntry = {
        requestId,
        timestamp: new Date().toISOString(),
        method: 'POST',
        path: '/api/topology/ai-clean',
        body: request.body,
        response: {
          statusCode: 200,
          body: result
        },
        latency: duration,
        tokens: llmInfo.tokens || null,
        llmInfo: {
          usedLLM: llmInfo.usedLLM,
          model: llmInfo.model,
          fallbackReason: llmInfo.fallbackReason
        }
      };
      
      writeFileSync(logFile, JSON.stringify(logEntry, null, 2));
    } catch (error) {
      fastify.log.warn('Failed to write request log', { error: error.message });
    }
  }

  // Log request completion
  fastify.log.info('AI clean request completed', {
    requestId,
    duration: `${duration}ms`,
    wallCount: result.walls.length,
    roomCount: result.rooms.length,
    openingCount: result.openings.length,
    ...llmInfo
  });

  return reply.send(result);
});

// Start server
const start = async () => {
  try {
    const port = process.env.PORT || 3001;
    const host = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port, host });
    fastify.log.info(`Server listening on http://${host}:${port}`);
    fastify.log.info(`Health check: http://${host}:${port}/health`);
    fastify.log.info(`AI clean endpoint: http://${host}:${port}/api/topology/ai-clean`);
    fastify.log.info(`LLM mode: ${USE_LLM ? 'ENABLED' : 'DISABLED'} (set USE_LLM=true to enable)`);
    if (USE_LLM) {
      fastify.log.info(`LLM model: ${process.env.LLM_MODEL || 'gpt-4o-mini'}`);
      fastify.log.info(`OpenAI API key: ${process.env.OPENAI_API_KEY ? 'SET' : 'NOT SET'}`);
    }
  } catch (err) {
    fastify.log.error(err);
    
    // Capture startup error in Sentry
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(err, {
        tags: {
          component: 'server-startup'
        }
      });
    }
    
    process.exit(1);
  }
};

start();

