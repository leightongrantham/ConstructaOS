/**
 * Concept Seed Storage Utilities
 * Stores concept seeds in Supabase Storage or local file system (fallback)
 */

import { writeFile, readFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ConceptSeed } from '../services/generateConceptSeed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Local storage directory (fallback when Supabase is not configured)
// Path: from dist/src/utils -> project root/.concepts
const LOCAL_STORAGE_DIR = join(__dirname, '../../../.concepts');

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
  axonImageUrl?: string
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

  // Check if Supabase is configured
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseBucket = process.env.SUPABASE_STORAGE_BUCKET || 'concepts';

  if (!supabaseUrl || !supabaseKey) {
    // Fallback to local file system storage
    try {
      const localFilePath = join(LOCAL_STORAGE_DIR, projectId, 'concepts', conceptId, 'seed.json');
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
    // Upload to Supabase Storage
    const uploadUrl = `${supabaseUrl}/storage/v1/object/${supabaseBucket}/${storagePath}`;

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'x-upsert': 'true', // Allow overwriting if it exists
      },
      body: jsonContent,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to store concept seed to Supabase: ${response.status} ${response.statusText}`);
      console.error('Error details:', errorText);
      // Don't throw - concept generation still succeeds even if storage fails
      return;
    }

    console.log(`Concept seed stored successfully: ${storagePath}`);
  } catch (error) {
    console.error('Error storing concept seed to Supabase:', error);
    // Don't throw - concept generation still succeeds even if storage fails
  }
}

/**
 * Retrieves a concept seed from Supabase Storage
 */
export async function getConceptSeed(
  projectId: string,
  conceptId: string
): Promise<StoredConcept | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseBucket = process.env.SUPABASE_STORAGE_BUCKET || 'concepts';

  if (!supabaseUrl || !supabaseKey) {
    // Fallback to local file system storage
    try {
      const localFilePath = join(LOCAL_STORAGE_DIR, projectId, 'concepts', conceptId, 'seed.json');
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

  const storagePath = `projects/${projectId}/concepts/${conceptId}/seed.json`;
  const downloadUrl = `${supabaseUrl}/storage/v1/object/public/${supabaseBucket}/${storagePath}`;

  try {
    const response = await fetch(downloadUrl);

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to retrieve concept seed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as unknown;
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
      return data as StoredConcept;
    }
    throw new Error('Invalid concept seed format in storage');
  } catch (error) {
    console.error('Error retrieving concept seed from Supabase:', error);
    return null;
  }
}
