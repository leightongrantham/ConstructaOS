/**
 * Unit tests for threshold functions
 * Note: Requires OpenCV.js to be loaded before running tests
 */

import {
  combinedThreshold,
  mergeThresholdLayers,
  otsuThresholdToImageData,
  adaptiveThresholdToImageData
} from '../src/preprocess/threshold.js';

// Simple test assertion helper
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertClose(actual, expected, tolerance = 1e-6, message = '') {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(`Assertion failed: expected ${expected}, got ${actual} (diff: ${diff})${message ? ': ' + message : ''}`);
  }
}

// Helper to create a test grayscale Mat
function createTestMat(width = 100, height = 100, value = 128) {
  const mat = new cv.Mat(height, width, cv.CV_8UC1);
  mat.data.fill(value);
  return mat;
}

// Helper to create a test Mat with gradient
function createGradientMat(width = 100, height = 100) {
  const mat = new cv.Mat(height, width, cv.CV_8UC1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = Math.floor((x / width) * 255);
      mat.data[y * width + x] = value;
    }
  }
  return mat;
}

// Helper to create a test Mat with dark and bright regions
function createBimodalMat(width = 100, height = 100) {
  const mat = new cv.Mat(height, width, cv.CV_8UC1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Left half dark, right half bright
      const value = x < width / 2 ? 50 : 200;
      mat.data[y * width + x] = value;
    }
  }
  return mat;
}

