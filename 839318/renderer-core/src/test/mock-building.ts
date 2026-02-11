/**
 * Hard-Coded Test Building Topology
 * 
 * Simple rectangular building for testing.
 * Used when USE_MOCK_TOPOLOGY is enabled.
 */

import type { Vec2 } from '../geometry/types.js';

/**
 * Load mock rectangular building footprint
 * 
 * @returns Building footprint polygon
 */
export function loadMockRectangularBuilding(): Vec2[] {
  // Simple 10m x 8m rectangular building
  const width = 10000;  // 10 meters
  const depth = 8000;   // 8 meters
  
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: depth },
    { x: 0, y: depth },
    { x: 0, y: 0 } // Close loop
  ];
}

