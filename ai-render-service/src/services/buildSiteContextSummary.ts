/**
 * Service for building site context summary
 * Combines location, envelope, and existing context information
 */

import type { SiteEnvelope } from './buildSiteEnvelope.js';
import type { InferredExistingContext } from './inferExistingContextFromOSM.js';
import type { ExistingContext, BuildingForm, Storeys, FootprintScale } from '../types/conceptInputs.js';

export interface BuildSiteContextSummaryOptions {
  locationName?: string;
  envelope: SiteEnvelope;
  inferredContext?: InferredExistingContext;
  userExistingContext?: ExistingContext;
}

/**
 * Formats building form for display
 */
function formatBuildingForm(form: BuildingForm): string {
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

/**
 * Formats storeys for display
 */
function formatStoreys(storeys: Storeys): string {
  switch (storeys) {
    case 'one':
      return 'single-storey';
    case 'two':
      return 'two-storey';
    case 'three_plus':
      return 'multi-storey';
  }
}

/**
 * Formats footprint scale for display
 */
function formatFootprintScale(scale: FootprintScale): string {
  switch (scale) {
    case 'compact':
      return 'compact';
    case 'medium':
      return 'medium';
    case 'wide':
      return 'wide';
  }
}

/**
 * Builds a site context summary from location, envelope, and context information
 * Uses inferred context if available, falls back to user input or defaults
 * Always phrases conclusions as "appears to" to indicate uncertainty
 * 
 * @param options - Options containing location, envelope, and context information
 * @returns Site context summary text
 */
export function buildSiteContextSummary(
  options: BuildSiteContextSummaryOptions
): string {
  const { locationName, envelope, inferredContext, userExistingContext } = options;

  const parts: string[] = [];

  // Start with location
  if (locationName) {
    parts.push(locationName);
  }

  // Add envelope information
  parts.push(envelope.description);

  // Add existing building context if available (for non-new-build projects)
  if (inferredContext || userExistingContext) {
    const contextParts: string[] = [];

    // Determine building form (prefer inferred, then user input)
    const buildingForm = inferredContext?.existingBuildingType || userExistingContext?.buildingForm;
    if (buildingForm) {
      contextParts.push(
        `The existing building appears to be ${formatBuildingForm(buildingForm)}`
      );
    }

    // Determine storeys (prefer inferred, then user input)
    const storeys = inferredContext?.existingStoreys;
    if (storeys) {
      contextParts.push(`appears to be ${formatStoreys(storeys)}`);
    } else if (userExistingContext) {
      // If we have user context but no storeys info, we can't infer it
      // Skip this part
    }

    // Determine footprint scale (prefer inferred, then user input)
    const footprintScale = inferredContext?.existingFootprintScale;
    if (footprintScale) {
      contextParts.push(`appears to have a ${formatFootprintScale(footprintScale)} footprint`);
    }

    // Add orientation if available (always phrase as "appears to")
    if (userExistingContext?.orientation) {
      const orientationText = userExistingContext.orientation.replace(/_/g, ' ');
      contextParts.push(`appears to be oriented ${orientationText}`);
    }

    // Add density if available (always phrase as "appears to")
    if (userExistingContext?.density) {
      contextParts.push(`appears to be in a ${userExistingContext.density} setting`);
    }

    if (contextParts.length > 0) {
      parts.push(contextParts.join(', ') + '.');
    }
  }

  return parts.join('. ');
}