// Wait for OpenCV to load
function waitForOpenCV() {
  return new Promise((resolve) => {
    if (typeof cv !== 'undefined' && cv.Mat) {
      resolve();
    } else if (typeof Module !== 'undefined') {
      Module.onRuntimeInitialized = () => resolve();
    } else {
      const checkInterval = setInterval(() => {
        if (typeof cv !== 'undefined' && cv.Mat) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    }
  });
}

async function runTests() {
  await waitForOpenCV();
  
  console.log('OpenCV.js loaded, running threshold tests...\n');
  
  try {
    // Test mergeThresholdLayers with AND method
    console.log('Testing mergeThresholdLayers() AND...');
    const layer1 = createTestMat(50, 50, 255);
    const layer2 = createTestMat(50, 50, 255);
    const mergedAND = mergeThresholdLayers([layer1, layer2], 'AND');
    assert(mergedAND instanceof cv.Mat, 'Should return cv.Mat');
    assert(mergedAND.cols === 50 && mergedAND.rows === 50, 'Dimensions should match');
    // Both layers are all white, AND should be all white
    const allWhite = Array.from(mergedAND.data).every(v => v === 255);
    assert(allWhite, 'AND of all-white layers should be all white');
    layer1.delete();
    layer2.delete();
    mergedAND.delete();
    
    // Test mergeThresholdLayers with OR method
    console.log('Testing mergeThresholdLayers() OR...');
    const layer3 = createTestMat(50, 50, 0);
    const layer4 = createTestMat(50, 50, 255);
    const mergedOR = mergeThresholdLayers([layer3, layer4], 'OR');
    assert(mergedOR instanceof cv.Mat, 'Should return cv.Mat');
    // OR should be all white
    const orAllWhite = Array.from(mergedOR.data).every(v => v === 255);
    assert(orAllWhite, 'OR of one white layer should be all white');
    layer3.delete();
    layer4.delete();
    mergedOR.delete();
    
    // Test mergeThresholdLayers with single layer
    console.log('Testing mergeThresholdLayers() single layer...');
    const singleLayer = createTestMat(30, 40, 128);
    const mergedSingle = mergeThresholdLayers([singleLayer]);
    assert(mergedSingle instanceof cv.Mat, 'Should return cv.Mat');
    assert(mergedSingle.cols === 30 && mergedSingle.rows === 40, 'Dimensions should match');
    singleLayer.delete();
    mergedSingle.delete();
    
    // Test mergeThresholdLayers error cases
    console.log('Testing mergeThresholdLayers() error cases...');
    try {
      mergeThresholdLayers([], 'AND');
      assert(false, 'Should throw error for empty array');
    } catch (e) {
      assert(e.message.includes('At least one layer'), 'Should throw appropriate error');
    }
    
    try {
      const testLayer = createTestMat(10, 10, 255);
      mergeThresholdLayers([testLayer], 'INVALID');
      testLayer.delete();
      assert(false, 'Should throw error for invalid method');
    } catch (e) {
      assert(e.message.includes('Unknown merge method'), 'Should throw appropriate error');
    }
    console.log('✓ mergeThresholdLayers() tests passed');
    
    // Test otsuThresholdToImageData
    console.log('Testing otsuThresholdToImageData()...');
    const bimodal = createBimodalMat(80, 80);
    const otsuMask = otsuThresholdToImageData(bimodal);
    assert(otsuMask instanceof ImageData, 'Should return ImageData');
    assert(otsuMask.width === 80 && otsuMask.height === 80, 'Dimensions should match');
    // Check that it's binary (values should be 0 or 255)
    let isBinary = true;
    for (let i = 0; i < otsuMask.data.length; i += 4) {
      const r = otsuMask.data[i];
      if (r !== 0 && r !== 255) {
        isBinary = false;
        break;
      }
    }
    assert(isBinary, 'Should produce binary mask');
    bimodal.delete();
    console.log('✓ otsuThresholdToImageData() tests passed');
    
    // Test adaptiveThresholdToImageData
    console.log('Testing adaptiveThresholdToImageData()...');
    const gradient = createGradientMat(60, 60);
    const adaptiveMask = adaptiveThresholdToImageData(gradient, {
      blockSize: 11,
      C: 2
    });
    assert(adaptiveMask instanceof ImageData, 'Should return ImageData');
    assert(adaptiveMask.width === 60 && adaptiveMask.height === 60, 'Dimensions should match');
    gradient.delete();
    console.log('✓ adaptiveThresholdToImageData() tests passed');
    
    // Test combinedThreshold with Otsu only
    console.log('Testing combinedThreshold() with Otsu...');
    const testMat1 = createBimodalMat(70, 70);
    const result1 = combinedThreshold(testMat1, {
      useOtsu: true,
      useAdaptiveGaussian: false,
      useAdaptiveMean: false,
      mergeMethod: 'AND'
    });
    assert(result1.layers.length === 1, 'Should have one layer');
    assert(result1.merged instanceof cv.Mat, 'Should have merged Mat');
    assert(result1.mask instanceof ImageData, 'Should have ImageData mask');
    assert(result1.mask.width === 70 && result1.mask.height === 70, 'Mask dimensions should match');
    
    // Cleanup
    result1.layers.forEach(layer => layer.delete());
    result1.merged.delete();
    testMat1.delete();
    console.log('✓ combinedThreshold() Otsu test passed');
    
    // Test combinedThreshold with multiple methods
    console.log('Testing combinedThreshold() with multiple methods...');
    const testMat2 = createBimodalMat(60, 60);
    const result2 = combinedThreshold(testMat2, {
      useOtsu: true,
      useAdaptiveGaussian: true,
      useAdaptiveMean: false,
      mergeMethod: 'AND'
    });
    assert(result2.layers.length === 2, 'Should have two layers');
    assert(result2.merged instanceof cv.Mat, 'Should have merged Mat');
    assert(result2.mask instanceof ImageData, 'Should have ImageData mask');
    
    // Cleanup
    result2.layers.forEach(layer => layer.delete());
    result2.merged.delete();
    testMat2.delete();
    console.log('✓ combinedThreshold() multiple methods test passed');
    
    // Test combinedThreshold with OR merge
    console.log('Testing combinedThreshold() with OR merge...');
    const testMat3 = createBimodalMat(50, 50);
    const result3 = combinedThreshold(testMat3, {
      useOtsu: true,
      useAdaptiveGaussian: true,
      mergeMethod: 'OR'
    });
    assert(result3.layers.length === 2, 'Should have two layers');
    assert(result3.merged instanceof cv.Mat, 'Should have merged Mat');
    assert(result3.mask instanceof ImageData, 'Should have ImageData mask');
    
    // Cleanup
    result3.layers.forEach(layer => layer.delete());
    result3.merged.delete();
    testMat3.delete();
    console.log('✓ combinedThreshold() OR merge test passed');
    
    // Test combinedThreshold with RGB input (should convert to grayscale)
    console.log('Testing combinedThreshold() with RGB input...');
    const rgbMat = new cv.Mat(40, 40, cv.CV_8UC3);
    for (let i = 0; i < rgbMat.data.length; i += 3) {
      rgbMat.data[i] = 128;     // R
      rgbMat.data[i + 1] = 128; // G
      rgbMat.data[i + 2] = 128; // B
    }
    const result4 = combinedThreshold(rgbMat, {
      useOtsu: true,
      useAdaptiveGaussian: false,
      useAdaptiveMean: false
    });
    assert(result4.mask instanceof ImageData, 'Should handle RGB input');
    assert(result4.mask.width === 40 && result4.mask.height === 40, 'Dimensions should match');
    
    // Cleanup
    result4.layers.forEach(layer => layer.delete());
    result4.merged.delete();
    rgbMat.delete();
    console.log('✓ combinedThreshold() RGB input test passed');
    
    // Test combinedThreshold error cases
    console.log('Testing combinedThreshold() error cases...');
    const testMat4 = createTestMat(30, 30, 128);
    try {
      combinedThreshold(testMat4, {
        useOtsu: false,
        useAdaptiveGaussian: false,
        useAdaptiveMean: false
      });
      testMat4.delete();
      assert(false, 'Should throw error when all methods disabled');
    } catch (e) {
      assert(e.message.includes('At least one thresholding method'), 'Should throw appropriate error');
      testMat4.delete();
    }
    console.log('✓ combinedThreshold() error cases passed');
    
    console.log('\n✅ All threshold tests passed!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    throw error;
  }
}

// Run tests if in browser/worker context
if (typeof window !== 'undefined' || typeof self !== 'undefined') {
  runTests().catch(console.error);
}

export { runTests };

