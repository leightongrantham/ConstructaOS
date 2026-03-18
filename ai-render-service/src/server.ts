/**
 * Express server setup
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import 'express-async-errors'; // Ensures async route rejections are passed to error handler (so we always return JSON, not Vercel's "An error occurred...")
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
import { generateConceptSeed, validateAndNormalizeSeed } from './services/generateConceptSeed.js';
import { storeConceptSeed, getConceptSeed, storeRenderedImage, loadConceptSeed, saveConceptSeed, loadRenderedImage, getRenderedImageUrl, LOCAL_STORAGE_DIR } from './utils/conceptStorage.js';
import { lookupSiteBaselineFull } from './services/site/lookupSiteBaseline.js';
import { runSiteLookup } from './services/site/runSiteLookup.js';
import type { ConceptInputs, ConceptBrief } from './types/conceptInputs.js';
import type { ExistingBaseline } from './services/site/inferExistingBaseline.js';
import { legacyInputsToConceptBrief } from './types/conceptInputs.js';
import type { RenderType, RenderResponse, SiteInput, ExistingBuildingPayload } from './types/render.js';
import type { RenderJob, JobStatusResponse } from './types/job.js';
import { storeJob, getJob } from './utils/jobStorage.js';
import { extractSupabaseConfig, resolveSupabaseConfig } from './utils/supabaseConfig.js';
import type { ConceptSeed as ConceptSeedType, StoreyCount } from './services/generateConceptSeed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type SiteParams = {
  hasSite: boolean;
  address?: string;
  lat?: number;
  lng?: number;
  baselineId?: number;
  /** Selected footprint from client; when set, renderer uses this instead of auto-detected primary. */
  existingBuilding?: ExistingBuildingPayload;
  baselineOverride?: { buildingForm?: string; storeys?: string; roofAssumption?: string; footprintScale?: string };
};

/** If job.imageUrl is a relative /storage/ path, rewrite to absolute URL so cross-origin clients can load the image. */
function jobWithAbsoluteImageUrl(job: RenderJob, req: Request): RenderJob {
  if (!job.imageUrl?.startsWith('/storage/')) return job;
  const base = `${req.protocol}://${req.get('host') || req.hostname}`;
  return { ...job, imageUrl: `${base}${job.imageUrl}` };
}

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
    if (site.existingBuilding) out.existingBuilding = site.existingBuilding;
    if (baselineOverride) out.baselineOverride = baselineOverride;
    return out;
  }
  const address = body.address as string | undefined;
  const lat = body.lat as number | undefined;
  const lng = body.lng as number | undefined;
  const hasSite = !!(address || (typeof lat === 'number' && typeof lng === 'number'));
  const selectedBuildingId = body.selectedBuildingId as number | undefined;
  const existingBuilding = body.existingBuilding as ExistingBuildingPayload | undefined;
  const baselineOverrides = body.baselineOverrides as
    | { buildingForm?: string; storeys?: string; roofAssumption?: string; footprintScale?: string }
    | undefined;
  const out: SiteParams = { hasSite };
  if (address !== undefined) out.address = address;
  if (lat !== undefined) out.lat = lat;
  if (lng !== undefined) out.lng = lng;
  if (selectedBuildingId !== undefined) out.baselineId = selectedBuildingId;
  if (existingBuilding) out.existingBuilding = existingBuilding;
  if (baselineOverrides) out.baselineOverride = baselineOverrides;
  return out;
}

/** Map client classification to ExistingBaseline.buildingForm. */
function existingBuildingForm(
  classification: ExistingBuildingPayload['classification']
): ExistingBaseline['buildingForm'] {
  switch (classification) {
    case 'detached': return 'Detached';
    case 'semi': return 'Semi-detached';
    case 'terrace': return 'Terraced';
    default: return 'Unknown';
  }
}

