/**
 * Test script to verify mock data input/output flow
 * Run in browser console or as a test
 */

import { runSandbox } from './sandbox.js';
import { validateImageData, validateTopology } from './src/utils/debug-pipeline.js';

/**
 * Test mock data flow through entire pipeline
 */
export async function testMockDataFlow() {
  console.log('🧪 Testing Mock Data Flow');
  console.log('═'.repeat(60));
  
  const results = {
    preprocessing: null,
    vectorization: null,
    topology: null,
    rendering: null,
    errors: []
  };
  
  try {
    // Step 1: Test mock ImageData generation
    console.log('\n📥 Step 1: Mock ImageData Generation');
    const { getMockImageData } = await import('./sandbox.js');
    const mockImageData = getMockImageData();
    
    const imageValidation = validateImageData(mockImageData);
    console.log(`   ${imageValidation.isOk() ? '✅' : '❌'} ImageData: ${imageValidation.details.message}`);
    console.log(`   Dimensions: ${mockImageData.width}x${mockImageData.height}`);
    console.log(`   Data length: ${mockImageData.data.length} bytes`);
    
    // Count pixels
    let whitePixels = 0;
    let blackPixels = 0;
    for (let i = 0; i < mockImageData.data.length; i += 4) {
      if (mockImageData.data[i] > 127) whitePixels++;
      else blackPixels++;
    }
    console.log(`   White pixels: ${whitePixels}, Black pixels: ${blackPixels}`);
    
    results.preprocessing = {
      valid: imageValidation.isOk(),
      width: mockImageData.width,
      height: mockImageData.height,
      whitePixels,
      blackPixels
    };
    
    // Step 2: Test preprocessing
    console.log('\n🔄 Step 2: Preprocessing');
    const { sandboxPreprocess } = await import('./sandbox.js');
    const preprocessed = await sandboxPreprocess(mockImageData);
    
    const preprocessValidation = validateImageData(preprocessed);
    console.log(`   ${preprocessValidation.isOk() ? '✅' : '❌'} Preprocessed: ${preprocessValidation.details.message}`);
    console.log(`   Dimensions: ${preprocessed.width}x${preprocessed.height}`);
    
    results.preprocessing.output = {
      valid: preprocessValidation.isOk(),
      width: preprocessed.width,
      height: preprocessed.height
    };
    
    // Step 3: Test vectorization
    console.log('\n🔄 Step 3: Vectorization');
    const { sandboxVectorize } = await import('./sandbox.js');
    const vectorized = await sandboxVectorize(preprocessed, { vectorizer: 'auto' });
    
    console.log(`   ✅ Vectorized: ${vectorized.polylines?.length || 0} polylines`);
    console.log(`   Dimensions: ${vectorized.width}x${vectorized.height}`);
    
    if (vectorized.polylines && vectorized.polylines.length > 0) {
      const samplePolyline = vectorized.polylines[0];
      console.log(`   Sample polyline: ${samplePolyline.length} points`);
      console.log(`   First 3 points:`, samplePolyline.slice(0, 3));
    } else {
      console.warn('   ⚠️ No polylines generated');
    }
    
    results.vectorization = {
      polylineCount: vectorized.polylines?.length || 0,
      width: vectorized.width,
      height: vectorized.height,
      hasPolylines: (vectorized.polylines?.length || 0) > 0
    };
    
    // Step 4: Test topology
    console.log('\n🔄 Step 4: Topology Processing');
    const { sandboxTopology } = await import('./sandbox.js');
    const topology = await sandboxTopology(vectorized, { aiClean: false });
    
    const topologyValidation = validateTopology(topology);
    console.log(`   ${topologyValidation.isOk() ? '✅' : '⚠️'} Topology: ${topologyValidation.details.message}`);
    console.log(`   Walls: ${topology.walls?.length || 0}`);
    console.log(`   Rooms: ${topology.rooms?.length || 0}`);
    console.log(`   Openings: ${topology.openings?.length || 0}`);
    
    if (topology.walls && topology.walls.length > 0) {
      const sampleWall = topology.walls[0];
      console.log(`   Sample wall:`, {
        start: sampleWall.start,
        end: sampleWall.end,
        thickness: sampleWall.thickness
      });
    }
    
    results.topology = {
      valid: topologyValidation.isOk(),
      wallCount: topology.walls?.length || 0,
      roomCount: topology.rooms?.length || 0,
      openingCount: topology.openings?.length || 0,
      validation: topologyValidation
    };
    
    // Step 5: Test rendering (if Paper.js available)
    console.log('\n🔄 Step 5: Rendering');
    if (typeof paper !== 'undefined') {
      const container = document.createElement('div');
      container.id = 'test-container';
      document.body.appendChild(container);
      
      const { sandboxRenderAxon } = await import('./sandbox.js');
      const canvas = await sandboxRenderAxon(container, topology, null);
      
      console.log(`   ✅ Canvas created: ${canvas.width}x${canvas.height}`);
      console.log(`   In DOM: ${canvas.parentNode !== null}`);
      
      results.rendering = {
        success: true,
        width: canvas.width,
        height: canvas.height,
        inDOM: canvas.parentNode !== null
      };
      
      // Cleanup
      document.body.removeChild(container);
    } else {
      console.warn('   ⚠️ Paper.js not available, skipping rendering test');
      results.rendering = {
        success: false,
        reason: 'Paper.js not available'
      };
    }
    
  } catch (error) {
    console.error('❌ Error in mock data flow test:', error);
    results.errors.push({
      step: 'unknown',
      error: error.message,
      stack: error.stack
    });
  }
  
  // Summary
  console.log('\n📊 Test Summary');
  console.log('═'.repeat(60));
  console.log('Preprocessing:', results.preprocessing?.valid ? '✅' : '❌', results.preprocessing);
  console.log('Vectorization:', results.vectorization?.hasPolylines ? '✅' : '❌', results.vectorization);
  console.log('Topology:', results.topology?.wallCount > 0 ? '✅' : '❌', results.topology);
  console.log('Rendering:', results.rendering?.success ? '✅' : '❌', results.rendering);
  
  if (results.errors.length > 0) {
    console.error('Errors:', results.errors);
  }
  
  return results;
}

/**
 * Test mock paths structure
 */
export function testMockPaths() {
  console.log('🧪 Testing Mock Paths Structure');
  console.log('═'.repeat(60));
  
  // Import getMockPaths (need to access it)
  // Since it's not exported, we'll test it indirectly through vectorization
  
  const mockImageData = getMockImageData();
  console.log('Mock ImageData:', {
    width: mockImageData.width,
    height: mockImageData.height,
    dataLength: mockImageData.data.length
  });
  
  return mockImageData;
}

// Make available in browser
if (typeof window !== 'undefined') {
  window.testMockDataFlow = testMockDataFlow;
  window.testMockPaths = testMockPaths;
  console.log('🧪 Mock data test functions available:');
  console.log('   - window.testMockDataFlow()');
  console.log('   - window.testMockPaths()');
}

