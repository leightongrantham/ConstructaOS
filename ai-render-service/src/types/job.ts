/**
 * Job types for async rendering
 */

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface RenderJob {
  jobId: string;
  projectId: string;
  conceptId: string;
  renderType: 'axonometric' | 'floor_plan' | 'section';
  status: JobStatus;
  progress?: number; // 0-100
  imageUrl?: string;
  promptVersion?: string;
  conceptRange?: string;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface JobCreateRequest {
  projectId: string;
  renderType: 'axonometric' | 'floor_plan' | 'section';
  conceptInputs: any; // ConceptBrief
  conceptId?: string;
}

export interface JobStatusResponse {
  job: RenderJob;
}
