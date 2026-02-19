#!/usr/bin/env node
/**
 * Lint script to check for imports from deprecated prompt files
 * 
 * This script ensures no files outside src/prompts/deprecated/
 * import from src/prompts/deprecated/
 * 
 * Exit codes:
 * - 0: No violations found
 * - 1: Violations found
 */

import { readdir, readFile } from 'fs/promises';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SRC_DIR = join(__dirname, '..', 'src');
const DEPRECATED_DIR = join(SRC_DIR, 'prompts', 'deprecated');

// Patterns to match imports from deprecated folder
// Matches: ./deprecated/, ../deprecated/, prompts/deprecated/, etc.
const DEPRECATED_IMPORT_PATTERNS = [
  /from\s+['"]\.\/deprecated\//,
  /from\s+['"]\.\.\/.*deprecated\//,
  /from\s+['"]\.\.?\/.*prompts\/deprecated\//,
  /import\s+.*from\s+['"]\.\/deprecated\//,
  /import\s+.*from\s+['"]\.\.\/.*deprecated\//,
  /import\s+.*from\s+['"]\.\.?\/.*prompts\/deprecated\//,
  /require\s*\(\s*['"]\.\/deprecated\//,
  /require\s*\(\s*['"]\.\.\/.*deprecated\//,
  /require\s*\(\s*['"]\.\.?\/.*prompts\/deprecated\//,
];

/**
 * Recursively find all TypeScript files in a directory
 */
async function findTsFiles(dir, excludeDir) {
  const files = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    
    // Skip excluded directory
    if (excludeDir && fullPath === excludeDir) {
      continue;
    }

    if (entry.isDirectory()) {
      const subFiles = await findTsFiles(fullPath, excludeDir);
      files.push(...subFiles);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Check if a file contains imports from deprecated folder
 */
async function checkFile(filePath) {
  const content = await readFile(filePath, 'utf-8');
  const violations = [];
  const relativePath = relative(SRC_DIR, filePath);

  for (const pattern of DEPRECATED_IMPORT_PATTERNS) {
    const matches = content.matchAll(new RegExp(pattern, 'g'));
    for (const match of matches) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      violations.push(`  ${relativePath}:${lineNumber} - Found import from deprecated folder`);
    }
  }

  return violations;
}

/**
 * Main function
 */
async function main() {
  try {
    // Find all TypeScript files excluding the deprecated directory
    const files = await findTsFiles(SRC_DIR, DEPRECATED_DIR);
    
    // Check each file for deprecated imports
    const allViolations = [];
    
    for (const file of files) {
      const violations = await checkFile(file);
      if (violations.length > 0) {
        allViolations.push(...violations);
      }
    }

    // Report results
    if (allViolations.length > 0) {
      console.error('❌ ERROR: Found imports from deprecated prompt folder:\n');
      console.error(allViolations.join('\n'));
      console.error('\nFiles outside src/prompts/deprecated/ should not import from src/prompts/deprecated/');
      console.error('The deprecated folder is quarantined and should not be used at runtime.');
      process.exit(1);
    } else {
      console.log('✅ No imports from deprecated prompt folder found');
      process.exit(0);
    }
  } catch (error) {
    console.error('Error running lint:deprecated:', error);
    process.exit(1);
  }
}

main();
