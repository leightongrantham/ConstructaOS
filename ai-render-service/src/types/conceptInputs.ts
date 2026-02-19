/**
 * Type definitions for structured concept inputs
 */

export type ProjectType =
  | 'extension'
  | 'renovation'
  | 'new_build';

export type BuildingForm =
  | 'detached'
  | 'semi_detached'
  | 'terraced'
  | 'infill';

export type Storeys =
  | 'one'
  | 'two'
  | 'three_plus';

export type NumberOfPlots =
  | 'one'
  | 'two'
  | 'three_to_five'
  | 'five_to_ten';

export type FloorAreaRange =
  | '0_25'
  | '25_50'
  | '50_75'
  | '75_100'
  | '100_150'
  | '150_200'
  | '200_plus';

/**
 * Maps FloorAreaRange to approximate midpoint area (m²) for cost estimation and scale assumptions.
 * Used by buildSiteEnvelope description and any cost/estimator logic.
 */
export function floorAreaRangeToApproximateSqm(range: FloorAreaRange): number {
  switch (range) {
    case '0_25':
      return 12;
    case '25_50':
      return 37;
    case '50_75':
      return 62;
    case '75_100':
      return 87;
    case '100_150':
      return 125;
    case '150_200':
      return 175;
    case '200_plus':
      return 225;
    default:
      return 125;
  }
}

export type RenovationScope =
  | 'Light refresh'
  | 'Reconfigure layout'
  | 'Deep retrofit'
  | 'Modernise (no extension)';

export type ExtensionType =
  | 'rear'
  | 'side'
  | 'side_and_rear'
  | 'wrap_around'
  | 'two_storey'
  | 'single_storey';

export type FootprintScale =
  | 'compact'
  | 'medium'
  | 'wide';

export type Bedrooms =
  | 'zero'
  | 'one'
  | 'two'
  | 'three'
  | 'four_plus';

export type Bathrooms =
  | 'zero'
  | 'one'
  | 'two'
  | 'three_plus';

/**
 * Numeric count for bedrooms (for cost/estimator). 0 = "not included", not missing data.
 */
export function bedroomsCountForEstimate(bedrooms: Bedrooms): number {
  switch (bedrooms) {
    case 'zero': return 0;
    case 'one': return 1;
    case 'two': return 2;
    case 'three': return 3;
    case 'four_plus': return 4;
    default: return 2;
  }
}

/**
 * Numeric count for bathrooms (for cost/estimator). 0 = "not included", not missing data.
 */
export function bathroomsCountForEstimate(bathrooms: Bathrooms): number {
  switch (bathrooms) {
    case 'zero': return 0;
    case 'one': return 1;
    case 'two': return 2;
    case 'three_plus': return 3;
    default: return 1;
  }
}

export type KitchenType =
  | 'open_plan'
  | 'semi_open'
  | 'separate';

export type LivingSpaces =
  | 'single_main_space'
  | 'multiple_living_areas';

export type RoofType =
  | 'flat'
  | 'pitched'
  | 'mixed';

export type MassingPreference =
  | 'split_volumes'
  | 'stepped'
  | 'simple_compact'
  | 'linear_elongated'
  | 'courtyard'
  | 'vertical_tall';

export type Orientation =
  | 'north_facing_rear'
  | 'south_facing_rear'
  | 'east'
  | 'west';

export type Density =
  | 'suburban'
  | 'urban'
  | 'rural';

export type OutputType =
  | 'concept_axonometric'
  | 'concept_plan'
  | 'concept_section';

/**
 * Existing context information (site/environmental context)
 * Optional - only relevant for extensions and renovations
 */
export interface ExistingContext {
  buildingForm?: BuildingForm; // Existing building form (optional when address/baseline supplies it)
  orientation?: Orientation;
  density?: Density;
}

/**
 * Base proposed design fields shared across all project types
 */
