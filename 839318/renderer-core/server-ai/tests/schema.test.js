import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Ajv from 'ajv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load schemas
const schemaFile = readFileSync(
  join(__dirname, '..', 'schemas', 'topology.schema.json'),
  'utf-8'
);
const schemas = JSON.parse(schemaFile);

const ajv = new Ajv({ allErrors: true });

// Merge definitions into input and output schemas for compilation
const inputSchemaWithDefs = {
  ...schemas.inputSchema,
  definitions: schemas.definitions
};
const outputSchemaWithDefs = {
  ...schemas.outputSchema,
  definitions: schemas.definitions
};

const validateInput = ajv.compile(inputSchemaWithDefs);
const validateOutput = ajv.compile(outputSchemaWithDefs);

// Test helper
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

// Valid input examples
const validInput1 = {
  polylines: [
    {
      points: [[0, 0], [10, 0], [10, 10], [0, 10]],
      closed: true
    },
    {
      points: [[5, 5], [15, 5], [15, 15]],
      closed: false
    }
  ],
  metadata: {
    imageSize: [1920, 1080],
    pxToMeters: 0.01
  }
};

const validInput2 = {
  polylines: [
    {
      points: [[0, 0], [100, 0]],
      closed: false
    }
  ],
  metadata: {
    imageSize: [800, 600]
    // pxToMeters is optional
  }
};

// Invalid input examples
const invalidInput1 = {
  // Missing required polylines
  metadata: {
    imageSize: [1920, 1080]
  }
};

const invalidInput2 = {
  polylines: [
    {
      points: [[0, 0]], // Too few points (min 2)
      closed: true
    }
  ],
  metadata: {
    imageSize: [1920, 1080]
  }
};

const invalidInput3 = {
  polylines: [
    {
      points: [[0, 0], [10, 0], [10, 10]],
      closed: true
    }
  ],
  metadata: {
    // Missing required imageSize
    pxToMeters: 0.01
  }
};

const invalidInput4 = {
  polylines: [
    {
      points: [[0, 0], [10, 0], [10, 10], [0, 10]],
      closed: true
    }
  ],
  metadata: {
    imageSize: [1920] // Invalid: should be [w, h]
  }
};

const invalidInput5 = {
  polylines: [
    {
      points: [[0, 0], [10, 0], [10, 10], [0, 10]],
      closed: true
    }
  ],
  metadata: {
    imageSize: [1920, 1080],
    pxToMeters: -1 // Invalid: must be > 0
  }
};

// Valid output examples
const validOutput1 = {
  walls: [
    {
      id: 'wall-1',
      start: [0, 0],
      end: [10, 0],
      thickness: 0.2,
      type: 'exterior'
    }
  ],
  rooms: [
    {
      id: 'room-1',
      polygon: [[0, 0], [10, 0], [10, 10], [0, 10]],
      area_m2: 1.0
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
      maxX: 10,
      minY: 0,
      maxY: 10
    }
  }
};

const validOutput2 = {
  walls: [],
  rooms: [],
  openings: [],
  meta: {
    scale: 0.01,
    bounds: {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0
    }
  }
};

// Invalid output examples
const invalidOutput1 = {
  // Missing required fields
  walls: [],
  rooms: []
  // Missing openings and meta
};

const invalidOutput2 = {
  walls: [
    {
      id: 'wall-1',
      start: [0, 0],
      end: [10, 0],
      thickness: 0.2
      // Missing required 'type'
    }
  ],
  rooms: [],
  openings: [],
  meta: {
    scale: 0.01,
    bounds: {
      minX: 0,
      maxX: 10,
      minY: 0,
      maxY: 10
    }
  }
};

const invalidOutput3 = {
  walls: [
    {
      id: 'wall-1',
      start: [0, 0],
      end: [10, 0],
      thickness: 0.2,
      type: 'invalid-type' // Invalid enum value
    }
  ],
  rooms: [],
  openings: [],
  meta: {
    scale: 0.01,
    bounds: {
      minX: 0,
      maxX: 10,
      minY: 0,
      maxY: 10
    }
  }
};

const invalidOutput4 = {
  walls: [],
  rooms: [
    {
      id: 'room-1',
      polygon: [[0, 0], [10, 0]], // Too few points (min 3)
      area_m2: 0
    }
  ],
  openings: [],
  meta: {
    scale: 0.01,
    bounds: {
      minX: 0,
      maxX: 10,
      minY: 0,
      maxY: 10
    }
  }
};

// Run tests
console.log('Running schema validation tests...\n');

// Input validation tests
console.log('Input Validation Tests:');
test('Valid input 1 (with pxToMeters)', () => {
  const valid = validateInput(validInput1);
  assert(valid, 'Should be valid');
  if (!valid) {
    console.error('Errors:', validateInput.errors);
  }
});

test('Valid input 2 (without pxToMeters)', () => {
  const valid = validateInput(validInput2);
  assert(valid, 'Should be valid');
  if (!valid) {
    console.error('Errors:', validateInput.errors);
  }
});

test('Invalid input 1 (missing polylines)', () => {
  const valid = validateInput(invalidInput1);
  assert(!valid, 'Should be invalid');
});

test('Invalid input 2 (too few points)', () => {
  const valid = validateInput(invalidInput2);
  assert(!valid, 'Should be invalid');
});

test('Invalid input 3 (missing imageSize)', () => {
  const valid = validateInput(invalidInput3);
  assert(!valid, 'Should be invalid');
});

test('Invalid input 4 (invalid imageSize format)', () => {
  const valid = validateInput(invalidInput4);
  assert(!valid, 'Should be invalid');
});

test('Invalid input 5 (negative pxToMeters)', () => {
  const valid = validateInput(invalidInput5);
  assert(!valid, 'Should be invalid');
});

// Output validation tests
console.log('\nOutput Validation Tests:');
test('Valid output 1 (complete)', () => {
  const valid = validateOutput(validOutput1);
  assert(valid, 'Should be valid');
  if (!valid) {
    console.error('Errors:', validateOutput.errors);
  }
});

test('Valid output 2 (empty arrays)', () => {
  const valid = validateOutput(validOutput2);
  assert(valid, 'Should be valid');
  if (!valid) {
    console.error('Errors:', validateOutput.errors);
  }
});

test('Invalid output 1 (missing required fields)', () => {
  const valid = validateOutput(invalidOutput1);
  assert(!valid, 'Should be invalid');
});

test('Invalid output 2 (missing wall type)', () => {
  const valid = validateOutput(invalidOutput2);
  assert(!valid, 'Should be invalid');
});

test('Invalid output 3 (invalid wall type enum)', () => {
  const valid = validateOutput(invalidOutput3);
  assert(!valid, 'Should be invalid');
});

test('Invalid output 4 (room with too few points)', () => {
  const valid = validateOutput(invalidOutput4);
  assert(!valid, 'Should be invalid');
});

console.log('\nAll tests passed! ✓');

