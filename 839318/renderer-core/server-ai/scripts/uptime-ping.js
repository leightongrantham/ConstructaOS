#!/usr/bin/env node
/**
 * Uptime ping script - calls /health endpoint and logs to file
 * Usage: node scripts/uptime-ping.js [endpoint-url] [log-file]
 * 
 * Can be run via cron:
 * */5 * * * * cd /path/to/server-ai && node scripts/uptime-ping.js >> /var/log/server-ai-uptime.log 2>&1
 */

import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

const endpointUrl = process.argv[2] || process.env.HEALTH_ENDPOINT_URL || 'http://localhost:3001/health';
const logFile = process.argv[3] || process.env.UPTIME_LOG_FILE || '/tmp/server-ai-uptime.log';

async function pingHealth() {
  const timestamp = new Date().toISOString();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch(endpointUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'server-ai-uptime-ping/1.0'
      }
    });
    
    clearTimeout(timeoutId);
    
    const status = response.status;
    const data = await response.json().catch(() => ({}));
    
    const logEntry = {
      timestamp,
      status,
      healthy: status === 200 && data.status === 'ok',
      uptime: data.uptime || null,
      llmEnabled: data.llm?.enabled || false,
      apiKeySet: data.llm?.apiKeySet || false,
      successRate: data.telemetry?.successRate || null,
      avgLatency: data.telemetry?.avgLatency || null,
      requestsLast5Min: data.telemetry?.requestsLast5Min || 0
    };
    
    // Ensure log directory exists
    const logDir = dirname(logFile);
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
    
    // Append to log file
    appendFileSync(logFile, JSON.stringify(logEntry) + '\n', { flag: 'a' });
    
    // Exit with error code if unhealthy
    if (!logEntry.healthy) {
      console.error(`[${timestamp}] Health check failed:`, logEntry);
      process.exit(1);
    } else {
      console.log(`[${timestamp}] Health check OK:`, {
        status,
        uptime: logEntry.uptime,
        successRate: logEntry.successRate
      });
    }
    
  } catch (error) {
    const logEntry = {
      timestamp,
      status: 'error',
      healthy: false,
      error: error.message,
      errorType: error.name
    };
    
    // Ensure log directory exists
    const logDir = dirname(logFile);
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
    
    // Append to log file
    appendFileSync(logFile, JSON.stringify(logEntry) + '\n', { flag: 'a' });
    
    console.error(`[${timestamp}] Health check error:`, error.message);
    process.exit(1);
  }
}

pingHealth();

