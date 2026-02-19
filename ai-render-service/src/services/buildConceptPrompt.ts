/**
 * This prompt builder converts structured intent into an architectural design brief.
 */

import type { ConceptInputs, ConceptBrief, ProjectType, BuildingForm, Storeys, NumberOfPlots, FloorAreaRange, FootprintScale, Bedrooms, Bathrooms, KitchenType, LivingSpaces, RoofType, MassingPreference, Orientation, Density, ExtensionType } from '../types/conceptInputs.js';
import { legacyInputsToConceptBrief } from '../types/conceptInputs.js';
import type { ConceptSeed } from './generateConceptSeed.js';
import type { ExistingBaseline } from './site/inferExistingBaseline.js';
import { getSectionAddendum, SECTION_ADDENDUM_VERSION } from '../prompts/sectionAddendum.js';
import { CONSTRUCTAOS_STYLE_LOCK, PLAN_SECTION_STYLE_VARIANT, ISOMETRIC_PLAN_CUTAWAY_STYLE_VARIANT } from '../prompts/styleLock.js';
import { conceptRangeAddendum } from '../prompts/conceptRangeAddendum.js';
import { toInternalRenderType, getViewMode } from '../utils/renderTypeMapping.js';
import { buildIsometricPlanPrompt, type BuildIsometricPlanPromptArgs } from '../prompts/planIsometricCutawayPrompt.js';
import type { RenderType } from '../types/render.js';

// Prompt version constants for tracking changes
export const AXON_PROMPT_VERSION = 'axon_v2_concept_range'; // Updated: concept range framework added
export const PLAN_PROMPT_VERSION = 'plan_isometric_cutaway_v1'; // Tracks new isometric plan prompt module version
export const SECTION_PROMPT_VERSION = SECTION_ADDENDUM_VERSION; // Tracks section addendum version

export interface BuildConceptPromptOptions {
  hasSketch?: boolean;
  conceptSeed?: ConceptSeed;
  /** Pass when building prompt for seed generation (no conceptSeed yet) so existing storeys come from baseline */
  existingBaseline?: ExistingBaseline;
  hasReferenceAxon?: boolean;
  includePeopleInPlan?: boolean;
  includePeopleInSection?: boolean;
  /** Optional footprint scale override for massing hint only; does not change footprint geometry (compact | medium | wide) */
  baselineFootprintScaleOverride?: string;
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
  }
}

/** Extension type as clear positioning for the model: where the new volume attaches to the existing building. */
function formatExtensionType(type: ExtensionType): string {
  switch (type) {
    case 'rear':
      return 'Rear — new volume attached to the back of the existing building only';
    case 'side':
      return 'Side — new volume attached to one side of the existing building only';
    case 'side_and_rear':
      return 'Side and rear — new volume wrapping one side and the rear; not the front';
    case 'wrap_around':
      return 'Wrap-around — new volume may extend along side(s) and/or rear; keep the front/principal elevation clearly the existing building';
    case 'two_storey':
      return 'Two-storey extension — position as rear or side; new volume is two storeys';
    case 'single_storey':
      return 'Single-storey extension — position as rear or side; new volume is one storey';
  }
}

