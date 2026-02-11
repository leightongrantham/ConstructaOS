/**
 * Telemetry module for recording per-request metrics
 */

import { writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';

/**
 * Simple ring buffer implementation
 */
class RingBuffer {
  constructor(size) {
    this.size = size;
    this.buffer = [];
    this.index = 0;
  }

  push(item) {
    if (this.buffer.length < this.size) {
      this.buffer.push(item);
    } else {
      this.buffer[this.index] = item;
      this.index = (this.index + 1) % this.size;
    }
  }

  getAll() {
    if (this.buffer.length < this.size) {
      return this.buffer;
    }
    // Return items in chronological order
    return [
      ...this.buffer.slice(this.index),
      ...this.buffer.slice(0, this.index)
    ];
  }

  getCount() {
    return this.buffer.length;
  }
}

// Global ring buffer for metrics (last 1000 entries)
const metricsBuffer = new RingBuffer(1000);

// Configuration
const DUMP_TO_FILE = process.env.TELEMETRY_DUMP_FILE === 'true';
const DUMP_FILE_PATH = process.env.TELEMETRY_FILE_PATH || '/tmp/ai-telemetry.log';

/**
 * Generate a unique request ID
 * @returns {string} Request ID
 */
function generateRequestId() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Record a metric entry
 * @param {Object} metric - Metric data
 * @param {string} metric.requestId - Request ID
 * @param {string} metric.model - Model used (optional)
 * @param {number} metric.latency - Latency in milliseconds
 * @param {number} metric.tokens_in - Input tokens (optional)
 * @param {number} metric.tokens_out - Output tokens (optional)
 * @param {boolean} metric.success - Whether request succeeded
 * @param {number} metric.inputSize - Input size in bytes
 * @param {string} metric.ip - Client IP address (optional)
 * @param {string} metric.apiKey - API key identifier (optional)
 */
export function recordMetric(metric) {
  const entry = {
    requestId: metric.requestId || generateRequestId(),
    timestamp: new Date().toISOString(),
    model: metric.model || null,
    latency: metric.latency || 0,
    tokens_in: metric.tokens_in || null,
    tokens_out: metric.tokens_out || null,
    success: metric.success !== undefined ? metric.success : true,
    inputSize: metric.inputSize || 0,
    ip: metric.ip || null,
    apiKey: metric.apiKey ? metric.apiKey.substring(0, 8) + '...' : null // Truncate for privacy
  };

  // Add to ring buffer
  metricsBuffer.push(entry);

  // Optionally dump to file
  if (DUMP_TO_FILE) {
    try {
      const logLine = JSON.stringify(entry) + '\n';
      appendFileSync(DUMP_FILE_PATH, logLine, { flag: 'a' });
    } catch (error) {
      console.error('[Telemetry] Failed to write to file:', error.message);
    }
  }
}

/**
 * Get aggregated metrics
 * @param {Object} options - Options
 * @param {number} options.windowMs - Time window in milliseconds (default: all time)
 * @returns {Object} Aggregated metrics
 */
export function getAggregatedMetrics(options = {}) {
  const { windowMs } = options;
  const now = Date.now();
  
  let entries = metricsBuffer.getAll();
  
  // Filter by time window if specified
  if (windowMs) {
    const cutoff = now - windowMs;
    entries = entries.filter(entry => {
      const entryTime = new Date(entry.timestamp).getTime();
      return entryTime >= cutoff;
    });
  }

  if (entries.length === 0) {
    return {
      totalRequests: 0,
      successRate: 0,
      avgLatency: 0,
      totalTokensIn: 0,
      totalTokensOut: 0,
      requestsByModel: {},
      errors: 0
    };
  }

  const successful = entries.filter(e => e.success);
  const failed = entries.filter(e => !e.success);
  
  const totalLatency = entries.reduce((sum, e) => sum + (e.latency || 0), 0);
  const totalTokensIn = entries.reduce((sum, e) => sum + (e.tokens_in || 0), 0);
  const totalTokensOut = entries.reduce((sum, e) => sum + (e.tokens_out || 0), 0);

  // Group by model
  const requestsByModel = {};
  entries.forEach(entry => {
    const model = entry.model || 'unknown';
    if (!requestsByModel[model]) {
      requestsByModel[model] = {
        count: 0,
        avgLatency: 0,
        totalLatency: 0
      };
    }
    requestsByModel[model].count++;
    requestsByModel[model].totalLatency += entry.latency || 0;
  });

  // Calculate average latency per model
  Object.keys(requestsByModel).forEach(model => {
    const stats = requestsByModel[model];
    stats.avgLatency = stats.totalLatency / stats.count;
    delete stats.totalLatency; // Remove intermediate value
  });

  return {
    totalRequests: entries.length,
    successRate: entries.length > 0 ? successful.length / entries.length : 0,
    avgLatency: entries.length > 0 ? totalLatency / entries.length : 0,
    totalTokensIn,
    totalTokensOut,
    requestsByModel,
    errors: failed.length,
    windowMs: windowMs || null
  };
}

/**
 * Get recent metrics (last N entries)
 * @param {number} count - Number of entries to return
 * @returns {Array} Recent metric entries
 */
export function getRecentMetrics(count = 10) {
  const all = metricsBuffer.getAll();
  return all.slice(-count);
}

/**
 * Clear all metrics
 */
export function clearMetrics() {
  // Reset the ring buffer
  metricsBuffer.buffer = [];
  metricsBuffer.index = 0;
}

