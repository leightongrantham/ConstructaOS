/**
 * Express server setup
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { randomUUID } from 'crypto';
import { generateConceptImage } from './services/aiRenderService.js';
import { buildConceptPrompt } from './services/buildConceptPrompt.js';
import { geocodeAddress } from './services/site/geocodeAddress.js';
import { buildSiteEnvelope } from './services/buildSiteEnvelope.js';
import { buildSiteContextSummary } from './services/buildSiteContextSummary.js';
import { queryNearbyBuildings } from './services/queryNearbyBuildings.js';
import { inferExistingContextFromOSM } from './services/inferExistingContextFromOSM.js';
import { generateConceptSeed } from './services/generateConceptSeed.js';
import { storeConceptSeed, getConceptSeed, storeRenderedImage, loadConceptSeed, saveConceptSeed, loadRenderedImage, getRenderedImageUrl, LOCAL_STORAGE_DIR } from './utils/conceptStorage.js';
import { lookupSiteBaselineFull } from './services/site/lookupSiteBaseline.js';
import { runSiteLookup } from './services/site/runSiteLookup.js';
import type { ConceptInputs, ConceptBrief } from './types/conceptInputs.js';
import type { ExistingBaseline } from './services/site/inferExistingBaseline.js';
import { legacyInputsToConceptBrief } from './types/conceptInputs.js';
import type { RenderType, RenderResponse, SiteInput } from './types/render.js';
import type { RenderJob, JobCreateRequest, JobStatusResponse } from './types/job.js';
import { storeJob, getJob } from './utils/jobStorage.js';
import type { StoreyCount } from './services/generateConceptSeed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type SiteParams = {
  hasSite: boolean;
  address?: string;
  lat?: number;
  lng?: number;
  baselineId?: number;
  baselineOverride?: { buildingForm?: string; storeys?: string; roofAssumption?: string; footprintScale?: string };
};

/** Normalize site params from req.body: prefer site object, fall back to flat address/lat/lng/baseline fields. */
function getSiteParams(body: Record<string, unknown>): SiteParams {
  const site = body.site as SiteInput | undefined;
  if (site && typeof site.lat === 'number' && typeof site.lng === 'number') {
    const baselineId = site.baselineId != null ? Number(site.baselineId) : undefined;
    const override = site.baselineOverride;
    let baselineOverride: SiteParams['baselineOverride'];
    if (override && (override.buildingForm ?? override.storeys ?? override.roofType ?? override.footprintScale)) {
      baselineOverride = {};
      if (override.buildingForm) baselineOverride.buildingForm = override.buildingForm;
      if (override.storeys) baselineOverride.storeys = override.storeys;
      if (override.roofType != null) baselineOverride.roofAssumption = override.roofType;
      if (override.footprintScale) baselineOverride.footprintScale = override.footprintScale;
    }
    const out: SiteParams = { hasSite: true, lat: site.lat, lng: site.lng };
    if (baselineId != null && !Number.isNaN(baselineId)) out.baselineId = baselineId;
    if (baselineOverride) out.baselineOverride = baselineOverride;
    return out;
  }
  const address = body.address as string | undefined;
  const lat = body.lat as number | undefined;
  const lng = body.lng as number | undefined;
  const hasSite = !!(address || (typeof lat === 'number' && typeof lng === 'number'));
  const selectedBuildingId = body.selectedBuildingId as number | undefined;
  const baselineOverrides = body.baselineOverrides as
    | { buildingForm?: string; storeys?: string; roofAssumption?: string; footprintScale?: string }
    | undefined;
  const out: SiteParams = { hasSite };
  if (address !== undefined) out.address = address;
  if (lat !== undefined) out.lat = lat;
  if (lng !== undefined) out.lng = lng;
  if (selectedBuildingId !== undefined) out.baselineId = selectedBuildingId;
  if (baselineOverrides) out.baselineOverride = baselineOverrides;
  return out;
}

/** Resolve seed storeys from single source: new build = brief; extension/renovation = baseline. */
function resolveSeedStoreys(brief: ConceptBrief, baseline: ExistingBaseline | null): StoreyCount {
  const isNewBuild = brief.proposedDesign.projectType === 'new_build';
  if (isNewBuild && brief.proposedDesign.storeys) {
    const s = brief.proposedDesign.storeys;
    return s === 'one' ? '1' : s === 'two' ? '2' : '3+';
  }
  if (!isNewBuild && baseline) {
    return baseline.storeys === 'Unknown' ? '2' : baseline.storeys;
  }
  return '2';
}

