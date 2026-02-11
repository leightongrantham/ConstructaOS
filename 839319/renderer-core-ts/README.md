# Renderer Core - TypeScript Version

This is the TypeScript version of the renderer-core project, located in a separate directory for easy comparison and migration.

## Structure

The project structure mirrors the original JavaScript version but with TypeScript files (.ts instead of .js).

## Setup

```bash
npm install
npm run dev
```

## Type Checking

```bash
npm run type-check
```

## Build

```bash
npm run build
```

## Key Differences from JavaScript Version

- All files use TypeScript with strict type checking
- Type definitions for external libraries (OpenCV.js, Paper.js, Rough.js) are included in `src/types/`
- Import paths use `.ts` extensions (handled by Vite)
- Full type safety throughout the codebase

