# OpenCV.js Setup Guide

The renderer uses OpenCV.js for image preprocessing. **OpenCV.js is optional** - the system will automatically fall back to simple thresholding if OpenCV.js is not available.

Due to CORS restrictions and ES module worker limitations, OpenCV.js needs to be hosted locally or via a CORS-enabled CDN.

## Option 1: Host OpenCV.js Locally (Recommended)

1. **Download OpenCV.js:**
   ```bash
   cd constructaos-m1/839318/renderer-core
   mkdir -p public
   curl -o public/opencv.js https://docs.opencv.org/4.x/opencv.js
   ```

2. **Update sandbox.js configuration:**
   ```javascript
   // In sandbox.js, getOpenCVPreprocessor function
   const opencvUrl = '/opencv.js'; // Local path
   ```

3. **Serve with Vite:**
   Vite will automatically serve files from the `public/` directory at `/opencv.js`

## Option 2: Use a CORS-Enabled CDN

Update `sandbox.js` with a CDN that supports CORS:

```javascript
// Try jsdelivr (may or may not have opencv-js)
const opencvUrl = 'https://cdn.jsdelivr.net/npm/opencv-js@4.5.5/dist/opencv.js';

// Or use unpkg
const opencvUrl = 'https://unpkg.com/opencv-js@4.5.5/dist/opencv.js';
```

**Note:** OpenCV.js may not be available on npm CDNs. Option 1 (local hosting) is most reliable.

## Option 3: Disable OpenCV (Use Fallback)

The renderer will automatically fall back to simple thresholding if OpenCV.js fails to load. No configuration needed - it just won't use advanced preprocessing features.

## Current Configuration

The default URL in `sandbox.js` is set to jsdelivr. If you see CORS errors:

1. Download OpenCV.js to `public/opencv.js`
2. Update `sandbox.js` line 50 to use: `const opencvUrl = '/opencv.js';`
3. Restart your dev server

## Troubleshooting

**Error: "CORS policy"**
- OpenCV.js must be loaded from the same origin or a CORS-enabled server
- Solution: Host locally in `public/` directory

**Error: "Module scripts don't support importScripts()"**
- ES module workers can't use `importScripts()`
- The worker now uses dynamic script execution instead
- This should be fixed in the current implementation

**Error: "OpenCV.js failed to load"**
- Check that the URL is correct
- Check browser console for network errors
- The system will fall back to simple preprocessing automatically

