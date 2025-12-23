/**
 * Type definitions for rendering operations
 */

export interface RenderRequest {
  projectId: string;
}

export interface RenderResult {
  imageBase64: string;
  model: string;
  promptVersion: string;
}

