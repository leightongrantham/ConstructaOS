import OpenAI from 'openai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Create OpenAI client instance
 * @returns {OpenAI|null} OpenAI client or null if API key is missing
 */
function createClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    return null;
  }
  
  return new OpenAI({
    apiKey: apiKey,
    timeout: 30000, // 30 seconds
    maxRetries: 0 // We'll handle retries manually
  });
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Call OpenAI LLM with retries and error handling
 * @param {string|Object} payload - The prompt string or messages array for chat completion
 * @param {Object} options - Options object
 * @param {string} options.model - Model to use (default: 'gpt-4o-mini')
 * @param {number} options.maxRetries - Maximum number of retries (default: 2)
 * @param {number} options.timeout - Timeout in milliseconds (default: 30000)
 * @param {number} options.retryDelay - Delay between retries in milliseconds (default: 1000)
 * @returns {Promise<{content: string, usage: Object|null}>} Response with content and token usage
 * @throws {Error} If API key is missing or all retries fail
 */
export async function callLLM(payload, options = {}) {
  const {
    model = 'gpt-4o-mini',
    maxRetries = 2,
    timeout = 30000,
    retryDelay = 1000
  } = options;

  const client = createClient();
  
  if (!client) {
    const error = new Error('OPENAI_API_KEY is not set in environment variables');
    console.error('[LLM] Error:', {
      error: error.message,
      timestamp: new Date().toISOString()
    });
    throw error;
  }

  // Normalize payload to messages format
  const messages = typeof payload === 'string' 
    ? [{ role: 'user', content: payload }]
    : Array.isArray(payload) 
      ? payload 
      : [{ role: 'user', content: String(payload) }];

  let lastError = null;
  const maxAttempts = maxRetries + 1; // Total attempts = retries + 1 initial attempt

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Request timeout after ${timeout}ms`));
        }, timeout);
      });

      // Create API call promise
      const apiCallPromise = client.chat.completions.create({
        model: model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 4000
      });

      // Race between API call and timeout
      const response = await Promise.race([apiCallPromise, timeoutPromise]);

      // Extract text content from response
      const content = response.choices[0]?.message?.content;
      
      if (!content) {
        throw new Error('No content in OpenAI response');
      }

      // Extract usage information if available
      const usage = response.usage ? {
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens,
        total_tokens: response.usage.total_tokens
      } : null;

      // Log successful response
      if (attempt > 0) {
        console.log('[LLM] Success after retry', {
          attempt: attempt + 1,
          model,
          timestamp: new Date().toISOString()
        });
      }

      return { content, usage };

    } catch (error) {
      lastError = error;
      
      const isLastAttempt = attempt === maxAttempts - 1;
      const errorInfo = {
        attempt: attempt + 1,
        maxAttempts,
        model,
        error: error.message,
        errorType: error.constructor.name,
        timestamp: new Date().toISOString()
      };

      // Add additional error context
      if (error.status) {
        errorInfo.statusCode = error.status;
      }
      if (error.code) {
        errorInfo.errorCode = error.code;
      }

      if (isLastAttempt) {
        // Final attempt failed
        console.error('[LLM] All retries exhausted', errorInfo);
        throw new Error(
          `OpenAI API call failed after ${maxAttempts} attempts: ${error.message}`
        );
      } else {
        // Log retry attempt
        console.warn('[LLM] Retrying after error', errorInfo);
        
        // Wait before retrying (exponential backoff)
        const delay = retryDelay * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  // This should never be reached, but TypeScript/static analysis might want it
  throw lastError || new Error('Unexpected error in callLLM');
}

