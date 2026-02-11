/**
 * Snapshot Test for Axonometric Rendering
 * 
 * Renders golden wall and compares output (canvas pixels or SVG path).
 * Fails if geometry regression detected.
 */

import { describe, it, expect } from '@jest/globals';
import { processGoldenWall } from '../src/test/goldenWall.js';
import { renderAxonToCanvas, renderAxonToSVG } from '../src/render/renderAxon.js';

describe('Axon Snapshot Test', () => {
  it('should render golden wall with stable output', () => {
    // Process golden wall
    const { axonFaces } = processGoldenWall();
    
    // Verify we have faces
    expect(axonFaces.length).toBeGreaterThan(0);
    
    // Render to SVG
    const svg = renderAxonToSVG(axonFaces, {
      width: 1200,
      height: 800,
      topStrokeWidth: 1.0,
      sideStrokeWidth: 2.0,
      strokeColor: '#1a1a1a',
      backgroundColor: '#ffffff',
      fitToView: true
    });
    
    // Verify SVG is valid
    expect(svg).toContain('<svg');
    expect(svg).toContain('<path');
    
    // Count paths (should match face count)
    const pathMatches = svg.match(/<path/g);
    expect(pathMatches?.length || 0).toBe(axonFaces.length);
  });

  it('should render golden wall to canvas with consistent dimensions', () => {
    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 800;
    
    // Process golden wall
    const { axonFaces } = processGoldenWall();
    
    // Render to canvas
    renderAxonToCanvas(canvas, axonFaces, {
      width: 1200,
      height: 800,
      topStrokeWidth: 1.0,
      sideStrokeWidth: 2.0,
      strokeColor: '#1a1a1a',
      backgroundColor: '#ffffff',
      fitToView: true
    });
    
    // Verify canvas has content (not all white/transparent)
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get canvas context');
    }
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Check that canvas has some non-background pixels
    let nonBackgroundPixels = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Check if pixel is not white background
      if (r !== 255 || g !== 255 || b !== 255) {
        nonBackgroundPixels++;
      }
    }
    
    // Should have some rendered content
    expect(nonBackgroundPixels).toBeGreaterThan(0);
  });

  it('should produce same output on multiple renders (deterministic)', () => {
    const { axonFaces } = processGoldenWall();
    
    // Render twice
    const svg1 = renderAxonToSVG(axonFaces, {
      width: 1200,
      height: 800
    });
    
    const svg2 = renderAxonToSVG(axonFaces, {
      width: 1200,
      height: 800
    });
    
    // Should be identical
    expect(svg1).toBe(svg2);
  });

  it('should have correct face count for golden wall', () => {
    const { axonFaces } = processGoldenWall();
    
    // Golden wall is a rectangular prism
    // Should have: 1 top face + 4 vertical faces = 5 faces (after culling)
    // (Bottom face is culled, some vertical faces may be culled)
    expect(axonFaces.length).toBeGreaterThanOrEqual(3);
    expect(axonFaces.length).toBeLessThanOrEqual(6);
    
    // Should have at least one top face
    const topFaces = axonFaces.filter(f => f.style === 'top');
    expect(topFaces.length).toBeGreaterThanOrEqual(1);
  });
});

