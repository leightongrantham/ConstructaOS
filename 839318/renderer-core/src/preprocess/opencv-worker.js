/**
 * OpenCV.js WebWorker for image preprocessing
 * Handles heavy image processing tasks off the main thread
 * 
 * Usage: Load OpenCV.js first, then post messages with ImageData
 * 
 * Message format:
 * {
 *   type: 'preprocess' | 'load-opencv',
 *   imageData: ImageData (for preprocess),
 *   opencvUrl: string (for load-opencv),
 *   options: { ... }
 * }
 * 
 * Response format:
 * {
 *   type: 'preprocess-result' | 'ready' | 'error',
 *   imageData: ImageData,
 *   metadata: {
 *     deskewAngle: number,
 *     bbox: { x, y, width, height }
 *   }
 * }
 */

let opencvLoaded = false;
let opencvLoadPromise = null;

// We'll dynamically import opencv-clean.js functions after OpenCV.js loads
// They expect cv to be in global scope

/**
 * Load OpenCV.js in worker
 * ES module workers can't use importScripts(), so we use dynamic import
 * @param {string} opencvUrl - URL to opencv.js
 * @returns {Promise<void>}
 */
function loadOpenCV(opencvUrl) {
  if (opencvLoaded) {
    return Promise.resolve();
  }

  if (opencvLoadPromise) {
    return opencvLoadPromise;
  }

  opencvLoadPromise = new Promise((resolve, reject) => {
    // For ES module workers, we need to load OpenCV.js as a script
    // Since importScripts() doesn't work, we'll fetch and eval it
    // OpenCV.js from /public is served by Vite and must be loaded via fetch at runtime
    
    // Always use fetch() for OpenCV.js (don't use import() as Vite will try to process it)
    // Fetch and execute script (classic OpenCV.js UMD format)
    fetch(opencvUrl)
          .then(response => {
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            // Check content type - if HTML, likely a 404 page
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('text/html')) {
              // This is expected if OpenCV.js hasn't been downloaded yet
              // The validation below will catch it and throw a proper error
              // The client will handle the error and fall back to simple preprocessing
            } else if (!contentType.includes('javascript') && !contentType.includes('application/javascript') && !contentType.includes('text/javascript')) {
              console.warn(`OpenCV.js URL may not be JavaScript (Content-Type: ${contentType})`);
            }
            
            return response.text();
          })
          .then(scriptText => {
            // Validate that we got JavaScript, not HTML (404 page)
            if (scriptText.trim().startsWith('<')) {
              throw new Error(`OpenCV.js not found at ${opencvUrl}. This is expected if OpenCV.js hasn't been downloaded. The system will use simple preprocessing instead. To enable OpenCV features, download opencv.js: mkdir -p public && curl -o public/opencv.js https://docs.opencv.org/4.x/opencv.js`);
            }
            
            // Check for basic JavaScript indicators
            if (!scriptText.includes('function') && !scriptText.includes('var ') && !scriptText.includes('const ') && !scriptText.includes('let ')) {
              throw new Error(`Response does not appear to be JavaScript: ${opencvUrl}`);
            }
            
            // Execute script in worker context
            // OpenCV.js expects Module object for configuration
            if (!globalThis.Module) {
              globalThis.Module = {};
            }
            
            // Set up initialization handler
            const originalOnRuntimeInitialized = globalThis.Module.onRuntimeInitialized;
            globalThis.Module.onRuntimeInitialized = () => {
              if (originalOnRuntimeInitialized) {
                originalOnRuntimeInitialized();
              }
              opencvLoaded = true;
              opencvLoadPromise = null;
              resolve();
            };
            
            // Execute the script
            try {
              // Use Function constructor to execute in global scope
              new Function(scriptText)();
              
              // If OpenCV is already loaded, resolve immediately
              if (typeof cv !== 'undefined' && cv.Mat) {
                opencvLoaded = true;
                opencvLoadPromise = null;
                resolve();
              }
            } catch (err) {
              opencvLoadPromise = null;
              reject(new Error(`Failed to execute OpenCV.js: ${err.message}`));
            }
          })
          .catch(err => {
            opencvLoadPromise = null;
            reject(new Error(`Failed to load OpenCV.js from ${opencvUrl}: ${err.message}`));
          });
  });

  return opencvLoadPromise;
}

