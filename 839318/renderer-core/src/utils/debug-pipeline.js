/**
 * Pipeline debugging utilities
 * Provides diagnostic tools and enhanced error reporting
 */

/**
 * Diagnostic result structure
 */
export class DiagnosticResult {
  constructor(component, status, details = {}) {
    this.component = component;
    this.status = status; // 'ok', 'warning', 'error'
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
  
  isOk() {
    return this.status === 'ok';
  }
  
  hasWarnings() {
    return this.status === 'warning';
  }
  
  hasErrors() {
    return this.status === 'error';
  }
}

/**
 * Check if AI endpoint is accessible
 */
export async function checkAIEndpoint(url) {
  let timeoutId = null;
  try {
    const healthUrl = url.replace('/api/topology/ai-clean', '/health');
    
    // Create timeout signal (fallback for browsers without AbortSignal.timeout)
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(healthUrl, {
      method: 'GET',
      signal: controller.signal
    });
    
    if (timeoutId) clearTimeout(timeoutId);
    
    if (!response.ok) {
      return new DiagnosticResult('ai-endpoint', 'error', {
        message: `Server returned status ${response.status}`,
        status: response.status,
        url: healthUrl
      });
    }
    
    const data = await response.json();
    const llmEnabled = data.llm?.enabled === true;
    const apiKeySet = data.llm?.apiKeySet === true;
    
    if (!llmEnabled) {
      return new DiagnosticResult('ai-endpoint', 'warning', {
        message: 'AI server available but LLM not enabled',
        serverAvailable: true,
        llmEnabled: false,
        apiKeySet: false,
        data
      });
    }
    
    if (!apiKeySet) {
      return new DiagnosticResult('ai-endpoint', 'warning', {
        message: 'AI server available but API key not set',
        serverAvailable: true,
        llmEnabled: true,
        apiKeySet: false,
        data
      });
    }
    
    return new DiagnosticResult('ai-endpoint', 'ok', {
      message: 'AI endpoint is accessible and configured',
      serverAvailable: true,
      llmEnabled: true,
      apiKeySet: true,
      data
    });
  } catch (error) {
    // Clear timeout if still pending
    if (timeoutId) clearTimeout(timeoutId);
    
    return new DiagnosticResult('ai-endpoint', 'error', {
      message: `Failed to connect to AI endpoint: ${error.message}`,
      error: error.message,
      url: url.replace('/api/topology/ai-clean', '/health'),
      type: error.name
    });
  }
}

/**
 * Check if vectorizer WASM files are accessible
 */
export async function checkVectorizerWASM(config) {
  const results = [];
  
  // Check Potrace
  if (config.potraceWasmUrl) {
    let timeoutId = null;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(config.potraceWasmUrl, {
        method: 'HEAD',
        signal: controller.signal
      });
      
      if (timeoutId) clearTimeout(timeoutId);
      
      if (response.ok) {
        results.push(new DiagnosticResult('potrace-wasm', 'ok', {
          message: 'Potrace WASM file is accessible',
          url: config.potraceWasmUrl,
          size: response.headers.get('content-length')
        }));
      } else {
        results.push(new DiagnosticResult('potrace-wasm', 'error', {
          message: `Potrace WASM file returned status ${response.status}`,
          url: config.potraceWasmUrl,
          status: response.status
        }));
      }
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      results.push(new DiagnosticResult('potrace-wasm', 'error', {
        message: `Potrace WASM file not accessible: ${error.message}`,
        url: config.potraceWasmUrl,
        error: error.message
      }));
    }
  } else {
    results.push(new DiagnosticResult('potrace-wasm', 'warning', {
      message: 'Potrace WASM URL not configured'
    }));
  }
  
