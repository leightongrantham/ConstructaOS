/**
 * Concept Seed Storage Utilities
 * Stores concept seeds in Supabase Storage or local file system (fallback)
 * 
 * Storage structure:
 * projects/{projectId}/concepts/{conceptId}/seed.json
 * projects/{projectId}/concepts/{conceptId}/axon.png
 * projects/{projectId}/concepts/{conceptId}/plan.png
 * projects/{projectId}/concepts/{conceptId}/section.png
 */

import { writeFile, readFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ConceptSeed } from '../services/generateConceptSeed.js';
export type { ConceptSeed } from '../services/generateConceptSeed.js';
import { resolveSupabaseConfig, type SupabaseConfig } from './supabaseConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Local storage directory (fallback when Supabase is not configured)
// Use /tmp on Vercel/serverless (read-only filesystem except /tmp)
export const LOCAL_STORAGE_DIR = process.env.VERCEL
  ? join('/tmp', '.concepts')
  : join(__dirname, '../../.concepts');

/**
 * Maps renderType to standardized filename
 * @param renderType - The render type (axonometric, floor_plan, section)
 * @returns Standardized filename (axon.png, plan.png, section.png)
 */
function getRenderFileName(renderType: string): string {
  const fileNameMap: Record<string, string> = {
    'axonometric': 'axon.png',
    'floor_plan': 'plan.png',
    'section': 'section.png',
  };
  
  return fileNameMap[renderType] || `${renderType}.png`;
}

export interface StoredConcept {
  projectId: string;
  conceptId: string;
  conceptSeed: ConceptSeed;
  createdAt: string;
  axonImageUrl?: string; // Optional: URL of the generated axonometric image
}

/**
 * Stores a concept seed to Supabase Storage
 * Path: projects/{projectId}/concepts/{conceptId}/seed.json
 */
export async function storeConceptSeed(
  projectId: string,
  conceptId: string,
  conceptSeed: ConceptSeed,
  axonImageUrl?: string,
  sbOverride?: SupabaseConfig | null
): Promise<void> {
  const createdAt = new Date().toISOString();

  const storedConcept: StoredConcept = {
    projectId,
    conceptId,
    conceptSeed,
    createdAt,
    ...(axonImageUrl && { axonImageUrl }),
  };

  const storagePath = `projects/${projectId}/concepts/${conceptId}/seed.json`;
  const jsonContent = JSON.stringify(storedConcept, null, 2);

  const sb = sbOverride !== undefined ? sbOverride : resolveSupabaseConfig();

  if (!sb) {
    // Fallback to local file system storage
    try {
      const localFilePath = join(LOCAL_STORAGE_DIR, `projects/${projectId}/concepts/${conceptId}/seed.json`);
      const localDir = dirname(localFilePath);
      
      // Ensure directory exists
      await mkdir(localDir, { recursive: true });
      
      // Write to local file
      await writeFile(localFilePath, jsonContent, 'utf-8');
      
      console.log(`Concept seed stored locally: ${localFilePath}`);
      return;
    } catch (error) {
      console.error('Error storing concept seed to local file system:', error);
      console.warn('Concept seed will not be persisted');
      // Continue without throwing - seed generation still succeeds
      return;
    }
  }

  try {
    const uploadUrl = `${sb.url}/storage/v1/object/${sb.bucket}/${storagePath}`;

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sb.key}`,
        'Content-Type': 'application/json',
        'x-upsert': 'true',
      },
      body: jsonContent,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to store concept seed to Supabase: ${response.status} ${response.statusText}`);
      console.error('Error details:', errorText);
      return;
    }

    console.log(`Concept seed stored successfully: ${storagePath}`);
  } catch (error) {
    console.error('Error storing concept seed to Supabase:', error);
  }
}

/**
 * Retrieves a concept seed from Supabase Storage
 */
export async function getConceptSeed(
  projectId: string,
  conceptId: string,
  sbOverride?: SupabaseConfig | null
): Promise<StoredConcept | null> {
  const seedPath = `projects/${projectId}/concepts/${conceptId}/seed.json`;
  const sb = sbOverride !== undefined ? sbOverride : resolveSupabaseConfig();

  if (!sb) {
    // Fallback to local file system storage
    try {
      const localFilePath = join(LOCAL_STORAGE_DIR, seedPath);
      const fileContent = await readFile(localFilePath, 'utf-8');
      const data = JSON.parse(fileContent) as unknown;
      
      // Validate the response has required fields
      if (
        data &&
        typeof data === 'object' &&
        'projectId' in data &&
        'conceptId' in data &&
        'createdAt' in data &&
        'conceptSeed' in data &&
        typeof (data as Record<string, unknown>).projectId === 'string' &&
        typeof (data as Record<string, unknown>).conceptId === 'string' &&
        typeof (data as Record<string, unknown>).createdAt === 'string'
      ) {
        console.log(`Concept seed retrieved from local storage: ${localFilePath}`);
        return data as StoredConcept;
      }
      throw new Error('Invalid concept seed format in local storage');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File not found - concept doesn't exist
        return null;
      }
      console.error('Error retrieving concept seed from local file system:', error);
      return null;
    }
  }

  const downloadUrl = `${sb.url}/storage/v1/object/public/${sb.bucket}/${seedPath}`;

  try {
    const response = await fetch(downloadUrl);

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to retrieve concept seed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as unknown;
    if (
      data &&
      typeof data === 'object' &&
      'projectId' in data &&
      'conceptId' in data &&
      'createdAt' in data &&
      'conceptSeed' in data &&
      typeof (data as Record<string, unknown>).projectId === 'string' &&
      typeof (data as Record<string, unknown>).conceptId === 'string' &&
      typeof (data as Record<string, unknown>).createdAt === 'string'
    ) {
      return data as StoredConcept;
    }
    throw new Error('Invalid concept seed format in storage');
  } catch (error) {
    console.error('Error retrieving concept seed from Supabase:', error);
    return null;
  }
}

