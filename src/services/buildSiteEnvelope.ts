/**
 * Site envelope builder
 * Generates descriptive site envelope information based on location and project inputs
 */

import type { ConceptInputs, ConceptBrief, BuildingForm, Density, ProjectType } from '../types/conceptInputs.js';
import { conceptBriefToLegacyInputs } from '../types/conceptInputs.js';

export interface SiteEnvelope {
  description: string;
  approximateWidth: number; // meters
  approximateDepth: number; // meters
  approximateArea: number; // square meters
}

/**
 * Calculates approximate site dimensions based on building form
 * Returns width and depth in meters
 */
function getBaseDimensions(buildingForm: BuildingForm): {
  width: number;
  depth: number;
} {
  switch (buildingForm) {
    case 'detached':
      // Detached houses typically have larger plots with more space around
      return { width: 20, depth: 25 };
    case 'semi_detached':
      // Semi-detached share one wall, so narrower plots
      return { width: 12, depth: 20 };
    case 'terraced':
      // Terraced houses are narrow with shared walls on both sides
      return { width: 6, depth: 15 };
    case 'infill':
      // Infill sites are often compact, constrained by existing buildings
      return { width: 10, depth: 15 };
  }
}

/**
 * Applies density multiplier to base dimensions
 */
function applyDensityMultiplier(
  width: number,
  depth: number,
  density?: Density
): { width: number; depth: number } {
  if (!density) {
    return { width, depth };
  }

  switch (density) {
    case 'rural':
      // Rural plots are typically larger with more land
      return { width: width * 1.8, depth: depth * 1.8 };
    case 'suburban':
      // Suburban: standard dimensions (no change)
      return { width, depth };
    case 'urban':
      // Urban plots are typically more compact
      return { width: width * 0.75, depth: depth * 0.75 };
  }
}

/**
 * Applies project type adjustments
 * Extensions and renovations may work with existing site constraints
 */
function applyProjectTypeAdjustment(
  width: number,
  depth: number,
  projectType: ProjectType
): { width: number; depth: number } {
  switch (projectType) {
    case 'extension':
      // Extensions work within existing plot, may be constrained
      return { width: width * 0.9, depth: depth * 0.9 };
    case 'renovation':
      // Renovations work within existing footprint
      return { width: width * 0.95, depth: depth * 0.95 };
    case 'new_build':
      // New builds have full flexibility
      return { width, depth };
    case 'conversion':
      // Conversions work within existing building envelope
      return { width: width * 0.9, depth: depth * 0.9 };
  }
}

/**
 * Rounds dimensions to reasonable approximations
 */
function roundDimensions(width: number, depth: number): {
  width: number;
  depth: number;
} {
  // Round to nearest 0.5 meters for readability
  return {
    width: Math.round(width * 2) / 2,
    depth: Math.round(depth * 2) / 2,
  };
}

/**
 * Generates a descriptive text about the site envelope bounding box
 */
function generateDescription(
  width: number,
  depth: number,
  area: number,
  buildingForm: BuildingForm,
  density?: Density
): string {
  const formDescription = buildingForm.replace('_', '-');
  const densityText = density ? ` in a ${density} setting` : '';
  
  return `Approximate site envelope: ${width}m × ${depth}m (${area}m²) ${formDescription} plot${densityText}. The bounding box polygon extends approximately ${width}m east-west and ${depth}m north-south from the site center point.`;
}

/**
 * Builds an approximate site envelope description based on location and project inputs
 * Accepts both ConceptBrief (new format) and ConceptInputs (legacy format) for backward compatibility
 * 
 * @param lat - Latitude of the site center point
 * @param lng - Longitude of the site center point
 * @param inputs - Concept inputs containing buildingForm, density, and projectType
 * @returns SiteEnvelope with descriptive text and approximate dimensions
 */
export function buildSiteEnvelope(
  lat: number,
  lng: number,
  inputs: ConceptBrief | ConceptInputs
): SiteEnvelope {
  // Convert ConceptBrief to legacy format if needed
  const legacyInputs: ConceptInputs = 'proposedDesign' in inputs
    ? conceptBriefToLegacyInputs(inputs)
    : inputs;
  // Validate coordinates
  if (isNaN(lat) || isNaN(lng)) {
    throw new Error('Invalid coordinates: lat and lng must be valid numbers');
  }

  if (lat < -90 || lat > 90) {
    throw new Error('Invalid latitude: must be between -90 and 90');
  }

  if (lng < -180 || lng > 180) {
    throw new Error('Invalid longitude: must be between -180 and 180');
  }

  // Calculate base dimensions from building form
  let { width, depth } = getBaseDimensions(legacyInputs.buildingForm);

  // Apply density adjustments
  ({ width, depth } = applyDensityMultiplier(width, depth, legacyInputs.density));

  // Apply project type adjustments
  ({ width, depth } = applyProjectTypeAdjustment(width, depth, legacyInputs.projectType));

  // Round to reasonable approximations
  ({ width, depth } = roundDimensions(width, depth));

  // Calculate approximate area
  const area = Math.round(width * depth);

  // Generate descriptive text
  const description = generateDescription(
    width,
    depth,
    area,
    legacyInputs.buildingForm,
    legacyInputs.density
  );

  return {
    description,
    approximateWidth: width,
    approximateDepth: depth,
    approximateArea: area,
  };
}

