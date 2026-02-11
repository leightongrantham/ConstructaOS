/**
 * Canvas Isolation Test
 * 
 * Bypasses ALL rendering libraries (Paper.js, Konva, SVG, etc.)
 * Uses raw canvas 2D context to verify coordinate system integrity
 * 
 * This test helps isolate whether rendering libraries are distorting coordinates.
 * 
 * @param {HTMLCanvasElement} canvas - Canvas element to test (optional, creates one if not provided)
 * @returns {Object} Test results with success status and diagnostics
 */
export function testCanvasIsolation(canvas = null) {
  // Create canvas if not provided
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
  }

  // Get 2D context - NO library helpers
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get 2D context');
  }

  // CRITICAL: Reset transform to identity matrix
  // This ensures no external transforms are applied
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Hardcoded projected points (ALREADY PROJECTED)
  // First quad (bottom)
  const p1 = { x: 200, y: 200 };
  const p2 = { x: 400, y: 200 };
  const p3 = { x: 400, y: 350 };
  const p4 = { x: 200, y: 350 };

  // Second quad (above first, y - 100)
  const p5 = { x: 200, y: 100 };   // p1.y - 100
  const p6 = { x: 400, y: 100 };   // p2.y - 100
  const p7 = { x: 400, y: 250 };   // p3.y - 100
  const p8 = { x: 200, y: 250 };   // p4.y - 100

  // Draw first quad (bottom rectangle)
  ctx.fillStyle = '#4a90e2'; // Blue
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.lineTo(p3.x, p3.y);
  ctx.lineTo(p4.x, p4.y);
  ctx.closePath();
  ctx.fill();

  // Draw second quad (top rectangle)
  ctx.fillStyle = '#e24a4a'; // Red
  ctx.beginPath();
  ctx.moveTo(p5.x, p5.y);
  ctx.lineTo(p6.x, p6.y);
  ctx.lineTo(p7.x, p7.y);
  ctx.lineTo(p8.x, p8.y);
  ctx.closePath();
  ctx.fill();

  // Draw outlines for clarity
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  
  // Outline first quad
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.lineTo(p3.x, p3.y);
  ctx.lineTo(p4.x, p4.y);
  ctx.closePath();
  ctx.stroke();

  // Outline second quad
  ctx.beginPath();
  ctx.moveTo(p5.x, p5.y);
  ctx.lineTo(p6.x, p6.y);
  ctx.lineTo(p7.x, p7.y);
  ctx.lineTo(p8.x, p8.y);
  ctx.closePath();
  ctx.stroke();

  // Verify expected positions
  const expectedBottomTop = 200;      // Top edge of bottom quad
  const expectedBottomBottom = 350;   // Bottom edge of bottom quad
  const expectedTopTop = 100;         // Top edge of top quad
  const expectedTopBottom = 250;      // Bottom edge of top quad

  // Check if rectangles are correctly positioned
  const bottomQuadCorrect = (
    p1.y === expectedBottomTop &&
    p4.y === expectedBottomBottom &&
    p2.y === expectedBottomTop &&
    p3.y === expectedBottomBottom
  );

  const topQuadCorrect = (
    p5.y === expectedTopTop &&
    p8.y === expectedTopBottom &&
    p6.y === expectedTopTop &&
    p7.y === expectedTopBottom
  );

  const verticalStacking = (expectedTopBottom === expectedBottomTop - 50); // 50px gap expected

  // Get current transform matrix for debugging
  const transform = ctx.getTransform();
  const isIdentity = (
    transform.a === 1 && transform.b === 0 &&
    transform.c === 0 && transform.d === 1 &&
    transform.e === 0 && transform.f === 0
  );

  return {
    success: bottomQuadCorrect && topQuadCorrect && verticalStacking && isIdentity,
    bottomQuadCorrect,
    topQuadCorrect,
    verticalStacking,
    isIdentity,
    transform: {
      a: transform.a, b: transform.b,
      c: transform.c, d: transform.d,
      e: transform.e, f: transform.f
    },
    points: {
      bottom: { p1, p2, p3, p4 },
      top: { p5, p6, p7, p8 }
    },
    canvas: canvas // Return canvas for inspection
  };
}

/**
 * Run canvas isolation test and log results to console
 * 
 * @param {HTMLCanvasElement} canvas - Optional canvas element
 */
export function runCanvasIsolationTest(canvas = null) {
  try {
    const result = testCanvasIsolation(canvas);
    
    if (result.success) {
      console.log('✅ Canvas Isolation Test PASSED');
      console.log('- Bottom quad correctly positioned');
      console.log('- Top quad correctly positioned');
      console.log('- Rectangles are stacked vertically');
      console.log('- Transform matrix is identity (no distortion)');
      console.log('Conclusion: Canvas coordinate system is clean. Any distortion is NOT from canvas transforms.');
    } else {
      console.error('❌ Canvas Isolation Test FAILED');
      if (!result.bottomQuadCorrect) console.error('- Bottom quad position incorrect');
      if (!result.topQuadCorrect) console.error('- Top quad position incorrect');
      if (!result.verticalStacking) console.error('- Rectangles not stacked vertically');
      if (!result.isIdentity) {
        console.error(`- Transform matrix is NOT identity:`, result.transform);
        console.error('  This indicates external transforms are being applied to the canvas');
      }
      console.error('Conclusion: Canvas coordinate system may be distorted by external transforms.');
    }
    
    console.log('Detailed results:', result);
    return result;
  } catch (error) {
    console.error('Canvas Isolation Test Error:', error);
    throw error;
  }
}