interface BaseProposedDesign {
  projectType: ProjectType;
  buildingForm?: BuildingForm; // Proposed building form (optional when baseline supplies existing)
  storeys?: Storeys; // Required only for New Build; Extension/Renovation use existingBaseline.storeys
  numberOfPlots?: NumberOfPlots; // Required only for New Build; excluded for Extension/Renovation
  footprintScale?: FootprintScale;
  bedrooms: Bedrooms;
  bathrooms: Bathrooms;
  kitchenType: KitchenType;
  livingSpaces: LivingSpaces;
  roofType: RoofType;
  massingPreference: MassingPreference;
  orientation?: Orientation; // Proposed orientation (if different from existing)
  density?: Density; // Proposed density context
  outputType: OutputType;
}

/**
 * Proposed design for New Build projects
 * Uses totalFloorAreaRange (not floorAreaRange)
 */
export interface NewBuildProposedDesign extends BaseProposedDesign {
  projectType: 'new_build';
  totalFloorAreaRange: FloorAreaRange; // Total floor area for new build
}

/**
 * Proposed design for Extension projects
 * Uses extensionType and additionalFloorAreaRange (not floorAreaRange)
 */
export interface ExtensionProposedDesign extends BaseProposedDesign {
  projectType: 'extension';
  extensionType: ExtensionType; // Type of extension
  additionalFloorAreaRange: FloorAreaRange; // Additional floor area from extension
}

/**
 * Proposed design for Renovation projects
 * Uses renovationScope (NOT floorAreaRange or additionalFloorAreaRange)
 */
export interface RenovationProposedDesign extends BaseProposedDesign {
  projectType: 'renovation';
  renovationScope: RenovationScope; // Scope of renovation work
}

/**
 * Proposed design information (design intent and requirements)
 * Discriminated union based on projectType
 */
export type ProposedDesign =
  | NewBuildProposedDesign
  | ExtensionProposedDesign
  | RenovationProposedDesign;

/**
 * Concept range indicating the level of design exploration
 */
export type ConceptRange = 'Grounded' | 'Exploratory' | 'Speculative';

/**
 * Complete concept brief combining existing context and proposed design
 */
export interface ConceptBrief {
  existingContext?: ExistingContext; // Optional - not required for new builds
  proposedDesign: ProposedDesign; // Always required
  conceptRange?: ConceptRange; // Optional - defaults to "Grounded"
}

/**
 * Legacy type for backward compatibility during migration
 * @deprecated Use ConceptBrief instead
 */
export interface ConceptInputs {
  projectType: ProjectType;
  buildingForm?: BuildingForm;
  storeys?: Storeys; // Required only for New Build; Extension/Renovation use baseline
  numberOfPlots?: NumberOfPlots; // Required only for New Build; excluded for Extension/Renovation
  floorAreaRange: FloorAreaRange;
  footprintScale?: FootprintScale;
  bedrooms: Bedrooms;
  bathrooms: Bathrooms;
  kitchenType: KitchenType;
  livingSpaces: LivingSpaces;
  roofType: RoofType;
  massingPreference: MassingPreference;
  orientation?: Orientation;
  density?: Density;
  outputType: OutputType;
}

/**
 * Converts a ConceptBrief to the legacy ConceptInputs format
 * Uses proposedDesign for most fields, falling back to existingContext where appropriate
 * Maps conditional fields to legacy floorAreaRange:
 * - NewBuild: uses totalFloorAreaRange
 * - Extension: uses additionalFloorAreaRange
 * - Renovation: uses a default floorAreaRange (legacy format limitation)
 */
