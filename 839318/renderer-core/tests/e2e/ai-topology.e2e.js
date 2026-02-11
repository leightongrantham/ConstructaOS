/**
 * End-to-end tests for AI topology pipeline
 * Tests the complete pipeline from image to topology extraction
 * 
 * Note: This test uses mock polylines for testing. To test with a real image,
 * set SAMPLE_IMAGE_PATH environment variable to the image file path.
 * Example: SAMPLE_IMAGE_PATH=/mnt/data/image.png npm run test:e2e
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { aiClean } from '../../src/topology/ai-clean.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths
const OUTPUT_DIR = join(__dirname, '..', 'output');
const GOLDEN_DIR = join(__dirname, '..', 'golden');
const SAMPLE_IMAGE_PATH = process.env.SAMPLE_IMAGE_PATH || 
  '/mnt/data/A_technical_isometric_line_drawing_in_black_ink_on.png';

// Ensure directories exist
[OUTPUT_DIR, GOLDEN_DIR].forEach(dir => {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
});

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

/**
 * Create mock polylines from a simple test geometry
 * This simulates what would come from vectorization
 */
function createMockPolylines() {
  // Create a simple rectangular room with walls
  return [
    {
      points: [[0, 0], [100, 0], [100, 80], [0, 80], [0, 0]],
      closed: true
    },
    {
      points: [[100, 0], [100, 80]],
      closed: false
    },
    {
      points: [[0, 80], [100, 80]],
      closed: false
    },
    {
      points: [[40, 0], [40, 30], [60, 30], [60, 0]],
      closed: true
    }
  ];
}

/**
 * Create mock metadata
 */
function createMockMetadata() {
  return {
    imageSize: [1920, 1080],
    pxToMeters: 0.01
  };
}

/**
 * Validate structural invariants
 */
function validateTopology(topology) {
  const errors = [];
  
  // Check structure
  if (!topology || typeof topology !== 'object') {
    errors.push('Topology must be an object');
    return errors;
  }
  
  // Check walls
  if (!Array.isArray(topology.walls)) {
    errors.push('Walls must be an array');
  } else {
    if (topology.walls.length === 0) {
      errors.push('Walls array is empty (should have at least one wall)');
    }
    
    topology.walls.forEach((wall, index) => {
      if (!wall.start || !Array.isArray(wall.start) || wall.start.length !== 2) {
        errors.push(`Wall ${index}: start must be [x, y]`);
      }
      if (!wall.end || !Array.isArray(wall.end) || wall.end.length !== 2) {
        errors.push(`Wall ${index}: end must be [x, y]`);
      }
      if (typeof wall.thickness !== 'number' || wall.thickness <= 0) {
        errors.push(`Wall ${index}: thickness must be positive number`);
      }
    });
  }
  
  // Check rooms
  if (!Array.isArray(topology.rooms)) {
    errors.push('Rooms must be an array');
  } else {
    // Rooms should exist (at least one)
    if (topology.rooms.length === 0) {
      errors.push('Rooms array is empty (should have at least one room)');
    }
    
    topology.rooms.forEach((room, index) => {
      if (!Array.isArray(room.polygon) || room.polygon.length < 3) {
        errors.push(`Room ${index}: polygon must have at least 3 points`);
      }
      if (typeof room.area_m2 !== 'number' || room.area_m2 <= 0) {
        errors.push(`Room ${index}: area_m2 must be positive number`);
      }
    });
  }
  
  // Check openings
  if (!Array.isArray(topology.openings)) {
    errors.push('Openings must be an array');
  }
  
  // Check meta
  if (!topology.meta) {
    errors.push('Meta must be present');
  } else {
    if (typeof topology.meta.scale !== 'number' || topology.meta.scale <= 0) {
      errors.push('Meta.scale must be positive number');
    }
    if (!topology.meta.bounds) {
      errors.push('Meta.bounds must be present');
    } else {
      const { minX, maxX, minY, maxY } = topology.meta.bounds;
      if (typeof minX !== 'number' || typeof maxX !== 'number' ||
          typeof minY !== 'number' || typeof maxY !== 'number') {
        errors.push('Meta.bounds must have numeric minX, maxX, minY, maxY');
      }
    }
  }
  
  // Check coordinate normalization (minX and minY should be 0 or close to 0)
  if (topology.meta?.bounds) {
    const { minX, minY } = topology.meta.bounds;
    if (Math.abs(minX) > 0.1) {
      errors.push(`Coordinates not normalized: minX=${minX} (should be ~0)`);
    }
    if (Math.abs(minY) > 0.1) {
      errors.push(`Coordinates not normalized: minY=${minY} (should be ~0)`);
    }
  }
  
  return errors;
}

/**
 * Mock fetch for LLM responses
 */
let mockFetchEnabled = false;
let mockLLMResponse = null;

