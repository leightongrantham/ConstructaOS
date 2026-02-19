/**
 * Express server setup
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';
import { generateConceptImage } from './services/aiRenderService.js';
import { buildConceptPrompt } from './services/buildConceptPrompt.js';
import { geocodeAddress } from './services/geocodeAddress.js';
import { buildSiteEnvelope } from './services/buildSiteEnvelope.js';
import { buildSiteContextSummary } from './services/buildSiteContextSummary.js';
import { queryNearbyBuildings } from './services/queryNearbyBuildings.js';
import { inferExistingContextFromOSM } from './services/inferExistingContextFromOSM.js';
import { generateConceptSeed } from './services/generateConceptSeed.js';
import { storeConceptSeed, getConceptSeed, storeRenderedImage, loadConceptSeed, saveConceptSeed, loadRenderedImage, getRenderedImageUrl } from './utils/conceptStorage.js';
import type { ConceptInputs, ConceptBrief } from './types/conceptInputs.js';
import { legacyInputsToConceptBrief, conceptBriefToLegacyInputs } from './types/conceptInputs.js';
import type { RenderType, RenderResponse } from './types/render.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function isValidConceptInputs(value: unknown): value is ConceptInputs {
  if (!value || typeof value !== 'object') return false;
  const inputs = value as Partial<ConceptInputs>;
  return (
    typeof inputs.projectType === 'string' &&
    typeof inputs.buildingForm === 'string' &&
    typeof inputs.storeys === 'string' &&
    typeof inputs.numberOfPlots === 'string' &&
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

  // GET /storage/* endpoint for serving local storage files
  app.get('/storage/*', async (req: Request, res: Response) => {
    try {
      // Extract the path after /storage/
      const storagePath = req.path.replace('/storage/', '');
      
      // Construct local file path (from src/ when running with tsx)
      const localStorageDir = join(__dirname, '../.concepts');
      const localFilePath = join(localStorageDir, storagePath);
      
      // Security check: ensure the path is within the storage directory
      const normalizedPath = join(localStorageDir, storagePath);
      if (!normalizedPath.startsWith(localStorageDir)) {
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
  });

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

        const envelope = buildSiteEnvelope(lat, lng, conceptBrief);

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
      try {
        const { projectId, renderType, conceptId, conceptInputs } = req.body;

        // Validate required fields
        if (!projectId || typeof projectId !== 'string') {
          res.status(400).json({
            error: 'projectId is required and must be a string',
          });
          return;
        }

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

        // For plan/section, conceptId is REQUIRED (must be correlated with existing axon)
        const requiresExistingConcept = renderType === 'floor_plan' || renderType === 'section';
        if (requiresExistingConcept && (!conceptId || typeof conceptId !== 'string')) {
          res.status(400).json({
            error: 'conceptId is required for floor_plan and section renders',
          });
          return;
        }

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

        // Map renderType to outputType for conceptBrief
        const outputTypeMap = {
          'axonometric': 'concept_axonometric',
          'floor_plan': 'concept_plan',
          'section': 'concept_section',
        } as const;
        conceptBrief.proposedDesign.outputType = outputTypeMap[renderType as RenderType];

        // Generate conceptId if not provided (only for axonometric)
        const finalConceptId = conceptId && typeof conceptId === 'string' ? conceptId : randomUUID();

        // SEED PIPELINE: Load or generate concept seed
        let conceptSeed = await loadConceptSeed(projectId, finalConceptId);
        
        if (conceptSeed) {
          // Use existing seed
          console.log(`Using existing concept seed for ${projectId}/${finalConceptId}`);
        } else {
          // For plan/section, seed MUST exist (return 409 if missing)
          if (requiresExistingConcept) {
            res.status(409).json({
              error: 'SEED_REQUIRED',
              message: 'Concept seed missing. Regenerate concept.',
            });
            return;
          }
          
          // Generate new seed (only for axonometric)
          console.log(`Generating new concept seed for ${projectId}/${finalConceptId}`);
          conceptSeed = await generateConceptSeed(conceptBrief);
          
          // Store the seed for reuse
          await saveConceptSeed(projectId, finalConceptId, conceptSeed);
        }

        // AXON REQUIREMENT CHECK: For floor_plan or section, require axon image
        let referenceImageUrl: string | undefined;
        
        if (requiresExistingConcept) {
          // Check if axonometric image exists by trying to load it
          const axonBuffer = await loadRenderedImage(projectId, finalConceptId, 'axonometric');
          
          if (!axonBuffer) {
            // Axon image not found - return 409 error
            res.status(409).json({
              error: 'AXON_REQUIRED',
              message: 'Generate axonometric first for correlated plan/section.',
            });
            return;
          }
          
          // Get the URL of the axonometric image (don't need the buffer anymore)
          referenceImageUrl = getRenderedImageUrl(projectId, finalConceptId, 'axonometric') || undefined;
          
          if (referenceImageUrl) {
            console.log(`Using axonometric reference for ${renderType} render: ${referenceImageUrl}`);
          }
        }

        // Build prompt with concept seed and reference axon flag
        const promptResult = buildConceptPrompt(conceptBrief, {
          conceptSeed,
          hasReferenceAxon: !!referenceImageUrl,
        });

        // Generate the render with the built prompt
        let result;
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
        } catch (error) {
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

        // Build and send response
        const response: RenderResponse = {
          conceptId: finalConceptId,
          renderType: renderType as RenderType,
          imageUrl,
          promptVersion: promptResult.promptVersion,
        };

        res.json(response);
      } catch (error) {
        next(error);
      }
    }
  );

  // POST /render endpoint
  app.post(
    '/render',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        // Validate conceptInputs (required) - accept both ConceptBrief and ConceptInputs
        const conceptInputs = req.body.conceptInputs;
        
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

        // Generate conceptId (UUID)
        const conceptId = randomUUID();
        
        // Optional projectId for storage organization
        const projectId = req.body.projectId || 'default';

        // Generate concept seed
        const conceptSeed = await generateConceptSeed(conceptBrief);
        
        // Store concept seed (non-blocking - don't fail render if storage fails)
        storeConceptSeed(projectId, conceptId, conceptSeed).catch((storageError) => {
          console.error('Failed to store concept seed (non-fatal):', storageError);
        });

        // Optional sketch image (base64 string)
        const sketchImageBase64 = req.body.sketchImageBase64;
        const hasSketch = !!sketchImageBase64 && typeof sketchImageBase64 === 'string';

        // Optional reference axonometric image (for plan/section only)
        const referenceAxonImageUrl = req.body.referenceAxonImageUrl;
        const referenceAxonImageBase64 = req.body.referenceAxonImageBase64;
        const hasReferenceAxon = !!(referenceAxonImageUrl || referenceAxonImageBase64);
        
        // Validate reference image is only provided for plan/section
        const outputType = conceptBrief.proposedDesign.outputType;
        if (hasReferenceAxon && outputType === 'concept_axonometric') {
          res.status(400).json({
            error: 'referenceAxonImageUrl/referenceAxonImageBase64 should only be provided for plan or section renders, not axonometric',
          });
          return;
        }

        // Optional site context summary
        const siteContextSummary = req.body.siteContextSummary;
        const buildOptions: { hasSketch: boolean; siteContextSummary?: string; conceptSeed?: typeof conceptSeed; hasReferenceAxon?: boolean } = {
          hasSketch,
          conceptSeed, // Include conceptSeed for consistency across views
          hasReferenceAxon, // Include reference axon flag for prompt building
        };
        if (typeof siteContextSummary === 'string' && siteContextSummary.trim().length > 0) {
          buildOptions.siteContextSummary = siteContextSummary;
        }

        // Build prompt from structured inputs (accepts both ConceptBrief and ConceptInputs)
        const promptResult = buildConceptPrompt(conceptBrief, buildOptions);

        // Convert sketch base64 to buffer if present
        let sketchBuffer: Buffer | undefined;
        if (hasSketch) {
          try {
            sketchBuffer = Buffer.from(sketchImageBase64, 'base64');
          } catch (error) {
            res.status(400).json({
              error: 'Invalid sketchImageBase64: must be a valid base64-encoded image',
            });
            return;
          }
        }

        // Convert reference axonometric image to buffer if present
        let referenceAxonBuffer: Buffer | undefined;
        if (hasReferenceAxon) {
          try {
            if (referenceAxonImageBase64) {
              // Use base64 string directly
              referenceAxonBuffer = Buffer.from(referenceAxonImageBase64, 'base64');
            } else if (referenceAxonImageUrl) {
              // Fetch image from URL and convert to buffer
              const imageResponse = await fetch(referenceAxonImageUrl);
              if (!imageResponse.ok) {
                throw new Error(`Failed to fetch reference image: ${imageResponse.status} ${imageResponse.statusText}`);
              }
              const imageArrayBuffer = await imageResponse.arrayBuffer();
              referenceAxonBuffer = Buffer.from(imageArrayBuffer);
            }
          } catch (error) {
            res.status(400).json({
              error: `Invalid referenceAxonImageUrl/referenceAxonImageBase64: ${error instanceof Error ? error.message : 'Invalid image format'}`,
            });
            return;
          }
        }

        // Convert ConceptBrief back to legacy format for compatibility with existing code
        const legacyInputs = conceptBriefToLegacyInputs(conceptBrief);
        
        // Map outputType to RenderType for generateConceptImage
        // Note: generateConceptImage still uses the old RenderType, but we're using the prompt directly
        const renderType = legacyInputs.outputType === 'concept_plan' 
          ? 'floor_plan' 
          : legacyInputs.outputType === 'concept_section'
          ? 'section'
          : 'axonometric';

        // Generate concept image using the built prompt
        const result = await generateConceptImage(
          sketchBuffer || Buffer.alloc(0),
          renderType,
          undefined, // userRequest not used with structured inputs
          promptResult.prompt, // Pass the pre-built prompt
          referenceAxonBuffer // Pass reference axon buffer for plan/section renders
        );

        // If axonometric output, store axon image URL for use in plan/section generation
        if (legacyInputs.outputType === 'concept_axonometric') {
          const axonImageUrl = `data:image/png;base64,${result.imageBase64}`;
          // Update stored concept with axon image URL
          await storeConceptSeed(projectId, conceptId, conceptSeed, axonImageUrl).catch((storageError) => {
            console.error('Failed to update stored concept with axon URL (non-fatal):', storageError);
          });
        }

        // Return result with conceptId and prompt text for debugging
        res.json({
          conceptId,
          projectId,
          conceptSeed, // Include conceptSeed in response for UI
          imageBase64: result.imageBase64,
          model: result.model,
          promptVersion: promptResult.promptVersion,
          outputType: legacyInputs.outputType,
          promptText: result._rewrittenPrompt || promptResult.prompt,
        });
      } catch (error) {
        next(error);
      }
    }
  );

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

  // POST /test/concept/plan - Generates plan view using stored seed and axon reference
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