export function conceptBriefToLegacyInputs(brief: ConceptBrief): ConceptInputs {
  const { existingContext, proposedDesign } = brief;
  
  // Determine floorAreaRange based on projectType
  let floorAreaRange: FloorAreaRange;
  if (proposedDesign.projectType === 'new_build') {
    floorAreaRange = proposedDesign.totalFloorAreaRange;
  } else if (proposedDesign.projectType === 'extension') {
    floorAreaRange = proposedDesign.additionalFloorAreaRange;
  } else {
    // Renovation: legacy format doesn't support renovationScope, use default
    floorAreaRange = '100_150'; // Default fallback for renovation
  }
  
  const result: ConceptInputs = {
    projectType: proposedDesign.projectType,
    floorAreaRange,
    bedrooms: proposedDesign.bedrooms,
    bathrooms: proposedDesign.bathrooms,
    kitchenType: proposedDesign.kitchenType,
    livingSpaces: proposedDesign.livingSpaces,
    roofType: proposedDesign.roofType,
    massingPreference: proposedDesign.massingPreference,
    outputType: proposedDesign.outputType,
  };

  if (proposedDesign.storeys !== undefined) {
    result.storeys = proposedDesign.storeys;
  }
  if (proposedDesign.numberOfPlots !== undefined) {
    result.numberOfPlots = proposedDesign.numberOfPlots;
  }
  if (proposedDesign.buildingForm !== undefined) {
    result.buildingForm = proposedDesign.buildingForm;
  }
  if (proposedDesign.footprintScale) {
    result.footprintScale = proposedDesign.footprintScale;
  }
  
  // Use proposed orientation if available, otherwise fall back to existing
  const orientation = proposedDesign.orientation ?? existingContext?.orientation;
  if (orientation) {
    result.orientation = orientation;
  }
  
  // Use proposed density if available, otherwise fall back to existing
  const density = proposedDesign.density ?? existingContext?.density;
  if (density) {
    result.density = density;
  }

  return result;
}

/**
 * Converts legacy ConceptInputs to ConceptBrief format
 * Attempts to infer existingContext based on projectType
 * Maps legacy floorAreaRange to conditional fields based on projectType
 */
export function legacyInputsToConceptBrief(inputs: ConceptInputs): ConceptBrief {
  const isNewBuild = inputs.projectType === 'new_build';
  
  // Build base fields (buildingForm, storeys, numberOfPlots optional)
  const baseFields: Record<string, unknown> = {
    bedrooms: inputs.bedrooms,
    bathrooms: inputs.bathrooms,
    kitchenType: inputs.kitchenType,
    livingSpaces: inputs.livingSpaces,
    roofType: inputs.roofType,
    massingPreference: inputs.massingPreference,
    outputType: inputs.outputType,
  };

  if (inputs.storeys !== undefined) {
    baseFields.storeys = inputs.storeys;
  }
  if (inputs.numberOfPlots !== undefined) {
    baseFields.numberOfPlots = inputs.numberOfPlots;
  }
  if (inputs.buildingForm !== undefined) {
    baseFields.buildingForm = inputs.buildingForm;
  }
  if (inputs.footprintScale) {
    baseFields.footprintScale = inputs.footprintScale;
  }
  if (inputs.orientation) {
    baseFields.orientation = inputs.orientation;
  }
  if (inputs.density) {
    baseFields.density = inputs.density;
  }

  // Build projectType-specific ProposedDesign
  let proposedDesign: ProposedDesign;
  
  if (inputs.projectType === 'new_build') {
    proposedDesign = {
      ...baseFields,
      projectType: 'new_build',
      totalFloorAreaRange: inputs.floorAreaRange,
    } as NewBuildProposedDesign;
  } else if (inputs.projectType === 'extension') {
    // For extensions, we need extensionType - use default if not provided in legacy format
    proposedDesign = {
      ...baseFields,
      projectType: 'extension',
      extensionType: 'rear', // Default fallback for legacy format
      additionalFloorAreaRange: inputs.floorAreaRange,
    } as ExtensionProposedDesign;
  } else {
    // Renovation (default for any existing-building project)
    proposedDesign = {
      ...baseFields,
      projectType: 'renovation',
      renovationScope: 'Modernise (no extension)', // Default fallback for legacy format
    } as RenovationProposedDesign;
  }

  // For non-new-build projects, create existingContext if we have context info
  if (isNewBuild) {
    return {
      proposedDesign,
    };
  }

  const existingContext: ExistingContext = {};
  if (inputs.buildingForm !== undefined) {
    existingContext.buildingForm = inputs.buildingForm;
  }
  if (inputs.orientation) {
    existingContext.orientation = inputs.orientation;
  }
  if (inputs.density) {
    existingContext.density = inputs.density;
  }

  return {
    existingContext,
    proposedDesign,
  };
}

