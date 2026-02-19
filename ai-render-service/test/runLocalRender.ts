/**
 * Local test harness for AI render service
 * Runs generateConceptImage with a test sketch image or PDF
 * 
 * Usage:
 *   npm run test:local [file-path] [render-type]
 * 
 * Examples:
 *   npm run test:local                                    # Uses default fixtures
 *   npm run test:local ./my-sketch.pdf                   # Use specific PDF
 *   npm run test:local ./my-sketch.png axonometric        # Use image with render type
 *   npm run test:local ./sketch.pdf floor_plan             # Use PDF with floor plan
 */

import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { generateConceptImage } from '../src/services/aiRenderService.js';
import type { RenderType } from '../src/types/render.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const VALID_RENDER_TYPES: RenderType[] = ['axonometric', 'floor_plan', 'section'];

/**
 * Detects file type from buffer
 */
function detectFileType(buffer: Buffer, filePath: string): 'pdf' | 'image' {
  // Check PDF header
  if (buffer.subarray(0, 4).toString('ascii') === '%PDF') {
    return 'pdf';
  }
  
  // Check file extension as fallback
  const ext = filePath.toLowerCase().split('.').pop();
  if (ext === 'pdf') {
    return 'pdf';
  }
  
  return 'image';
}

/**
 * Finds a test file - either from command line or fixtures directory
 */
function getTestFile(): { path: string; type: 'pdf' | 'image' } {
  // Check for command-line argument
  const fileArg = process.argv[2];
  
  if (fileArg) {
    const resolvedPath = resolve(fileArg);
    
    if (!existsSync(resolvedPath)) {
      throw new Error(`File not found: ${resolvedPath}`);
    }
    
    const buffer = readFileSync(resolvedPath);
    const type = detectFileType(buffer, resolvedPath);
    
    return { path: resolvedPath, type };
  }
  
  // Fall back to fixtures directory
  const pdfPath = join(__dirname, 'fixtures', 'sketch.pdf');
  const imagePath = join(__dirname, 'fixtures', 'sketch.png');

  if (existsSync(pdfPath)) {
    return { path: pdfPath, type: 'pdf' };
  }
  
  if (existsSync(imagePath)) {
    return { path: imagePath, type: 'image' };
  }

  throw new Error(
    `No test file found. Either:\n` +
    `  1. Provide a file path: npm run test:local <file-path>\n` +
    `  2. Place sketch.pdf or sketch.png in test/fixtures/`
  );
}

/**
 * Gets render type from command line or defaults to axonometric
 */
function getRenderType(): RenderType {
  const renderTypeArg = process.argv[3];
  
  if (renderTypeArg) {
    if (!VALID_RENDER_TYPES.includes(renderTypeArg as RenderType)) {
      throw new Error(
        `Invalid render type: ${renderTypeArg}. Must be one of: ${VALID_RENDER_TYPES.join(', ')}`
      );
    }
    return renderTypeArg as RenderType;
  }
  
  return 'axonometric';
}

async function runLocalRender(): Promise<void> {
  try {
    // Get test file (from command line or fixtures)
    const testFile = getTestFile();
    const sketchBuffer = readFileSync(testFile.path);

    // Get render type (from command line or default)
    const renderType = getRenderType();

    // Test parameters
    const projectId = 'test-project';

    console.log(`Running local render test...`);
    console.log(`Project ID: ${projectId}`);
    console.log(`Render Type: ${renderType}`);
    console.log(`Test file: ${testFile.path}`);
    console.log(`File type: ${testFile.type.toUpperCase()}`);
    console.log(`File size: ${sketchBuffer.length} bytes`);
    console.log('');

    // Call generateConceptImage
    const result = await generateConceptImage(sketchBuffer, renderType);

    // Log full result
    console.log('Render result:');
    console.log(JSON.stringify(result, null, 2));
    console.log('');
    console.log(`✅ Success! Generated ${result.renderType} rendering`);
    console.log(`   Model: ${result.model}`);
    console.log(`   Prompt Version: ${result.promptVersion}`);
    console.log(`   Image size: ${result.imageBase64.length} characters (base64)`);
  } catch (error) {
    console.error('❌ Error running local render test:');
    if (error instanceof Error) {
      console.error(error.message);
      if (error.stack && process.env.DEBUG) {
        console.error(error.stack);
      }
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

runLocalRender();