/** Resolve existing baseline when request has site (address/lat/lng). Used before seed load/generate so prompt and seed use same source. */
async function resolveBaselineIfSite(
  siteParams: ReturnType<typeof getSiteParams>
): Promise<ExistingBaseline | null> {
  const hasLocation = siteParams.hasSite && (siteParams.address !== undefined || (typeof siteParams.lat === 'number' && typeof siteParams.lng === 'number'));
  if (!hasLocation) return null;
  try {
    const lookupResponse = await lookupSiteBaselineFull(
      siteParams.address,
      siteParams.lat,
      siteParams.lng
    );
    if (!lookupResponse) return null;
    let baseline = lookupResponse.primary;
    const baselineId = siteParams.baselineId;
    if (baselineId != null) {
      const { queryNearbyBuildingsOverpass } = await import('./services/site/queryNearbyBuildingsOverpass.js');
      const { inferExistingBaseline } = await import('./services/site/inferExistingBaseline.js');
      const buildingsResult = await queryNearbyBuildingsOverpass(
        lookupResponse.lat,
        lookupResponse.lng,
        40
      );
      const selectedBuilding = buildingsResult.buildings.find((b) => b.id === baselineId);
      if (selectedBuilding) {
        baseline = inferExistingBaseline(
          selectedBuilding,
          buildingsResult.buildings.filter((b) => b.id !== baselineId)
        );
        baseline.rationale.push(`Building selected by baselineId: ${baselineId}`);
      }
    }
    const overrides = siteParams.baselineOverride;
    if (overrides) {
      if (overrides.buildingForm) {
        baseline.buildingForm = overrides.buildingForm as ExistingBaseline['buildingForm'];
        baseline.rationale.push(`Building form overridden to ${overrides.buildingForm}`);
      }
      if (overrides.storeys) {
        baseline.storeys = overrides.storeys as ExistingBaseline['storeys'];
        baseline.rationale.push(`Storeys overridden to ${overrides.storeys}`);
      }
      if (overrides.roofAssumption) {
        baseline.roofAssumption = overrides.roofAssumption as ExistingBaseline['roofAssumption'];
        baseline.rationale.push(`Roof assumption overridden to ${overrides.roofAssumption}`);
      }
    }
    return baseline;
  } catch {
    return null;
  }
}

function isValidConceptInputs(value: unknown): value is ConceptInputs {
  if (!value || typeof value !== 'object') return false;
  const inputs = value as Partial<ConceptInputs>;
  return (
    typeof inputs.projectType === 'string' &&
    (inputs.buildingForm === undefined || typeof inputs.buildingForm === 'string') &&
    (inputs.storeys === undefined || typeof inputs.storeys === 'string') &&
    (inputs.numberOfPlots === undefined || typeof inputs.numberOfPlots === 'string') &&
    typeof inputs.floorAreaRange === 'string' &&
    typeof inputs.bedrooms === 'string' &&
    typeof inputs.bathrooms === 'string' &&
    typeof inputs.kitchenType === 'string' &&
    typeof inputs.livingSpaces === 'string' &&
    typeof inputs.roofType === 'string' &&
    typeof inputs.massingPreference === 'string' &&
    typeof inputs.outputType === 'string'
  );
}