// Wait for OpenCV.js to be available
function waitForOpenCV() {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (typeof globalThis.cv !== 'undefined' && globalThis.cv.Mat) {
      resolve();
      return;
    }
    
    // Check window.cv (fallback)
    if (typeof cv !== 'undefined' && cv.Mat) {
      resolve();
      return;
    }
    
    // If Module is defined (OpenCV.js loading via Module)
    if (typeof globalThis.Module !== 'undefined') {
      if (globalThis.Module.onRuntimeInitialized) {
        // Already has callback, wait for it
        const originalCallback = globalThis.Module.onRuntimeInitialized;
        globalThis.Module.onRuntimeInitialized = () => {
          originalCallback();
          resolve();
        };
      } else {
        // Set up callback
        globalThis.Module.onRuntimeInitialized = () => resolve();
      }
    } else {
      // Poll for OpenCV availability
      let attempts = 0;
      const maxAttempts = 300; // 30 seconds at 100ms intervals
      
      const checkInterval = setInterval(() => {
        attempts++;
        
        if (typeof globalThis.cv !== 'undefined' && globalThis.cv.Mat) {
          clearInterval(checkInterval);
          resolve();
        } else if (typeof cv !== 'undefined' && cv.Mat) {
          clearInterval(checkInterval);
          resolve();
        } else if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          reject(new Error('OpenCV.js failed to load in worker (timeout)'));
        }
      }, 100);
    }
  });
}

/**
 * Process ImageData through OpenCV pipeline
 * @param {ImageData} imageData - Input image data
 * @param {Object} options - Processing options
 * @returns {Promise<{imageData: ImageData, metadata: Object}>}
 */
async function preprocessImageData(imageData, options = {}) {
  const {
    removeShadows: doRemoveShadows = true,
    shadowKernelSize = 21,
    useAdaptiveThreshold = true,
    adaptiveMethod = 'GAUSSIAN',
    adaptiveBlockSize = 11,
    adaptiveC = 2,
    doCannyEdge = false,
    cannyThreshold1 = 50,
    cannyThreshold2 = 150,
    deskew = true,
    deskewOptions = {}
  } = options;

  // Ensure OpenCV is loaded
  if (!opencvLoaded) {
    await waitForOpenCV();
    opencvLoaded = true;
  }

  // Ensure cv is in global scope for opencv-clean.js functions
  if (typeof globalThis.cv === 'undefined' && typeof cv !== 'undefined') {
    globalThis.cv = cv;
  }

  // Dynamically import OpenCV processing functions (they need cv in global scope)
  const {
    loadImageToMat,
    matToImageData,
    grayscale,
    removeShadows,
    adaptiveThreshold,
    deskewUsingHough
  } = await import('./opencv-clean.js');

  // Load image to Mat
  let srcMat = loadImageToMat(imageData);
  
  try {
    // 1. Convert to grayscale
    let grayMat = grayscale(srcMat);
    if (srcMat !== grayMat) {
      srcMat.delete();
    }
    srcMat = grayMat;

    // 2. Remove shadows using morphological closing
    if (doRemoveShadows) {
      const noShadowMat = removeShadows(srcMat, { kernelSize: shadowKernelSize });
      srcMat.delete();
      srcMat = noShadowMat;
    }

    // 3. Apply adaptive threshold (Gaussian)
    if (useAdaptiveThreshold) {
      const thresholdMat = adaptiveThreshold(srcMat, {
        method: adaptiveMethod,
        blockSize: adaptiveBlockSize,
        C: adaptiveC
      });
      srcMat.delete();
      srcMat = thresholdMat;
      
      // Debug: Check if threshold produced all white or all black
      const mean = cv.mean(srcMat);
      const avg = mean[0];
      if (avg > 250) {
        console.warn('Adaptive threshold produced mostly white image - image may be inverted. Consider inverting threshold.');
      } else if (avg < 5) {
        console.warn('Adaptive threshold produced mostly black image - may need to invert input or adjust threshold parameters.');
      }
    }

    // 4. Optional Canny edge detection (for visualization/analysis, not used in final output)
    // Note: Canny is already used internally in deskewUsingHough for line detection
    // If explicitly requested, we can apply it here but typically not needed
    if (doCannyEdge) {
      // Canny is used internally in deskew, so we don't need to apply it separately
      // The adaptive threshold already produces good edge-like binary output
    }

    // 5. Deskew using HoughLines
    let deskewAngle = 0;
    if (deskew) {
      const deskewResult = deskewUsingHough(srcMat, deskewOptions);
      deskewAngle = deskewResult.angle;
      srcMat.delete();
      srcMat = deskewResult.mat;
    }

    // 6. Find largest contour and crop tightly
    let bbox = {
      x: 0,
      y: 0,
      width: srcMat.cols,
      height: srcMat.rows
    };
    let scale = 1.0;
    let croppedMat = srcMat;

    // Find contours to get bounding box of actual content
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(
      srcMat,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,  // Only external contours
      cv.CHAIN_APPROX_SIMPLE
    );

    // Find largest contour
    let largestContourIdx = -1;
    let largestArea = 0;
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      if (area > largestArea) {
        largestArea = area;
        largestContourIdx = i;
      }
      contour.delete();
    }

    // Get bounding box of largest contour
    if (largestContourIdx >= 0 && largestArea > 100) { // Minimum area threshold to avoid tiny noise
      const largestContour = contours.get(largestContourIdx);
      const rect = cv.boundingRect(largestContour);
      
      // Validate bounding box
      if (rect.width > 0 && rect.height > 0) {
        // Add small padding (2% of dimension or 5px minimum)
        const paddingX = Math.max(5, Math.floor(rect.width * 0.02));
        const paddingY = Math.max(5, Math.floor(rect.height * 0.02));
        
        bbox = {
          x: Math.max(0, rect.x - paddingX),
          y: Math.max(0, rect.y - paddingY),
          width: Math.min(srcMat.cols - Math.max(0, rect.x - paddingX), rect.width + paddingX * 2),
          height: Math.min(srcMat.rows - Math.max(0, rect.y - paddingY), rect.height + paddingY * 2)
        };

        // Crop to bounding box (only if crop would change the image)
        if (bbox.width > 10 && bbox.height > 10 && 
            (bbox.x > 0 || bbox.y > 0 || bbox.width < srcMat.cols || bbox.height < srcMat.rows)) {
          const roi = new cv.Rect(bbox.x, bbox.y, bbox.width, bbox.height);
          croppedMat = srcMat.roi(roi);
          
          // Create a new Mat with the cropped region (roi is a view, need a copy for safety)
          const croppedCopy = new cv.Mat();
          croppedMat.copyTo(croppedCopy);
          croppedMat.delete(); // Delete the roi view
          croppedMat = croppedCopy;
        }
      }
      
      largestContour.delete();
    } else {
      // No valid contours found - don't crop, use full image
      console.warn('No valid contours found, using full image without cropping');
      bbox = {
        x: 0,
        y: 0,
        width: srcMat.cols,
        height: srcMat.rows
      };
    }

    // Cleanup contours
    contours.delete();
    hierarchy.delete();

    // Calculate scale (currently 1.0, can be used for future scaling)
    // For now, we keep original scale unless specified otherwise
    scale = 1.0;

    // Convert Mat back to ImageData
    const resultImageData = matToImageData(croppedMat);
    
    // Cleanup
    if (srcMat !== croppedMat) {
      srcMat.delete();
    }
    croppedMat.delete();

    return {
      imageData: resultImageData,
      metadata: {
        deskewAngle: deskewAngle,
        bbox: bbox,
        scale: scale
      }
    };
  } catch (error) {
    // Cleanup on error
    if (srcMat) srcMat.delete();
    throw error;
  }
}


