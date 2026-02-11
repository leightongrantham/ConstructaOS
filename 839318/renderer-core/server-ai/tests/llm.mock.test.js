import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  ${error.message}`);
    throw error;
  }
}

// Mock OpenAI client
class MockOpenAIClient {
  constructor(options) {
    this.apiKey = options.apiKey;
    this.shouldFail = false;
    this.failCount = 0;
    this.failAfter = 0;
    this.responseDelay = 0;
    this.response = {
      choices: [{
        message: {
          content: 'Mock response from OpenAI'
        }
      }]
    };
    
    // Store create function so it can be overridden
    this._createFn = null;
  }

  setShouldFail(shouldFail, failAfter = 0) {
    this.shouldFail = shouldFail;
    this.failAfter = failAfter;
    this.failCount = 0;
  }

  setResponse(content) {
    this.response = {
      choices: [{
        message: {
          content: content
        }
      }]
    };
  }

  setResponseDelay(ms) {
    this.responseDelay = ms;
  }

  get chat() {
    const self = this;
    return {
      completions: {
        get create() {
          // If create function was overridden, use it
          if (self._createFn) {
            return self._createFn;
          }
          
          // Otherwise use default implementation
          return async (params) => {
            // Simulate delay
            if (self.responseDelay > 0) {
              await new Promise(resolve => setTimeout(resolve, self.responseDelay));
            }

            // Simulate failures
            if (self.shouldFail && self.failCount < self.failAfter) {
              self.failCount++;
              const error = new Error('Mock API error');
              error.status = 500;
              throw error;
            }

            // Return response with usage info
            return {
              ...self.response,
              usage: {
                prompt_tokens: 100,
                completion_tokens: 50,
                total_tokens: 150
              }
            };
          };
        },
        set create(fn) {
          self._createFn = fn;
        }
      }
    };
  }
}

// Create a testable version of callLLM that accepts a client factory
async function testableCallLLM(payload, options = {}, clientFactory) {
  const {
    model = 'gpt-4o-mini',
    maxRetries = 2,
    timeout = 30000,
    retryDelay = 1000
  } = options;

  const client = clientFactory();
  
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
  const maxAttempts = maxRetries + 1;

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

      return { content, usage };

    } catch (error) {
      lastError = error;
      
      const isLastAttempt = attempt === maxAttempts - 1;

      if (isLastAttempt) {
        throw new Error(
          `OpenAI API call failed after ${maxAttempts} attempts: ${error.message}`
        );
      } else {
        // Wait before retrying (exponential backoff)
        const delay = retryDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Unexpected error in callLLM');
}

console.log('Running LLM wrapper tests...\n');

// Test 1: Missing API key
await asyncTest('Throws error when API key is missing', async () => {
  const clientFactory = () => null;
  
  try {
    await testableCallLLM('test prompt', {}, clientFactory);
    assert(false, 'Should have thrown an error');
  } catch (error) {
    assert(
      error.message.includes('OPENAI_API_KEY'),
      `Error should mention API key, got: ${error.message}`
    );
  }
});

// Test 2: Successful response
await asyncTest('Returns text content from successful API call', async () => {
  const mockClient = new MockOpenAIClient({ apiKey: 'test-key' });
  mockClient.setResponse('Hello, world!');
  
  const clientFactory = () => mockClient;
  
  const response = await testableCallLLM('Say hello', {}, clientFactory);
  assert(response.content === 'Hello, world!', `Expected 'Hello, world!', got '${response.content}'`);
  assert(response.usage !== null, 'Should include usage information');
});

// Test 3: Retry on failure
await asyncTest('Retries on failure and succeeds on second attempt', async () => {
  const mockClient = new MockOpenAIClient({ apiKey: 'test-key' });
  mockClient.setShouldFail(true, 1); // Fail once, then succeed
  mockClient.setResponse('Success after retry');
  
  const clientFactory = () => mockClient;
  
  const response = await testableCallLLM('test', { maxRetries: 2 }, clientFactory);
  assert(response.content === 'Success after retry', 'Should succeed after retry');
  assert(mockClient.failCount === 1, 'Should have failed once before succeeding');
});

// Test 4: All retries exhausted
await asyncTest('Throws error when all retries are exhausted', async () => {
  const mockClient = new MockOpenAIClient({ apiKey: 'test-key' });
  mockClient.setShouldFail(true, 10); // Always fail
  
  const clientFactory = () => mockClient;
  
  try {
    await testableCallLLM('test', { maxRetries: 2 }, clientFactory);
    assert(false, 'Should have thrown an error');
  } catch (error) {
    assert(
      error.message.includes('failed after'),
      `Error should mention retries, got: ${error.message}`
    );
  }
});

// Test 5: Timeout handling
await asyncTest('Handles timeout correctly', async () => {
  const mockClient = new MockOpenAIClient({ apiKey: 'test-key' });
  mockClient.setResponseDelay(100); // Delay response
  mockClient.setResponse('Too slow');
  
  const clientFactory = () => mockClient;
  
  try {
    await testableCallLLM('test', { timeout: 50 }, clientFactory);
    assert(false, 'Should have timed out');
  } catch (error) {
    assert(
      error.message.includes('timeout'),
      `Error should mention timeout, got: ${error.message}`
    );
  }
});

// Test 6: Model selection
await asyncTest('Uses specified model from options', async () => {
  const mockClient = new MockOpenAIClient({ apiKey: 'test-key' });
  let capturedModel = null;
  
  // Override create to capture model
  const originalCreate = mockClient.chat.completions.create;
  mockClient.chat.completions.create = async (params) => {
    capturedModel = params.model;
    return {
      choices: [{ message: { content: 'test' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
    };
  };
  
  const clientFactory = () => mockClient;
  
  await testableCallLLM('test', { model: 'gpt-4' }, clientFactory);
  assert(capturedModel === 'gpt-4', `Expected model 'gpt-4', got '${capturedModel}'`);
});

// Test 7: String payload normalization
await asyncTest('Normalizes string payload to messages format', async () => {
  const mockClient = new MockOpenAIClient({ apiKey: 'test-key' });
  let capturedMessages = null;
  
  const originalCreate = mockClient.chat.completions.create;
  mockClient.chat.completions.create = async (params) => {
    capturedMessages = params.messages;
    return {
      choices: [{ message: { content: 'test' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
    };
  };
  
  const clientFactory = () => mockClient;
  
  await testableCallLLM('Hello, AI!', {}, clientFactory);
  assert(
    Array.isArray(capturedMessages),
    'Messages should be an array'
  );
  assert(
    capturedMessages.length === 1,
    'Should have one message'
  );
  assert(
    capturedMessages[0].role === 'user',
    'First message should have role "user"'
  );
  assert(
    capturedMessages[0].content === 'Hello, AI!',
    'Content should match input'
  );
});

// Test 8: Array payload (messages format)
await asyncTest('Handles array payload (messages format)', async () => {
  const mockClient = new MockOpenAIClient({ apiKey: 'test-key' });
  let capturedMessages = null;
  
  const originalCreate = mockClient.chat.completions.create;
  mockClient.chat.completions.create = async (params) => {
    capturedMessages = params.messages;
    return {
      choices: [{ message: { content: 'test' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
    };
  };
  
  const clientFactory = () => mockClient;
  
  const messages = [
    { role: 'system', content: 'You are a helpful assistant' },
    { role: 'user', content: 'Hello' }
  ];
  
  await testableCallLLM(messages, {}, clientFactory);
  assert(
    capturedMessages.length === 2,
    'Should preserve all messages'
  );
  assert(
    capturedMessages[0].role === 'system',
    'Should preserve message roles'
  );
});

console.log('\nAll tests passed! ✓');