/**
 * Convenience function: Load only the ConceptSeed (without StoredConcept wrapper)
 * @returns ConceptSeed if found, null otherwise
 */
export async function loadConceptSeed(
  projectId: string,
  conceptId: string,
  sbOverride?: SupabaseConfig | null
): Promise<ConceptSeed | null> {
  const stored = await getConceptSeed(projectId, conceptId, sbOverride);
  return stored ? stored.conceptSeed : null;
}

/**
 * Convenience function: Save only the ConceptSeed
 * @returns Promise<void>
 */
export async function saveConceptSeed(
  projectId: string,
  conceptId: string,
  seed: ConceptSeed,
  sbOverride?: SupabaseConfig | null
): Promise<void> {
  return storeConceptSeed(projectId, conceptId, seed, undefined, sbOverride);
}

/**
 * Stores a rendered image to Supabase Storage
 * Path: projects/{projectId}/concepts/{conceptId}/{axon|plan|section}.png
 * @returns Public URL of the stored image
 */
export async function storeRenderedImage(
  projectId: string,
  conceptId: string,
  renderType: string,
  imageBase64: string,
  sbOverride?: SupabaseConfig | null
): Promise<string> {
  const imageBuffer = Buffer.from(imageBase64, 'base64');
  const fileName = getRenderFileName(renderType);
  const storagePath = `projects/${projectId}/concepts/${conceptId}/${fileName}`;

  const sb = sbOverride !== undefined ? sbOverride : resolveSupabaseConfig();

  if (!sb) {
    // Fallback to local file system storage
    try {
      const localFilePath = join(LOCAL_STORAGE_DIR, `projects/${projectId}/concepts/${conceptId}/${fileName}`);
      const localDir = dirname(localFilePath);
      
      // Ensure directory exists
      await mkdir(localDir, { recursive: true });
      
      // Write to local file
      await writeFile(localFilePath, imageBuffer);
      
      console.log(`Rendered image stored locally: ${localFilePath}`);
      // Return HTTP URL for local storage (served via /storage endpoint)
      return `/storage/projects/${projectId}/concepts/${conceptId}/${fileName}`;
    } catch (error) {
      console.error('Error storing rendered image to local file system:', error);
      throw new Error('Failed to store rendered image to local storage');
    }
  }

  try {
    const uploadUrl = `${sb.url}/storage/v1/object/${sb.bucket}/${storagePath}`;

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sb.key}`,
        'Content-Type': 'image/png',
        'x-upsert': 'true',
      },
      body: imageBuffer,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to store rendered image to Supabase: ${response.status} ${response.statusText}`);
      console.error('Error details:', errorText);
      console.error('Upload URL:', uploadUrl);
      throw new Error(`Failed to store rendered image to Supabase: ${response.status} ${errorText}`);
    }

    const publicUrl = `${sb.url}/storage/v1/object/public/${sb.bucket}/${storagePath}`;
    console.log(`Rendered image stored successfully: ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    console.error('Error storing rendered image to Supabase:', error);
    throw error;
  }
}

/**
 * Gets the URL of a rendered image without fetching it
 * Path: projects/{projectId}/concepts/{conceptId}/{axon|plan|section}.png
 * @returns Image URL or null if storage not configured
 */
export function getRenderedImageUrl(
  projectId: string,
  conceptId: string,
  renderType: string,
  sbOverride?: SupabaseConfig | null
): string | null {
  const fileName = getRenderFileName(renderType);
  const storagePath = `projects/${projectId}/concepts/${conceptId}/${fileName}`;

  const sb = sbOverride !== undefined ? sbOverride : resolveSupabaseConfig();

  if (!sb) {
    return `/storage/${storagePath}`;
  }

  return `${sb.url}/storage/v1/object/public/${sb.bucket}/${storagePath}`;
}

/**
 * Loads a rendered image from Supabase Storage
 * Path: projects/{projectId}/concepts/{conceptId}/{axon|plan|section}.png
 * @returns Image buffer if found, null if not found
 */
export async function loadRenderedImage(
  projectId: string,
  conceptId: string,
  renderType: string,
  sbOverride?: SupabaseConfig | null
): Promise<Buffer | null> {
  const fileName = getRenderFileName(renderType);
  const storagePath = `projects/${projectId}/concepts/${conceptId}/${fileName}`;

  const sb = sbOverride !== undefined ? sbOverride : resolveSupabaseConfig();

  if (!sb) {
    // Fallback to local file system storage
    try {
      const localFilePath = join(LOCAL_STORAGE_DIR, `projects/${projectId}/concepts/${conceptId}/${fileName}`);
      const imageBuffer = await readFile(localFilePath);
      console.log(`Rendered image loaded from local storage: ${localFilePath}`);
      return imageBuffer;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File not found - image doesn't exist
        return null;
      }
      console.error('Error loading rendered image from local file system:', error);
      return null;
    }
  }

  try {
    const downloadUrl = `${sb.url}/storage/v1/object/public/${sb.bucket}/${storagePath}`;

    const response = await fetch(downloadUrl);

    if (!response.ok) {
      if (response.status === 404) {
        // Image not found
        return null;
      }
      throw new Error(`Failed to load rendered image: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);
    console.log(`Rendered image loaded from Supabase: ${downloadUrl}`);
    return imageBuffer;
  } catch (error) {
    console.error('Error loading rendered image from Supabase:', error);
    return null;
  }
}