  // Check VTracer
  if (config.vtracerWasmUrl) {
    let timeoutId = null;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(config.vtracerWasmUrl, {
        method: 'HEAD',
        signal: controller.signal
      });
      
      if (timeoutId) clearTimeout(timeoutId);
      
      if (response.ok) {
        results.push(new DiagnosticResult('vtracer-wasm', 'ok', {
          message: 'VTracer WASM file is accessible',
          url: config.vtracerWasmUrl,
          size: response.headers.get('content-length')
        }));
      } else {
        results.push(new DiagnosticResult('vtracer-wasm', 'error', {
          message: `VTracer WASM file returned status ${response.status}`,
          url: config.vtracerWasmUrl,
          status: response.status
        }));
      }
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      results.push(new DiagnosticResult('vtracer-wasm', 'error', {
        message: `VTracer WASM file not accessible: ${error.message}`,
        url: config.vtracerWasmUrl,
        error: error.message
      }));
    }
  } else {
    results.push(new DiagnosticResult('vtracer-wasm', 'warning', {
      message: 'VTracer WASM URL not configured'
    }));
  }
  
  return results;
}

/**
 * Check if OpenCV.js is accessible
 */
export async function checkOpenCV(opencvUrl = '/opencv.js') {
  let timeoutId = null;
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(opencvUrl, {
      method: 'HEAD',
      signal: controller.signal
    });
    
    if (timeoutId) clearTimeout(timeoutId);
    
    if (response.ok) {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('javascript')) {
        return new DiagnosticResult('opencv', 'ok', {
          message: 'OpenCV.js is accessible',
          url: opencvUrl,
          contentType: contentType,
          size: response.headers.get('content-length')
        });
      } else {
        return new DiagnosticResult('opencv', 'warning', {
          message: 'OpenCV.js URL exists but content type is not JavaScript',
          url: opencvUrl,
          contentType: contentType
        });
      }
    } else {
      return new DiagnosticResult('opencv', 'error', {
        message: `OpenCV.js returned status ${response.status}`,
        url: opencvUrl,
        status: response.status
      });
    }
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    return new DiagnosticResult('opencv', 'error', {
      message: `OpenCV.js not accessible: ${error.message}`,
      url: opencvUrl,
      error: error.message
    });
  }
}

/**
 * Validate ImageData structure
 */
export function validateImageData(imageData) {
  if (!imageData) {
    return new DiagnosticResult('imagedata', 'error', {
      message: 'ImageData is null or undefined'
    });
  }
  
  if (!(imageData instanceof ImageData)) {
    return new DiagnosticResult('imagedata', 'error', {
      message: 'Input is not an ImageData instance',
      type: typeof imageData
    });
  }
  
  if (!imageData.width || !imageData.height) {
    return new DiagnosticResult('imagedata', 'error', {
      message: 'ImageData missing width or height',
      width: imageData.width,
      height: imageData.height
    });
  }
  
  if (imageData.width <= 0 || imageData.height <= 0) {
    return new DiagnosticResult('imagedata', 'error', {
      message: 'ImageData has invalid dimensions',
      width: imageData.width,
      height: imageData.height
    });
  }
  
  const expectedDataLength = imageData.width * imageData.height * 4;
  if (!imageData.data || imageData.data.length !== expectedDataLength) {
    return new DiagnosticResult('imagedata', 'error', {
      message: 'ImageData.data length mismatch',
      expected: expectedDataLength,
      actual: imageData.data?.length || 0
    });
  }
  
  return new DiagnosticResult('imagedata', 'ok', {
    message: 'ImageData is valid',
    width: imageData.width,
    height: imageData.height,
    dataLength: imageData.data.length
  });
}

/**
 * Validate topology result structure
 */
