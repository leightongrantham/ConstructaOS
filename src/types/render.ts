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
}

export interface RenderResult {
  imageBase64: string;
  model: string;
  promptVersion: string;
  renderType: RenderType;
}

