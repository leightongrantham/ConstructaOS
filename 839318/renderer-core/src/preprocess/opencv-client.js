/**
 * OpenCV preprocessing client for main thread
 * Wraps WebWorker communication for OpenCV.js image processing
 * 
 * Usage:
 * ```javascript
 * import { OpenCVPreprocessor } from './opencv-client.js';
 * 
 * const preprocessor = new OpenCVPreprocessor('/path/to/opencv-worker.js', '/path/to/opencv.js');
 * await preprocessor.initialize();
 * 
   * const result = await preprocessor.preprocess(imageData, options);
   * // result.imageData - processed ImageData (cleanedBitmap)
   * // result.metadata - { deskewAngle, bbox: {x, y, width, height}, scale }
 * ```
 */

/**
 * OpenCV Preprocessing Client
 * Manages WebWorker and handles image preprocessing
 */
export class OpenCVPreprocessor {
  /**
   * @param {string} workerUrl - URL to opencv-worker.js
   * @param {string} opencvUrl - URL to opencv.js (for loading in worker)
   * @param {Object} options - Options
   * @param {number} options.timeout - Request timeout in ms (default: 60000)
   */
  constructor(workerUrl, opencvUrl = null, options = {}) {
    this.workerUrl = workerUrl;
    this.opencvUrl = opencvUrl;
    this.timeout = options.timeout || 60000;
    this.worker = null;
    this.ready = false;
    this.initialized = false;
    this.pendingRequests = new Map();
    this.requestIdCounter = 0;
  }

  /**
   * Initialize the worker and load OpenCV.js
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // Create worker
      this.worker = new Worker(this.workerUrl, { type: 'module' });

      // Load OpenCV.js in worker if URL provided
      if (this.opencvUrl) {
        // Send OpenCV.js URL to worker for loading
        this.worker.postMessage({
          type: 'load-opencv',
          opencvUrl: this.opencvUrl
        });
      }

      // Wait for worker ready signal
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Worker initialization timeout'));
        }, this.timeout);

        const messageHandler = (event) => {
          if (event.data.type === 'ready') {
            clearTimeout(timeout);
            this.worker.removeEventListener('message', messageHandler);
            this.ready = true;
            this.initialized = true;
            resolve();
          } else if (event.data.type === 'error') {
            clearTimeout(timeout);
            this.worker.removeEventListener('message', messageHandler);
            reject(new Error(event.data.error.message));
          }
        };

        this.worker.addEventListener('message', messageHandler);
      });

      // Set up main message handler
      this.worker.addEventListener('message', (event) => {
        this.handleWorkerMessage(event);
      });

      this.worker.addEventListener('error', (error) => {
        console.error('Worker error:', error);
        // Reject any pending requests
        for (const { reject } of this.pendingRequests.values()) {
          reject(new Error(`Worker error: ${error.message}`));
        }
        this.pendingRequests.clear();
      });

    } catch (error) {
      this.cleanup();
      // Provide helpful error message
      const errorMsg = error.message.includes('Unexpected token') 
        ? `OpenCV.js URL returned invalid content. Make sure OpenCV.js is available at the configured URL. ${error.message}`
        : error.message;
      throw new Error(`Failed to initialize OpenCV preprocessor: ${errorMsg}`);
    }
  }

  /**
   * Handle messages from worker
   * @private
   */
  handleWorkerMessage(event) {
    const { type, requestId } = event.data;

    if (type === 'error' && requestId) {
      const request = this.pendingRequests.get(requestId);
      if (request) {
        this.pendingRequests.delete(requestId);
        const error = new Error(event.data.error.message);
        error.stack = event.data.error.stack;
        request.reject(error);
      }
      return;
    }

    if (requestId && this.pendingRequests.has(requestId)) {
      const { resolve } = this.pendingRequests.get(requestId);
      this.pendingRequests.delete(requestId);
      resolve(event.data);
    }
  }

  /**
   * Preprocess image data
   * @param {ImageData} imageData - Input image data
   * @param {Object} options - Processing options
   * @returns {Promise<{imageData: ImageData, metadata: {deskewAngle: number, bbox: {x: number, y: number, width: number, height: number}, scale: number}}>}
   */
  async preprocess(imageData, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.ready) {
      throw new Error('Worker not ready');
    }

    if (!imageData || !(imageData instanceof ImageData)) {
      throw new Error('Invalid ImageData provided');
    }

    const requestId = ++this.requestIdCounter;

    return new Promise((resolve, reject) => {
      // Set timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Preprocessing timeout after ${this.timeout}ms`));
      }, this.timeout);

      this.pendingRequests.set(requestId, {
        resolve: (result) => {
          clearTimeout(timeout);
          // Return in format matching checklist specification
          resolve({
            imageData: result.imageData,  // cleanedBitmap (as ImageData)
            metadata: result.metadata,    // { deskewAngle, bbox, scale }
            // Also provide structured format matching checklist:
            cleanedBitmap: result.imageData,
            scale: result.metadata?.scale ?? 1.0,
            bounds: result.metadata?.bbox ?? { x: 0, y: 0, width: result.imageData.width, height: result.imageData.height }
          });
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });

      // Send message to worker
      // Clone ImageData since we can't transfer it directly (worker will handle)
      const imageDataCopy = new ImageData(
        new Uint8ClampedArray(imageData.data),
        imageData.width,
        imageData.height
      );

      this.worker.postMessage({
        type: 'preprocess',
        requestId,
        imageData: imageDataCopy,
        options
      }, [imageDataCopy.data.buffer]);
    });
  }

  /**
   * Check if worker is ready
   * @returns {Promise<boolean>}
   */
  async ping() {
    if (!this.initialized) {
      await this.initialize();
    }

    const requestId = ++this.requestIdCounter;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Ping timeout'));
      }, 5000);

      this.pendingRequests.set(requestId, {
        resolve: () => {
          clearTimeout(timeout);
          resolve(true);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });

      this.worker.postMessage({
        type: 'ping',
        requestId
      });
    });
  }

  /**
   * Cleanup and terminate worker
   */
  cleanup() {
    if (this.worker) {
      // Reject all pending requests
      for (const { reject } of this.pendingRequests.values()) {
        reject(new Error('Preprocessor terminated'));
      }
      this.pendingRequests.clear();

      this.worker.terminate();
      this.worker = null;
    }
    this.ready = false;
    this.initialized = false;
  }
}

/**
 * Create and initialize a preprocessor instance
 * Convenience function for quick setup
 * @param {string} workerUrl - URL to opencv-worker.js
 * @param {string} opencvUrl - URL to opencv.js
 * @param {Object} options - Options
 * @returns {Promise<OpenCVPreprocessor>}
 */
export async function createPreprocessor(workerUrl, opencvUrl = null, options = {}) {
  const preprocessor = new OpenCVPreprocessor(workerUrl, opencvUrl, options);
  await preprocessor.initialize();
  return preprocessor;
}

