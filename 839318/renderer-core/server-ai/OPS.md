# Operations & Monitoring Guide

This document describes the monitoring setup, alerting, and operational procedures for server-ai.

## Overview

Server-ai includes:
- **Sentry integration** for exception tracking
- **Uptime monitoring** via health check pings
- **Success rate alerts** for degraded performance
- **Telemetry** for request metrics
- **Request logging** for debugging and replay

## Monitoring Components

### 1. Sentry Exception Tracking

Sentry automatically captures exceptions and errors from the server.

#### Setup

1. Get a Sentry DSN from https://sentry.io
2. Set environment variable:
   ```bash
   export SENTRY_DSN=https://your-dsn@sentry.io/project-id
   ```

#### Configuration

Environment variables:
- `SENTRY_DSN` - Your Sentry project DSN (required for Sentry to work)
- `SENTRY_TRACES_SAMPLE_RATE` - Transaction sampling rate (default: 0.1 = 10%)
- `NODE_ENV` - Environment name (development/production)

#### What Gets Captured

- LLM API failures and fallbacks
- Output validation errors
- Server startup errors
- Unhandled exceptions via Fastify error handler

#### Viewing Errors

1. Go to your Sentry project dashboard
2. Errors appear in real-time
3. Each error includes:
   - Stack trace
   - Request context (URL, method, headers)
   - Tags (component, model, etc.)
   - Custom data (request IDs, metrics)

### 2. Uptime Monitoring

The `uptime-ping.js` script periodically checks the `/health` endpoint and logs results.

#### Setup

1. **Manual run:**
   ```bash
   node scripts/uptime-ping.js
   ```

2. **Cron setup (every 5 minutes):**
   ```bash
   # Edit crontab
   crontab -e
   
   # Add this line (adjust paths):
   */5 * * * * cd /path/to/server-ai && node scripts/uptime-ping.js >> /var/log/server-ai-uptime.log 2>&1
   ```

3. **With custom endpoint and log file:**
   ```bash
   node scripts/uptime-ping.js http://production-server:3001/health /var/log/server-ai-uptime.log
   ```

#### Environment Variables

- `HEALTH_ENDPOINT_URL` - Health check endpoint (default: `http://localhost:3001/health`)
- `UPTIME_LOG_FILE` - Log file path (default: `/tmp/server-ai-uptime.log`)

#### Log Format

Each log entry is a JSON line:
```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "status": 200,
  "healthy": true,
  "uptime": 3600,
  "llmEnabled": true,
  "apiKeySet": true,
  "successRate": 0.95,
  "avgLatency": 1250,
  "requestsLast5Min": 10
}
```

#### Monitoring Uptime Logs

```bash
# Watch recent entries
tail -f /var/log/server-ai-uptime.log | jq

# Check for failures
grep '"healthy":false' /var/log/server-ai-uptime.log

# Count failures in last hour
grep '"healthy":false' /var/log/server-ai-uptime.log | wc -l
```

### 3. Success Rate Alerts

The `check-alerts.js` script monitors success rates and sends alerts when below threshold.

#### Setup

1. **Manual run:**
   ```bash
   node scripts/check-alerts.js
   ```

2. **Cron setup (every 5 minutes):**
   ```bash
   */5 * * * * cd /path/to/server-ai && node scripts/check-alerts.js >> /var/log/server-ai-alerts.log 2>&1
   ```

3. **With custom threshold:**
   ```bash
   node scripts/check-alerts.js http://localhost:3001/metrics 0.85 log
   ```

#### Configuration

Environment variables:
- `METRICS_ENDPOINT_URL` - Metrics endpoint (default: `http://localhost:3001/metrics`)
- `ALERT_SUCCESS_RATE_THRESHOLD` - Success rate threshold (default: `0.90` = 90%)
- `ALERT_LATENCY_THRESHOLD_MS` - High latency threshold (default: `5000` = 5 seconds)
- `ALERT_METHOD` - Alert method: `log` or `email` (default: `log`)
- `ALERT_LOG_FILE` - Alert log file (default: `/tmp/server-ai-alerts.log`)
- `ALERT_WINDOW_SECONDS` - Time window for metrics (default: `300` = 5 minutes)
- `ALERT_EMAIL_TO` - Email address for alerts (required if using email method)
- `ALERT_EMAIL_FROM` - From address for email alerts

#### Alert Methods

**1. Log-based (default):**
- Alerts written to log file
- Console output for immediate visibility
- Exit code 1 triggers monitoring systems

**2. Email-based:**
- Requires `mailutils` or similar mail command
- Sends email to configured address
- Falls back to logging if email fails

#### Example Alert Output

```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "level": "ALERT",
  "message": "Success rate 85.5% is below threshold 90.0%",
  "data": {
    "successRate": 0.855,
    "threshold": 0.90,
    "totalRequests": 100,
    "errors": 15,
    "avgLatency": 1500,
    "windowSeconds": 300
  }
}
```

## Log Locations

### Application Logs

- **Stdout/Stderr**: Captured by process manager (systemd, Docker, etc.)
- **Fastify logs**: Structured JSON logs to stdout

### Monitoring Logs

