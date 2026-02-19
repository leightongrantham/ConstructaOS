/**
 * Isometric Plan Cutaway Prompt Builder
 * Brand new prompt module with no references to old plan language
 * Focuses exclusively on isometric/axonometric cutaway floor plans
 */

import type { ConceptBrief } from '../types/conceptInputs.js';
import type { ConceptSeed } from '../services/generateConceptSeed.js';
import { conceptRangeAddendum } from './conceptRangeAddendum.js';

export interface BuildIsometricPlanPromptArgs {
  conceptSeed: ConceptSeed;
  brief: ConceptBrief;
  styleLock: string;
  /** Optional footprint scale override for massing hint only; does not change footprint geometry (compact | medium | wide) */
  baselineFootprintScaleOverride?: string;
}

/**
 * Builds a complete isometric plan cutaway prompt from concept seed and brief
 * Uses ONLY isometric cutaway language - no references to top-down or orthographic plans
 */
export function buildIsometricPlanPrompt(args: BuildIsometricPlanPromptArgs): string {
  const { conceptSeed, brief, styleLock, baselineFootprintScaleOverride } = args;
  const { existingContext, proposedDesign } = brief;
  
  const parts: string[] = [];
  
  // SECTION 1: ROLE
  parts.push(
    'You are an architectural designer creating early-stage concept visuals.\nThe output is a conceptual design study, not a technical drawing.'
  );
  
  // SECTION 2: CAMERA / VIEW (STRICT - ISOMETRIC CUTAWAY ONLY)
  parts.push(
    `Camera / view (STRICT, must follow):
- Produce an ISOMETRIC / AXONOMETRIC interior cutaway floor plan (3D-like).
- View angle ~30–45 degrees, showing floor plane and wall thickness.
- DO NOT produce a flat overhead view from directly above.
- DO NOT produce a flat 2D schematic drawing.
- DO NOT produce a flat schematic.
- The illustration must show depth and perspective, like looking into a dollhouse or architectural model.
- This is a 3D cutaway illustration with visible depth and spatial relationships.`
  );
  
  // SECTION 2B: EXISTING BASELINE (from address/site lookup — renovation/extension only)
  const isRenovation = proposedDesign.projectType === 'renovation';
  const isExtension = proposedDesign.projectType === 'extension';
  const existingBaseline = conceptSeed.existingBaseline;
  const hasExistingBaseline = (isRenovation || isExtension) && existingBaseline;

  if (hasExistingBaseline) {
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
    if (baselineFootprintScaleOverride) {
      const scaleLabel = baselineFootprintScaleOverride === 'compact' ? 'small' : baselineFootprintScaleOverride === 'wide' ? 'large' : 'medium';
      parts.push(`Interpret existing baseline massing as ${scaleLabel} scale for proportion and base massing; footprint geometry is unchanged.`);
    }
  }

  // SECTION 3: BRIEF SUMMARY (Existing context from form, if any)
  if (existingContext) {
    const existingParts: string[] = [];
    // When we have address-derived baseline, skip building form here — SECTION 2B covers it
    if (!hasExistingBaseline && existingContext.buildingForm) {
      existingParts.push(`Existing building form: ${formatBuildingForm(existingContext.buildingForm)}`);
    }
    if (existingContext.orientation) {
      existingParts.push(`Existing orientation: ${formatOrientation(existingContext.orientation)}`);
    }
    if (existingContext.density) {
      existingParts.push(`Site context: ${formatDensity(existingContext.density)}`);
    }
    if (existingParts.length > 0) {
      parts.push(`Existing context:\n${existingParts.join('\n')}`);
    }
  }

  // Proposed intervention summary
  const interventionParts: string[] = [];

  if (proposedDesign.projectType === 'renovation') {
    // Use existingBaseline when from address; otherwise existingContext (allows plan from address-only)
    const existingForm = hasExistingBaseline && existingBaseline.buildingForm !== 'Unknown'
      ? existingBaseline.buildingForm
      : existingContext?.buildingForm;
    if (existingForm) {
      // Baseline uses 'Detached' | 'Semi-detached' | etc.; brief uses snake_case — display consistently
      const formDisplay = typeof existingForm === 'string' && /^[a-z_]+$/i.test(existingForm)
        ? formatBuildingForm(existingForm)
        : String(existingForm).replace(/-/g, ' ');
      interventionParts.push(`Existing building: ${formDisplay}`);
    }
    const renovationStoreys = hasExistingBaseline ? formatBaselineStoreys(existingBaseline.storeys) : '~2 (estimated, no survey)';
    interventionParts.push(`Existing storeys: ${renovationStoreys}`);
    if (existingContext?.orientation) {
      interventionParts.push(`Existing orientation: ${formatOrientation(existingContext.orientation)}`);
    }
    interventionParts.push(`\nFocus: existing building structure. Renovation goals (within existing envelope):`);
    interventionParts.push(`Renovation scope: ${proposedDesign.renovationScope}`);
    interventionParts.push(`Target bedroom count: ${formatBedrooms(proposedDesign.bedrooms)}`);
    interventionParts.push(`Target bathroom count: ${formatBathrooms(proposedDesign.bathrooms)}`);
    interventionParts.push(`Desired kitchen arrangement: ${formatKitchenType(proposedDesign.kitchenType)}`);
    interventionParts.push(`Desired living space arrangement: ${formatLivingSpaces(proposedDesign.livingSpaces)}`);
    interventionParts.push(`Roof treatment: ${formatRoofType(proposedDesign.roofType)}`);
    interventionParts.push(`Massing refinement preference (within existing envelope): ${formatMassingPreference(proposedDesign.massingPreference)}`);
  } else if (proposedDesign.projectType === 'new_build') {
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
  } else if (proposedDesign.projectType === 'extension') {
    // Extension: existing form can come from address baseline or manual existingContext
    interventionParts.push(`Project type: ${formatProjectType(proposedDesign.projectType)}`);
    const existingFormForExt = hasExistingBaseline && existingBaseline.buildingForm !== 'Unknown'
      ? baselineFormToBrief(existingBaseline.buildingForm)
      : existingContext?.buildingForm;
    if (proposedDesign.buildingForm && existingFormForExt !== undefined && proposedDesign.buildingForm !== existingFormForExt) {
      interventionParts.push(`Proposed building form: ${formatBuildingForm(proposedDesign.buildingForm)}`);
    }
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
  
  if (proposedDesign.orientation && (!existingContext || proposedDesign.orientation !== existingContext.orientation)) {
    interventionParts.push(`Proposed orientation: ${formatOrientation(proposedDesign.orientation)}`);
  }
  
  if (proposedDesign.density && (!existingContext || proposedDesign.density !== existingContext.density)) {
    interventionParts.push(`Proposed density context: ${formatDensity(proposedDesign.density)}`);
  }
  
  parts.push(`Proposed intervention:\n${interventionParts.join('\n')}`);

  // SECTION 3.4: EXTENSION POSITIONING (only for extension — so the plan shows the new volume in the right place)
  if (proposedDesign.projectType === 'extension') {
    parts.push(`\nExtension positioning (must follow):\n${extensionPositioningRule(proposedDesign.extensionType)}`);
  }

  // SECTION 3.4b: RENOVATION CONSTRAINTS (only for renovation — focus on existing building structure)
  if (proposedDesign.projectType === 'renovation') {
    parts.push(
      '\nRenovation constraints: Show the existing building structure as the primary subject. The plan must depict the full existing footprint and envelope; improvements (reconfigured layout, new openings, roof treatment) are within that structure. Do not add new wings or extension; the existing mass must remain clearly recognisable.'
    );
  }

  // SECTION 3.5: CONCEPT RANGE (design interpretation framework)
  const conceptRange = conceptSeed.conceptRange ?? brief.conceptRange ?? 'Grounded';
  parts.push(`\n=== DESIGN INTERPRETATION FRAMEWORK ===\n${conceptRangeAddendum(conceptRange)}`);
  
  // SECTION 4: CONCEPT SEED (as JSON block)
  const seedJson = JSON.stringify(conceptSeed, null, 2);
  parts.push(`\nCONCEPT SEED (MUST REMAIN CONSISTENT ACROSS VIEWS):\n${seedJson}`);
  
  // SECTION 5: ISOMETRIC PLAN STYLING RULES
  parts.push(
    `ISOMETRIC PLAN CUTAWAY STYLING RULES:

Visual Style:
- Off-white paper texture
- Thin black ink linework
- Subtle grey shading
- Clean, precise black ink linework with subtle grayscale hatching for depth and material texture
- Minimal built-in furniture allowed (kitchen units, table, sofa) in simple linework
- All furniture elements defined by clean black outlines, minimal internal detail

Content Restrictions:
- NO people
- NO labels
- NO dimensions
- NO symbols
- NO north arrow
- NO scale bar
- For renovation: focus on the existing building structure—show the full building and the proposed improvements within it. For new build: focus on the proposed space. For extension: show existing building and new volume together.

Isometric Cutaway Representation:
- Isometric/axonometric cutaway view at 30-45 degree angle
- Front and right exterior walls (and roof/ceiling) conceptually removed
- Show wall thickness - walls should appear as solid elements with visible depth/thickness in perspective
- Show room enclosure - rooms should be clearly defined by their enclosing walls with depth
- The cutaway should reveal the interior spatial organization clearly from an angled viewpoint
- Elevated angled viewpoint offering clear three-dimensional understanding of the space

Spatial Organization:
- Use zoning hints from concept seed:
  * Public zone: ${conceptSeed.zoningHint.publicZone}
  * Private zone: ${conceptSeed.zoningHint.privateZone}
- Show clear spatial organization through wall and partition placement
- Maintain logical circulation and spatial flow appropriate to building type`
  );
  
  // SECTION 6: OUTPUT INSTRUCTION
  parts.push(
    '\nGenerate a clean architectural concept isometric floor plan cutaway.\nFocus on massing, scale, and spatial clarity.'
  );
  
  // SECTION 6.5: VARIATION INSTRUCTION (encourages different interpretations)
  // Add variation to ensure different renders even with same inputs
  parts.push(
    '\nVARIATION: While respecting all requirements above, interpret the brief creatively. Each generation should explore different spatial arrangements, room proportions, and layout interpretations that satisfy the constraints. Avoid repeating identical floor plans or spatial organizations.'
  );
  
  // SECTION 7: STYLE LOCK (appended at end)
  parts.push(`\n${styleLock}`);
  
  const finalPrompt = parts.join('\n\n');
  
  // PERMANENT RUNTIME ASSERTION: Check for forbidden keywords
  // Floor plan prompts must NOT contain: top-down/orthographic/plan view; or "accurate survey", "as-built"
  const forbiddenKeywords = ['top-down', 'orthographic', 'plan view', 'accurate survey', 'as-built', 'as built'];
  const foundKeywords = forbiddenKeywords.filter(keyword => {
    const regex = new RegExp(keyword, 'i');
    return regex.test(finalPrompt);
  });
  if (/\bexact\b/i.test(finalPrompt)) {
    foundKeywords.push('exact');
  }
  if (foundKeywords.length > 0) {
    const promptPreview = finalPrompt.substring(0, 400);
    throw new Error(
      `Floor plan prompt contains forbidden top-down keywords: ${foundKeywords.join(', ')}\n\n` +
      `Prompt preview (first 400 chars):\n${promptPreview}...`
    );
  }
  
  return finalPrompt;
}

// Helper formatting functions (minimal, focused on brief summary)
function formatProjectType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function formatBuildingForm(form: string): string {
  return form.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

/** Map ExistingBaseline buildingForm (e.g. 'Semi-detached') to brief BuildingForm (e.g. 'semi_detached') for comparison. */
function baselineFormToBrief(form: string): string | undefined {
  const map: Record<string, string> = {
    Detached: 'detached',
    'Semi-detached': 'semi_detached',
    Terraced: 'terraced',
    Infill: 'infill',
  };
  return map[form];
}

function formatStoreys(storeys: string): string {
  const map: Record<string, string> = {
    'one': '1',
    'two': '2',
    'three_plus': '3+',
  };
  return map[storeys] || storeys;
}

/** Format baseline storeys ('1'|'2'|'3+'|'Unknown') for prompt text. Single source: site/footprint with override. */
function formatBaselineStoreys(storeys: '1' | '2' | '3+' | 'Unknown'): string {
  if (storeys === 'Unknown') return '~2 (estimated, no survey)';
  return storeys;
}

function formatNumberOfPlots(plots: string): string {
  const map: Record<string, string> = {
    'one': '1',
    'two': '2',
    'three_to_five': '3-5',
    'five_to_ten': '5-10',
  };
  return map[plots] || plots;
}

function formatFloorAreaRange(range: string): string {
  const map: Record<string, string> = {
    '0_25': '0–25',
    '25_50': '25–50',
    '50_75': '50–75',
    '75_100': '75–100',
    '100_150': '100–150',
    '150_200': '150–200',
    '200_plus': '200+',
  };
  return map[range] ?? range.replace(/_/g, '-');
}

function formatFootprintScale(scale: string): string {
  return scale.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function formatBedrooms(bedrooms: string): string {
  const map: Record<string, string> = {
    'zero': '0 (not included)',
    'studio': 'Studio',
    'one': '1',
    'two': '2',
    'three': '3',
    'four': '4',
    'five_plus': '5+',
  };
  return map[bedrooms] ?? bedrooms;
}

function formatBathrooms(bathrooms: string): string {
  const map: Record<string, string> = {
    'zero': '0 (not included)',
    'one': '1',
    'two': '2',
    'three_plus': '3+',
  };
  return map[bathrooms] ?? bathrooms;
}

function formatKitchenType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function formatLivingSpaces(spaces: string): string {
  return spaces.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function formatRoofType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function formatMassingPreference(pref: string): string {
  return pref.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function formatOrientation(orientation: string): string {
  return orientation.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function formatDensity(density: string): string {
  return density.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function formatExtensionType(type: string): string {
  const map: Record<string, string> = {
    rear: 'Rear — new volume attached to the back of the existing building only',
    side: 'Side — new volume attached to one side of the existing building only',
    side_and_rear: 'Side and rear — new volume wrapping one side and the rear; not the front',
    wrap_around: 'Wrap-around — new volume may extend along side(s) and/or rear; keep the front/principal elevation clearly the existing building',
    two_storey: 'Two-storey extension — position as rear or side; new volume is two storeys',
    single_storey: 'Single-storey extension — position as rear or side; new volume is one storey',
  };
  return map[type] || type.replace(/_/g, ' ');
}

function extensionPositioningRule(type: string): string {
  const map: Record<string, string> = {
    rear: '- Attach the new volume to the BACK of the existing building only. Do not place it to the side or front.',
    side: '- Attach the new volume to ONE SIDE of the existing building only. Do not place it to the rear or front.',
    side_and_rear: '- Attach the new volume to ONE SIDE and the REAR (L-shape). Do not extend to the front.',
    wrap_around: '- New volume may wrap side(s) and/or rear; the front/principal elevation must remain the existing building.',
    two_storey: '- Attach the new volume (two storeys) to the rear or one side of the existing building. Do not place it in front.',
    single_storey: '- Attach the new volume (single storey) to the rear or one side of the existing building. Do not place it in front.',
  };
  return map[type] || '- Attach the new extension to the existing building in a coherent position (rear or side).';
}