/** One-line positioning rule for extension constraints (where to attach the new volume). */
function extensionPositioningRule(type: ExtensionType): string {
  switch (type) {
    case 'rear':
      return 'Attach the new volume to the BACK of the existing building only. Do not place it to the side or front.';
    case 'side':
      return 'Attach the new volume to ONE SIDE of the existing building only. Do not place it to the rear or front.';
    case 'side_and_rear':
      return 'Attach the new volume to ONE SIDE and the REAR (L-shape). Do not extend to the front.';
    case 'wrap_around':
      return 'New volume may wrap side(s) and/or rear; the front/principal elevation must remain the existing building.';
    case 'two_storey':
      return 'Attach the new volume (two storeys) to the rear or one side of the existing building. Do not place it in front.';
    case 'single_storey':
      return 'Attach the new volume (single storey) to the rear or one side of the existing building. Do not place it in front.';
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

/** Format baseline storeys ('1'|'2'|'3+'|'Unknown') for prompt text. Single source: site/footprint with override. */
function formatBaselineStoreys(storeys: ExistingBaseline['storeys']): string {
  if (storeys === 'Unknown') return '~2 (estimated, no survey)';
  return storeys;
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
    case '0_25':
      return '0–25';
    case '25_50':
      return '25–50';
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

/** Format for prompts: 0 is "not included", so renderer/cost treat as valid option, not missing data. */
function formatBedrooms(bedrooms: Bedrooms): string {
  switch (bedrooms) {
    case 'zero':
      return '0 (not included)';
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

/** Format for prompts: 0 is "not included", so renderer/cost treat as valid option, not missing data. */
function formatBathrooms(bathrooms: Bathrooms): string {
  switch (bathrooms) {
    case 'zero':
      return '0 (not included)';
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

  // Detect render type early (needed for section camera instructions)
  // Note: floor_plan returns early using buildIsometricPlanPrompt, so only section/axon continue
  const isSection = proposedDesign.outputType === 'concept_section';
  const renderTypeForMapping: RenderType = proposedDesign.outputType === 'concept_plan' ? 'floor_plan' : isSection ? 'section' : 'axonometric';
  const internalRenderType = toInternalRenderType(renderTypeForMapping);
  
  // EARLY RETURN: Use new isometric plan prompt module for floor_plan
  if (renderTypeForMapping === 'floor_plan') {
    console.log(`floor_plan prompt path: isometric_cutaway_v1`);
    
    if (!options?.conceptSeed) {
      throw new Error('conceptSeed is required for floor_plan render type');
    }
    
    // Build combined style lock (CONSTRUCTAOS_STYLE_LOCK + ISOMETRIC_PLAN_CUTAWAY_STYLE_VARIANT)
    // Use isometric plan-specific variant (not shared PLAN_SECTION_STYLE_VARIANT) to avoid any plan wording
    const styleLock = `${CONSTRUCTAOS_STYLE_LOCK}\n\n${ISOMETRIC_PLAN_CUTAWAY_STYLE_VARIANT}`;
    
    // Call new isometric plan prompt builder - this is the ONLY path for floor_plan prompts
    const planArgs: BuildIsometricPlanPromptArgs = {
      conceptSeed: options.conceptSeed,
      brief,
      styleLock,
    };
    if (options.baselineFootprintScaleOverride) {
      planArgs.baselineFootprintScaleOverride = options.baselineFootprintScaleOverride;
    }
    const prompt = buildIsometricPlanPrompt(planArgs);
    
    // Return immediately - do not append any other addenda or output instructions
    return {
      prompt,
      promptVersion: 'plan_isometric_cutaway_v1',
    };
  }
  
  // Get view mode and assert it's not orthographic for section (floor_plan returns early)
  const viewMode = getViewMode(renderTypeForMapping);
  if (isSection && viewMode === 'orthographic') {
    throw new Error(`REGRESSION DETECTED: renderType "${renderTypeForMapping}" (${proposedDesign.outputType}) has viewMode "orthographic". Section must use "isometric_cutaway" view mode.`);
  }

  // SECTION 1 — ROLE / FRAMING
  if (isRenovation) {
    parts.push(
      'You are an architectural designer creating early-stage concept visuals for a renovation project.\nThe output must focus on the existing building structure as the main subject: show the existing building clearly, with improvements (layout, light, character) expressed within that structure. This is a conceptual design study of the existing building improved, not a technical drawing.'
    );
  } else {
    parts.push(
      'You are an architectural designer creating early-stage concept visuals.\nThe output is a conceptual design study, not a technical drawing.'
    );
  }

  // SECTION 1B — CAMERA/VIEW (CRITICAL - MUST BE FIRST FOR SECTION)
  // This must appear immediately after role to establish the isometric view requirement
  // Note: floor_plan uses separate module and returns early, so only section reaches here
  if (isSection) {
    parts.push(
      '\n⚠️⚠️⚠️ CAMERA / VIEW (ISOMETRIC SECTION CUTAWAY - REQUIRED) ⚠️⚠️⚠️\n- Produce an isometric / axonometric section cutaway (3D perspective illustration).\n- View angle: angled to show depth and perspective, revealing interior structure.\n- Show floor plate(s) and cut walls with visible thickness.\n- The image must show depth and perspective, like looking into a dollhouse or architectural model.\n- This is a 3D cutaway illustration with visible depth and spatial relationships.'
    );
  }

  // SECTION 2 — EXISTING CONTEXT (only if not new build and existingContext exists)
  // When we have existingBaseline (address path), skip building form here — SECTION 2B covers it
  const isExtension = proposedDesign.projectType === 'extension';
  const existingBaseline = options?.conceptSeed?.existingBaseline ?? options?.existingBaseline;
  const hasExistingBaseline = (isRenovation || isExtension) && existingBaseline;

  if (!isNewBuild && existingContext) {
    const contextParts: string[] = [];
    if (!hasExistingBaseline && existingContext.buildingForm) {
      contextParts.push(`Existing building form: ${formatBuildingForm(existingContext.buildingForm)}`);
    }
    if (existingContext.orientation) {
      contextParts.push(`Existing orientation: ${formatOrientation(existingContext.orientation)}`);
    }
    if (existingContext.density) {
      contextParts.push(`Site context: ${formatDensity(existingContext.density)}`);
    }
    if (contextParts.length > 0) {
      parts.push(`Existing context:\n${contextParts.join('\n')}`);
    }
  }

  // SECTION 2B — EXISTING BASELINE (for Renovation/Extension only; skip if no baseline)
  const interventionType = isRenovation ? 'Renovation' : isExtension ? 'Extension' : null;

  if (interventionType && existingBaseline) {
    const summary: string[] = [];
    if (existingBaseline.buildingForm !== 'Unknown') {
      summary.push(existingBaseline.buildingForm.toLowerCase());
    }
    if (existingBaseline.storeys !== 'Unknown') {
      summary.push(`${existingBaseline.storeys} storeys`);
    } else {
      summary.push('~2 storeys (estimated)');
    }
    summary.push(`~${Math.round(existingBaseline.footprintAreaM2)} m²`);
    parts.push(
      `\nExisting building (estimated): ${summary.join(', ')}.\n` +
      'Existing building is estimated from mapping data; footprint and storeys may be approximate. Not a measured survey.\n' +
      'Treat this as fixed baseline massing.'
    );
    if (options?.baselineFootprintScaleOverride) {
      const scaleLabel = options.baselineFootprintScaleOverride === 'compact' ? 'small' : options.baselineFootprintScaleOverride === 'wide' ? 'large' : 'medium';
      parts.push(`Interpret existing baseline massing as ${scaleLabel} scale for proportion and base massing; footprint geometry is unchanged.`);
    }
  }

  // SECTION 3 — PROPOSED INTERVENTION (design brief)
  const interventionParts: string[] = [];
  
  if (isRenovation) {
    // For renovations, existing storeys from baseline (site/footprint with override); single source of truth
    if (existingContext && !hasExistingBaseline && existingContext.buildingForm) {
      interventionParts.push(`Existing building: ${formatBuildingForm(existingContext.buildingForm)}`);
    }
    const renovationStoreys = hasExistingBaseline ? formatBaselineStoreys(existingBaseline.storeys) : '~2 (estimated, no survey)';
    interventionParts.push(`Existing storeys: ${renovationStoreys}`);
    if (existingContext?.orientation) {
      interventionParts.push(`Existing orientation: ${formatOrientation(existingContext.orientation)}`);
    }
    
    // Renovation: focus on existing building structure; goals are improvements within it
    interventionParts.push(`\nFocus: existing building structure. Renovation goals (within existing envelope):`);
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
    // For new builds, storeys from user input only (single source)
    if (proposedDesign.buildingForm) {
      interventionParts.push(`Building form: ${formatBuildingForm(proposedDesign.buildingForm)}`);
    }
    if (proposedDesign.storeys) {
      interventionParts.push(`Number of storeys: ${formatStoreys(proposedDesign.storeys)}`);
    }
    if (proposedDesign.numberOfPlots) {
      interventionParts.push(`Number of plots: ${formatNumberOfPlots(proposedDesign.numberOfPlots)}`);
    }
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
    // Extension only (conversion removed — use renovation)
    interventionParts.push(`Project type: ${formatProjectType(proposedDesign.projectType)}`);
    const existingForm = hasExistingBaseline && existingBaseline.buildingForm !== 'Unknown'
      ? existingBaseline.buildingForm
      : existingContext?.buildingForm;
    if (proposedDesign.buildingForm && existingForm !== undefined && proposedDesign.buildingForm !== existingForm) {
      interventionParts.push(`Proposed building form: ${formatBuildingForm(proposedDesign.buildingForm)}`);
    }
    
    // Extension: existing storeys from baseline (site/footprint with override); new volume from extensionType
    if (hasExistingBaseline) {
      interventionParts.push(`Existing building storeys: ${formatBaselineStoreys(existingBaseline.storeys)}`);
    }
    const extStoreys = proposedDesign.extensionType === 'two_storey' ? '2' : proposedDesign.extensionType === 'single_storey' ? '1' : null;
    if (extStoreys) {
      interventionParts.push(`Extension volume: ${extStoreys} storey${extStoreys === '1' ? '' : 's'}`);
    }
    if (proposedDesign.numberOfPlots) {
      interventionParts.push(`Number of plots: ${formatNumberOfPlots(proposedDesign.numberOfPlots)}`);
    }
    interventionParts.push(`Extension positioning: ${formatExtensionType(proposedDesign.extensionType)}`);
    interventionParts.push(`Additional floor area from extension: ${formatFloorAreaRange(proposedDesign.additionalFloorAreaRange)} m²`);
    
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

  // Proposed orientation (only sent for New Build; excluded for Extension/Renovation)
  if (proposedDesign.orientation && (!existingContext || proposedDesign.orientation !== existingContext.orientation)) {
    interventionParts.push(`Proposed orientation: ${formatOrientation(proposedDesign.orientation)}`);
  }

  if (!isRenovation && proposedDesign.density && (!existingContext || proposedDesign.density !== existingContext.density)) {
    interventionParts.push(`Proposed density context: ${formatDensity(proposedDesign.density)}`);
  }

  parts.push(`Proposed intervention:\n${interventionParts.join('\n')}`);

  // SECTION 3B — CONCEPT RANGE (for axonometric and section - placed early for emphasis)
  // Note: floor_plan uses separate module and includes concept range there
  if (proposedDesign.outputType === 'concept_axonometric' || proposedDesign.outputType === 'concept_section') {
    const conceptRange = options?.conceptSeed?.conceptRange ?? brief.conceptRange ?? 'Grounded';
    parts.push(`\n=== DESIGN INTERPRETATION FRAMEWORK ===\n${conceptRangeAddendum(conceptRange)}`);
  }

  // SECTION 4 — CONCEPT SEED (must remain consistent across views)
  if (options?.conceptSeed) {
    const seedJson = JSON.stringify(options.conceptSeed, null, 2);
    parts.push(`\nCONCEPT SEED (MUST REMAIN CONSISTENT ACROSS VIEWS):\n${seedJson}`);
  }

  // SECTION 5B — RENOVATION CONSTRAINTS (only for renovation projects)
  if (proposedDesign.projectType === 'renovation') {
    parts.push(
      '\nRenovation constraints (focus on existing building structure):\n- The image must show the existing building as the primary subject; do not replace or obscure it with a new design.\n- Keep the overall footprint and envelope of the existing building; the structure is fixed.\n- Do not add a new wing or significant extension unless explicitly requested.\n- Show improvements (layout, light, openings, roof treatment, character) within the existing form only.\n- External changes: limited to openings, roof adjustments, and subtle massing refinement—the existing mass must remain clearly recognisable.'
    );
  }

  // SECTION 5C — EXTENSION POSITIONING (only for extension projects — so the model places the new volume correctly)
  if (proposedDesign.projectType === 'extension') {
    const positioningRule = extensionPositioningRule(proposedDesign.extensionType);
    parts.push(
      `\nExtension positioning (must follow):\n- ${positioningRule}\n- Show the existing building and the new extension as one coherent mass; the new volume must be clearly attached in the specified position only.`
    );
  }

  // SECTION 6 — LAYOUT REFERENCE (optional sketch; soft influence only)
  if (options?.hasSketch === true) {
    parts.push(
      '\nLAYOUT REFERENCE (OPTIONAL — SOFT INFLUENCE ONLY):\nAn image is provided as a layout reference only, not a literal drawing to reproduce.\nUse it for general layout, proportions, and spatial relationships as a soft influence; do not trace or follow it exactly.\nIt is not dimensionally accurate. The structured brief and concept description remain the primary source of truth.'
    );
  }

  // Debug: Log render type routing (floor_plan returns early, so only section/axon reach here)
  if (isSection) {
    console.log(`[buildConceptPrompt] outputType: ${proposedDesign.outputType} -> renderType: ${renderTypeForMapping} -> internalRenderType: ${internalRenderType} -> viewMode: ${viewMode}`);
  }

  // SECTION 6B — REFERENCE AXON IMAGE (for section only - floor_plan returns early)
  if (options?.hasReferenceAxon === true && isSection) {
    parts.push(
      '\nREFERENCE AXONOMETRIC IMAGE (STYLE REFERENCE ONLY):\nUse the axonometric reference to match illustration style and line language, not to exactly trace exterior footprint.\nThe axonometric reference is a visual style guide (paper texture, line quality, tonal treatment), not a strict geometric template.'
    );
  }

  // SECTION 7 — OUTPUT INSTRUCTION (varies by output type)
  // Split into per-renderType blocks to ensure floor_plan doesn't receive any shared plan wording
  let outputInstruction: string;
  let outputAddendum: string | undefined;
  
  switch (internalRenderType) {
    case 'axonometric':
      // Axonometric uses existing axon instructions only
      outputInstruction = 'Generate a clean architectural concept axonometric illustration.';
      break;
    case 'isometric_floor_plan_cutaway':
      // This should never be reached - floor_plan returns early
      throw new Error('INTERNAL ERROR: isometric_floor_plan_cutaway should be handled by early return');
    case 'isometric_section_cutaway':
      // Section appends sectionAddendum
      console.log('Using addendum: isometric_section_cutaway');
      outputInstruction = 'Generate a clean architectural concept section diagram.';
      if (options?.conceptSeed) {
        outputAddendum = getSectionAddendum(options.conceptSeed, options.includePeopleInSection);
      }
      break;
    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = internalRenderType;
      throw new Error(`Unsupported internal render type: ${_exhaustive}`);
  }
  
  // PRIMARY SOURCE OF TRUTH for section outputs (before output instructions)
  // Note: floor_plan uses separate module and returns early, so only section reaches here
  if (isSection && options?.conceptSeed) {
    parts.push(
      '\nPRIMARY SOURCE OF TRUTH:\nThe structured inputs and concept seed define the programme, scale, adjacencies, and spatial intent.\nUse these as the primary source for the section geometry and layout.'
    );
    
    if (options?.hasReferenceAxon) {
      parts.push(
        '\nThe axonometric reference image is a style/visual language reference (paper texture, line quality, tonal treatment), not a strict geometric template.\nUse the axonometric reference to match illustration style and line language, not to exactly trace exterior footprint.'
      );
    }
    
    parts.push(
      '\nThe section should feel consistent with the same concept (programme, scale, adjacency), but does not need to match exterior massing exactly.\nDo not invent a completely different project type or scale.'
    );
  }
  
  // OUTPUT INSTRUCTION - Split into per-renderType blocks
  parts.push(`\n${outputInstruction}`);
  
  // OUTPUT GUIDANCE - Split into per-renderType blocks (no shared plan/section wording)
  if (internalRenderType === 'axonometric') {
    parts.push(
      'Focus on massing, scale, and spatial clarity.\nDo not include dimensions, labels, annotations, or technical symbols.'
    );
  } else if (internalRenderType === 'isometric_section_cutaway') {
    parts.push(
      'Focus on massing, scale, and spatial clarity.\nDo not include dimensions, labels, annotations, or technical symbols.'
    );
  }
  // Note: floor_plan uses separate module and returns early, so it doesn't reach here

  // MID-PROMPT REINFORCEMENT for section (critical reminder)
  // Note: floor_plan uses separate module and returns early, so only section reaches here
  if (isSection) {
    parts.push(
      '\n⚠️ REMINDER: This is an ISOMETRIC/AXONOMETRIC 3D CUTAWAY. The illustration must show depth and perspective at an angle, like looking into a dollhouse or architectural model.'
    );
  }

  // Output-specific addenda (for section only - floor_plan uses separate module and returns early)
  // Note: Section addenda contain hard constraints that override concept range for consistency
  if (outputAddendum) {
    parts.push(`\n${outputAddendum}`);
  }

  // SECTION 7.5 — VARIATION INSTRUCTION (encourages different interpretations)
  // Add variation to ensure different renders even with same inputs
  parts.push(
    '\nVARIATION: While respecting all requirements above, interpret the brief creatively. Each generation should explore different spatial arrangements, proportions, and design interpretations that satisfy the constraints. Avoid repeating identical layouts or compositions.'
  );

  // SECTION 8 — FIXED CONSTRUCTAOS STYLE LOCK (global for all view types)
  parts.push(`\n${CONSTRUCTAOS_STYLE_LOCK}`);
  
  // SECTION 8B — PLAN/SECTION STYLE VARIANT (appended only for section views)
  // Appended AFTER style lock for additional section specific style rules
  // Note: floor_plan uses separate module and returns early, so only section reaches here
  if (internalRenderType === 'isometric_section_cutaway') {
    parts.push(`\n${PLAN_SECTION_STYLE_VARIANT}`);
  }

  // Extra ConstructaOS visuals guidance (applies to all view types)
  if (internalRenderType === 'axonometric') {
    parts.push(
      '\nUltra high-resolution black-and-white architectural line drawing.\nClean, precise black ink linework with subtle grayscale hatching for depth and material texture.\nInclude a small garden or surrounding landscape with trees and shrubs rendered in minimalist style.\nPopulate the scene with a few minimal line-drawn figures — sitting, walking, talking — to add human warmth, scale, and everyday life.\nThe composition should feel like a professional architectural presentation: calm, balanced, and quietly aspirational.'
    );
  } else if (internalRenderType === 'isometric_section_cutaway') {
    parts.push(
      '\nUltra high-resolution black-and-white architectural line drawing.\nClean, precise black ink linework with subtle grayscale hatching for depth and material texture.\nThe composition should feel like a professional architectural presentation: calm, balanced, and quietly aspirational.'
    );
  }

  // Determine prompt version based on internal render type
  let promptVersion: string;
  switch (internalRenderType) {
    case 'axonometric':
      promptVersion = AXON_PROMPT_VERSION;
      break;
    case 'isometric_section_cutaway':
      promptVersion = SECTION_PROMPT_VERSION;
      break;
    default:
      // TypeScript exhaustiveness check
      // Note: isometric_floor_plan_cutaway is handled by early return above
      const _exhaustive: never = internalRenderType;
      throw new Error(`Unsupported internal render type: ${_exhaustive}`);
  }

  const finalPrompt = parts.join('\n\n');

  // Forbidden phrases: never claim survey/building is exact, accurate survey, or as-built
  const forbiddenPhrases = [
    'orthographic plan', '2D plan', 'floor plan (top view)', "bird's-eye plan", 'traditional plan',
    'accurate survey', 'as-built', 'as built',
  ];
  const foundPhrases = forbiddenPhrases.filter(phrase => {
    const regex = new RegExp(phrase, 'i');
    return regex.test(finalPrompt);
  });
  if (/\bexact\b/i.test(finalPrompt)) {
    foundPhrases.push('exact');
  }
  if (foundPhrases.length > 0) {
    console.warn(`⚠️  WARNING: Found forbidden phrases in ${internalRenderType} prompt:`, foundPhrases);
  }

  // Debug logging for section prompts (floor_plan uses separate module and returns early)
  if (internalRenderType === 'isometric_section_cutaway') {
    console.log(`\n=== FINAL PROMPT FOR ${internalRenderType.toUpperCase()} ===`);
    console.log(finalPrompt);
    console.log('=== END PROMPT ===\n');
    if (foundPhrases.length === 0) {
      console.log(`✓ No forbidden phrases found in ${internalRenderType} prompt`);
    }
  }

  return {
    prompt: finalPrompt,
    promptVersion,
  };
}

