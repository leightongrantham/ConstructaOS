/**
 * Pipeline Debugging Tool
 * Run diagnostics and test pipeline components
 * 
 * Usage:
 *   import { runDiagnostics, formatDiagnostics } from './src/utils/debug-pipeline.js';
 *   const results = await runDiagnostics({ aiEndpointUrl: '...', potraceWasmUrl: '...' });
 *   console.log(formatDiagnostics(results));
 */

import { 
  runDiagnostics, 
  formatDiagnostics, 
  checkAIEndpoint,
  checkVectorizerWASM,
  checkOpenCV,
  validateImageData,
  validateTopology
} from './src/utils/debug-pipeline.js';

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  aiEndpointUrl: 'http://localhost:3001/api/topology/ai-clean',
  potraceWasmUrl: '/potrace.wasm',
  vtracerWasmUrl: '/vtracer.wasm',
  opencvUrl: '/opencv.js',
  checkOpenCV: true
};

/**
 * Run diagnostics with default or custom config
 */
export async function debug(config = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  console.log('🔍 Starting pipeline diagnostics...\n');
  
  const diagnostics = await runDiagnostics(finalConfig);
  const formatted = formatDiagnostics(diagnostics);
  
  console.log(formatted);
  
  return diagnostics;
}

/**
 * Quick check functions
 */
export async function checkAI(url = DEFAULT_CONFIG.aiEndpointUrl) {
  console.log('🔍 Checking AI endpoint...');
  const result = await checkAIEndpoint(url);
  console.log(`${result.isOk() ? '✅' : (result.hasErrors() ? '❌' : '⚠️')} ${result.component}: ${result.details.message}`);
  if (result.details.error) {
    console.error('   Error:', result.details.error);
  }
  return result;
}

export async function checkVectorizers(config = {}) {
  console.log('🔍 Checking vectorizers...');
  const results = await checkVectorizerWASM({
    potraceWasmUrl: config.potraceWasmUrl || DEFAULT_CONFIG.potraceWasmUrl,
    vtracerWasmUrl: config.vtracerWasmUrl || DEFAULT_CONFIG.vtracerWasmUrl
  });
  
  results.forEach(result => {
    console.log(`${result.isOk() ? '✅' : (result.hasErrors() ? '❌' : '⚠️')} ${result.component}: ${result.details.message}`);
  });
  
  return results;
}

export async function checkOpenCVLib(url = DEFAULT_CONFIG.opencvUrl) {
  console.log('🔍 Checking OpenCV.js...');
  const result = await checkOpenCV(url);
  console.log(`${result.isOk() ? '✅' : (result.hasErrors() ? '❌' : '⚠️')} ${result.component}: ${result.details.message}`);
  return result;
}

// Export all utilities
export {
  runDiagnostics,
  formatDiagnostics,
  checkAIEndpoint,
  checkVectorizerWASM,
  checkOpenCV,
  validateImageData,
  validateTopology
};

// Auto-run if executed directly
if (typeof window !== 'undefined') {
  // Browser context - make available globally for console debugging
  window.debugPipeline = {
    run: debug,
    checkAI,
    checkVectorizers,
    checkOpenCV: checkOpenCVLib,
    validateImageData,
    validateTopology
  };
  
  console.log('🔧 Pipeline debugging tools available at window.debugPipeline');
  console.log('   Usage: await window.debugPipeline.run()');
}

