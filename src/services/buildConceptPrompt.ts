/**
 * This prompt builder converts structured intent into an architectural design brief.
 */

import type { ConceptInputs, ConceptBrief, ProjectType, BuildingForm, Storeys, NumberOfPlots, FloorAreaRange, FootprintScale, Bedrooms, Bathrooms, KitchenType, LivingSpaces, RoofType, MassingPreference, Orientation, Density } from '../types/conceptInputs.js';
import { legacyInputsToConceptBrief } from '../types/conceptInputs.js';
import type { ConceptSeed } from './generateConceptSeed.js';
import { getPlanAddendum, PLAN_ADDENDUM_VERSION } from '../prompts/planAddendum.js';
import { getSectionAddendum, SECTION_ADDENDUM_VERSION } from '../prompts/sectionAddendum.js';
import { CONSTRUCTAOS_STYLE_LOCK } from '../prompts/styleLock.js';

// Prompt version constants for tracking changes
export const AXON_PROMPT_VERSION = 'axon_v1'; // Frozen - do not change
export const PLAN_PROMPT_VERSION = PLAN_ADDENDUM_VERSION; // Tracks plan addendum version
export const SECTION_PROMPT_VERSION = SECTION_ADDENDUM_VERSION; // Tracks section addendum version

export interface BuildConceptPromptOptions {
  hasSketch?: boolean;
  siteContextSummary?: string;
  conceptSeed?: ConceptSeed;
  hasReferenceAxon?: boolean;
  isInferredContext?: boolean; // Indicates if existing context was inferred from address lookup/map data
}

export interface BuildConceptPromptResult {
  prompt: string;
  promptVersion: string;
}

// Helper functions to convert enum values to readable text
function formatProjectType(type: ProjectType): string {
  switch (type) {
    case 'extension':
      return 'Extension';
    case 'renovation':
      return 'Renovation';
    case 'new_build':
      return 'New build';
    case 'conversion':
      return 'Conversion';
  }
}

function formatBuildingForm(form: BuildingForm): string {
  switch (form) {
    case 'detached':
      return 'Detached';
    case 'semi_detached':
      return 'Semi-detached';
    case 'terraced':
      return 'Terraced';
    case 'infill':
      return 'Infill';
  }
}

function formatStoreys(storeys: Storeys): string {
  switch (storeys) {
    case 'one':
      return '1';
    case 'two':
      return '2';
    case 'three_plus':
      return '3+';
  }
}

function formatNumberOfPlots(plots: NumberOfPlots): string {
  switch (plots) {
    case 'one':
      return '1';
    case 'two':
      return '2';
    case 'three_to_five':
      return '3-5';
    case 'five_to_ten':
      return '5-10';
  }
}

function formatFloorAreaRange(range: FloorAreaRange): string {
  switch (range) {
    case '50_75':
      return '50–75';
    case '75_100':
      return '75–100';
    case '100_150':
      return '100–150';
    case '150_200':
      return '150–200';
    case '200_plus':
      return '200+';
  }
}

function formatFootprintScale(scale: FootprintScale): string {
  if (!scale) return '';
  switch (scale) {
    case 'compact':
      return 'Compact';
    case 'medium':
      return 'Medium';
    case 'wide':
      return 'Wide';
  }
}

function formatBedrooms(bedrooms: Bedrooms): string {
  switch (bedrooms) {
    case 'one':
      return '1';
    case 'two':
      return '2';
    case 'three':
      return '3';
    case 'four_plus':
      return '4+';
  }
}

function formatBathrooms(bathrooms: Bathrooms): string {
  switch (bathrooms) {
    case 'one':
      return '1';
    case 'two':
      return '2';
    case 'three_plus':
      return '3+';
  }
}

function formatKitchenType(type: KitchenType): string {
  switch (type) {
    case 'open_plan':
      return 'Open-plan';
    case 'semi_open':
      return 'Semi-open';
    case 'separate':
      return 'Separate';
  }
}

function formatLivingSpaces(spaces: LivingSpaces): string {
  switch (spaces) {
    case 'single_main_space':
      return 'Single main space';
    case 'multiple_living_areas':
      return 'Multiple living areas';
  }
}

