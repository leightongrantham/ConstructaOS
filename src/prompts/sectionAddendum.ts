/**
 * Section addendum prompts
 * Strict requirements for vertical orthographic section diagrams
 * Must match storeys + roof profile from conceptSeed
 */

import type { ConceptSeed } from '../services/generateConceptSeed.js';

export const SECTION_ADDENDUM_VERSION = 'section_addendum_v1';

/**
 * Generates a section-specific addendum that enforces strict vertical section requirements
 * and matches the conceptSeed storeys and roof profile
 */
export function getSectionAddendum(conceptSeed: ConceptSeed): string {
  const storeysDescription = getStoreysDescription(conceptSeed.storeys);
  const roofDescription = getRoofDescription(conceptSeed.roof);
  const sectionCutDescription = conceptSeed.sectionCutHint || 'simple vertical cut through building';

  return `SECTION VIEW REQUIREMENTS (CRITICAL - STRICTER THAN AXONOMETRIC):

PROJECTION TYPE (NON-NEGOTIABLE):
- Vertical orthographic section diagram only - 90-degree horizontal cut through building
- NO isometric, NO axonometric, NO perspective - purely orthographic vertical section
- NO 3D elements, NO depth cues - flat vertical elevation through cut plane
- Simple cut representation - floor plates and roof silhouette only

VERTICAL CONSTRAINTS (MUST MATCH CONCEPT SEED):
- Storeys: ${storeysDescription}
- Roof profile: ${roofDescription}
- Section cut location: ${sectionCutDescription}

CONTENT RESTRICTIONS:
- Focus on floor plates, walls, and roof profile - architectural structure
- Show floor levels clearly - horizontal lines indicating floor plates
- Show roof as outline/profile matching roof type from seed
- Can show walls as vertical lines - minimal structural representation
- NO materials, NO textures, NO detailed construction details
- NO labels, NO text, NO dimensions, NO annotations
- Can include simple ground line/context if helpful for understanding

GEOMETRIC REPRESENTATION:
- Floor plates as horizontal lines showing levels
- Roof as geometric profile matching roof type
- Walls as vertical lines showing building edges
- Simple cut representation - show elements cut by section plane
- Can include minimal landscape/ground context if appropriate

STYLE REQUIREMENTS (NEAVE BROWN STYLING - SAME AS AXONOMETRIC):
- Neave Brown–inspired architectural language
- Clean, precise black ink linework with subtle grayscale hatching for depth and material texture
- Thin, consistent black linework
- Off-white paper background
- Subtle tonal variation only
- Can use slightly thicker lines for cut elements (standard architectural convention)
- Can include simple landscape/ground context (minimalist grayscale rendering)
- Can include minimal line-drawn figures for scale (standing) - appropriate for section view
- Human-scale proportions
- Calm, neutral presentation suitable for early design discussion

OUTPUT: A clean architectural concept section diagram in Neave Brown style. Vertical orthographic section showing floor plates, walls, and roof profile. Can include simple ground context and minimal figures for scale. No labels or dimensions.`;
}

function getStoreysDescription(storeys: ConceptSeed['storeys']): string {
  switch (storeys) {
    case '1':
      return 'Single storey - ground floor only, no upper levels';
    case '2':
      return 'Two storeys - ground floor and first floor, show two floor plates';
    case '3+':
      return 'Three or more storeys - show multiple floor plates representing all levels';
    default:
      return 'Storey count as specified in brief';
  }
}

function getRoofDescription(roof: ConceptSeed['roof']): string {
  switch (roof) {
    case 'flat':
      return 'Flat roof - single horizontal line at top, no pitch';
    case 'pitched':
      return 'Pitched/sloped roof - angled profile, gabled or hipped form';
    case 'mixed':
      return 'Mixed roof - combination of flat and pitched elements in profile';
    default:
      return 'Roof profile as specified in brief';
  }
}
