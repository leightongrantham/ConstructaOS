/**
 * Service for inferring existing building context from OSM data
 * Analyzes nearby buildings from Overpass API results to infer building characteristics
 */

import type { NearbyBuildingsResult } from './queryNearbyBuildings.js';
import type { BuildingForm, Storeys, FootprintScale, Density } from '../types/conceptInputs.js';

export interface InferredExistingContext {
  existingBuildingType: BuildingForm;
  existingStoreys: Storeys;
  existingFootprintScale: FootprintScale;
  inferred: true; // Marker to indicate this is inferred data
}

/**
 * Infers building form based on footprint size and touching neighbours
 */
function inferBuildingForm(
  footprints: number[],
  touchingNeighbours: boolean,
  density?: Density
): BuildingForm {
  if (footprints.length === 0) {
    // Default fallback based on density
    if (density === 'urban') {
      return 'terraced';
    } else if (density === 'rural') {
      return 'detached';
    }
    return 'semi_detached';
  }

  const medianFootprint = [...footprints].sort((a, b) => a - b)[Math.floor(footprints.length / 2)];

  // Use median as it's less affected by outliers
  const typicalFootprint = medianFootprint;
  
  if (typicalFootprint === undefined) {
    // Fallback if median calculation fails
    return density === 'urban' ? 'terraced' : density === 'rural' ? 'detached' : 'semi_detached';
  }

  // Terraced: Small footprints (< 100 m²) with touching neighbours
  if (touchingNeighbours && typicalFootprint < 100) {
    return 'terraced';
  }

  // Semi-detached: Medium footprints (80-150 m²) with touching neighbours
  if (touchingNeighbours && typicalFootprint >= 80 && typicalFootprint <= 150) {
    return 'semi_detached';
  }

  // Detached: Larger footprints (> 150 m²) or no touching neighbours
  if (!touchingNeighbours || typicalFootprint > 150) {
    return 'detached';
  }

  // Infill: Small-medium footprints in dense areas
  if (density === 'urban' && typicalFootprint < 120) {
    return 'infill';
  }

  // Default based on footprint size
  if (typicalFootprint < 100) {
    return 'semi_detached';
  } else if (typicalFootprint > 200) {
    return 'detached';
  }

  return 'semi_detached';
}

/**
 * Infers storeys range based on building levels and density
 */
function inferStoreys(
  buildingLevels?: number[],
  density?: Density,
  footprints: number[] = []
): Storeys {
  // If we have actual building levels data, use it
  if (buildingLevels && buildingLevels.length > 0) {
    const avgLevels = buildingLevels.reduce((a, b) => a + b, 0) / buildingLevels.length;
    const maxLevels = Math.max(...buildingLevels);

    // If most buildings are similar height, use that
    if (avgLevels <= 1.5) {
      return 'one';
    } else if (avgLevels <= 2.5 && maxLevels <= 2) {
      return 'two';
    } else {
      return 'three_plus';
    }
  }

  // Infer from density context
  if (density === 'urban') {
    // Urban areas typically have 2-3+ storeys
    const avgFootprint = footprints.length > 0
      ? footprints.reduce((a, b) => a + b, 0) / footprints.length
      : 0;
    
    // Very small footprints in urban areas often indicate taller buildings
    if (avgFootprint > 0 && avgFootprint < 80) {
      return 'three_plus';
    }
    return 'two';
  } else if (density === 'suburban') {
    // Suburban areas typically have 1-2 storeys
    return 'two';
  } else if (density === 'rural') {
    // Rural areas typically single storey
    return 'one';
  }

  // Default: assume 2 storeys
  return 'two';
}

/**
 * Infers footprint scale based on building footprint areas
 */
function inferFootprintScale(footprints: number[]): FootprintScale {
  if (footprints.length === 0) {
    return 'medium'; // Default fallback
  }

  const sortedFootprints = [...footprints].sort((a, b) => a - b);
  const medianIndex = Math.floor(sortedFootprints.length / 2);
  const medianFootprint = sortedFootprints[medianIndex];

  if (medianFootprint === undefined) {
    return 'medium'; // Default fallback
  }

  // Compact: < 80 m²
  if (medianFootprint < 80) {
    return 'compact';
  }

  // Wide: > 150 m²
  if (medianFootprint > 150) {
    return 'wide';
  }

  // Medium: 80-150 m²
  return 'medium';
}

/**
 * Infers existing building context from OSM Overpass API results
 * 
 * @param overpassResult - Result from queryNearbyBuildings
 * @param densityHint - Optional density hint (suburban/urban/rural) to help inference
 * @returns InferredExistingContext with building characteristics
 */
export function inferExistingContextFromOSM(
  overpassResult: NearbyBuildingsResult,
  densityHint?: Density
): InferredExistingContext {
  const { footprints, touchingNeighbours, buildingLevels } = overpassResult;

  // If no buildings found, use default values based on density hint
  if (overpassResult.buildingCount === 0 || footprints.length === 0) {
    const defaultBuildingType = densityHint === 'urban'
      ? 'terraced'
      : densityHint === 'rural'
      ? 'detached'
      : 'semi_detached';

    return {
      existingBuildingType: defaultBuildingType,
      existingStoreys: inferStoreys(undefined, densityHint, []),
      existingFootprintScale: 'medium',
      inferred: true,
    };
  }

  return {
    existingBuildingType: inferBuildingForm(footprints, touchingNeighbours, densityHint),
    existingStoreys: inferStoreys(buildingLevels, densityHint, footprints),
    existingFootprintScale: inferFootprintScale(footprints),
    inferred: true,
  };
}