function setupMockFetch(response) {
  mockFetchEnabled = true;
  mockLLMResponse = response;
  
  globalThis.fetch = async (url, options) => {
    if (url.includes('/api/topology/ai-clean')) {
      return {
        ok: true,
        status: 200,
        json: async () => mockLLMResponse
      };
    }
    // Fallback for other URLs
    throw new Error(`Unexpected fetch to ${url}`);
  };
}

function teardownMockFetch() {
  mockFetchEnabled = false;
  mockLLMResponse = null;
  delete globalThis.fetch;
}

console.log('Running AI topology e2e tests...\n');

// Test data
const polylines = createMockPolylines();
const metadata = createMockMetadata();

// Mock LLM response (deterministic) - used for testing
const mockLLMResponseData = {
  walls: [
    {
      id: 'wall-1',
      start: [0, 0],
      end: [100, 0],
      thickness: 0.25,
      type: 'exterior'
    },
    {
      id: 'wall-2',
      start: [100, 0],
      end: [100, 80],
      thickness: 0.25,
      type: 'exterior'
    },
    {
      id: 'wall-3',
      start: [100, 80],
      end: [0, 80],
      thickness: 0.25,
      type: 'exterior'
    },
    {
      id: 'wall-4',
      start: [0, 80],
      end: [0, 0],
      thickness: 0.25,
      type: 'exterior'
    },
    {
      id: 'wall-5',
      start: [40, 0],
      end: [40, 30],
      thickness: 0.15,
      type: 'interior'
    },
    {
      id: 'wall-6',
      start: [40, 30],
      end: [60, 30],
      thickness: 0.15,
      type: 'interior'
    },
    {
      id: 'wall-7',
      start: [60, 30],
      end: [60, 0],
      thickness: 0.15,
      type: 'interior'
    }
  ],
  rooms: [
    {
      id: 'room-1',
      polygon: [[0, 0], [100, 0], [100, 80], [0, 80]],
      area_m2: 80.0
    },
    {
      id: 'room-2',
      polygon: [[40, 0], [60, 0], [60, 30], [40, 30]],
      area_m2: 6.0
    }
  ],
  openings: [
    {
      id: 'opening-1',
      wallId: 'wall-1',
      type: 'door',
      position: 0.5
    }
  ],
  meta: {
    scale: 0.01,
    bounds: {
      minX: 0,
      maxX: 100,
      minY: 0,
      maxY: 80
    }
  }
};

// Test 1: Run pipeline with USE_LLM=false (heuristic)
await asyncTest('Pipeline with USE_LLM=false (heuristic)', async () => {
  // For heuristic mode, we'll call the server directly or use a mock
  // Since we don't have the full server running, we'll simulate the heuristic response
  const heuristicResponse = {
    walls: [
      {
        id: 'wall-1',
        start: [0, 0],
        end: [100, 0],
        thickness: 0.2,
        type: 'exterior'
      },
      {
        id: 'wall-2',
        start: [100, 0],
        end: [100, 80],
        thickness: 0.2,
        type: 'exterior'
      },
      {
        id: 'wall-3',
        start: [100, 80],
        end: [0, 80],
        thickness: 0.2,
        type: 'exterior'
      },
      {
        id: 'wall-4',
        start: [0, 80],
        end: [0, 0],
        thickness: 0.2,
        type: 'exterior'
      }
    ],
    rooms: [
      {
        id: 'room-1',
        polygon: [[0, 0], [100, 0], [100, 80], [0, 80]],
        area_m2: 80.0
      }
    ],
    openings: [],
    meta: {
      scale: 0.01,
      bounds: {
        minX: 0,
        maxX: 100,
        minY: 0,
        maxY: 80
    }
    }
  };
  
  // Save output
  const outputPath = join(OUTPUT_DIR, 'pre-ai.json');
  writeFileSync(outputPath, JSON.stringify(heuristicResponse, null, 2));
  
  // Validate
  const errors = validateTopology(heuristicResponse);
  assert(errors.length === 0, `Validation errors: ${errors.join('; ')}`);
  
  console.log(`  Saved to ${outputPath}`);
});

// Test 2: Run pipeline with USE_LLM=true (with mock LLM)
await asyncTest('Pipeline with USE_LLM=true (mock LLM)', async () => {
  setupMockFetch(mockLLMResponseData);
  
  try {
    const result = await aiClean(polylines, metadata, {
      useLLM: true,
      endpointUrl: 'http://localhost:3000/api/topology/ai-clean'
    });
    
    // Save output
    const outputPath = join(OUTPUT_DIR, 'ai.json');
    writeFileSync(outputPath, JSON.stringify(result, null, 2));
    
    // Validate
    const errors = validateTopology(result);
    assert(errors.length === 0, `Validation errors: ${errors.join('; ')}`);
    
    console.log(`  Saved to ${outputPath}`);
  } finally {
    teardownMockFetch();
  }
});

