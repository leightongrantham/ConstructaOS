/**
 * Type definitions for structured concept inputs
 */

export type ProjectType =
  | 'extension'
  | 'renovation'
  | 'new_build'
  | 'conversion';

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
  | '50_75'
  | '75_100'
  | '100_150'
  | '150_200'
  | '200_plus';

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
  | 'one'
  | 'two'
  | 'three'
  | 'four_plus';

export type Bathrooms =
  | 'one'
  | 'two'
  | 'three_plus';

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
 * Optional - only relevant for extensions, renovations, and conversions
 */
export interface ExistingContext {
  buildingForm: BuildingForm; // Existing building form
  orientation?: Orientation; // Existing orientation
  density?: Density; // Site context density
}

/**
 * Base proposed design fields shared across all project types
 */
interface BaseProposedDesign {
  projectType: ProjectType;
  buildingForm: BuildingForm; // Proposed building form
  storeys: Storeys;
  numberOfPlots: NumberOfPlots;
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
 * Proposed design for Conversion projects
 * Uses floorAreaRange (as before)
 */
export interface ConversionProposedDesign extends BaseProposedDesign {
  projectType: 'conversion';
  floorAreaRange: FloorAreaRange; // Floor area for conversion
}

/**
 * Proposed design information (design intent and requirements)
 * Discriminated union based on projectType
 */
export type ProposedDesign =
  | NewBuildProposedDesign
  | ExtensionProposedDesign
  | RenovationProposedDesign
  | ConversionProposedDesign;

/**
 * Complete concept brief combining existing context and proposed design
 */
export interface ConceptBrief {
  existingContext?: ExistingContext; // Optional - not required for new builds
  proposedDesign: ProposedDesign; // Always required
}

/**
 * Legacy type for backward compatibility during migration
 * @deprecated Use ConceptBrief instead
 */
export interface ConceptInputs {
  projectType: ProjectType;
  buildingForm: BuildingForm;
  storeys: Storeys;
  numberOfPlots: NumberOfPlots;
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
 * - Conversion: uses floorAreaRange
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
  } else if (proposedDesign.projectType === 'conversion') {
    floorAreaRange = proposedDesign.floorAreaRange;
  } else {
    // Renovation: legacy format doesn't support renovationScope, use default
    floorAreaRange = '100_150'; // Default fallback for renovation
  }
  
  const result: ConceptInputs = {
    projectType: proposedDesign.projectType,
    buildingForm: proposedDesign.buildingForm,
    storeys: proposedDesign.storeys,
    numberOfPlots: proposedDesign.numberOfPlots,
    floorAreaRange,
    bedrooms: proposedDesign.bedrooms,
    bathrooms: proposedDesign.bathrooms,
    kitchenType: proposedDesign.kitchenType,
    livingSpaces: proposedDesign.livingSpaces,
    roofType: proposedDesign.roofType,
    massingPreference: proposedDesign.massingPreference,
    outputType: proposedDesign.outputType,
  };

  // Add optional fields only if they exist
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
  
  // Build base fields
  const baseFields = {
    buildingForm: inputs.buildingForm,
    storeys: inputs.storeys,
    numberOfPlots: inputs.numberOfPlots,
    bedrooms: inputs.bedrooms,
    bathrooms: inputs.bathrooms,
    kitchenType: inputs.kitchenType,
    livingSpaces: inputs.livingSpaces,
    roofType: inputs.roofType,
    massingPreference: inputs.massingPreference,
    outputType: inputs.outputType,
  };

  // Add optional fields
  if (inputs.footprintScale) {
    (baseFields as any).footprintScale = inputs.footprintScale;
  }
  if (inputs.orientation) {
    (baseFields as any).orientation = inputs.orientation;
  }
  if (inputs.density) {
    (baseFields as any).density = inputs.density;
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
  } else if (inputs.projectType === 'renovation') {
    // For renovations, we need renovationScope - use default if not provided in legacy format
    proposedDesign = {
      ...baseFields,
      projectType: 'renovation',
      renovationScope: 'Modernise (no extension)', // Default fallback for legacy format
    } as RenovationProposedDesign;
  } else {
    // Conversion - uses floorAreaRange as before
    proposedDesign = {
      ...baseFields,
      projectType: 'conversion',
      floorAreaRange: inputs.floorAreaRange,
    } as ConversionProposedDesign;
  }

  // For non-new-build projects, create existingContext if we have context info
  if (isNewBuild) {
    return {
      proposedDesign,
    };
  }

  const existingContext: ExistingContext = {
    buildingForm: inputs.buildingForm, // Assume existing form matches proposed if not specified
  };

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