/** Apply client-provided existingBuilding (selected footprint) to baseline so renderer uses selected, not auto-detected. */
function applyExistingBuildingToBaseline(
  baseline: ExistingBaseline | null,
  existingBuilding: ExistingBuildingPayload
): ExistingBaseline | null {
  const form = existingBuildingForm(existingBuilding.classification);
  if (baseline) {
    baseline.buildingForm = form;
    baseline.footprintAreaM2 = existingBuilding.footprintArea;
    baseline.rationale.push(`Selected footprint: ${form}, ${Math.round(existingBuilding.footprintArea)} m², ${existingBuilding.adjacencyCount} adjacent`);
    return baseline;
  }
  return null;
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

type LegacyClientRenderType =
  | 'concept-axon'
  | 'concept-axonometric'
  | 'concept-axonometric-cutaway'
  | 'concept-plan'
  | 'concept-floor-plan'
  | 'concept-section';

function normalizeIncomingRenderType(renderType: unknown): RenderType | undefined {
  if (renderType === 'axonometric' || renderType === 'floor_plan' || renderType === 'section') return renderType;
  if (typeof renderType !== 'string') return undefined;
  const rt = renderType.trim();

  // Common legacy/client aliases (Lovable + UI prototyping)
  const legacyMap: Record<LegacyClientRenderType, RenderType> = {
    'concept-axon': 'axonometric',
    'concept-axonometric': 'axonometric',
    'concept-axonometric-cutaway': 'axonometric',
    'concept-plan': 'floor_plan',
    'concept-floor-plan': 'floor_plan',
    'concept-section': 'section',
  };
  if (rt in legacyMap) return legacyMap[rt as LegacyClientRenderType];

  // Also accept underscore forms if someone passes outputType by mistake
  const underscoreMap: Record<string, RenderType> = {
    concept_axonometric: 'axonometric',
    concept_plan: 'floor_plan',
    concept_section: 'section',
  };
  if (rt in underscoreMap) return underscoreMap[rt] ?? undefined;

  return undefined;
}

function mapConceptRange(input: unknown): ConceptBrief['conceptRange'] | undefined {
  if (typeof input !== 'string') return undefined;
  const v = input.trim().toLowerCase();
  if (v === 'grounded') return 'Grounded';
  if (v === 'exploratory') return 'Exploratory';
  if (v === 'speculative') return 'Speculative';
  // Allow already-capitalized internal values
  if (input === 'Grounded' || input === 'Exploratory' || input === 'Speculative') return input as ConceptBrief['conceptRange'];
  return undefined;
}

function mapProjectType(input: unknown): ConceptBrief['proposedDesign']['projectType'] | undefined {
  if (typeof input !== 'string') return undefined;
  const v = input.trim();
  if (v === 'extension' || v === 'renovation' || v === 'new_build') return v;
  if (v === 'new-build') return 'new_build';
  return undefined;
}

function mapStoreys(input: unknown): any {
  if (typeof input !== 'string') return undefined;
  const v = input.trim();
  if (v === '1') return 'one';
  if (v === '2') return 'two';
  if (v === '3+') return 'three_plus';
  return undefined;
}

function mapFloorAreaRange(input: unknown): any {
  if (typeof input !== 'string') return undefined;
  const v = input.trim();
  const m: Record<string, string> = {
    '0-25': '0_25',
    '25-50': '25_50',
    '50-75': '50_75',
    '75-100': '75_100',
    '100-150': '100_150',
    '150-200': '150_200',
    '200+': '200_plus',
  };
  return m[v];
}

function mapBuildingForm(input: unknown): any {
  if (typeof input !== 'string') return undefined;
  const v = input.trim().toLowerCase();
  if (v === 'detached') return 'detached';
  if (v === 'semi-detached' || v === 'semi_detached' || v === 'semi') return 'semi_detached';
  if (v === 'terraced' || v === 'terrace') return 'terraced';
  if (v === 'infill') return 'infill';
  return undefined;
}

function mapRoofType(input: unknown): any {
  if (typeof input !== 'string') return undefined;
  const v = input.trim().toLowerCase();
  if (v === 'flat' || v === 'pitched' || v === 'mixed') return v;
  return undefined;
}

function mapKitchenType(input: unknown): any {
  if (typeof input !== 'string') return undefined;
  const v = input.trim().toLowerCase();
  if (v === 'open-plan' || v === 'open_plan') return 'open_plan';
  if (v === 'semi-open' || v === 'semi_open') return 'semi_open';
  if (v === 'separate') return 'separate';
  return undefined;
}

function mapLivingSpaces(input: unknown): any {
  if (typeof input !== 'string') return undefined;
  const v = input.trim().toLowerCase();
  if (v === 'single' || v === 'single_main_space') return 'single_main_space';
  if (v === 'multiple' || v === 'multiple_living_areas') return 'multiple_living_areas';
  return undefined;
}

function mapMassingPreference(input: unknown): any {
  if (typeof input !== 'string') return undefined;
  const v = input.trim().toLowerCase();
  const m: Record<string, string> = {
    'split-volumes': 'split_volumes',
    'split_volumes': 'split_volumes',
    'stepped': 'stepped',
    'simple-compact': 'simple_compact',
    'simple_compact': 'simple_compact',
    'linear-elongated': 'linear_elongated',
    'linear_elongated': 'linear_elongated',
    'courtyard': 'courtyard',
    'vertical-tall': 'vertical_tall',
    'vertical_tall': 'vertical_tall',
  };
  return m[v];
}

function mapOrientation(input: unknown): any {
  if (typeof input !== 'string') return undefined;
  const v = input.trim().toLowerCase();
  const m: Record<string, string> = {
    'north-facing-rear': 'north_facing_rear',
    'south-facing-rear': 'south_facing_rear',
    'north_facing_rear': 'north_facing_rear',
    'south_facing_rear': 'south_facing_rear',
    east: 'east',
    west: 'west',
  };
  return m[v];
}

function mapBedrooms(input: unknown): any {
  if (typeof input === 'number' && Number.isFinite(input)) {
    if (input <= 0) return 'zero';
    if (input === 1) return 'one';
    if (input === 2) return 'two';
    if (input === 3) return 'three';
    return 'four_plus';
  }
  if (typeof input === 'string') {
    const n = Number(input);
    if (!Number.isNaN(n)) return mapBedrooms(n);
  }
  return undefined;
}

function mapBathrooms(input: unknown): any {
  if (typeof input === 'number' && Number.isFinite(input)) {
    if (input <= 0) return 'zero';
    if (input === 1) return 'one';
    if (input === 2) return 'two';
    return 'three_plus';
  }
  if (typeof input === 'string') {
    const n = Number(input);
    if (!Number.isNaN(n)) return mapBathrooms(n);
  }
  return undefined;
}

function mapExtensionType(input: unknown): any {
  if (typeof input !== 'string') return undefined;
  const v = input.trim().toLowerCase();
  const m: Record<string, string> = {
    rear: 'rear',
    side: 'side',
    'side-and-rear': 'side_and_rear',
    'side_and_rear': 'side_and_rear',
    'wrap-around': 'wrap_around',
    wrap_around: 'wrap_around',
    'two-storey': 'two_storey',
    two_storey: 'two_storey',
    'single-storey': 'single_storey',
    single_storey: 'single_storey',
  };
  return m[v];
}

function mapOutputTypeToConceptOutputType(input: unknown): any {
  if (typeof input !== 'string') return undefined;
  const v = input.trim().toLowerCase();
  if (v === 'concept-axon' || v === 'concept_axonometric' || v === 'concept-axonometric') return 'concept_axonometric';
  if (v === 'isometric-plan' || v === 'concept-plan' || v === 'concept_plan' || v === 'concept-floor-plan') return 'concept_plan';
  if (v === 'concept-section' || v === 'concept_section') return 'concept_section';
  return undefined;
}

function conceptBriefFromNewSchema(body: Record<string, unknown>): ConceptBrief | null {
  const proposedAddition = body.proposedAddition as Record<string, unknown> | undefined;
  const outputSettings = body.outputSettings as Record<string, unknown> | undefined;
  if (!proposedAddition || typeof proposedAddition !== 'object' || !outputSettings || typeof outputSettings !== 'object') return null;

  const projectType = mapProjectType(proposedAddition.projectType);
  const outputType = mapOutputTypeToConceptOutputType(outputSettings.outputType);
  if (!projectType || !outputType) return null;

  const existingBuilding = (body.existingBuilding as Record<string, unknown> | undefined) ?? undefined;

  const existingContext: ConceptBrief['existingContext'] | undefined = existingBuilding
    ? {
        buildingForm: mapBuildingForm(existingBuilding.buildingForm),
        density: typeof existingBuilding.density === 'string' ? (existingBuilding.density as any) : undefined,
        orientation: mapOrientation(existingBuilding.orientation),
      }
    : undefined;

  const baseProposed: Record<string, unknown> = {
    projectType,
    roofType: mapRoofType(proposedAddition.roofType),
    massingPreference: mapMassingPreference(proposedAddition.massingPreference),
    kitchenType: mapKitchenType(proposedAddition.kitchenType),
    livingSpaces: mapLivingSpaces(proposedAddition.livingSpaces),
    bedrooms: mapBedrooms(proposedAddition.bedrooms),
    bathrooms: mapBathrooms(proposedAddition.bathrooms),
    orientation: mapOrientation(proposedAddition.orientation),
    outputType,
    footprintScale: typeof proposedAddition.footprintScale === 'string' ? (proposedAddition.footprintScale as any) : undefined,
  };

  if (projectType === 'new_build') {
    baseProposed.storeys = mapStoreys(proposedAddition.storeys);
    baseProposed.totalFloorAreaRange = mapFloorAreaRange(proposedAddition.floorAreaRange);
    if (typeof proposedAddition.numberOfPlots === 'string') baseProposed.numberOfPlots = (proposedAddition.numberOfPlots as any);
  } else if (projectType === 'extension') {
    baseProposed.extensionType = mapExtensionType(proposedAddition.extensionType);
    baseProposed.additionalFloorAreaRange = mapFloorAreaRange(proposedAddition.floorAreaRange);
  } else if (projectType === 'renovation') {
    if (typeof proposedAddition.renovationScope === 'string') {
      baseProposed.renovationScope = proposedAddition.renovationScope as any;
    }
  }

  const brief: ConceptBrief = {
    proposedDesign: baseProposed as any,
  };
  const range = mapConceptRange(outputSettings.conceptRange);
  if (range) brief.conceptRange = range;
  if (existingContext) brief.existingContext = existingContext;

  return brief;
}

/**
 * Normalize incoming payload shapes.
 * - Some clients send `{ conceptInputs: { projectId, proposedDesign, ... }, renderType: "concept-axon" }`
 * - Others send `{ projectId, renderType: "axonometric", conceptInputs: { ... } }`
 */
function normalizeRenderRequestBody(body: Record<string, unknown>): {
  projectId?: string;
  renderType?: RenderType;
  conceptId?: string;
  conceptInputs?: unknown;
  includePeopleInPlan?: unknown;
  includePeopleInSection?: unknown;
  /** When true, return the raw render result (like `test/runLocalRender.ts`). */
  returnRawResult?: boolean;
} {
  const newBrief = conceptBriefFromNewSchema(body);
  const conceptInputs = (newBrief ?? body.conceptInputs) as unknown;
  const wrappedConceptInputs = (body.conceptInputs && typeof body.conceptInputs === 'object' ? body.conceptInputs : undefined) as Record<string, unknown> | undefined;

  // projectId may be top-level or nested inside conceptInputs (some clients treat it as part of "conceptInputs")
  const projectId =
    (typeof body.projectId === 'string' && body.projectId.trim()) ||
    (wrappedConceptInputs && typeof wrappedConceptInputs.projectId === 'string' && wrappedConceptInputs.projectId.trim()) ||
    undefined;

  const normalizedRenderType =
    normalizeIncomingRenderType(body.renderType) ??
    normalizeIncomingRenderType((body.outputSettings as Record<string, unknown> | undefined)?.outputType);
  const conceptId = typeof body.conceptId === 'string' && body.conceptId.trim() ? body.conceptId.trim() : undefined;

  // Allow boolean flag or string "true"
  const returnRawResult =
    body.returnRawResult === true ||
    body.returnRawResult === 'true' ||
    body.returnFormat === 'raw' ||
    body.returnFormat === 'harness';

  const out: {
    projectId?: string;
    renderType?: RenderType;
    conceptId?: string;
    conceptInputs?: unknown;
    includePeopleInPlan?: unknown;
    includePeopleInSection?: unknown;
    returnRawResult?: boolean;
  } = {};
  if (projectId !== undefined) out.projectId = projectId;
  if (normalizedRenderType !== undefined) out.renderType = normalizedRenderType;
  if (conceptId !== undefined) out.conceptId = conceptId;
  if (conceptInputs !== undefined) out.conceptInputs = conceptInputs;
  if (body.includePeopleInPlan !== undefined) out.includePeopleInPlan = body.includePeopleInPlan;
  if (body.includePeopleInSection !== undefined) out.includePeopleInSection = body.includePeopleInSection;
  // New schema: booleans are nested under outputSettings
  const os = body.outputSettings as Record<string, unknown> | undefined;
  if (os && typeof os === 'object') {
    if (out.includePeopleInPlan === undefined && os.includePeopleInPlan !== undefined) out.includePeopleInPlan = os.includePeopleInPlan;
    if (out.includePeopleInSection === undefined && os.includePeopleInSection !== undefined) out.includePeopleInSection = os.includePeopleInSection;
  }
  if (returnRawResult) out.returnRawResult = true;
  return out;
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
  // Skip body parsing when body already set (e.g. delegated from root or Vercel) to avoid "stream is not readable"
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.body !== undefined && req.body !== null) return next();
    express.json({ limit: '10mb' })(req, res, next);
  });

  // Body parser errors (e.g. invalid JSON) must return JSON so client never sees "Unexpected token" or plain-text errors
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    const isSyntaxError = err instanceof SyntaxError || (err && typeof err === 'object' && 'body' in err);
    if (isSyntaxError) {
      res.status(400).json({
        error: 'Invalid request body',
        message: err instanceof Error ? err.message : 'Malformed JSON or body too large',
      });
      return;
    }
    next(err);
  });

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  /**
   * GET /api/health/keys - Key presence and optional validation (no key values returned).
   * ?validate=1 runs a minimal OpenAI call to confirm the key works.
   * (Also mounted at /health/keys for when Vercel strips /api prefix.)
   */
  const healthKeysHandler = async (req: Request, res: Response) => {
    const openaiSet = Boolean(process.env.OPENAI_API_KEY?.trim());
    const gatewaySet = Boolean(process.env.AI_GATEWAY_API_KEY?.trim());
    const imageReady = openaiSet || gatewaySet;

    const out: Record<string, unknown> = {
      keys: {
        openai: { set: openaiSet },
        gateway: { set: gatewaySet },
        imageReady,
      },
    };

    if (req.query.validate === '1' || req.query.validate === 'true') {
      if (!imageReady) {
        res.status(200).json({ ...out, validated: false, error: 'No API key set (OPENAI_API_KEY or AI_GATEWAY_API_KEY)' });
        return;
      }
      try {
        const { chatClient, chatModel } = await import('./utils/openaiClient.js');
        const start = Date.now();
        await chatClient.responses.create({
          model: chatModel('gpt-4o-mini'),
          input: 'Reply with exactly: OK',
          max_output_tokens: 10,
        });
        (out as Record<string, unknown>).validated = true;
        (out as Record<string, unknown>).valid = true;
        (out as Record<string, unknown>).durationMs = Date.now() - start;
      } catch (err) {
        (out as Record<string, unknown>).validated = true;
        (out as Record<string, unknown>).valid = false;
        (out as Record<string, unknown>).error = err instanceof Error ? err.message : String(err);
      }
    }

    res.status(200).json(out);
  };
  app.get('/api/health/keys', healthKeysHandler);
  app.get('/health/keys', healthKeysHandler);

  /**
   * GET /test/openai - OpenAI connectivity test (diagnostic for connection errors)
   * Tests chat (gateway or direct). Accepts either OPENAI_API_KEY or AI_GATEWAY_API_KEY.
   */
  app.get('/test/openai', async (_req: Request, res: Response) => {
    const results: Record<string, { ok: boolean; duration?: number; error?: string }> = {};
    const hasGateway = Boolean(process.env.AI_GATEWAY_API_KEY?.trim());
    const hasOpenAI = Boolean(process.env.OPENAI_API_KEY?.trim());
    const hasAnyKey = hasOpenAI || hasGateway;

    if (!hasAnyKey) {
      res.status(500).json({
        error: 'Neither OPENAI_API_KEY nor AI_GATEWAY_API_KEY is set',
        results: { env: { hasGateway, hasOpenAI } },
      });
      return;
    }

    try {
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
        const body = req.body as Record<string, unknown>;
        const directProjectId = typeof body.projectId === 'string' ? body.projectId.trim() : '';
        const nestedProjectId =
          body.conceptInputs &&
          typeof body.conceptInputs === 'object' &&
          typeof (body.conceptInputs as Record<string, unknown>).projectId === 'string'
            ? ((body.conceptInputs as Record<string, unknown>).projectId as string).trim()
            : '';
        const projectId = (directProjectId || nestedProjectId) || undefined;
        const renderType = normalizeIncomingRenderType(body.renderType);
        const conceptInputs = body.conceptInputs as any;
        const conceptId = typeof body.conceptId === 'string' ? body.conceptId : undefined;
        const sbClientConfig = extractSupabaseConfig(req.body);
        const sb = resolveSupabaseConfig(sbClientConfig);

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

        // Align renderType with conceptInputs.outputType so job is created with correct type (e.g. isometric cutaway when client sends outputType 'concept_plan' but renderType 'axonometric')
        const requestedOutputType =
          (conceptInputs && typeof conceptInputs === 'object' && (conceptInputs as any).proposedDesign?.outputType) ||
          (conceptInputs && typeof conceptInputs === 'object' && (conceptInputs as any).outputType);
        let effectiveRenderType: RenderType = renderType as RenderType;
        if (requestedOutputType === 'concept_plan' && renderType !== 'floor_plan') {
          effectiveRenderType = 'floor_plan';
          console.log('[jobs/render] Using renderType=floor_plan from conceptInputs.outputType (concept_plan)');
        } else if (requestedOutputType === 'concept_section' && renderType !== 'section') {
          effectiveRenderType = 'section';
          console.log('[jobs/render] Using renderType=section from conceptInputs.outputType (concept_section)');
        } else if (requestedOutputType === 'concept_axonometric' && renderType !== 'axonometric') {
          effectiveRenderType = 'axonometric';
          console.log('[jobs/render] Using renderType=axonometric from conceptInputs.outputType (concept_axonometric)');
        }

        // Generate job ID and concept ID
        const jobId = randomUUID();
        const finalConceptId = conceptId || randomUUID();

        // Create job record (use effectiveRenderType so process uses correct prompt and response)
        const job: RenderJob = {
          jobId,
          projectId,
          conceptId: finalConceptId,
          renderType: effectiveRenderType,
          status: 'pending',
          progress: 0,
          createdAt: new Date().toISOString(),
        };

        // Store job (fast operation, <1s)
        await storeJob(job, sb);

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
        const { projectId, supabaseUrl, supabaseKey, supabaseBucket } = req.query;
        const sb = resolveSupabaseConfig({
          supabaseUrl: typeof supabaseUrl === 'string' ? supabaseUrl : undefined,
          supabaseKey: typeof supabaseKey === 'string' ? supabaseKey : undefined,
          supabaseBucket: typeof supabaseBucket === 'string' ? supabaseBucket : undefined,
        });

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

        const job = await getJob(projectId, jobId, sb);

        if (!job) {
          res.status(404).json({
            error: 'Job not found',
            jobId,
          });
          return;
        }

        const response: JobStatusResponse = { job: jobWithAbsoluteImageUrl(job, req) };
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
        const sbClientConfig = extractSupabaseConfig(req.body);
        const sb = resolveSupabaseConfig(sbClientConfig);

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
        let job = await getJob(projectId, jobId, sb);
        if (!job) {
          res.status(404).json({
            error: 'Job not found',
            jobId,
          });
          return;
        }

        // Check if already completed
        if (job.status === 'completed') {
          res.json({ job: jobWithAbsoluteImageUrl(job, req), message: 'Job already completed' });
          return;
        }

        // Update job to processing
        job.status = 'processing';
        job.startedAt = new Date().toISOString();
        job.progress = 10;
        await storeJob(job, sb);

        // Parse concept inputs
        let conceptBrief: ConceptBrief;
        if (conceptInputs == null || typeof conceptInputs !== 'object') {
          job.status = 'failed';
          job.error = 'conceptInputs is required and must be an object';
          await storeJob(job, sb);
          res.status(400).json({ job });
          return;
        }
        if ('proposedDesign' in conceptInputs) {
          conceptBrief = conceptInputs as ConceptBrief;
        } else if (isValidConceptInputs(conceptInputs)) {
          conceptBrief = legacyInputsToConceptBrief(conceptInputs);
        } else {
          job.status = 'failed';
          job.error = 'Invalid conceptInputs';
          await storeJob(job, sb);
          res.status(400).json({ job });
          return;
        }

        // Apply default conceptRange
        if (!conceptBrief.conceptRange) {
          conceptBrief.conceptRange = 'Grounded';
        }

        // Align effective renderType with conceptBrief.proposedDesign.outputType when they conflict (same as sync /api/render)
        let effectiveRenderType: RenderType = job.renderType;
        const requestedOutputType = conceptBrief.proposedDesign?.outputType;
        if (requestedOutputType === 'concept_plan' && job.renderType !== 'floor_plan') {
          effectiveRenderType = 'floor_plan';
          console.log('[jobs/process] Using renderType=floor_plan from conceptInputs.outputType (concept_plan)');
        } else if (requestedOutputType === 'concept_section' && job.renderType !== 'section') {
          effectiveRenderType = 'section';
          console.log('[jobs/process] Using renderType=section from conceptInputs.outputType (concept_section)');
        } else if (requestedOutputType === 'concept_axonometric' && job.renderType !== 'axonometric') {
          effectiveRenderType = 'axonometric';
          console.log('[jobs/process] Using renderType=axonometric from conceptInputs.outputType (concept_axonometric)');
        }

        // Map renderType to outputType
        const outputTypeMap = {
          'axonometric': 'concept_axonometric',
          'floor_plan': 'concept_plan',
          'section': 'concept_section',
        } as const;
        conceptBrief.proposedDesign.outputType = outputTypeMap[effectiveRenderType];

        // Resolve baseline from site (same as sync /api/render) so Lovable can send address/lat/lng and get same prompt context
        const siteParams = getSiteParams(req.body);
        let resolvedBaseline: ExistingBaseline | null = null;
        try {
          resolvedBaseline = await resolveBaselineIfSite(siteParams);
          if (resolvedBaseline) {
            console.log(`[jobs/process] Resolved existingBaseline (confidence: ${resolvedBaseline.confidence})`);
          }
          if (siteParams.existingBuilding) {
            resolvedBaseline = applyExistingBuildingToBaseline(resolvedBaseline, siteParams.existingBuilding);
            if (resolvedBaseline) {
              console.log(`[jobs/process] Applied selected footprint: ${siteParams.existingBuilding.classification}, ${siteParams.existingBuilding.footprintArea} m²`);
            }
          }
        } catch (err) {
          console.error('[jobs/process] Baseline resolution failed:', err);
        }

        // Load or generate seed (with baseline so prompt matches sync renderer). Prefer client-supplied seed (e.g. from Lovable).
        job.progress = 30;
        await storeJob(job, sb);

        const jobClientSeed = req.body?.conceptSeed;
        const jobHasValidClientSeed =
          jobClientSeed &&
          typeof jobClientSeed === 'object' &&
          typeof (jobClientSeed as Record<string, unknown>).footprintShape === 'string' &&
          typeof (jobClientSeed as Record<string, unknown>).storeys === 'string' &&
          typeof (jobClientSeed as Record<string, unknown>).roof === 'string';

        let conceptSeed: ConceptSeedType | null = jobHasValidClientSeed ? validateAndNormalizeSeed(jobClientSeed) : null;
        if (conceptSeed && jobHasValidClientSeed) {
          console.log(`[jobs/process] Using client-supplied concept seed for ${projectId}/${job.conceptId}`);
          conceptBrief.conceptRange = conceptSeed.conceptRange;
        }
        if (!conceptSeed) {
          conceptSeed = await loadConceptSeed(projectId, job.conceptId, sb);
        }
        if (conceptSeed) {
          conceptBrief.conceptRange = conceptSeed.conceptRange;
          if (conceptSeed.existingBaseline === undefined && resolvedBaseline) {
            conceptSeed.existingBaseline = resolvedBaseline;
            conceptSeed.storeys = resolveSeedStoreys(conceptBrief, resolvedBaseline);
            await saveConceptSeed(projectId, job.conceptId, conceptSeed, sb);
          }
        } else {
          conceptSeed = await generateConceptSeed(conceptBrief, resolvedBaseline ? { existingBaseline: resolvedBaseline } : undefined);
          if (resolvedBaseline) {
            conceptSeed.existingBaseline = resolvedBaseline;
            conceptSeed.storeys = resolveSeedStoreys(conceptBrief, resolvedBaseline);
          } else if (conceptBrief.proposedDesign.projectType !== 'new_build') {
            conceptSeed.storeys = resolveSeedStoreys(conceptBrief, null);
          }
          await saveConceptSeed(projectId, job.conceptId, conceptSeed, sb);
        }

        // Build prompt
        job.progress = 50;
        await storeJob(job, sb);

        const requiresExistingConcept = job.renderType === 'floor_plan' || job.renderType === 'section';
        let referenceAxonBuffer: Buffer | undefined;
        let referenceImageUrl: string | undefined;

        if (requiresExistingConcept) {
          const axonBuffer = await loadRenderedImage(projectId, job.conceptId, 'axonometric', sb);
          if (axonBuffer) {
            referenceAxonBuffer = axonBuffer;
            console.log(`Using axonometric reference for ${job.renderType} (buffer from storage)`);
          } else {
            // Client can pass reference (same as sync) so Lovable can supply axon from another source
            const refUrl = req.body?.referenceAxonUrl;
            const refB64 = req.body?.referenceAxonBase64;
            if (typeof refUrl === 'string' && refUrl.trim()) {
              referenceImageUrl = refUrl.trim();
              console.log(`Using axonometric reference for ${job.renderType} (client referenceAxonUrl)`);
            } else if (typeof refB64 === 'string' && refB64.trim()) {
              try {
                referenceAxonBuffer = Buffer.from(refB64.trim(), 'base64');
                if (referenceAxonBuffer.length > 0) {
                  console.log(`Using axonometric reference for ${job.renderType} (client referenceAxonBase64, ${referenceAxonBuffer.length} bytes)`);
                } else referenceAxonBuffer = undefined;
              } catch {
                referenceAxonBuffer = undefined;
              }
            }
            if (!referenceAxonBuffer && !referenceImageUrl) {
              const url = getRenderedImageUrl(projectId, job.conceptId, 'axonometric', sb) || undefined;
              if (url && !url.startsWith('/')) {
                referenceImageUrl = url;
                console.log(`Using axonometric reference for ${job.renderType} render: ${referenceImageUrl}`);
              } else {
                console.log(`No axonometric reference found for ${job.renderType} render - generating standalone`);
              }
            }
          }
        }

        const promptOptions: Parameters<typeof buildConceptPrompt>[1] = {
          conceptSeed,
          hasReferenceAxon: !!(referenceAxonBuffer?.length || referenceImageUrl),
        };
        if (job.renderType === 'floor_plan' && typeof req.body?.includePeopleInPlan === 'boolean') {
          promptOptions.includePeopleInPlan = req.body.includePeopleInPlan;
        }
        if (job.renderType === 'section' && typeof req.body?.includePeopleInSection === 'boolean') {
          promptOptions.includePeopleInSection = req.body.includePeopleInSection;
        }
        if (siteParams.baselineOverride?.footprintScale) {
          promptOptions.baselineFootprintScaleOverride = siteParams.baselineOverride.footprintScale;
        }
        const promptResult = buildConceptPrompt(conceptBrief, promptOptions);

        // Generate image
        job.progress = 70;
        await storeJob(job, sb);

        const result = await generateConceptImage(
          Buffer.alloc(0),
          effectiveRenderType,
          undefined,
          promptResult.prompt,
          referenceAxonBuffer ?? undefined,
          referenceImageUrl,
          job.conceptId
        );

        // Store rendered image
        job.progress = 90;
        await storeJob(job, sb);

        const imageUrl = await storeRenderedImage(
          projectId,
          job.conceptId,
          effectiveRenderType,
          result.imageBase64,
          sb
        );

        // Mark job as completed (use effectiveRenderType so stored job and response show what was actually rendered)
        job.status = 'completed';
        job.progress = 100;
        job.completedAt = new Date().toISOString();
        job.imageUrl = imageUrl;
        job.renderType = effectiveRenderType;
        job.promptVersion = promptResult.promptVersion;
        job.conceptRange = conceptBrief.conceptRange;
        await storeJob(job, sb);

        console.log(`✅ Job ${jobId} completed successfully`);
        res.json({ job: jobWithAbsoluteImageUrl(job, req) });
      } catch (error) {
        // Mark job as failed
        const { jobId } = req.params;
        const { projectId } = req.body;
        const sbErr = resolveSupabaseConfig(extractSupabaseConfig(req.body));
        
        if (projectId && typeof projectId === 'string' && jobId && typeof jobId === 'string') {
          try {
            const job = await getJob(projectId, jobId, sbErr);
            if (job) {
              job.status = 'failed';
              job.error = error instanceof Error ? error.message : 'Unknown error';
              job.completedAt = new Date().toISOString();
              await storeJob(job, sbErr);
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
        if (message.includes('Address not found') || message.includes('no results')) {
          res.status(404).json({ error: message });
          return;
        }
        if (message.includes('timeout') || message.includes('timed out') || message.includes('Geocoding')) {
          res.status(504).json({ error: message });
          return;
        }
        console.error('Site-lookup endpoint error:', error);
        if (!res.headersSent) {
          const lower = message.toLowerCase();
          const isOverpassTimeout =
            lower === 'map_service_timeout' ||
            lower.includes('504') ||
            lower.includes('503') ||
            lower.includes('gateway timeout') ||
            lower.includes('overpass') ||
            lower.includes('failed to query nearby');
          res.status(500).json({
            error: 'Internal server error',
            message: isOverpassTimeout
              ? 'Map data service is temporarily unavailable (timeout). Please try again in a moment.'
              : message,
          });
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

        if (conceptInputs == null || typeof conceptInputs !== 'object') {
          res.status(400).json({
            error: 'conceptInputs is required and must be a valid ConceptInputs or ConceptBrief object',
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

      // Early check: need either OPENAI_API_KEY (direct) or AI_GATEWAY_API_KEY (gateway + BYOK) for image generation
      const hasOpenAI = Boolean(process.env.OPENAI_API_KEY?.trim());
      const hasGateway = Boolean(process.env.AI_GATEWAY_API_KEY?.trim());
      if (!hasOpenAI && !hasGateway) {
        res.status(503).json({
          error: 'SERVICE_UNAVAILABLE',
          message: 'No API key configured. Set OPENAI_API_KEY (direct) or AI_GATEWAY_API_KEY (Vercel gateway + BYOK) in Vercel → Environment Variables.',
          hint: 'For Vercel, use AI_GATEWAY_API_KEY and add your OpenAI key in AI Gateway → Bring Your Own Key.',
          keys: { openai: hasOpenAI, gateway: hasGateway },
        });
        return;
      }

      try {
        const normalized = normalizeRenderRequestBody(req.body as Record<string, unknown>);
        let {
          projectId: rawProjectId,
          renderType,
          conceptId,
          conceptInputs,
          includePeopleInPlan,
          includePeopleInSection,
          returnRawResult,
        } = normalized;

        // Resolve Supabase config from request body (Lovable sends its own creds) or env vars
        const sbClientConfig = extractSupabaseConfig(req.body);
        const sb = resolveSupabaseConfig(sbClientConfig);

        // projectId optional - default to "default" for storage organization
        const projectId = (rawProjectId && typeof rawProjectId === 'string') ? rawProjectId : 'default';

        if (!renderType) {
          res.status(400).json({
            error: 'renderType is required and must be one of: "axonometric", "floor_plan", "section" (or legacy aliases like "concept-axon")',
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

        // Iso (floor_plan/section) can be generated independently: omit conceptId to create new concept + seed and render without any prior axon.
        const requiresExistingConcept = renderType === 'floor_plan' || renderType === 'section';

        // Validate conceptInputs (required for seed generation)
        if (conceptInputs == null || typeof conceptInputs !== 'object') {
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

        // Align renderType with conceptBrief.proposedDesign.outputType when they conflict (e.g. Lovable sends outputType 'concept_plan' but renderType 'axonometric')
        const requestedOutputType = conceptBrief.proposedDesign?.outputType;
        if (requestedOutputType === 'concept_plan' && renderType !== 'floor_plan') {
          renderType = 'floor_plan';
          console.log('[RENDER] Using renderType=floor_plan from conceptInputs.outputType (concept_plan)');
        } else if (requestedOutputType === 'concept_section' && renderType !== 'section') {
          renderType = 'section';
          console.log('[RENDER] Using renderType=section from conceptInputs.outputType (concept_section)');
        } else if (requestedOutputType === 'concept_axonometric' && renderType !== 'axonometric') {
          renderType = 'axonometric';
          console.log('[RENDER] Using renderType=axonometric from conceptInputs.outputType (concept_axonometric)');
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
          // When client sends existingBuilding (selected footprint), use it so renderer uses selected not auto-detected
          if (siteParams.existingBuilding) {
            resolvedBaseline = applyExistingBuildingToBaseline(resolvedBaseline, siteParams.existingBuilding);
            if (resolvedBaseline) {
              console.log(`Applied selected footprint: ${siteParams.existingBuilding.classification}, ${siteParams.existingBuilding.footprintArea} m²`);
            }
          }
        } catch (err) {
          console.error('Baseline resolution failed:', err);
        }

        // SEED PIPELINE: Use client-supplied seed (Lovable), load from storage, or generate
        const clientSeed = req.body?.conceptSeed;
        const hasValidClientSeed =
          clientSeed &&
          typeof clientSeed === 'object' &&
          typeof (clientSeed as Record<string, unknown>).footprintShape === 'string' &&
          typeof (clientSeed as Record<string, unknown>).storeys === 'string' &&
          typeof (clientSeed as Record<string, unknown>).roof === 'string';

        let conceptSeed: ConceptSeedType | null = hasValidClientSeed
          ? validateAndNormalizeSeed(clientSeed)
          : null;

        if (conceptSeed && hasValidClientSeed) {
          console.log(`Using client-supplied concept seed for ${projectId}/${finalConceptId}`);
          conceptBrief.conceptRange = conceptSeed.conceptRange;
        }

        if (!conceptSeed) {
          conceptSeed = await loadConceptSeed(projectId, finalConceptId, sb);
        }

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
            await saveConceptSeed(projectId, finalConceptId, conceptSeed, sb);
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
          await saveConceptSeed(projectId, finalConceptId, conceptSeed, sb);
        }

        // Ensure conceptSeed is defined (TypeScript guard + runtime safety)
        if (!conceptSeed) {
          throw new Error('Failed to load or generate concept seed');
        }

        // AXON REFERENCE: For floor_plan or section, use axon image so prompt and style match test harness.
        // 1) Prefer buffer from storage (same as test harness); 2) else client-supplied referenceAxonUrl/referenceAxonBase64; 3) else URL from storage (Supabase).
        let referenceAxonBuffer: Buffer | undefined;
        let referenceImageUrl: string | undefined;

        if (requiresExistingConcept) {
          const axonBuffer = await loadRenderedImage(projectId, finalConceptId, 'axonometric', sb);
          if (axonBuffer) {
            referenceAxonBuffer = axonBuffer;
            console.log(`Using axonometric reference for ${renderType} (buffer from storage)`);
          } else {
            // Cross-instance (e.g. Vercel) or not stored: allow client to supply reference
            const refUrl = req.body?.referenceAxonUrl;
            const refB64 = req.body?.referenceAxonBase64;
            if (typeof refUrl === 'string' && refUrl.trim()) {
              referenceImageUrl = refUrl.trim();
              console.log(`Using axonometric reference for ${renderType} (client referenceAxonUrl)`);
            } else if (typeof refB64 === 'string' && refB64.trim()) {
              try {
                referenceAxonBuffer = Buffer.from(refB64.trim(), 'base64');
                if (referenceAxonBuffer.length > 0) {
                  console.log(`Using axonometric reference for ${renderType} (client referenceAxonBase64, ${referenceAxonBuffer.length} bytes)`);
                } else {
                  referenceAxonBuffer = undefined;
                }
              } catch {
                referenceAxonBuffer = undefined;
              }
            }
            if (!referenceAxonBuffer && !referenceImageUrl) {
              const url = getRenderedImageUrl(projectId, finalConceptId, 'axonometric', sb) || undefined;
              if (url && !url.startsWith('/')) {
                referenceImageUrl = url;
                console.log(`Using axonometric reference for ${renderType} (storage URL)`);
              } else {
                console.log(`No axonometric reference found for ${renderType} render - generating standalone`);
              }
            }
          }
        }

        const hasReferenceAxon = !!(referenceAxonBuffer?.length || referenceImageUrl);

        // Build prompt with concept seed and reference axon flag
        // Include people options for plan/section views; footprint scale override for massing hint only
        const promptOptions: Parameters<typeof buildConceptPrompt>[1] = {
          conceptSeed,
          hasReferenceAxon,
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
            referenceAxonBuffer ?? undefined, // Prefer buffer (same as test harness); omit when URL-only
            referenceImageUrl, // Pass reference URL when no buffer (e.g. client URL or Supabase)
            finalConceptId // Pass concept ID for logging
          );
          console.log('[RENDER] generateConceptImage OK', { duration: Date.now() - renderStart });
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          console.error('[RENDER] generateConceptImage FAIL', { duration: Date.now() - renderStart, error: errMsg });
          // Handle reference image fetch failures
          if (error instanceof Error && error.message.includes('Failed to fetch reference image')) {
            res.status(500).json({
              error: 'REFERENCE_IMAGE_FETCH_FAILED',
              message: 'Failed to fetch reference axonometric image for correlation.',
              details: error.message,
            });
            return;
          }
          // Connection / OpenAI errors: return 503 so client never sees generic 500
          const msgLower = errMsg.toLowerCase();
          const isConnectionError =
            msgLower.includes('connection') ||
            msgLower.includes('econnrefused') ||
            msgLower.includes('enotfound') ||
            msgLower.includes('fetch failed') ||
            msgLower.includes('failed to connect to openai') ||
            msgLower.includes('failed to generate concept image');
          if (isConnectionError) {
            res.status(503).json({
              error: 'OPENAI_CONNECTION_FAILED',
              message: errMsg,
              hint: 'Set AI_GATEWAY_API_KEY in Vercel and add your OpenAI key in AI Gateway → Bring Your Own Key. Or use the jobs API (POST /api/jobs/render then poll /api/jobs/:id).',
            });
            return;
          }
          // Any other render failure: return 500 with message (do not pass to generic handler)
          res.status(500).json({
            error: 'RENDER_FAILED',
            message: errMsg,
          });
          return;
        }

        // Store the rendered image
        const imageUrl = await storeRenderedImage(
          projectId,
          finalConceptId,
          renderType,
          result.imageBase64,
          sb
        );

        // Final conceptRange used (from seed)
        const finalConceptRange = conceptBrief.conceptRange;

        // Ensure client always gets a displayable image URL (cross-origin safe).
        // When storage returns a relative path (/storage/...) the client cannot load it from another origin, so use inline data URL.
        const dataUrl = `data:image/png;base64,${result.imageBase64}`;
        const useDataUrl = !imageUrl || imageUrl.startsWith('/');
        if (useDataUrl && process.env.NODE_ENV === 'production') {
          console.warn('[RENDER] Supabase not configured; returning image inline. For reliable cross-origin display (e.g. Lovable), set SUPABASE_URL and SUPABASE_ANON_KEY or send supabase in request body.');
        }
        const displayUrl = useDataUrl ? dataUrl : imageUrl;
        const imageDataUrl = useDataUrl ? dataUrl : undefined;

        // Comprehensive logging
        console.log('=== /api/render completed ===');
        console.log(`  conceptId: ${finalConceptId}`);
        console.log(`  renderType: ${renderType}`);
        console.log(`  inputConceptRange: ${inputConceptRange || '(not provided)'}`);
        console.log(`  finalConceptRange: ${finalConceptRange}`);
        console.log(`  promptVersion: ${promptResult.promptVersion}`);
        console.log('============================');

        // Both imageUrl and imageDataUrl set so clients using either can display; imageBase64 for blob URL if CSP blocks data:
        const response: RenderResponse = {
          conceptId: finalConceptId,
          renderType: renderType as RenderType,
          imageUrl: displayUrl,
          ...(imageDataUrl && { imageDataUrl }),
          ...(useDataUrl && { imageBase64: result.imageBase64 }),
          promptVersion: promptResult.promptVersion,
          conceptRange: finalConceptRange, // Return final conceptRange used
          conceptSeed, // So client (e.g. Lovable) can cache and send back for consistent plan/section
        };

        // Some clients want the raw render result (like `test/runLocalRender.ts`) rather than the storage-oriented RenderResponse.
        // This is opt-in so the default API remains stable.
        if (returnRawResult) {
          res.json({
            conceptId: finalConceptId,
            projectId,
            renderType: response.renderType,
            promptVersion: response.promptVersion,
            model: result.model,
            imageBase64: result.imageBase64,
            // Keep handy fields for web clients too:
            imageUrl: response.imageUrl,
            ...(response.imageDataUrl && { imageDataUrl: response.imageDataUrl }),
            conceptRange: response.conceptRange,
            conceptSeed: response.conceptSeed,
          });
          return;
        }

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
        const conceptInputs = req.body?.conceptInputs ?? req.body;
        if (conceptInputs == null || typeof conceptInputs !== 'object') {
          res.status(400).json({
            error: 'conceptInputs or ConceptBrief is required (request body must contain conceptInputs or a ConceptBrief object)',
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
    
    if (res.headersSent) {
      return _next(err);
    }
    
    const msg = err.message || 'An unexpected error occurred';
    const msgLower = msg.toLowerCase();
    const isConnectionError =
      msgLower.includes('connection') ||
      msgLower.includes('econnrefused') ||
      msgLower.includes('failed to connect to openai') ||
      msgLower.includes('failed to generate concept image');
    
    if (isConnectionError) {
      res.status(503).json({
        error: 'OPENAI_CONNECTION_FAILED',
        message: msg,
        hint: 'Set AI_GATEWAY_API_KEY and BYOK in Vercel AI Gateway, or use jobs API: POST /api/jobs/render then poll /api/jobs/:id.',
      });
      return;
    }
    
    res.status(500).json({
      error: 'Internal server error',
      message: msg,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  });

  return app;
}

/**
 * Start the server (for local dev: node dist/index.js)
 */
export function startServer(): void {
  const app = createServer();
  const port = process.env.PORT ?? 3000;

  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

/**
 * Default export for Vercel: expects Express app or handler.
 * src/server is recognized as server entry; must have default export.
 */
export default createServer();