export function validateTopology(topology) {
  if (!topology) {
    return new DiagnosticResult('topology', 'error', {
      message: 'Topology is null or undefined'
    });
  }
  
  const issues = [];
  
  if (!Array.isArray(topology.walls)) {
    issues.push('walls is not an array');
  } else {
    const invalidWalls = topology.walls.filter(wall => {
      return !wall || 
             !Array.isArray(wall.start) || 
             !Array.isArray(wall.end) ||
             wall.start.length !== 2 ||
             wall.end.length !== 2;
    });
    
    if (invalidWalls.length > 0) {
      issues.push(`${invalidWalls.length} walls have invalid structure`);
    }
  }
  
  if (!Array.isArray(topology.rooms)) {
    issues.push('rooms is not an array');
  }
  
  if (!Array.isArray(topology.openings)) {
    issues.push('openings is not an array');
  }
  
  if (issues.length > 0) {
    return new DiagnosticResult('topology', 'warning', {
      message: 'Topology has structural issues',
      issues: issues,
      wallCount: topology.walls?.length || 0,
      roomCount: topology.rooms?.length || 0,
      openingCount: topology.openings?.length || 0
    });
  }
  
  return new DiagnosticResult('topology', 'ok', {
    message: 'Topology structure is valid',
    wallCount: topology.walls?.length || 0,
    roomCount: topology.rooms?.length || 0,
    openingCount: topology.openings?.length || 0
  });
}

/**
 * Run comprehensive diagnostics
 */
export async function runDiagnostics(config = {}) {
  const results = [];
  
  // Check AI endpoint
  if (config.aiEndpointUrl) {
    const aiResult = await checkAIEndpoint(config.aiEndpointUrl);
    results.push(aiResult);
  }
  
  // Check vectorizers
  const vectorizerResults = await checkVectorizerWASM({
    potraceWasmUrl: config.potraceWasmUrl,
    vtracerWasmUrl: config.vtracerWasmUrl
  });
  results.push(...vectorizerResults);
  
  // Check OpenCV
  if (config.checkOpenCV !== false) {
    const opencvResult = await checkOpenCV(config.opencvUrl);
    results.push(opencvResult);
  }
  
  return {
    results,
    summary: {
      ok: results.filter(r => r.isOk()).length,
      warnings: results.filter(r => r.hasWarnings()).length,
      errors: results.filter(r => r.hasErrors()).length,
      total: results.length
    }
  };
}

/**
 * Format diagnostic results for console output
 */
export function formatDiagnostics(diagnostics) {
  const lines = [];
  lines.push('🔍 Pipeline Diagnostics');
  lines.push('═'.repeat(50));
  
  diagnostics.results.forEach(result => {
    const icon = result.isOk() ? '✅' : (result.hasErrors() ? '❌' : '⚠️');
    lines.push(`${icon} ${result.component}: ${result.details.message}`);
    
    if (result.details.error) {
      lines.push(`   Error: ${result.details.error}`);
    }
    
    if (Object.keys(result.details).length > 1) {
      const extra = { ...result.details };
      delete extra.message;
      delete extra.error;
      if (Object.keys(extra).length > 0) {
        lines.push(`   Details: ${JSON.stringify(extra, null, 2)}`);
      }
    }
  });
  
  lines.push('═'.repeat(50));
  lines.push(`Summary: ${diagnostics.summary.ok} OK, ${diagnostics.summary.warnings} Warnings, ${diagnostics.summary.errors} Errors`);
  
  return lines.join('\n');
}

/**
 * Enhanced error wrapper with context
 */
export class PipelineError extends Error {
  constructor(component, message, context = {}) {
    super(message);
    this.name = 'PipelineError';
    this.component = component;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }
  
  toJSON() {
    return {
      name: this.name,
      component: this.component,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

/**
 * Enhanced logging with context
 */
export function logWithContext(level, component, message, context = {}) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${component}]`;
  
  const logEntry = {
    timestamp,
    level,
    component,
    message,
    context
  };
  
  switch (level) {
    case 'error':
      console.error(`${prefix} ❌ ${message}`, context);
      break;
    case 'warn':
      console.warn(`${prefix} ⚠️ ${message}`, context);
      break;
    case 'info':
      console.info(`${prefix} ℹ️ ${message}`, context);
      break;
    default:
      console.log(`${prefix} ${message}`, context);
  }
  
  return logEntry;
}