function formatRoofType(type: RoofType): string {
  switch (type) {
    case 'flat':
      return 'Flat';
    case 'pitched':
      return 'Pitched';
    case 'mixed':
      return 'Mixed';
  }
}

function formatMassingPreference(pref: MassingPreference): string {
  switch (pref) {
    case 'split_volumes':
      return 'Split volumes';
    case 'stepped':
      return 'Stepped';
    case 'simple_compact':
      return 'Simple/compact';
    case 'linear_elongated':
      return 'Linear/elongated';
    case 'courtyard':
      return 'Courtyard';
    case 'vertical_tall':
      return 'Vertical/Tall';
  }
}

// Helper functions for inferred context formatting (lowercase, natural phrasing)
function formatStoreysForInference(storeys: Storeys): string {
  switch (storeys) {
    case 'one':
      return 'single-storey';
    case 'two':
      return 'two-storey';
    case 'three_plus':
      return 'three or more storey';
  }
}

function formatBuildingFormForInference(form: BuildingForm): string {
  switch (form) {
    case 'detached':
      return 'detached';
    case 'semi_detached':
      return 'semi-detached';
    case 'terraced':
      return 'terraced';
    case 'infill':
      return 'infill';
  }
}

function formatRoofTypeForInference(roofType: RoofType): string {
  switch (roofType) {
    case 'flat':
      return 'flat';
    case 'pitched':
      return 'pitched';
    case 'mixed':
      return 'mixed';
  }
}

function formatDensityForInference(density: Density): string {
  switch (density) {
    case 'suburban':
      return 'suburban';
    case 'urban':
      return 'urban';
    case 'rural':
      return 'rural';
  }
}

function formatOrientation(orientation: Orientation): string {
  switch (orientation) {
    case 'north_facing_rear':
      return 'North-facing rear';
    case 'south_facing_rear':
      return 'South-facing rear';
    case 'east':
      return 'East';
    case 'west':
      return 'West';
  }
}

function formatDensity(density: Density): string {
  switch (density) {
    case 'suburban':
      return 'Suburban';
    case 'urban':
      return 'Urban';
    case 'rural':
      return 'Rural';
  }
}

/**
 * Builds an architectural concept prompt from structured inputs
 * Accepts both ConceptBrief (new format) and ConceptInputs (legacy format) for backward compatibility
 * @returns Object containing the prompt and its version
 */
