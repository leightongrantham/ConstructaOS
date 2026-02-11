#!/usr/bin/env node
/**
 * Alert script - checks success rate and sends alerts if below threshold
 * Usage: node scripts/check-alerts.js [endpoint-url] [threshold] [alert-method]
 * 
 * Can be run via cron:
 * */5 * * * * cd /path/to/server-ai && node scripts/check-alerts.js >> /var/log/server-ai-alerts.log 2>&1
 */

import { appendFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { dirname } from 'path';
import { execSync } from 'child_process';

const endpointUrl = process.argv[2] || process.env.METRICS_ENDPOINT_URL || 'http://localhost:3001/metrics';
const threshold = parseFloat(process.argv[3] || process.env.ALERT_SUCCESS_RATE_THRESHOLD || '0.90'); // 90%
const alertMethod = process.argv[4] || process.env.ALERT_METHOD || 'log'; // 'log' or 'email'
const alertLogFile = process.env.ALERT_LOG_FILE || '/tmp/server-ai-alerts.log';
const windowSeconds = parseInt(process.env.ALERT_WINDOW_SECONDS || '300', 10); // 5 minutes

/**
 * Send alert via logging (default)
 */
function sendLogAlert(message, data) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level: 'ALERT',
    message,
    data
  };
  
  // Ensure log directory exists
  const logDir = dirname(alertLogFile);
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
  
  // Append to log file
  appendFileSync(alertLogFile, JSON.stringify(logEntry) + '\n', { flag: 'a' });
  
  // Also print to console
  console.error(`[ALERT] ${timestamp}: ${message}`, data);
}

/**
 * Send alert via email (simple implementation using mail command)
 */
function sendEmailAlert(message, data) {
  const emailTo = process.env.ALERT_EMAIL_TO || 'admin@example.com';
  const emailFrom = process.env.ALERT_EMAIL_FROM || 'server-ai@localhost';
  const subject = `[ALERT] Server-AI: ${message}`;
  
  const body = `
Server-AI Alert

Time: ${new Date().toISOString()}
Message: ${message}

Details:
${JSON.stringify(data, null, 2)}

---
This is an automated alert from server-ai monitoring.
  `.trim();
  
  // Try to send email using system mail command
  // Note: This requires mailutils or similar to be installed
  try {
    execSync(`echo "${body}" | mail -s "${subject}" -r "${emailFrom}" "${emailTo}"`, {
      stdio: 'ignore'
    });
    console.log(`Alert email sent to ${emailTo}`);
  } catch (error) {
    console.error('Failed to send email alert, falling back to log:', error.message);
    sendLogAlert(message, data);
  }
}

async function checkAlerts() {
  const timestamp = new Date().toISOString();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    // Get metrics for the last 5 minutes
    const metricsUrl = `${endpointUrl}?window=${windowSeconds}`;
    const response = await fetch(metricsUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'server-ai-alert-checker/1.0'
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Metrics endpoint returned status ${response.status}`);
    }
    
    const metrics = await response.json();
    
    // Check success rate
    const successRate = metrics.successRate || 0;
    const totalRequests = metrics.totalRequests || 0;
    const errors = metrics.errors || 0;
    const avgLatency = metrics.avgLatency || 0;
    
    // Only alert if we have enough data (at least 10 requests in the window)
    if (totalRequests < 10) {
      console.log(`[${timestamp}] Insufficient data for alerting: ${totalRequests} requests`);
      return;
    }
    
    // Check if success rate is below threshold
    if (successRate < threshold) {
      const message = `Success rate ${(successRate * 100).toFixed(1)}% is below threshold ${(threshold * 100).toFixed(1)}%`;
      const alertData = {
        successRate,
        threshold,
        totalRequests,
        errors,
        avgLatency,
        windowSeconds,
        requestsByModel: metrics.requestsByModel || {}
      };
      
      if (alertMethod === 'email') {
        sendEmailAlert(message, alertData);
      } else {
        sendLogAlert(message, alertData);
      }
      
      process.exit(1); // Exit with error code to trigger monitoring systems
    } else {
      console.log(`[${timestamp}] Success rate OK: ${(successRate * 100).toFixed(1)}% (${totalRequests} requests)`);
    }
    
    // Optional: Check for high latency
    const highLatencyThreshold = parseFloat(process.env.ALERT_LATENCY_THRESHOLD_MS || '5000'); // 5 seconds
    if (avgLatency > highLatencyThreshold && totalRequests > 0) {
      const message = `Average latency ${avgLatency.toFixed(0)}ms exceeds threshold ${highLatencyThreshold}ms`;
      const alertData = {
        avgLatency,
        threshold: highLatencyThreshold,
        totalRequests,
        successRate
      };
      
      if (alertMethod === 'email') {
        sendEmailAlert(message, alertData);
      } else {
        sendLogAlert(message, alertData);
      }
    }
    
  } catch (error) {
    const message = `Failed to check metrics: ${error.message}`;
    const alertData = {
      error: error.message,
      errorType: error.name,
      endpointUrl
    };
    
    sendLogAlert(message, alertData);
    process.exit(1);
  }
}

checkAlerts();

