import { validateGeometry, repairGeometry } from '../lib/validator.js';

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

console.log('Running validator tests...\n');

// Valid geometry example
const validGeometry = {
  walls: [
    {
      id: 'wall-1',
      start: [0, 0],
      end: [10, 0],
      thickness: 0.25,
      type: 'exterior'
    },
    {
      id: 'wall-2',
      start: [10, 0],
      end: [10, 8],
      thickness: 0.25,
      type: 'exterior'
    }
  ],
  rooms: [
    {
      id: 'room-1',
      polygon: [[0, 0], [10, 0], [10, 8], [0, 8], [0, 0]],
      area_m2: 80
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
      maxY: 8
    }
  }
};

// Invalid geometries for testing
const geometryWithInvalidWall = {
  walls: [
    {
      id: 'wall-1',
      start: [0, 0],
      end: [100, 100], // Out of bounds
      thickness: 0.25,
      type: 'exterior'
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

const geometryWithNonNumericWall = {
  walls: [
    {
      id: 'wall-1',
      start: ['invalid', 0], // Non-numeric
      end: [10, 0],
      thickness: 0.25,
      type: 'exterior'
    }
  ],
  rooms: [],
  openings: [],
  meta: {
    scale: 0.01,
    bounds: { minX: 0, maxX: 10, minY: 0, maxY: 10 }
  }
};

const geometryWithUnclosedRoom = {
  walls: [],
  rooms: [
    {
      id: 'room-1',
      polygon: [[0, 0], [10, 0], [10, 8], [0, 8]], // Not closed (missing last point)
      area_m2: 80
    }
  ],
  openings: [],
  meta: {
    scale: 0.01,
    bounds: { minX: 0, maxX: 10, minY: 0, maxY: 8 }
  }
};

const geometryWithZeroAreaRoom = {
  walls: [],
  rooms: [
    {
      id: 'room-1',
      polygon: [[0, 0], [10, 0], [10, 0], [0, 0]], // Degenerate (zero area)
      area_m2: 0
    }
  ],
  openings: [],
  meta: {
    scale: 0.01,
    bounds: { minX: 0, maxX: 10, minY: 0, maxY: 10 }
  }
};

const geometryWithInvalidOpening = {
  walls: [
    {
      id: 'wall-1',
      start: [0, 0],
      end: [10, 0],
      thickness: 0.25,
      type: 'exterior'
    }
  ],
  rooms: [],
  openings: [
    {
      id: 'opening-1',
      wallId: 'wall-nonexistent', // References non-existent wall
      type: 'door',
      position: 0.5
    }
  ],
  meta: {
    scale: 0.01,
    bounds: { minX: 0, maxX: 10, minY: 0, maxY: 10 }
  }
};

const geometryWithoutScale = {
  walls: [],
  rooms: [],
  openings: [],
  meta: {
    bounds: { minX: 0, maxX: 10, minY: 0, maxY: 10 }
    // Missing scale
  }
};

const geometryWithDuplicatePoints = {
  walls: [],
  rooms: [
    {
      id: 'room-1',
      polygon: [[0, 0], [0, 0], [10, 0], [10, 8], [0, 8], [0, 0]], // Duplicate at start
      area_m2: 80
    }
  ],
  openings: [],
  meta: {
    scale: 0.01,
    bounds: { minX: 0, maxX: 10, minY: 0, maxY: 8 }
  }
};

const geometryWithShortWall = {
  walls: [
    {
      id: 'wall-1',
      start: [0, 0],
      end: [0.01, 0], // Very short wall (1cm)
      thickness: 0.25,
      type: 'exterior'
    },
    {
      id: 'wall-2',
      start: [0, 0],
      end: [10, 0], // Normal wall
      thickness: 0.25,
      type: 'exterior'
    }
  ],
  rooms: [],
  openings: [],
  meta: {
    scale: 0.01,
    bounds: { minX: 0, maxX: 10, minY: 0, maxY: 10 }
  }
};

const geometryWithAlmostClosedPolygon = {
  walls: [],
  rooms: [
    {
      id: 'room-1',
      polygon: [[0, 0], [10, 0], [10, 8], [0, 8.01]], // Almost closed (1cm gap)
      area_m2: 80
    }
  ],
  openings: [],
  meta: {
    scale: 0.01,
    bounds: { minX: 0, maxX: 10, minY: 0, maxY: 8.01 }
  }
};

// Validation tests
console.log('Validation Tests:');

test('Valid geometry passes validation', () => {
  const result = validateGeometry(validGeometry);
  assert(result.valid === true, 'Valid geometry should pass');
  assert(result.errors.length === 0, 'Should have no errors');
});

test('Invalid wall (out of bounds) fails validation', () => {
  const result = validateGeometry(geometryWithInvalidWall);
  assert(result.valid === false, 'Should fail validation');
  assert(result.errors.length > 0, 'Should have errors');
  assert(
    result.errors.some(e => e.path.includes('wall') && e.message.includes('bounds')),
    'Should have bounds error'
  );
});

test('Invalid wall (non-numeric) fails validation', () => {
  const result = validateGeometry(geometryWithNonNumericWall);
  assert(result.valid === false, 'Should fail validation');
  assert(
    result.errors.some(e => e.path.includes('start') || e.path.includes('end')),
    'Should have point validation error'
  );
});

test('Unclosed room polygon fails validation', () => {
  const result = validateGeometry(geometryWithUnclosedRoom);
  assert(result.valid === false, 'Should fail validation');
  assert(
    result.errors.some(e => e.message.includes('closed')),
    'Should have closed polygon error'
  );
});

test('Zero area room fails validation', () => {
  const result = validateGeometry(geometryWithZeroAreaRoom);
  assert(result.valid === false, 'Should fail validation');
  assert(
    result.errors.some(e => e.message.includes('area')),
    'Should have area error'
  );
});

test('Opening with invalid wallId fails validation', () => {
  const result = validateGeometry(geometryWithInvalidOpening);
  assert(result.valid === false, 'Should fail validation');
  assert(
    result.errors.some(e => e.message.includes('wallId') || e.message.includes('non-existent')),
    'Should have wallId reference error'
  );
});

test('Missing scale fails validation', () => {
  const result = validateGeometry(geometryWithoutScale);
  assert(result.valid === false, 'Should fail validation');
  assert(
    result.errors.some(e => e.path.includes('scale')),
    'Should have scale error'
  );
});

// Repair tests
console.log('\nRepair Tests:');

test('Repair removes duplicate points', () => {
  const repaired = repairGeometry(geometryWithDuplicatePoints);
  const room = repaired.rooms[0];
  assert(room !== undefined, 'Should have room');
  
  // Check that duplicate points are removed
  const firstPoint = room.polygon[0];
  const secondPoint = room.polygon[1];
  assert(
    !(firstPoint[0] === secondPoint[0] && firstPoint[1] === secondPoint[1]),
    'Duplicate points should be removed'
  );
});

test('Repair closes almost-closed polygons', () => {
  const repaired = repairGeometry(geometryWithAlmostClosedPolygon);
  const room = repaired.rooms[0];
  assert(room !== undefined, 'Should have room');
  
  // Check that polygon is closed
  const first = room.polygon[0];
  const last = room.polygon[room.polygon.length - 1];
  const dist = Math.sqrt(
    Math.pow(last[0] - first[0], 2) + Math.pow(last[1] - first[1], 2)
  );
  assert(dist < 0.1, 'Polygon should be closed (endpoints close)');
});

test('Repair drops short walls', () => {
  const repaired = repairGeometry(geometryWithShortWall);
  assert(repaired.walls.length === 1, 'Should drop short wall');
  assert(repaired.walls[0].id === 'wall-2', 'Should keep normal wall');
});

test('Repair fixes missing scale', () => {
  const repaired = repairGeometry(geometryWithoutScale);
  assert(typeof repaired.meta.scale === 'number', 'Should have scale');
  assert(repaired.meta.scale > 0, 'Scale should be positive');
});

test('Repair removes openings with invalid wallId', () => {
  const repaired = repairGeometry(geometryWithInvalidOpening);
  assert(repaired.openings.length === 0, 'Should remove invalid opening');
});

test('Repair fixes zero area rooms', () => {
  const repaired = repairGeometry(geometryWithZeroAreaRoom);
  assert(repaired.rooms.length === 0, 'Should drop zero area room');
});

test('Repair maintains valid geometry structure', () => {
  const repaired = repairGeometry(validGeometry);
  assert(Array.isArray(repaired.walls), 'Should have walls array');
  assert(Array.isArray(repaired.rooms), 'Should have rooms array');
  assert(Array.isArray(repaired.openings), 'Should have openings array');
  assert(repaired.meta !== undefined, 'Should have meta');
  assert(repaired.meta.scale > 0, 'Should have valid scale');
  assert(repaired.meta.bounds !== undefined, 'Should have bounds');
});

test('Repair handles empty geometry', () => {
  const empty = { walls: [], rooms: [], openings: [], meta: { scale: 0.01, bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 } } };
  const repaired = repairGeometry(empty);
  assert(repaired.walls.length === 0, 'Should handle empty walls');
  assert(repaired.rooms.length === 0, 'Should handle empty rooms');
  assert(repaired.openings.length === 0, 'Should handle empty openings');
});

test('Repair fixes invalid wall types', () => {
  const geometry = {
    walls: [
      {
        id: 'wall-1',
        start: [0, 0],
        end: [10, 0],
        thickness: 0.25,
        type: 'invalid-type' // Invalid type
      }
    ],
    rooms: [],
    openings: [],
    meta: {
      scale: 0.01,
      bounds: { minX: 0, maxX: 10, minY: 0, maxY: 10 }
    }
  };
  
  const repaired = repairGeometry(geometry);
  assert(repaired.walls.length === 1, 'Should keep wall');
  assert(repaired.walls[0].type === 'interior', 'Should default to interior type');
});

test('Repair fixes invalid opening types', () => {
  const geometry = {
    walls: [
      {
        id: 'wall-1',
        start: [0, 0],
        end: [10, 0],
        thickness: 0.25,
        type: 'exterior'
      }
    ],
    rooms: [],
    openings: [
      {
        id: 'opening-1',
        wallId: 'wall-1',
        type: 'invalid-type', // Invalid type
        position: 0.5
      }
    ],
    meta: {
      scale: 0.01,
      bounds: { minX: 0, maxX: 10, minY: 0, maxY: 10 }
    }
  };
  
  const repaired = repairGeometry(geometry);
  assert(repaired.openings.length === 1, 'Should keep opening');
  assert(repaired.openings[0].type === 'opening', 'Should default to opening type');
});

test('Repair fixes opening position out of range', () => {
  const geometry = {
    walls: [
      {
        id: 'wall-1',
        start: [0, 0],
        end: [10, 0],
        thickness: 0.25,
        type: 'exterior'
      }
    ],
    rooms: [],
    openings: [
      {
        id: 'opening-1',
        wallId: 'wall-1',
        type: 'door',
        position: 1.5 // Out of range (> 1)
      }
    ],
    meta: {
      scale: 0.01,
      bounds: { minX: 0, maxX: 10, minY: 0, maxY: 10 }
    }
  };
  
  const repaired = repairGeometry(geometry);
  assert(repaired.openings.length === 1, 'Should keep opening');
  assert(repaired.openings[0].position === 1, 'Should clamp to 1');
});

test('Repair recalculates room area', () => {
  const geometry = {
    walls: [],
    rooms: [
      {
        id: 'room-1',
        polygon: [[0, 0], [10, 0], [10, 8], [0, 8], [0, 0]],
        area_m2: 999 // Wrong area
      }
    ],
    openings: [],
    meta: {
      scale: 0.01,
      bounds: { minX: 0, maxX: 10, minY: 0, maxY: 8 }
    }
  };
  
  const repaired = repairGeometry(geometry);
  assert(repaired.rooms.length === 1, 'Should have room');
  // Area should be recalculated (10 * 8 = 80)
  assert(Math.abs(repaired.rooms[0].area_m2 - 80) < 0.1, 'Should recalculate area');
});

console.log('\nAll tests passed! ✓');

