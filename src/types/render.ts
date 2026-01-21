/**
 * Type definitions for rendering operations
 */

export type RenderType =
  | 'axonometric'
  | 'floor_plan'
  | 'section';

export interface RenderRequest {
  projectId: string;
  renderType: RenderType;
  conceptId?: string;
}

export interface RenderResponse {
  conceptId: string;
  renderType: RenderType;
  imageUrl: string;
  promptVersion: string;
}

export interface RenderResult {
  imageBase64: string;
  model: string;
  promptVersion: string;
  renderType: RenderType;
  // Internal: rewritten prompt from vision analysis (not exposed to user)
  _rewrittenPrompt?: string;
}

