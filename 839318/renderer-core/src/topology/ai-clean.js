/**
 * Client-side wrapper for AI topology cleaning API
 * Posts to server-ai /api/topology/ai-clean endpoint
 */

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if error is retryable (429 or 5xx)
 * @param {number} status - HTTP status code
 * @returns {boolean} True if retryable
 */
function isRetryableError(status) {
  return status === 429 || (status >= 500 && status < 600);
}

/**
 * Clean topology using AI endpoint with retries and error handling
 * @param {Array<{points: Array<[number, number]>, closed?: boolean}>} polylines - Array of polylines
 * @param {Object} metadata - Metadata object with imageSize and optional pxToMeters
 * @param {Object} opts - Options
 * @param {boolean} opts.useLLM - Whether to use LLM (adds header, default: true)
 * @param {boolean} opts.preferDeterministic - Prefer deterministic heuristic (default: false)
 * @param {string} opts.endpointUrl - API endpoint URL (default: 'http://localhost:3001/api/topology/ai-clean')
 * @param {number} opts.maxRetries - Maximum retries (default: 2)
 * @param {number} opts.timeout - Request timeout in milliseconds (default: 30000)
 * @param {Object} opts.headers - Additional headers
 * @returns {Promise<Object>} Geometry response with {walls, rooms, openings, meta}
 */
export async function aiClean(polylines, metadata, opts = {}) {
  const {
    useLLM = true,
    preferDeterministic = false,
    endpointUrl = 'http://localhost:3001/api/topology/ai-clean',
    maxRetries = 2,
    timeout = 30000,
    headers = {}
  } = opts;
  
  // Validate input
  if (!Array.isArray(polylines)) {
    throw new Error('Polylines must be an array');
  }
  
  if (!metadata || typeof metadata !== 'object') {
    throw new Error('Metadata must be an object');
  }
  
  if (!Array.isArray(metadata.imageSize) || metadata.imageSize.length !== 2) {
    throw new Error('Metadata must have imageSize as [width, height]');
      }
  
  // Build request payload
  const payload = {
    polylines: polylines.map(polyline => ({
      points: polyline.points || polyline, // Support both formats
      closed: polyline.closed !== undefined ? polyline.closed : false
    })),
    metadata
  };
  
  // Add headers
  const requestHeaders = {
    'Content-Type': 'application/json',
    ...headers
  };
  
  // Add useLLM header if specified
  if (useLLM !== undefined) {
    requestHeaders['X-Use-LLM'] = useLLM ? 'true' : 'false';
  }

  if (preferDeterministic) {
    requestHeaders['X-Prefer-Deterministic'] = 'true';
  }

  let lastError = null;
  const maxAttempts = maxRetries + 1; // Total attempts = retries + 1 initial

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    // POST to AI endpoint
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    // Check HTTP status
    if (!response.ok) {
          const status = response.status;
      const errorText = await response.text().catch(() => 'Unknown error');
          
          // Check if retryable
          if (isRetryableError(status) && attempt < maxAttempts - 1) {
            // Calculate exponential backoff delay
            const baseDelay = status === 429 ? 1000 : 2000; // 429: 1s, 5xx: 2s
            const delay = baseDelay * Math.pow(2, attempt);
            
            lastError = new Error(`HTTP ${status}: ${errorText}`);
            
            // Wait before retrying
            await sleep(delay);
            continue;
          }
          
          // Non-retryable error or last attempt
          throw new Error(`AI endpoint returned status ${status}: ${errorText}`);
    }
    
    // Parse JSON response
    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      throw new Error(`Failed to parse AI response as JSON: ${parseError.message}`);
    }
    
        // Validate response structure
        if (!data || typeof data !== 'object') {
          throw new Error('AI response is not a valid object');
    }
    
        // Ensure required fields exist
    return {
      walls: Array.isArray(data.walls) ? data.walls : [],
          rooms: Array.isArray(data.rooms) ? data.rooms : [],
      openings: Array.isArray(data.openings) ? data.openings : [],
          meta: data.meta || {
            scale: metadata.pxToMeters || 0.01,
            bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 }
          }
    };
    
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }

  } catch (error) {
      lastError = error;

      const isLastAttempt = attempt === maxAttempts - 1;
    
      // Handle timeout
    if (error.name === 'AbortError') {
        if (isLastAttempt) {
          const timeoutError = new Error(`AI endpoint request timed out after ${timeout}ms`);
          timeoutError.endpointUrl = endpointUrl;
          timeoutError.timeout = timeout;
          timeoutError.attempt = attempt + 1;
          timeoutError.maxAttempts = maxAttempts;
          throw timeoutError;
        }
        // Retry timeout with exponential backoff
        const delay = 2000 * Math.pow(2, attempt);
        console.warn(`AI endpoint timeout, retrying in ${delay}ms... (attempt ${attempt + 1}/${maxAttempts})`);
        await sleep(delay);
        continue;
    }
    
      // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
        if (isLastAttempt) {
          const detailedError = new Error(`Failed to connect to AI endpoint: ${error.message}`);
          detailedError.endpointUrl = endpointUrl;
          detailedError.attempt = attempt + 1;
          detailedError.maxAttempts = maxAttempts;
          throw detailedError;
        }
        // Retry network errors with exponential backoff
        const delay = 1000 * Math.pow(2, attempt);
        console.warn(`AI endpoint network error, retrying in ${delay}ms... (attempt ${attempt + 1}/${maxAttempts})`);
        await sleep(delay);
        continue;
}

      // Handle JSON parse errors (don't retry)
      if (error.message.includes('parse') || error.message.includes('JSON')) {
        throw error;
      }

      // For other errors, retry if not last attempt
      if (!isLastAttempt) {
        const delay = 1000 * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }

      // Last attempt failed
      throw error;
    }
  }

  // This should never be reached, but TypeScript/static analysis might want it
  throw lastError || new Error('Unexpected error in aiClean');
}
