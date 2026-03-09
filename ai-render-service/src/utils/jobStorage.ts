/**
 * Job storage utilities for async rendering
 * Uses same storage backend as concept seeds (Supabase or local filesystem)
 */

import { writeFile, readFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { RenderJob } from '../types/job.js';
import { resolveSupabaseConfig, type SupabaseConfig } from './supabaseConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Local storage directory (fallback when Supabase is not configured)
// Use /tmp on Vercel/serverless (read-only filesystem except /tmp)
const LOCAL_STORAGE_DIR = process.env.VERCEL
  ? join('/tmp', '.jobs')
  : join(__dirname, '../../.jobs');

/**
 * Store a render job
 */
export async function storeJob(job: RenderJob, sbOverride?: SupabaseConfig | null): Promise<void> {
  const storagePath = `jobs/${job.projectId}/${job.jobId}.json`;
  const jsonContent = JSON.stringify(job, null, 2);

  const sb = sbOverride !== undefined ? sbOverride : resolveSupabaseConfig();

  if (!sb) {
    // Fallback to local file system storage
    try {
      const localFilePath = join(LOCAL_STORAGE_DIR, storagePath);
      const localDir = dirname(localFilePath);
      
      await mkdir(localDir, { recursive: true });
      await writeFile(localFilePath, jsonContent, 'utf-8');
      
      console.log(`Job stored locally: ${localFilePath}`);
      return;
    } catch (error) {
      console.error('Error storing job to local file system:', error);
      throw error;
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
      console.error(`Failed to store job to Supabase: ${response.status}`);
      console.error('Error details:', errorText);
      throw new Error('Failed to store job');
    }

    console.log(`Job stored successfully: ${storagePath}`);
  } catch (error) {
    console.error('Error storing job to Supabase:', error);
    throw error;
  }
}

/**
 * Retrieve a render job
 */
export async function getJob(projectId: string, jobId: string, sbOverride?: SupabaseConfig | null): Promise<RenderJob | null> {
  const storagePath = `jobs/${projectId}/${jobId}.json`;

  const sb = sbOverride !== undefined ? sbOverride : resolveSupabaseConfig();

  if (!sb) {
    // Fallback to local file system storage
    try {
      const localFilePath = join(LOCAL_STORAGE_DIR, storagePath);
      const fileContent = await readFile(localFilePath, 'utf-8');
      return JSON.parse(fileContent) as RenderJob;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      console.error('Error retrieving job from local file system:', error);
      return null;
    }
  }

  const downloadUrl = `${sb.url}/storage/v1/object/public/${sb.bucket}/${storagePath}`;

  try {
    const response = await fetch(downloadUrl);

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to retrieve job: ${response.status}`);
    }

    return (await response.json()) as RenderJob;
  } catch (error) {
    console.error('Error retrieving job from Supabase:', error);
    return null;
  }
}
