/**
 * Example: Using AI Topology Cleaning in Renderer
 * 
 * This example shows how to integrate the AI backend into your renderer workflow.
 */

import { Renderer } from '../index.js';
import { aiClean } from '../src/topology/ai-clean.js';

/**
 * Example 1: Using AI directly
 */
async function exampleDirectAI() {
  console.log('Example 1: Direct AI Usage');
  
  // Your vectorized paths
  const polylines = [
    {
      points: [[0, 0], [10, 0], [10, 10], [0, 10]],
      closed: true
    },
    {
      points: [[5, 5], [15, 5], [15, 15]],
      closed: false
    }
  ];
  
  // Prepare metadata
  const metadata = {
    imageSize: [1000, 1000],
    pxToMeters: 0.01
  };
  
  // Call AI backend
  try {
    const result = await aiClean(polylines, metadata, {
      endpointUrl: 'http://localhost:3001/api/topology/ai-clean',
      useLLM: true,
      timeout: 30000
    });
    
    console.log('AI Result:');
    console.log(`  Walls: ${result.walls.length}`);
    console.log(`  Rooms: ${result.rooms.length}`);
    console.log(`  Openings: ${result.openings.length}`);
    
    return result;
  } catch (error) {
    console.error('AI cleaning failed:', error);
    throw error;
  }
}

/**
 * Example 2: Using AI in Renderer pipeline
 */
async function exampleRendererWithAI(imageFile) {
  console.log('Example 2: Renderer with AI');
  
  const renderer = new Renderer({
    // Configure AI endpoint
    aiEndpointUrl: 'http://localhost:3001/api/topology/ai-clean'
  });
  
  try {
    // Run full pipeline with AI enabled
    const result = await renderer.render(imageFile, {
      // Preprocessing options
      preprocess: {
        // ... preprocessing options
      },
      
      // Vectorization options
      vectorize: {
        // ... vectorization options
      },
      
      // Topology options with AI
      topology: {
        aiClean: true,  // Enable AI cleaning
        useLLM: true,   // Use LLM (set to false for heuristic)
        imageSize: [1920, 1080],
        pxToMeters: 0.01,
        aiTimeout: 30000,
        // Fallback options if AI fails
        snapOrthogonal: true,
        mergeParallel: true
      },
      
      // Rendering options
      axon: {
        // ... rendering options
      }
    });
    
    console.log('Renderer Result:');
    console.log(`  Walls: ${result.topology?.walls?.length || 0}`);
    console.log(`  Rooms: ${result.topology?.rooms?.length || 0}`);
    console.log(`  Openings: ${result.topology?.openings?.length || 0}`);
    
    return result;
  } catch (error) {
    console.error('Renderer with AI failed:', error);
    throw error;
  }
}

/**
 * Example 3: Using AI with error handling and fallback
 */
async function exampleAIWithFallback(polylines, metadata) {
  console.log('Example 3: AI with Fallback');
  
  try {
    // Try AI first
    const aiResult = await aiClean(polylines, metadata, {
      endpointUrl: 'http://localhost:3001/api/topology/ai-clean',
      useLLM: true
    });
    
    console.log('✓ AI cleaning succeeded');
    return aiResult;
    
  } catch (error) {
    console.warn('AI cleaning failed, using heuristic fallback:', error.message);
    
    // Fallback to heuristic processing
    // You would call your heuristic functions here
    const heuristicResult = {
      walls: [],
      rooms: [],
      openings: [],
      meta: {
        scale: metadata.pxToMeters || 0.01,
        bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 }
      }
    };
    
    console.log('✓ Using heuristic fallback');
    return heuristicResult;
  }
}

/**
 * Example 4: Testing AI endpoint availability
 */
async function testAIEndpoint(endpointUrl = 'http://localhost:3001/api/topology/ai-clean') {
  console.log('Testing AI endpoint...');
  
  try {
    // Test health endpoint first
    const healthResponse = await fetch(endpointUrl.replace('/api/topology/ai-clean', '/health'));
    const health = await healthResponse.json();
    
    console.log('Health check:');
    console.log(`  Status: ${health.status}`);
    console.log(`  LLM Enabled: ${health.llm?.enabled}`);
    console.log(`  API Key Set: ${health.llm?.apiKeySet}`);
    
    if (!health.llm?.enabled) {
      console.warn('⚠ LLM is not enabled on the server');
    }
    
    if (!health.llm?.apiKeySet) {
      console.warn('⚠ OpenAI API key is not set on the server');
    }
    
    return health.llm?.enabled && health.llm?.apiKeySet;
    
  } catch (error) {
    console.error('Failed to connect to AI endpoint:', error.message);
    return false;
  }
}

// Export examples
export {
  exampleDirectAI,
  exampleRendererWithAI,
  exampleAIWithFallback,
  testAIEndpoint
};

// Run example if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    console.log('AI Integration Examples\n');
    console.log('='.repeat(50));
    
    // Test endpoint first
    const isAvailable = await testAIEndpoint();
    console.log('');
    
    if (isAvailable) {
      // Run example 1
      await exampleDirectAI();
      console.log('');
    } else {
      console.log('⚠ AI endpoint not available. Start server-ai first:');
      console.log('  cd server-ai');
      console.log('  export OPENAI_API_KEY=sk-your-key');
      console.log('  export USE_LLM=true');
      console.log('  npm start');
    }
  })();
}