- **Uptime logs**: `/var/log/server-ai-uptime.log` (or `UPTIME_LOG_FILE`)
- **Alert logs**: `/var/log/server-ai-alerts.log` (or `ALERT_LOG_FILE`)
- **Telemetry logs**: `/tmp/ai-telemetry.log` (if `TELEMETRY_DUMP_FILE=true`)
- **Request logs**: `/tmp/ai-requests/YYYY-MM-DD/` (if `REQUEST_LOG_ENABLED=true`)

### Log Rotation

Recommended log rotation setup (`/etc/logrotate.d/server-ai`):

```
/var/log/server-ai-*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 root root
}
```

## Health Check Endpoint

### GET `/health`

Returns server status and recent metrics.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "version": "1.0.0",
  "llm": {
    "enabled": true,
    "apiKeySet": true,
    "model": "gpt-4o-mini"
  },
  "telemetry": {
    "requestsLast5Min": 10,
    "successRate": 0.95,
    "avgLatency": 1250
  },
  "uptime": 3600
}
```

**Use cases:**
- Load balancer health checks
- Monitoring system probes
- Manual status checks

## Metrics Endpoint

### GET `/metrics?window=300`

Returns aggregated metrics for the specified time window.

**Query parameters:**
- `window` - Time window in seconds (optional, defaults to all time)

**Response:**
```json
{
  "totalRequests": 100,
  "successRate": 0.95,
  "avgLatency": 1250,
  "totalTokensIn": 5000,
  "totalTokensOut": 20000,
  "requestsByModel": {
    "gpt-4o-mini": {
      "count": 100,
      "avgLatency": 1250
    }
  },
  "errors": 5,
  "windowMs": 300000,
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

## Monitoring Best Practices

### 1. Set Up Alerts

- Configure `check-alerts.js` to run every 5 minutes
- Set appropriate thresholds for your use case
- Use email alerts for critical production systems
- Monitor alert log files for patterns

### 2. Monitor Key Metrics

- **Success rate**: Should be > 95% in production
- **Average latency**: Should be < 3 seconds for LLM requests
- **Error rate**: Track error patterns in Sentry
- **Token usage**: Monitor OpenAI API costs

### 3. Log Retention

- Keep uptime logs for at least 7 days
- Keep alert logs for at least 30 days
- Archive request logs for debugging (optional)

### 4. Regular Reviews

- Weekly review of Sentry errors
- Daily check of alert logs
- Monthly review of success rates and latency trends

## Troubleshooting

### Health Check Failing

1. Check server is running: `curl http://localhost:3001/health`
2. Check logs: `docker logs server-ai` or system logs
3. Verify environment variables are set correctly
4. Check Sentry for recent errors

### High Error Rate

1. Check Sentry dashboard for error patterns
2. Review recent request logs
3. Check OpenAI API status: https://status.openai.com
4. Verify API key is valid and has credits
5. Consider disabling LLM temporarily: `USE_LLM=false`

### Alerts Not Firing

1. Verify cron job is running: `crontab -l`
2. Check alert script has execute permission: `chmod +x scripts/check-alerts.js`
3. Test manually: `node scripts/check-alerts.js`
4. Check alert log file exists and is writable

### Email Alerts Not Working

1. Verify `mailutils` is installed: `which mail`
2. Test email command: `echo "test" | mail -s "test" your@email.com`
3. Check `ALERT_EMAIL_TO` is set correctly
4. Check system mail logs: `/var/log/mail.log`

## Integration with Monitoring Systems

### Prometheus

The `/metrics` endpoint can be scraped by Prometheus:

```yaml
scrape_configs:
  - job_name: 'server-ai'
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: '/metrics'
    scrape_interval: 30s
```

### Grafana

Create dashboards using:
- Success rate: `successRate * 100`
- Request count: `totalRequests`
- Average latency: `avgLatency`
- Error count: `errors`

### PagerDuty / Opsgenie

Configure webhooks or use alert scripts to trigger incidents:
- Alert script exit code 1 can trigger monitoring system alerts
- Email alerts can be forwarded to incident management systems

## Quick Reference

### Environment Variables

```bash
# Sentry
SENTRY_DSN=https://...
SENTRY_TRACES_SAMPLE_RATE=0.1

# Monitoring
HEALTH_ENDPOINT_URL=http://localhost:3001/health
UPTIME_LOG_FILE=/var/log/server-ai-uptime.log
METRICS_ENDPOINT_URL=http://localhost:3001/metrics
ALERT_SUCCESS_RATE_THRESHOLD=0.90
ALERT_METHOD=log
ALERT_EMAIL_TO=admin@example.com
```

### Cron Examples

```bash
# Uptime check every 5 minutes
*/5 * * * * cd /path/to/server-ai && node scripts/uptime-ping.js >> /var/log/server-ai-uptime.log 2>&1

# Alert check every 5 minutes
*/5 * * * * cd /path/to/server-ai && node scripts/check-alerts.js >> /var/log/server-ai-alerts.log 2>&1
```

### Manual Checks

```bash
# Health check
curl http://localhost:3001/health | jq

# Metrics
curl http://localhost:3001/metrics?window=300 | jq

# Test uptime script
node scripts/uptime-ping.js

# Test alert script
node scripts/check-alerts.js
```

## Support

For issues or questions:
1. Check Sentry dashboard for errors
2. Review logs in `/var/log/server-ai-*.log`
3. Check server logs (Docker/systemd)
4. Review this OPS.md guide