// Message handler
self.addEventListener('message', async (event) => {
  const { type, imageData, options, requestId, opencvUrl } = event.data;

  try {
    if (type === 'load-opencv') {
      // Load OpenCV.js
      if (!opencvUrl) {
        throw new Error('opencvUrl required for load-opencv');
      }
      await loadOpenCV(opencvUrl);
      self.postMessage({ type: 'ready', requestId });
    } else if (type === 'preprocess') {
      if (!imageData || !(imageData instanceof ImageData)) {
        throw new Error('Invalid ImageData provided');
      }

      // Ensure OpenCV is loaded
      if (!opencvLoaded) {
        await waitForOpenCV();
        opencvLoaded = true;
      }

      const result = await preprocessImageData(imageData, options);
      
      // Transfer ImageData via transferable (zero-copy)
      self.postMessage({
        type: 'preprocess-result',
        requestId,
        imageData: result.imageData,
        metadata: result.metadata
      }, [result.imageData.data.buffer]);
    } else if (type === 'ping') {
      // Health check
      self.postMessage({ type: 'pong', requestId });
    } else {
      throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      requestId,
      error: {
        message: error.message,
        stack: error.stack
      }
    });
  }
});

// Send ready signal when worker is initialized
// If OpenCV is already available (loaded globally), mark as ready
if (typeof cv !== 'undefined' && cv.Mat) {
  opencvLoaded = true;
  self.postMessage({ type: 'ready' });
} else {
  // Wait a bit to see if OpenCV loads
  waitForOpenCV()
    .then(() => {
      opencvLoaded = true;
      self.postMessage({ type: 'ready' });
    })
    .catch(() => {
      // If OpenCV isn't available, still send ready
      // It will be loaded on first preprocess request
      self.postMessage({ type: 'ready' });
    });
}

