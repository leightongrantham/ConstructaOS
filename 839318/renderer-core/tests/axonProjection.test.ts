/**
 * Unit tests for axonometric projection
 * Tests deterministic projection with known input/output
 */

import { describe, it, expect } from '@jest/globals';
import { projectAxon } from '../src/geometry/axonProjection.js';

describe('projectAxon', () => {
  it('should project origin (0,0,0) to (0,0)', () => {
    const result = projectAxon({ x: 0, y: 0, z: 0 });
    expect(result.x).toBeCloseTo(0, 10);
    expect(result.y).toBeCloseTo(0, 10);
  });

  it('should project point on X axis correctly', () => {
    const result = projectAxon({ x: 100, y: 0, z: 0 });
    const cos30 = Math.cos(30 * Math.PI / 180);
    const sin30 = Math.sin(30 * Math.PI / 180);
    
    expect(result.x).toBeCloseTo(100 * cos30, 10);
    expect(result.y).toBeCloseTo(100 * sin30, 10);
  });

  it('should project point on Y axis correctly', () => {
    const result = projectAxon({ x: 0, y: 100, z: 0 });
    const cos30 = Math.cos(30 * Math.PI / 180);
    const sin30 = Math.sin(30 * Math.PI / 180);
    
    expect(result.x).toBeCloseTo(-100 * cos30, 10);
    expect(result.y).toBeCloseTo(100 * sin30, 10);
  });

  it('should project point on Z axis correctly (vertical)', () => {
    const result = projectAxon({ x: 0, y: 0, z: 100 });
    expect(result.x).toBeCloseTo(0, 10);
    expect(result.y).toBeCloseTo(-100, 10); // Z goes down in screen space
  });

  it('should be deterministic (same input → same output)', () => {
    const point = { x: 123.456, y: 789.012, z: 345.678 };
    const result1 = projectAxon(point);
    const result2 = projectAxon(point);
    
    expect(result1.x).toBe(result2.x);
    expect(result1.y).toBe(result2.y);
  });

  it('should handle negative coordinates', () => {
    const result = projectAxon({ x: -100, y: -100, z: -100 });
    // Should produce valid 2D coordinates
    expect(typeof result.x).toBe('number');
    expect(typeof result.y).toBe('number');
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
  });
});