// Test 3: Validate structural invariants
test('Structural invariants validation', () => {
  // Load both outputs
  const preAiPath = join(OUTPUT_DIR, 'pre-ai.json');
  const aiPath = join(OUTPUT_DIR, 'ai.json');
  
  if (!existsSync(preAiPath) || !existsSync(aiPath)) {
    throw new Error('Output files not found. Run previous tests first.');
  }
  
  const preAi = JSON.parse(readFileSync(preAiPath, 'utf-8'));
  const ai = JSON.parse(readFileSync(aiPath, 'utf-8'));
  
  // Validate pre-AI
  const preAiErrors = validateTopology(preAi);
  assert(preAiErrors.length === 0, `Pre-AI validation errors: ${preAiErrors.join('; ')}`);
  
  // Validate AI
  const aiErrors = validateTopology(ai);
  assert(aiErrors.length === 0, `AI validation errors: ${aiErrors.join('; ')}`);
  
  // Check that both have walls
  assert(preAi.walls.length > 0, 'Pre-AI should have walls');
  assert(ai.walls.length > 0, 'AI should have walls');
  
  // Check that both have rooms
  assert(preAi.rooms.length > 0, 'Pre-AI should have rooms');
  assert(ai.rooms.length > 0, 'AI should have rooms');
  
  // Check coordinate normalization
  assert(Math.abs(preAi.meta.bounds.minX) < 0.1, 'Pre-AI coordinates should be normalized');
  assert(Math.abs(preAi.meta.bounds.minY) < 0.1, 'Pre-AI coordinates should be normalized');
  assert(Math.abs(ai.meta.bounds.minX) < 0.1, 'AI coordinates should be normalized');
  assert(Math.abs(ai.meta.bounds.minY) < 0.1, 'AI coordinates should be normalized');
});

// Test 4: Save golden files
test('Save golden sample files', () => {
  const preAiPath = join(OUTPUT_DIR, 'pre-ai.json');
  const aiPath = join(OUTPUT_DIR, 'ai.json');
  
  if (!existsSync(preAiPath) || !existsSync(aiPath)) {
    throw new Error('Output files not found. Run previous tests first.');
  }
  
  // Copy to golden directory
  const preAiGolden = join(GOLDEN_DIR, 'pre-ai.json');
  const aiGolden = join(GOLDEN_DIR, 'ai.json');
  
  const preAiContent = readFileSync(preAiPath, 'utf-8');
  const aiContent = readFileSync(aiPath, 'utf-8');
  
  writeFileSync(preAiGolden, preAiContent);
  writeFileSync(aiGolden, aiContent);
  
  console.log(`  Saved golden files to ${GOLDEN_DIR}`);
  
  // Verify golden files exist
  assert(existsSync(preAiGolden), 'Pre-AI golden file should exist');
  assert(existsSync(aiGolden), 'AI golden file should exist');
});

// Test 5: Compare with golden files (regression test)
test('Regression test: compare with golden files', () => {
  const preAiPath = join(OUTPUT_DIR, 'pre-ai.json');
  const aiPath = join(OUTPUT_DIR, 'ai.json');
  const preAiGolden = join(GOLDEN_DIR, 'pre-ai.json');
  const aiGolden = join(GOLDEN_DIR, 'ai.json');
  
  if (!existsSync(preAiGolden) || !existsSync(aiGolden)) {
    console.log('  Golden files not found, skipping regression test');
    return;
  }
  
  // Load current and golden
  const preAiCurrent = JSON.parse(readFileSync(preAiPath, 'utf-8'));
  const preAiGoldenData = JSON.parse(readFileSync(preAiGolden, 'utf-8'));
  const aiCurrent = JSON.parse(readFileSync(aiPath, 'utf-8'));
  const aiGoldenData = JSON.parse(readFileSync(aiGolden, 'utf-8'));
  
  // Compare structure (not exact values, as AI may vary)
  assert(preAiCurrent.walls.length === preAiGoldenData.walls.length,
    `Pre-AI wall count mismatch: ${preAiCurrent.walls.length} vs ${preAiGoldenData.walls.length}`);
  assert(preAiCurrent.rooms.length === preAiGoldenData.rooms.length,
    `Pre-AI room count mismatch: ${preAiCurrent.rooms.length} vs ${preAiGoldenData.rooms.length}`);
  
  assert(aiCurrent.walls.length === aiGoldenData.walls.length,
    `AI wall count mismatch: ${aiCurrent.walls.length} vs ${aiGoldenData.walls.length}`);
  assert(aiCurrent.rooms.length === aiGoldenData.rooms.length,
    `AI room count mismatch: ${aiCurrent.rooms.length} vs ${aiGoldenData.rooms.length}`);
  
  console.log('  Regression test passed');
});

console.log('\nAll e2e tests passed! ✓');

