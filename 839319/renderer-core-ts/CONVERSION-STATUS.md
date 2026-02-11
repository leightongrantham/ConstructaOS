# TypeScript Conversion Status

## ✅ Completed

### Configuration
- [x] `tsconfig.json` - TypeScript configuration
- [x] `package.json` - Updated with TypeScript dependencies
- [x] `vite.config.ts` - Vite configuration converted to TypeScript

### Type Definitions
- [x] `src/types/opencv.d.ts` - OpenCV.js type definitions
- [x] `src/types/paper.d.ts` - Paper.js type definitions
- [x] `src/types/rough.d.ts` - Rough.js type definitions

### Utils
- [x] `src/utils/timing.ts` - Timing utilities
- [x] `src/utils/debug.ts` - Debug utilities
- [x] `src/utils/geom.ts` - Geometry utilities
- [x] `src/utils/matrix.ts` - Matrix transformation utilities

### Preprocess
- [x] `src/preprocess/opencv-clean.ts` - OpenCV image cleaning
- [x] `src/preprocess/threshold.ts` - Image thresholding

### Vectorize
- [x] `src/vectorize/simplify-paths.ts` - Path simplification

## 🔄 Needs Conversion

### Preprocess
- [ ] `src/preprocess/opencv-client.js` → `.ts`
- [ ] `src/preprocess/opencv-transform.js` → `.ts`
- [ ] `src/preprocess/opencv-worker.js` → `.ts`
- [ ] `src/preprocess/vector-guide-detect.js` → `.ts`

### Vectorize
- [ ] `src/vectorize/potrace.js` → `.ts`

### Topology
- [ ] `src/topology/ai-clean.js` → `.ts`
- [ ] `src/topology/cleanup.js` → `.ts`
- [ ] `src/topology/merge-parallel.js` → `.ts`
- [ ] `src/topology/snap-orthogonal.js` → `.ts`
- [ ] `src/topology/wall-detection.js` → `.ts`

### Render
- [ ] `src/render/axon.js` → `.ts`
- [ ] `src/render/export.js` → `.ts`
- [ ] `src/render/plan.js` → `.ts`
- [ ] `src/render/preview.js` → `.ts`
- [ ] `src/render/section.js` → `.ts`
- [ ] `src/render/style.js` → `.ts`

### Main Files
- [ ] `index.js` → `index.ts`
- [ ] `sandbox.js` → `sandbox.ts`
- [ ] `index.html` - Update to reference TypeScript files

## Notes

- All converted files use strict TypeScript with proper type annotations
- Import paths use `.ts` extensions (handled by Vite)
- External library types are defined in `src/types/`
- The structure mirrors the original JavaScript version