export function createServer(): express.Application {
  const app = express();

  // CORS middleware - allow Vercel origins and localhost
  const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, Postman, etc.)
      if (!origin) {
        callback(null, true);
        return;
      }
      // Allow localhost for local development
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        callback(null, true);
        return;
      }
      // Allow all Vercel deployments (*.vercel.app)
      if (origin.endsWith('.vercel.app')) {
        callback(null, true);
        return;
      }
      // Allow the specific Vercel app domain
      if (origin.includes('vercel.app')) {
        callback(null, true);
        return;
      }
      // Allow Lovable preview and deployed apps
      if (origin.includes('lovableproject.com') || origin.includes('lovable.app') || origin.includes('lovable.dev')) {
        callback(null, true);
        return;
      }
      // Reject other origins
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  };
  app.use(cors(corsOptions));

  // Middleware
  app.use(express.json());

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  /**
   * GET /test/openai - OpenAI connectivity test (diagnostic for connection errors)
   * Tests chat (gateway or direct) and optionally image API.
   */
  app.get('/test/openai', async (_req: Request, res: Response) => {
    const results: Record<string, { ok: boolean; duration?: number; error?: string }> = {};
    const hasGateway = !!process.env.AI_GATEWAY_API_KEY;
    const hasOpenAI = !!process.env.OPENAI_API_KEY;

    if (!hasOpenAI) {
      res.status(500).json({
        error: 'OPENAI_API_KEY not set',
        results: { env: { hasGateway, hasOpenAI } },
      });
      return;
    }

    try {
      // Test 1: Chat completion (uses gateway if AI_GATEWAY_API_KEY set)
      const chatStart = Date.now();
      const { chatClient, chatModel } = await import('./utils/openaiClient.js');
      const chatRes = await chatClient.responses.create({
        model: chatModel('gpt-4o-mini'),
        input: 'Reply with exactly: OK',
        max_output_tokens: 10,
      });
      results.chat = {
        ok: !!chatRes.output_text,
        duration: Date.now() - chatStart,
      };
    } catch (err) {
      results.chat = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    res.json({
      ok: results.chat?.ok ?? false,
      gateway: hasGateway,
      results,
    });
  });

  // ============================================================================
  // JOB-BASED ASYNC RENDERING ENDPOINTS (for Vercel Free Tier)
  // ============================================================================

  /**
   * POST /api/jobs/render
   * Create a render job (returns immediately, <1s)
   */
  app.post(
    '/api/jobs/render',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { projectId, renderType, conceptInputs, conceptId } = req.body as JobCreateRequest & { conceptInputs: any };

        // Validate required fields
        if (!projectId || !renderType || !conceptInputs) {
          res.status(400).json({
            error: 'projectId, renderType, and conceptInputs are required',
          });
          return;
        }

        const validRenderTypes: RenderType[] = ['axonometric', 'floor_plan', 'section'];
        if (!validRenderTypes.includes(renderType as RenderType)) {
          res.status(400).json({
            error: 'renderType must be one of: "axonometric", "floor_plan", "section"',
          });
          return;
        }

        // Generate job ID and concept ID
        const jobId = randomUUID();
        const finalConceptId = conceptId || randomUUID();

        // Create job record
        const job: RenderJob = {
          jobId,
          projectId,
          conceptId: finalConceptId,
          renderType: renderType as RenderType,
          status: 'pending',
          progress: 0,
          createdAt: new Date().toISOString(),
        };

        // Store job (fast operation, <1s)
        await storeJob(job);

        // Return immediately with jobId
        res.json({
          jobId,
          conceptId: finalConceptId,
          status: 'pending',
          message: 'Job created. Poll /api/jobs/:jobId for status.',
          pollUrl: `/api/jobs/${jobId}`,
          processUrl: `/api/jobs/${jobId}/process`,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /api/jobs/:jobId
   * Check job status (fast, <1s)
   */
  app.get(
    '/api/jobs/:jobId',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { jobId } = req.params;
        const { projectId } = req.query;

        if (!jobId || typeof jobId !== 'string') {
          res.status(400).json({
            error: 'jobId parameter is required',
          });
          return;
        }

        if (!projectId || typeof projectId !== 'string') {
          res.status(400).json({
            error: 'projectId query parameter is required',
          });
          return;
        }

        const job = await getJob(projectId, jobId);

        if (!job) {
          res.status(404).json({
            error: 'Job not found',
            jobId,
          });
          return;
        }

        const response: JobStatusResponse = { job };
        res.json(response);
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST /api/jobs/:jobId/process
   * Actually process the job (long-running, requires Pro tier or local)
   * This can be called by:
   * - Client (if on Pro tier)
   * - Vercel Cron (if configured)
   * - External worker
   */
  app.post(
    '/api/jobs/:jobId/process',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { jobId } = req.params;
        const { projectId, conceptInputs } = req.body;

        if (!jobId || typeof jobId !== 'string') {
          res.status(400).json({
            error: 'jobId parameter is required',
          });
          return;
        }

        if (!projectId || typeof projectId !== 'string' || !conceptInputs) {
          res.status(400).json({
            error: 'projectId and conceptInputs are required',
          });
          return;
        }

        // Load job
        let job = await getJob(projectId, jobId);
        if (!job) {
          res.status(404).json({
            error: 'Job not found',
            jobId,
          });
          return;
        }

        // Check if already completed
        if (job.status === 'completed') {
          res.json({ job, message: 'Job already completed' });
          return;
        }

        // Update job to processing
        job.status = 'processing';
        job.startedAt = new Date().toISOString();
        job.progress = 10;
        await storeJob(job);

        // Parse concept inputs
        let conceptBrief: ConceptBrief;
        if ('proposedDesign' in conceptInputs) {
          conceptBrief = conceptInputs as ConceptBrief;
        } else if (isValidConceptInputs(conceptInputs)) {
          conceptBrief = legacyInputsToConceptBrief(conceptInputs);
        } else {
          job.status = 'failed';
          job.error = 'Invalid conceptInputs';
          await storeJob(job);
          res.status(400).json({ job });
          return;
        }

        // Apply default conceptRange
        if (!conceptBrief.conceptRange) {
          conceptBrief.conceptRange = 'Grounded';
        }

        // Map renderType to outputType
        const outputTypeMap = {
          'axonometric': 'concept_axonometric',
          'floor_plan': 'concept_plan',
          'section': 'concept_section',
        } as const;
        conceptBrief.proposedDesign.outputType = outputTypeMap[job.renderType];

        // Load or generate seed
        job.progress = 30;
        await storeJob(job);

        let conceptSeed = await loadConceptSeed(projectId, job.conceptId);
        if (conceptSeed) {
          conceptBrief.conceptRange = conceptSeed.conceptRange;
        } else {
          conceptSeed = await generateConceptSeed(conceptBrief);
          await saveConceptSeed(projectId, job.conceptId, conceptSeed);
        }

        // Build prompt
        job.progress = 50;
        await storeJob(job);

        const requiresExistingConcept = job.renderType === 'floor_plan' || job.renderType === 'section';
        let referenceImageUrl: string | undefined;

        if (requiresExistingConcept) {
          // Check if axonometric image exists (optional - proceed without it if missing)
          const axonBuffer = await loadRenderedImage(projectId, job.conceptId, 'axonometric');
          if (axonBuffer) {
            // Axon image exists - use it as reference for style consistency
            referenceImageUrl = getRenderedImageUrl(projectId, job.conceptId, 'axonometric') || undefined;
            if (referenceImageUrl) {
              console.log(`Using axonometric reference for ${job.renderType} render: ${referenceImageUrl}`);
            }
          } else {
            // Axon image not found - proceed without reference (standalone generation)
            console.log(`No axonometric reference found for ${job.renderType} render - generating standalone`);
          }
        }

        const promptResult = buildConceptPrompt(conceptBrief, {
          conceptSeed,
          hasReferenceAxon: !!referenceImageUrl,
        });

        // Generate image
        job.progress = 70;
        await storeJob(job);

        const result = await generateConceptImage(
          Buffer.alloc(0),
          job.renderType,
          undefined,
          promptResult.prompt,
          undefined,
          referenceImageUrl,
          job.conceptId
        );

        // Store rendered image
        job.progress = 90;
        await storeJob(job);

        const imageUrl = await storeRenderedImage(
          projectId,
          job.conceptId,
          job.renderType,
          result.imageBase64
        );

        // Mark job as completed
        job.status = 'completed';
        job.progress = 100;
        job.completedAt = new Date().toISOString();
        job.imageUrl = imageUrl;
        job.promptVersion = promptResult.promptVersion;
        job.conceptRange = conceptBrief.conceptRange;
        await storeJob(job);

        console.log(`✅ Job ${jobId} completed successfully`);
        res.json({ job });
      } catch (error) {
        // Mark job as failed
        const { jobId } = req.params;
        const { projectId } = req.body;
        
        if (projectId && typeof projectId === 'string' && jobId && typeof jobId === 'string') {
          try {
            const job = await getJob(projectId, jobId);
            if (job) {
              job.status = 'failed';
              job.error = error instanceof Error ? error.message : 'Unknown error';
              job.completedAt = new Date().toISOString();
              await storeJob(job);
            }
          } catch (storeError) {
            console.error('Failed to update job status:', storeError);
          }
        }
        
        next(error);
      }
    }
  );

  // GET /storage/* and /api/storage/* - serve local storage files (same dir as conceptStorage)
  const serveStorage = async (req: Request, res: Response) => {
    try {
      // Extract path: /storage/xxx or /api/storage/xxx -> xxx (e.g. projects/.../axon.png)
      const storagePath = req.path.replace(/^\/(api\/)?storage\/?/, '') || req.path;
      
      const localFilePath = join(LOCAL_STORAGE_DIR, storagePath);
      
      // Security check: prevent path traversal (e.g. ../)
      const normalizedPath = join(LOCAL_STORAGE_DIR, storagePath);
      const resolved = resolve(normalizedPath);
      const resolvedDir = resolve(LOCAL_STORAGE_DIR);
      if (!resolved.startsWith(resolvedDir)) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
      
      // Check if file exists and serve it
      const fs = await import('fs/promises');
      try {
        const fileBuffer = await fs.readFile(localFilePath);
        
        // Set appropriate content type based on file extension
        if (localFilePath.endsWith('.png')) {
          res.setHeader('Content-Type', 'image/png');
        } else if (localFilePath.endsWith('.json')) {
          res.setHeader('Content-Type', 'application/json');
        }
        
        res.send(fileBuffer);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          res.status(404).json({ error: 'File not found' });
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error('Error serving storage file:', error);
      res.status(500).json({ error: 'Failed to serve file' });
    }
  };
  app.get('/storage/*', serveStorage);
  app.get('/api/storage/*', serveStorage);

  // POST /api/geocode endpoint for address lookup
  app.post(
    '/api/geocode',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { query } = req.body;
        if (!query || typeof query !== 'string') {
          res.status(400).json({
            error: 'query is required and must be a string',
          });
          return;
        }

        const result = await geocodeAddress(query);
        if (!result) {
          res.status(404).json({
            error: 'No results found for the provided address or postcode',
          });
          return;
        }

        res.json(result);
      } catch (error) {
        // Ensure error is passed to Express error handler
        console.error('Geocode endpoint error:', error);
        next(error);
      }
    }
  );

  // POST /api/site-lookup — existing building baseline from address or lat/lng
  app.post(
    '/api/site-lookup',
    async (req: Request, res: Response): Promise<void> => {
      try {
        const result = await runSiteLookup(req.body as { query?: string; lat?: number; lng?: number });
        res.status(200).json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (message.includes('Invalid request body')) {
          res.status(400).json({ error: message });
          return;
        }
        if (message.includes('Address not found')) {
          res.status(404).json({ error: message });
          return;
        }
        console.error('Site-lookup endpoint error:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal server error', message });
        }
      }
    }
  );

  // POST /api/infer-existing-context endpoint
  app.post(
    '/api/infer-existing-context',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { lat, lng, densityHint } = req.body;

        if (typeof lat !== 'number' || typeof lng !== 'number') {
          res.status(400).json({
            error: 'lat and lng are required and must be numbers',
          });
          return;
        }

        // Query nearby buildings
        const overpassResult = await queryNearbyBuildings(lat, lng, 50);

        // Infer existing context
        const inferredContext = inferExistingContextFromOSM(overpassResult, densityHint);

        res.json({
          inferredContext,
          nearbyBuildings: overpassResult,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // POST /api/build-site-context endpoint
  app.post(
    '/api/build-site-context',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { lat, lng, displayName, conceptInputs, inferredContext } = req.body;

        if (typeof lat !== 'number' || typeof lng !== 'number') {
          res.status(400).json({
            error: 'lat and lng are required and must be numbers',
          });
          return;
        }

        // Accept both ConceptBrief (new format) and ConceptInputs (legacy format)
        let conceptBrief: ConceptBrief;
        
        if ('proposedDesign' in conceptInputs) {
          // Already in ConceptBrief format
          conceptBrief = conceptInputs as ConceptBrief;
        } else if (isValidConceptInputs(conceptInputs)) {
          // Convert legacy ConceptInputs to ConceptBrief
          conceptBrief = legacyInputsToConceptBrief(conceptInputs);
        } else {
          res.status(400).json({
            error: 'conceptInputs is required and must be a valid ConceptInputs or ConceptBrief object',
          });
          return;
        }

        const envelope = buildSiteEnvelope(lat, lng, conceptBrief, {
          derivedBuildingForm: inferredContext?.existingBuildingType,
        });

        // Build site context summary using the service function
        // Uses inferred context if available, falls back to user input or defaults
        const summaryOptions: {
          locationName?: string;
          envelope: typeof envelope;
          inferredContext?: typeof inferredContext;
          userExistingContext?: typeof conceptBrief.existingContext;
        } = {
          locationName: displayName,
          envelope,
        };

        if (inferredContext) {
          summaryOptions.inferredContext = inferredContext;
        }

        if (conceptBrief.existingContext) {
          summaryOptions.userExistingContext = conceptBrief.existingContext;
        }

        const siteContextSummary = buildSiteContextSummary(summaryOptions);

        res.json({
          location: {
            lat,
            lng,
            displayName: displayName || 'Unknown location',
          },
          envelope,
          siteContextSummary,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // POST /api/render endpoint - Simplified render API with concept seed
  app.post(
    '/api/render',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const requestStartTime = Date.now();
      const VERCEL_FREE_TIMEOUT = 10000; // 10 seconds for free tier
      const TIMEOUT_WARNING_THRESHOLD = 8000; // Warn if approaching timeout
      
      try {
        const { projectId: rawProjectId, renderType, conceptId, conceptInputs, includePeopleInPlan, includePeopleInSection } = req.body;

        // projectId optional - default to "default" for storage organization
        const projectId = (rawProjectId && typeof rawProjectId === 'string') ? rawProjectId : 'default';

        if (!renderType || typeof renderType !== 'string') {
          res.status(400).json({
            error: 'renderType is required and must be a string',
          });
          return;
        }

        // Validate renderType is one of the allowed values
        const validRenderTypes: RenderType[] = ['axonometric', 'floor_plan', 'section'];
        if (!validRenderTypes.includes(renderType as RenderType)) {
          res.status(400).json({
            error: 'renderType must be one of: "axonometric", "floor_plan", "section"',
          });
          return;
        }

        // For plan/section, conceptId is optional - if not provided, generate new one
        // This allows generating floor_plan/section without existing seed/axon
        const requiresExistingConcept = renderType === 'floor_plan' || renderType === 'section';

        // Validate conceptInputs (required for seed generation)
        if (!conceptInputs) {
          res.status(400).json({
            error: 'conceptInputs is required (ConceptBrief or ConceptInputs)',
          });
          return;
        }

        // Accept both ConceptBrief (new format) and ConceptInputs (legacy format)
        let conceptBrief: ConceptBrief;
        
        if ('proposedDesign' in conceptInputs) {
          // Already in ConceptBrief format
          conceptBrief = conceptInputs as ConceptBrief;
        } else if (isValidConceptInputs(conceptInputs)) {
          // Convert legacy ConceptInputs to ConceptBrief
          conceptBrief = legacyInputsToConceptBrief(conceptInputs);
        } else {
          res.status(400).json({
            error: 'conceptInputs must be a valid ConceptInputs or ConceptBrief object',
          });
          return;
        }

        // Track input conceptRange for logging
        const inputConceptRange = conceptBrief.conceptRange || null;
        
        // Apply default conceptRange if not provided
        if (!conceptBrief.conceptRange) {
          conceptBrief.conceptRange = 'Grounded';
        }

        // Map renderType to outputType for conceptBrief
        const outputTypeMap = {
          'axonometric': 'concept_axonometric',
          'floor_plan': 'concept_plan',
          'section': 'concept_section',
        } as const;
        conceptBrief.proposedDesign.outputType = outputTypeMap[renderType as RenderType];

        // Generate conceptId if not provided (works for all render types now)
        const finalConceptId = conceptId && typeof conceptId === 'string' ? conceptId : randomUUID();

        // Resolve baseline first when request has site (single source of truth for existing storeys)
        const siteParams = getSiteParams(req.body);
        let resolvedBaseline: ExistingBaseline | null = null;
        try {
          resolvedBaseline = await resolveBaselineIfSite(siteParams);
          if (resolvedBaseline) {
            console.log(`Resolved existingBaseline for ${projectId}/${finalConceptId} (confidence: ${resolvedBaseline.confidence})`);
          }
        } catch (err) {
          console.error('Baseline resolution failed:', err);
        }

        // SEED PIPELINE: Load or generate concept seed
        let conceptSeed = await loadConceptSeed(projectId, finalConceptId);
        
        if (conceptSeed) {
          // Use existing seed
          console.log(`Using existing concept seed for ${projectId}/${finalConceptId}`);
          conceptBrief.conceptRange = conceptSeed.conceptRange;
          console.log(`Locked to seed's conceptRange: ${conceptSeed.conceptRange}`);
          if (inputConceptRange && inputConceptRange !== conceptSeed.conceptRange) {
            console.log(`Input conceptRange '${inputConceptRange}' overridden by seed's locked value '${conceptSeed.conceptRange}'`);
          }
          // If seed had no baseline and we now have one, attach and override storeys from single source
          if (conceptSeed.existingBaseline === undefined && resolvedBaseline) {
            conceptSeed.existingBaseline = resolvedBaseline;
            conceptSeed.storeys = resolveSeedStoreys(conceptBrief, resolvedBaseline);
            await saveConceptSeed(projectId, finalConceptId, conceptSeed);
            console.log(`existingBaseline and storeys set for ${projectId}/${finalConceptId}`);
          }
        } else {
          // Generate new seed; pass resolved baseline so prompt uses existing storeys from site/footprint
          console.log(`[RENDER] OpenAI responses (seed) START - generateConceptSeed`);
          const seedStart = Date.now();
          console.log(`Generating new concept seed for ${projectId}/${finalConceptId}`);
          conceptSeed = await generateConceptSeed(conceptBrief, resolvedBaseline ? { existingBaseline: resolvedBaseline } : undefined);
          console.log(`[RENDER] OpenAI responses (seed) OK`, { duration: Date.now() - seedStart });
          console.log(`New seed generated with conceptRange: ${conceptSeed.conceptRange}`);
          if (resolvedBaseline) {
            conceptSeed.existingBaseline = resolvedBaseline;
            conceptSeed.storeys = resolveSeedStoreys(conceptBrief, resolvedBaseline);
          } else if (conceptBrief.proposedDesign.projectType !== 'new_build') {
            conceptSeed.storeys = resolveSeedStoreys(conceptBrief, null);
          }
          await saveConceptSeed(projectId, finalConceptId, conceptSeed);
        }

        // Ensure conceptSeed is defined (TypeScript guard + runtime safety)
        if (!conceptSeed) {
          throw new Error('Failed to load or generate concept seed');
        }

        // AXON REFERENCE CHECK: For floor_plan or section, check if axon image exists (optional)
        // If it exists, use it as a reference for style consistency. If not, proceed without it.
        let referenceImageUrl: string | undefined;
        
        if (requiresExistingConcept) {
          // Check if axonometric image exists by trying to load it
          const axonBuffer = await loadRenderedImage(projectId, finalConceptId, 'axonometric');
          
          if (axonBuffer) {
            // Axon image exists - use it as reference for style consistency
            referenceImageUrl = getRenderedImageUrl(projectId, finalConceptId, 'axonometric') || undefined;
            
            if (referenceImageUrl) {
              console.log(`Using axonometric reference for ${renderType} render: ${referenceImageUrl}`);
            }
          } else {
            // Axon image not found - proceed without reference (standalone generation)
            console.log(`No axonometric reference found for ${renderType} render - generating standalone`);
          }
        }

        // Build prompt with concept seed and reference axon flag
        // Include people options for plan/section views; footprint scale override for massing hint only
        const promptOptions: Parameters<typeof buildConceptPrompt>[1] = {
          conceptSeed,
          hasReferenceAxon: !!referenceImageUrl,
        };
        
        if (renderType === 'floor_plan' && typeof includePeopleInPlan === 'boolean') {
          promptOptions.includePeopleInPlan = includePeopleInPlan;
        }
        
        if (renderType === 'section' && typeof includePeopleInSection === 'boolean') {
          promptOptions.includePeopleInSection = includePeopleInSection;
        }
        
        if (siteParams.baselineOverride?.footprintScale) {
          promptOptions.baselineFootprintScaleOverride = siteParams.baselineOverride.footprintScale;
        }
        
        const promptResult = buildConceptPrompt(conceptBrief, promptOptions);
        
        // Runtime debug log for floor_plan renderType
        if (renderType === 'floor_plan') {
          console.log(`\n🔍 [SERVER DEBUG] renderType="floor_plan" - Prompt generated:`);
          console.log(`Prompt version: ${promptResult.promptVersion}`);
          console.log(`Prompt preview (first 500 chars): ${promptResult.prompt.substring(0, 500)}...\n`);
        }

        // Check if we're approaching timeout before expensive AI call
        const elapsedTime = Date.now() - requestStartTime;
        if (elapsedTime > TIMEOUT_WARNING_THRESHOLD) {
          console.warn(`⚠️  Approaching timeout (${elapsedTime}ms elapsed, ${VERCEL_FREE_TIMEOUT}ms limit)`);
          res.status(503).json({
            error: 'TIMEOUT_IMMINENT',
            message: 'Request is taking too long and may timeout. This service requires Vercel Pro (60s timeout) for reliable AI image generation.',
            suggestion: 'Free tier has 10s limit. Upgrade to Pro or run locally for development.',
            elapsedTime,
            timeoutLimit: VERCEL_FREE_TIMEOUT,
          });
          return;
        }

        // Generate the render with the built prompt
        let result;
        console.log('[RENDER] generateConceptImage START', { renderType, conceptId: finalConceptId });
        const renderStart = Date.now();
        try {
          result = await generateConceptImage(
            Buffer.alloc(0), // No sketch input
            renderType as RenderType,
            undefined, // No user request
            promptResult.prompt,    // Use prompt with concept seed
            undefined, // No buffer needed
            referenceImageUrl, // Pass reference image URL for plan/section
            finalConceptId // Pass concept ID for logging
          );
          console.log('[RENDER] generateConceptImage OK', { duration: Date.now() - renderStart });
        } catch (error) {
          console.error('[RENDER] generateConceptImage FAIL', { duration: Date.now() - renderStart, error: error instanceof Error ? error.message : String(error) });
          // Handle reference image fetch failures
          if (error instanceof Error && error.message.includes('Failed to fetch reference image')) {
            console.error('Reference image fetch failed:', error);
            res.status(500).json({
              error: 'REFERENCE_IMAGE_FETCH_FAILED',
              message: 'Failed to fetch reference axonometric image for correlation.',
              details: error.message,
            });
            return;
          }
          throw error;
        }

        // Store the rendered image
        const imageUrl = await storeRenderedImage(
          projectId,
          finalConceptId,
          renderType,
          result.imageBase64
        );

        // Final conceptRange used (from seed)
        const finalConceptRange = conceptBrief.conceptRange;

        // When Supabase is not configured, /tmp is not shared across Vercel instances - include data URL so frontend can display immediately
        const hasSupabase = !!(process.env.SUPABASE_URL && (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));
        const imageDataUrl = !hasSupabase ? `data:image/png;base64,${result.imageBase64}` : undefined;

        // Comprehensive logging
        console.log('=== /api/render completed ===');
        console.log(`  conceptId: ${finalConceptId}`);
        console.log(`  renderType: ${renderType}`);
        console.log(`  inputConceptRange: ${inputConceptRange || '(not provided)'}`);
        console.log(`  finalConceptRange: ${finalConceptRange}`);
        console.log(`  promptVersion: ${promptResult.promptVersion}`);
        console.log('============================');

        // Build and send response
        const response: RenderResponse = {
          conceptId: finalConceptId,
          renderType: renderType as RenderType,
          imageUrl,
          ...(imageDataUrl && { imageDataUrl }),
          promptVersion: promptResult.promptVersion,
          conceptRange: finalConceptRange, // Return final conceptRange used
        };

        res.json(response);
      } catch (error) {
        next(error);
      }
    }
  );

  // Single render endpoint: POST /api/render handles axon, floor_plan, and section (see above).
  // Do not add a separate POST /render or other render route.

  // ============================================================================
  // TEST ENDPOINTS - 3-view concept workflow
  // ============================================================================

  // POST /test/concept/create - Creates initial concept (axon) and seed
  app.post(
    '/test/concept/create',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        // Validate conceptInputs (required) - accept both ConceptBrief and ConceptInputs
        const conceptInputs = req.body.conceptInputs || req.body;
        
        // Accept both ConceptBrief (new format) and ConceptInputs (legacy format)
        let conceptBrief: ConceptBrief;
        
        if ('proposedDesign' in conceptInputs) {
          // Already in ConceptBrief format
          conceptBrief = conceptInputs as ConceptBrief;
        } else if (isValidConceptInputs(conceptInputs)) {
          // Convert legacy ConceptInputs to ConceptBrief
          conceptBrief = legacyInputsToConceptBrief(conceptInputs);
        } else {
          res.status(400).json({
            error: 'conceptInputs or ConceptBrief is required',
          });
          return;
        }

        // Force output type to axonometric for the create endpoint
        conceptBrief.proposedDesign.outputType = 'concept_axonometric';

        // Generate conceptId (UUID)
        const conceptId = randomUUID();
        
        // Optional projectId for storage organization
        const projectId = req.body.projectId || 'default';

        // Generate concept seed
        const conceptSeed = await generateConceptSeed(conceptBrief);

        // Build prompt for axonometric view
        const promptResult = buildConceptPrompt(conceptBrief, {
          conceptSeed,
        });

        // Generate axonometric image
        const axonResult = await generateConceptImage(
          Buffer.alloc(0), // No sketch input for create endpoint
          'axonometric',
          undefined,
          promptResult.prompt
        );

        // Create a data URL for the axon image (for testing, can be replaced with proper storage)
        const axonImageUrl = `data:image/png;base64,${axonResult.imageBase64}`;

        // Store concept seed with axon image URL
        await storeConceptSeed(projectId, conceptId, conceptSeed, axonImageUrl);

        res.json({
          conceptId,
          projectId,
          conceptSeed,
          axonImageUrl,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // POST /test/concept/plan - Generates isometric floor plan cutaway using stored seed and axon reference
  app.post(
    '/test/concept/plan',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { projectId, conceptId } = req.body;

        if (!projectId || typeof projectId !== 'string') {
          res.status(400).json({
            error: 'projectId is required and must be a string',
          });
          return;
        }

        if (!conceptId || typeof conceptId !== 'string') {
          res.status(400).json({
            error: 'conceptId is required and must be a string',
          });
          return;
        }

        // Load stored concept seed
        const storedConcept = await getConceptSeed(projectId, conceptId);
        if (!storedConcept) {
          res.status(404).json({
            error: `Concept not found: ${projectId}/${conceptId}`,
          });
          return;
        }

        if (!storedConcept.axonImageUrl) {
          res.status(404).json({
            error: `Axon image URL not found for concept: ${projectId}/${conceptId}`,
          });
          return;
        }

        // Fetch axon image from URL
        const axonImageResponse = await fetch(storedConcept.axonImageUrl);
        if (!axonImageResponse.ok) {
          res.status(500).json({
            error: `Failed to fetch axon image: ${axonImageResponse.status}`,
          });
          return;
        }
        const axonImageArrayBuffer = await axonImageResponse.arrayBuffer();
        const referenceAxonBuffer = Buffer.from(axonImageArrayBuffer);

        // Reconstruct ConceptBrief from stored seed (minimal for plan generation)
        // In a real implementation, you might store the full ConceptBrief
        // For now, create a minimal brief with plan output type
        const conceptBrief: ConceptBrief = {
          proposedDesign: {
            projectType: 'new_build',
            buildingForm: 'detached',
            storeys: storedConcept.conceptSeed.storeys === '1' ? 'one' : storedConcept.conceptSeed.storeys === '2' ? 'two' : 'three_plus',
            numberOfPlots: 'one',
            totalFloorAreaRange: '100_150',
            bedrooms: 'two',
            bathrooms: 'one',
            kitchenType: 'open_plan',
            livingSpaces: 'single_main_space',
            roofType: storedConcept.conceptSeed.roof,
            massingPreference: 'simple_compact',
            outputType: 'concept_plan',
          },
        };

        // Build prompt with seed and reference axon
        const promptResult = buildConceptPrompt(conceptBrief, {
          conceptSeed: storedConcept.conceptSeed,
          hasReferenceAxon: true,
        });

        // Generate plan image
        const planResult = await generateConceptImage(
          Buffer.alloc(0),
          'floor_plan',
          undefined,
          promptResult.prompt,
          referenceAxonBuffer
        );

        // Create data URL for plan image
        const planImageUrl = `data:image/png;base64,${planResult.imageBase64}`;

        res.json({
          conceptId,
          projectId,
          planImageUrl,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // POST /test/concept/section - Generates section view using stored seed and axon reference
  app.post(
    '/test/concept/section',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { projectId, conceptId } = req.body;

        if (!projectId || typeof projectId !== 'string') {
          res.status(400).json({
            error: 'projectId is required and must be a string',
          });
          return;
        }

        if (!conceptId || typeof conceptId !== 'string') {
          res.status(400).json({
            error: 'conceptId is required and must be a string',
          });
          return;
        }

        // Load stored concept seed
        const storedConcept = await getConceptSeed(projectId, conceptId);
        if (!storedConcept) {
          res.status(404).json({
            error: `Concept not found: ${projectId}/${conceptId}`,
          });
          return;
        }

        if (!storedConcept.axonImageUrl) {
          res.status(404).json({
            error: `Axon image URL not found for concept: ${projectId}/${conceptId}`,
          });
          return;
        }

        // Fetch axon image from URL
        const axonImageResponse = await fetch(storedConcept.axonImageUrl);
        if (!axonImageResponse.ok) {
          res.status(500).json({
            error: `Failed to fetch axon image: ${axonImageResponse.status}`,
          });
          return;
        }
        const axonImageArrayBuffer = await axonImageResponse.arrayBuffer();
        const referenceAxonBuffer = Buffer.from(axonImageArrayBuffer);

        // Reconstruct ConceptBrief from stored seed
        const conceptBrief: ConceptBrief = {
          proposedDesign: {
            projectType: 'new_build',
            buildingForm: 'detached',
            storeys: storedConcept.conceptSeed.storeys === '1' ? 'one' : storedConcept.conceptSeed.storeys === '2' ? 'two' : 'three_plus',
            numberOfPlots: 'one',
            totalFloorAreaRange: '100_150',
            bedrooms: 'two',
            bathrooms: 'one',
            kitchenType: 'open_plan',
            livingSpaces: 'single_main_space',
            roofType: storedConcept.conceptSeed.roof,
            massingPreference: 'simple_compact',
            outputType: 'concept_section',
          },
        };

        // Build prompt with seed and reference axon
        const promptResult = buildConceptPrompt(conceptBrief, {
          conceptSeed: storedConcept.conceptSeed,
          hasReferenceAxon: true,
        });

        // Generate section image
        const sectionResult = await generateConceptImage(
          Buffer.alloc(0),
          'section',
          undefined,
          promptResult.prompt,
          referenceAxonBuffer
        );

        // Create data URL for section image
        const sectionImageUrl = `data:image/png;base64,${sectionResult.imageBase64}`;

        res.json({
          conceptId,
          projectId,
          sectionImageUrl,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // Serve static files from public directory (after all API routes)
  // Only serve static files for GET requests to avoid interfering with API routes
  app.get('*', express.static(join(__dirname, '../public'), {
    index: 'index.html',
  }));

  // Error handling middleware - must be last
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction): void => {
    console.error('Express error handler:', err);
    console.error('Error stack:', err.stack);
    
    // Ensure we haven't already sent a response
    if (res.headersSent) {
      return _next(err);
    }
    
    // Always return JSON error response
    res.status(500).json({
      error: 'Internal server error',
      message: err.message || 'An unexpected error occurred',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  });

  return app;
}

/**
 * Start the server
 */
export function startServer(): void {
  const app = createServer();
  const port = process.env.PORT ?? 3001;

  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

