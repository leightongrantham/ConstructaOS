# How to Set Up OpenCV.js

OpenCV.js provides advanced image preprocessing features (shadow removal, adaptive thresholding, deskew, contour detection). **It's optional** - the system works without it using simple thresholding, but OpenCV.js provides much better results.

## Quick Setup (One Command)

```bash
cd /Users/leightongrantham/Freelance/constructaos-m1/839318/renderer-core
mkdir -p public
curl -o public/opencv.js https://docs.opencv.org/4.x/opencv.js
```

**That's it!** Restart your dev server and OpenCV.js will be loaded automatically.

## Step-by-Step Instructions

### 1. Navigate to Project Directory

```bash
cd /Users/leightongrantham/Freelance/constructaos-m1/839318/renderer-core
```

### 2. Create Public Directory (if it doesn't exist)

```bash
mkdir -p public
```

### 3. Download OpenCV.js

**Option A: Using curl (Recommended)**
```bash
curl -o public/opencv.js https://docs.opencv.org/4.x/opencv.js
```

**Option B: Using wget**
```bash
wget -O public/opencv.js https://docs.opencv.org/4.x/opencv.js
```

**Option C: Download Manually**
1. Open browser and go to: https://docs.opencv.org/4.x/opencv.js
2. Right-click → "Save As"
3. Save as `opencv.js` in the `public/` directory

### 4. Verify Download

```bash
ls -lh public/opencv.js
```

You should see a file around **8-10 MB** in size.

### 5. Restart Dev Server

If your dev server is running, restart it:

```bash
# Stop the current server (Ctrl+C), then:
npm run dev
```

### 6. Test

Open your browser and check the console. You should see:
- ✅ No "OpenCV.js not available" message
- ✅ Preprocessing logs showing OpenCV operations

## File Structure

After setup, your project should look like:

```
renderer-core/
├── public/
│   └── opencv.js          ← OpenCV.js file (8-10 MB)
├── src/
├── index.html
├── package.json
└── ...
```

## How It Works

1. **Vite serves `public/` files** at the root URL (`/`)
2. **Configuration**: `sandbox.js` is already configured to load `/opencv.js`
3. **Worker loads OpenCV.js**: The WebWorker (`opencv-worker.js`) loads OpenCV.js automatically
4. **Automatic detection**: The system detects if OpenCV.js is available and uses it

## Features Enabled with OpenCV.js

Once OpenCV.js is set up, you get:

- ✅ **Grayscale conversion** - Better color-to-grayscale conversion
- ✅ **Shadow removal** - Morphological operations to remove shadows/uneven lighting
- ✅ **Adaptive thresholding** - Better than simple thresholding for varied lighting
- ✅ **Deskew detection** - Automatic rotation correction using HoughLines
- ✅ **Contour detection** - Find and crop to largest content area
- ✅ **Better preprocessing** - Overall higher quality results

## Troubleshooting

### "File not found" or 404 errors

**Check file location:**
```bash
ls -la public/opencv.js
```

**Check file size:**
```bash
ls -lh public/opencv.js
```
Should be ~8-10 MB. If it's much smaller, the download may have failed.

**Re-download:**
```bash
rm public/opencv.js
curl -o public/opencv.js https://docs.opencv.org/4.x/opencv.js
```

### "CORS policy" errors

If you see CORS errors, make sure:
1. You're using the dev server (`npm run dev`), not opening HTML directly
2. The file is in the `public/` directory (not `src/` or root)

### Still seeing "OpenCV.js not available"

1. **Check browser console** for errors
2. **Verify file exists:**
   ```bash
   cat public/opencv.js | head -5
   ```
   Should show JavaScript code starting with `(function()` or similar

3. **Hard refresh browser** (Ctrl+Shift+R or Cmd+Shift+R)
4. **Check network tab** - Is `/opencv.js` loading? What status code?

## Alternative: Build OpenCV.js Locally

If you want to build OpenCV.js yourself:

```bash
# Clone OpenCV repository
git clone https://github.com/opencv/opencv.git
cd opencv

# Install emscripten (required for building to WebAssembly)
# Follow instructions at: https://emscripten.org/docs/getting_started/downloads.html

# Build OpenCV.js
python ./platforms/js/build_js.py build_js --build_wasm --build_test
```

**Note:** Building locally is complex and usually unnecessary. Downloading the pre-built version is recommended.

## File Size

OpenCV.js is a large file (~8-10 MB):
- ⚠️ **Not recommended** to commit to git (add to `.gitignore`)
- ✅ **Fine for local development** and production deployments
- ✅ **Gzipped in production** can reduce to ~2-3 MB

Add to `.gitignore`:
```
public/opencv.js
```

## Next Steps

After setting up OpenCV.js:

1. **Test with an image** - Upload a sketch and see improved preprocessing
2. **Compare results** - Try with and without OpenCV.js to see the difference
3. **Adjust parameters** - Fine-tune preprocessing options in `sandbox.js`

## Need Help?

If you encounter issues:
1. Check browser console for specific error messages
2. Verify file location and size
3. Ensure dev server is running (`npm run dev`)
4. Try hard refresh (Ctrl+Shift+R)