export function buildConceptPrompt(
  inputs: ConceptBrief | ConceptInputs,
  options?: BuildConceptPromptOptions
): BuildConceptPromptResult {
  // Normalize to ConceptBrief format
  const brief: ConceptBrief = 'proposedDesign' in inputs
    ? inputs
    : legacyInputsToConceptBrief(inputs);

  const { existingContext, proposedDesign } = brief;
  const isNewBuild = proposedDesign.projectType === 'new_build';

  // Validate: non-new-build projects require existingContext
  if (!isNewBuild && !existingContext) {
    throw new Error(`existingContext is required for ${proposedDesign.projectType} projects`);
  }

  const parts: string[] = [];
  const isRenovation = proposedDesign.projectType === 'renovation';

  // SECTION 1 — ROLE / FRAMING
  if (isRenovation) {
    parts.push(
      'You are an architectural designer creating early-stage concept visuals for a renovation project.\nThe output is a conceptual design study showing improvements to an existing building, not a technical drawing.'
    );
  } else {
    parts.push(
      'You are an architectural designer creating early-stage concept visuals.\nThe output is a conceptual design study, not a technical drawing.'
    );
  }

  // SECTION 2 — EXISTING CONTEXT (only if not new build and existingContext exists)
  if (!isNewBuild && existingContext) {
    const isInferred = options?.isInferredContext === true;
    
    if (isInferred) {
      // For inferred context from address lookup/map data, use specific phrasing
      const storeysText = formatStoreysForInference(proposedDesign.storeys);
      const buildingTypeText = formatBuildingFormForInference(existingContext.buildingForm);
      const roofTypeText = formatRoofTypeForInference(proposedDesign.roofType);
      const densityText = existingContext.density ? formatDensityForInference(existingContext.density) : null;
      
      let inferredText = `The site appears to contain a ${storeysText} ${buildingTypeText} residential building`;
      if (roofTypeText) {
        inferredText += ` with a ${roofTypeText} roof`;
      }
      if (densityText) {
        inferredText += ` in a ${densityText} setting`;
      }
      inferredText += '.';
      
      // For Renovation, append additional instruction
      if (isRenovation) {
        inferredText += '\nUse this inferred building as the baseline; the renovation is an improvement of this property, not a new design from scratch.';
      }
      
      parts.push(`Existing context:\n${inferredText}`);
    } else {
      // Standard existing context phrasing (not inferred)
      const contextParts: string[] = [];
      contextParts.push(`Existing building form: ${formatBuildingForm(existingContext.buildingForm)}`);
      
      if (existingContext.orientation) {
        contextParts.push(`Existing orientation: ${formatOrientation(existingContext.orientation)}`);
      }
      
      if (existingContext.density) {
        contextParts.push(`Site context: ${formatDensity(existingContext.density)}`);
      }

      parts.push(`Existing context:\n${contextParts.join('\n')}`);
    }
  }

  // SECTION 3 — PROPOSED INTERVENTION (design brief)
  const interventionParts: string[] = [];
  
  if (isRenovation) {
    // For renovations, describe existing building as baseline
    interventionParts.push(`Existing building: ${formatBuildingForm(existingContext!.buildingForm)}`);
    interventionParts.push(`Existing storeys: ${formatStoreys(proposedDesign.storeys)}`);
    if (existingContext?.orientation) {
      interventionParts.push(`Existing orientation: ${formatOrientation(existingContext.orientation)}`);
    }
    
    // Renovation goals as improvements within existing envelope
    interventionParts.push(`\nRenovation goals (within existing envelope):`);
    interventionParts.push(`Renovation scope: ${proposedDesign.renovationScope}`);
    interventionParts.push(`Target bedroom count: ${formatBedrooms(proposedDesign.bedrooms)}`);
    interventionParts.push(`Target bathroom count: ${formatBathrooms(proposedDesign.bathrooms)}`);
    interventionParts.push(`Desired kitchen arrangement: ${formatKitchenType(proposedDesign.kitchenType)}`);
    interventionParts.push(`Desired living space arrangement: ${formatLivingSpaces(proposedDesign.livingSpaces)}`);
    
    // For renovation, roof type refers to proposed changes/improvements, not new design
    interventionParts.push(`Roof treatment: ${formatRoofType(proposedDesign.roofType)}`);
    
    // Massing preference for renovation is about refinement/articulation within existing footprint
    interventionParts.push(`Massing refinement preference (within existing envelope): ${formatMassingPreference(proposedDesign.massingPreference)}`);
    
    // Do not include footprintScale for renovation - it doesn't change footprint
    
  } else if (isNewBuild) {
    // For new builds, treat proposedDesign as the whole building
    interventionParts.push(`Building form: ${formatBuildingForm(proposedDesign.buildingForm)}`);
    interventionParts.push(`Number of storeys: ${formatStoreys(proposedDesign.storeys)}`);
    interventionParts.push(`Number of plots: ${formatNumberOfPlots(proposedDesign.numberOfPlots)}`);
    interventionParts.push(`Approximate total floor area: ${formatFloorAreaRange(proposedDesign.totalFloorAreaRange)} m²`);
    
    if (proposedDesign.footprintScale) {
      interventionParts.push(`Footprint scale: ${formatFootprintScale(proposedDesign.footprintScale)}`);
    }
    
    interventionParts.push(`Bedrooms: ${formatBedrooms(proposedDesign.bedrooms)}`);
    interventionParts.push(`Bathrooms: ${formatBathrooms(proposedDesign.bathrooms)}`);
    interventionParts.push(`Kitchen arrangement: ${formatKitchenType(proposedDesign.kitchenType)}`);
    interventionParts.push(`Living space arrangement: ${formatLivingSpaces(proposedDesign.livingSpaces)}`);
    interventionParts.push(`Roof type: ${formatRoofType(proposedDesign.roofType)}`);
    interventionParts.push(`Overall massing preference: ${formatMassingPreference(proposedDesign.massingPreference)}`);
    
  } else {
    // For extensions/conversions, frame as addition/transformation
    interventionParts.push(`Project type: ${formatProjectType(proposedDesign.projectType)}`);
    if (existingContext && proposedDesign.buildingForm !== existingContext.buildingForm) {
      interventionParts.push(`Proposed building form: ${formatBuildingForm(proposedDesign.buildingForm)}`);
    }
    
    interventionParts.push(`Number of storeys: ${formatStoreys(proposedDesign.storeys)}`);
    interventionParts.push(`Number of plots: ${formatNumberOfPlots(proposedDesign.numberOfPlots)}`);
    
    if (proposedDesign.projectType === 'extension') {
      interventionParts.push(`Extension type: ${proposedDesign.extensionType}`);
      interventionParts.push(`Additional floor area from extension: ${formatFloorAreaRange(proposedDesign.additionalFloorAreaRange)} m²`);
    } else if (proposedDesign.projectType === 'conversion') {
      interventionParts.push(`Approximate total floor area: ${formatFloorAreaRange(proposedDesign.floorAreaRange)} m²`);
    }
    
    if (proposedDesign.footprintScale) {
      interventionParts.push(`Footprint scale: ${formatFootprintScale(proposedDesign.footprintScale)}`);
    }
    
    interventionParts.push(`Bedrooms: ${formatBedrooms(proposedDesign.bedrooms)}`);
    interventionParts.push(`Bathrooms: ${formatBathrooms(proposedDesign.bathrooms)}`);
    interventionParts.push(`Kitchen arrangement: ${formatKitchenType(proposedDesign.kitchenType)}`);
    interventionParts.push(`Living space arrangement: ${formatLivingSpaces(proposedDesign.livingSpaces)}`);
    interventionParts.push(`Roof type: ${formatRoofType(proposedDesign.roofType)}`);
    interventionParts.push(`Overall massing preference: ${formatMassingPreference(proposedDesign.massingPreference)}`);
  }

  // Orientation and density (common to all types, but frame appropriately for renovation)
  if (!isRenovation && proposedDesign.orientation && (!existingContext || proposedDesign.orientation !== existingContext.orientation)) {
    interventionParts.push(`Proposed orientation: ${formatOrientation(proposedDesign.orientation)}`);
  }

  if (!isRenovation && proposedDesign.density && (!existingContext || proposedDesign.density !== existingContext.density)) {
    interventionParts.push(`Proposed density context: ${formatDensity(proposedDesign.density)}`);
  }

  parts.push(`Proposed intervention:\n${interventionParts.join('\n')}`);

  // SECTION 4 — CONCEPT SEED (must remain consistent across views)
  if (options?.conceptSeed) {
    const seedJson = JSON.stringify(options.conceptSeed, null, 2);
    parts.push(`\nCONCEPT SEED (MUST REMAIN CONSISTENT ACROSS VIEWS):\n${seedJson}`);
  }

  // SECTION 5 — SITE / CONTEXT (optional)
  if (options?.siteContextSummary) {
    parts.push(`\nSite context considerations:\n${options.siteContextSummary}`);
  }

  // SECTION 5B — RENOVATION CONSTRAINTS (only for renovation projects)
  if (proposedDesign.projectType === 'renovation') {
    parts.push(
      '\nRenovation constraints:\n- Treat the existing building as the main object.\n- Keep the overall footprint and envelope broadly the same.\n- Do not add a new wing or significant extension unless explicitly requested.\n- Focus on improving layout, light, and architectural character within the existing form.\n- External changes should be limited to openings, roof adjustments, and subtle massing refinement.'
    );
  }

  // SECTION 6 — SKETCH HANDLING (conditional)
  if (options?.hasSketch === true) {
    parts.push(
      '\nA hand-drawn sketch is provided as a loose layout reference.\nIt should inform general layout, proportions, and spatial relationships only.\nIt is not dimensionally accurate and must not be followed exactly.'
    );
  }

  // SECTION 6B — REFERENCE AXON IMAGE (for plan/section only)
  if (options?.hasReferenceAxon === true && (proposedDesign.outputType === 'concept_plan' || proposedDesign.outputType === 'concept_section')) {
    parts.push(
      '\nUse the provided axonometric concept as the primary visual reference.\nThe plan/section must correlate to its footprint, storeys, and roof profile.'
    );
  }

  // SECTION 7 — OUTPUT INSTRUCTION (varies by output type)
  let outputInstruction: string;
  let outputAddendum: string | undefined;
  
  switch (proposedDesign.outputType) {
    case 'concept_axonometric':
      // Axonometric uses existing axon instructions only
      outputInstruction = 'Generate a clean architectural concept axonometric view.';
      break;
    case 'concept_plan':
      // Floor plan appends planAddendum
      outputInstruction = 'Generate a clean architectural concept floor plan diagram.';
      if (options?.conceptSeed) {
        outputAddendum = getPlanAddendum(options.conceptSeed);
      }
      break;
    case 'concept_section':
      // Section appends sectionAddendum
      outputInstruction = 'Generate a clean architectural concept section diagram.';
      if (options?.conceptSeed) {
        outputAddendum = getSectionAddendum(options.conceptSeed);
      }
      break;
  }
  
  // HARD CONSTRAINT for plan/section outputs (before output instructions)
  if ((proposedDesign.outputType === 'concept_plan' || proposedDesign.outputType === 'concept_section') && options?.conceptSeed && options?.hasReferenceAxon) {
    parts.push(
      '\nCRITICAL: Do not introduce any new design moves not present in the concept seed and axonometric reference.'
    );
    
    // Explicit instruction to use both sources
    parts.push(`
PRIMARY SOURCES (use both):
1) The structured inputs and concept seed define programme, storeys, roof, and intent.
2) The provided axonometric reference image defines the footprint, massing, and composition.

Do not contradict either source. If uncertain, prefer the axonometric reference for geometry and the structured inputs for programme.`);
  }
  
  parts.push(`\n${outputInstruction}`);
  parts.push(
    'Focus on massing, scale, and spatial clarity.\nDo not include dimensions, labels, annotations, or technical symbols.'
  );

  // Output-specific addenda (for plan and section only)
  if (outputAddendum) {
    parts.push(`\n${outputAddendum}`);
  }

  // Extra ConstructaOS visuals guidance (applies to all view types)
  if (proposedDesign.outputType === 'concept_axonometric') {
    parts.push(
      '\nUltra high-resolution black-and-white architectural line drawing.\nClean, precise black ink linework with subtle grayscale hatching for depth and material texture.\nInclude a small garden or surrounding landscape with trees and shrubs rendered in minimalist style.\nPopulate the scene with a few minimal line-drawn figures — sitting, walking, talking — to add human warmth, scale, and everyday life.\nThe composition should feel like a professional architectural presentation: calm, balanced, and quietly aspirational.'
    );
  } else if (proposedDesign.outputType === 'concept_plan' || proposedDesign.outputType === 'concept_section') {
    parts.push(
      '\nUltra high-resolution black-and-white architectural line drawing.\nClean, precise black ink linework with subtle grayscale hatching for depth and material texture.\nThe composition should feel like a professional architectural presentation: calm, balanced, and quietly aspirational.'
    );
  }

  // SECTION 8 — FIXED CONSTRUCTAOS STYLE LOCK (same for all view types)
  parts.push(`\n${CONSTRUCTAOS_STYLE_LOCK}`);

  // Determine prompt version based on output type
  let promptVersion: string;
  switch (proposedDesign.outputType) {
    case 'concept_axonometric':
      promptVersion = AXON_PROMPT_VERSION;
      break;
    case 'concept_plan':
      promptVersion = PLAN_PROMPT_VERSION;
      break;
    case 'concept_section':
      promptVersion = SECTION_PROMPT_VERSION;
      break;
    default:
      promptVersion = 'structured-v1';
  }

  return {
    prompt: parts.join('\n\n'),
    promptVersion,
  };
}

