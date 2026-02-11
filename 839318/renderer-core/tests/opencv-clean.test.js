/**
 * Unit tests for OpenCV preprocessing functions
 * Note: Requires OpenCV.js to be loaded before running tests
 * In browser: <script src="opencv.js"></script>
 * In worker: importScripts('opencv.js')
 */

import {
  loadImageToMat,
  matToImageData,
  grayscale,
  removeShadows,
  adaptiveThreshold,
  deskewUsingHough,
  preprocessImage
} from '../src/preprocess/opencv-clean.js';

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

// Helper to create a test ImageData
function createTestImageData(width = 100, height = 100, color = [255, 255, 255, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = color[0];     // R
    data[i + 1] = color[1]; // G
    data[i + 2] = color[2]; // B
    data[i + 3] = color[3]; // A
  }
  return new ImageData(data, width, height);
}

// Helper to create a grayscale test Mat
function createTestMat(width = 100, height = 100, value = 128) {
  const mat = new cv.Mat(height, width, cv.CV_8UC1);
  mat.data.fill(value);
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
      // In worker or browser with script tag
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
  
  console.log('OpenCV.js loaded, running tests...\n');
  
  try {
    // Test loadImageToMat() with ImageData
    console.log('Testing loadImageToMat()...');
    const testImgData = createTestImageData(50, 50, [100, 150, 200, 255]);
    const mat = loadImageToMat(testImgData);
    assert(mat instanceof cv.Mat, 'Should return cv.Mat');
    assert(mat.cols === 50, 'Width should match');
    assert(mat.rows === 50, 'Height should match');
    assert(mat.channels() === 3, 'Should be RGB (3 channels)');
    mat.delete();
    console.log('✓ loadImageToMat() tests passed');
    
    // Test matToImageData()
    console.log('Testing matToImageData()...');
    const testMat = createTestMat(30, 40, 128);
    const imgData = matToImageData(testMat);
    assert(imgData instanceof ImageData, 'Should return ImageData');
    assert(imgData.width === 30, 'Width should match');
    assert(imgData.height === 40, 'Height should match');
    testMat.delete();
    console.log('✓ matToImageData() tests passed');
    
    // Test grayscale()
    console.log('Testing grayscale()...');
    const colorMat = new cv.Mat(100, 100, cv.CV_8UC3);
    // Fill with a known color (128, 64, 32)
    for (let i = 0; i < colorMat.data.length; i += 3) {
      colorMat.data[i] = 128;     // R
      colorMat.data[i + 1] = 64;  // G
      colorMat.data[i + 2] = 32;  // B
    }
    const grayMat = grayscale(colorMat);
    assert(grayMat instanceof cv.Mat, 'Should return cv.Mat');
    assert(grayMat.channels() === 1, 'Should be grayscale (1 channel)');
    assert(grayMat.cols === 100 && grayMat.rows === 100, 'Dimensions should match');
    colorMat.delete();
    grayMat.delete();
    console.log('✓ grayscale() tests passed');
    
    // Test adaptiveThreshold()
    console.log('Testing adaptiveThreshold()...');
    const srcMat = createTestMat(100, 100, 128);
    const thresholded = adaptiveThreshold(srcMat, {
      maxValue: 255,
      blockSize: 11,
      C: 2
    });
    assert(thresholded instanceof cv.Mat, 'Should return cv.Mat');
    assert(thresholded.channels() === 1, 'Should be single channel');
    assert(thresholded.cols === 100 && thresholded.rows === 100, 'Dimensions should match');
    // Threshold should produce binary values (0 or maxValue)
    const hasBinary = Array.from(thresholded.data).every(v => v === 0 || v === 255);
    assert(hasBinary, 'Should produce binary image');
    srcMat.delete();
    thresholded.delete();
    console.log('✓ adaptiveThreshold() tests passed');
    
    // Test removeShadows()
    console.log('Testing removeShadows()...');
    const graySrc = createTestMat(100, 100, 200);
    // Create a darker region (shadow simulation)
    for (let i = 0; i < graySrc.rows; i++) {
      for (let j = 0; j < graySrc.cols; j++) {
        if (i > 30 && i < 70 && j > 30 && j < 70) {
          graySrc.data[i * graySrc.cols + j] = 100; // Darker region
        }
      }
    }
    const noShadow = removeShadows(graySrc, { kernelSize: 21 });
    assert(noShadow instanceof cv.Mat, 'Should return cv.Mat');
    assert(noShadow.cols === 100 && noShadow.rows === 100, 'Dimensions should match');
    graySrc.delete();
    noShadow.delete();
    console.log('✓ removeShadows() tests passed');
    
    // Test deskewUsingHough()
    console.log('Testing deskewUsingHough()...');
    // Create a test image with horizontal lines (skewed would have angled lines)
    const testDeskew = new cv.Mat(200, 200, cv.CV_8UC1, new cv.Scalar(255));
    // Draw some horizontal lines
    for (let i = 0; i < 200; i += 20) {
      cv.line(testDeskew, new cv.Point(0, i), new cv.Point(200, i), new cv.Scalar(0), 2);
    }
    const result = deskewUsingHough(testDeskew, {
      minAngle: -45,
      maxAngle: 45,
      angleStep: 0.5
    });
    assert(result.mat instanceof cv.Mat, 'Should return object with mat property');
    assert(typeof result.angle === 'number', 'Should return angle');
    assert(Math.abs(result.angle) <= 45, 'Angle should be within range');
    assert(result.mat.cols === 200 && result.mat.rows === 200, 'Dimensions should match');
    testDeskew.delete();
    result.mat.delete();
    console.log('✓ deskewUsingHough() tests passed');
    
    // Test preprocessImage() pipeline
    console.log('Testing preprocessImage()...');
    const pipelineImg = createTestImageData(80, 80);
    const processed = preprocessImage(pipelineImg, {
      removeShadows: false,
      adaptiveThreshold: true,
      deskew: false
    });
    assert(processed instanceof cv.Mat, 'Should return cv.Mat');
    assert(processed.channels() === 1, 'Should be grayscale/binary');
    processed.delete();
    console.log('✓ preprocessImage() tests passed');
    
    console.log('\n✅ All OpenCV preprocessing tests passed!');
    
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

