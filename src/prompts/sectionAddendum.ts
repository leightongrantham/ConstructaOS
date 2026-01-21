/**
 * Section addendum prompts
 * Strict requirements for vertical orthographic section diagrams
 * Must match storeys + roof profile from conceptSeed
 */

import type { ConceptSeed } from '../services/generateConceptSeed.js';

export const SECTION_ADDENDUM_VERSION = 'section_addendum_v6';

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

SECTION GEOMETRY RULE (TRACING REQUIREMENT):
- Derive storey count and roof profile from the axonometric reference
- The section silhouette must match the axon (same number of levels, same roof type, same stepping)
- Do NOT invent new levels or change the roof form
- Trace the vertical profile implied by the axonometric reference

CUT INSTRUCTION (CRITICAL):
- Use the sectionCutHint from the concept seed to choose a sensible cut line
- Section cut guidance: ${sectionCutDescription}
- Do NOT cut randomly - the cut should reveal key spatial relationships
- Prefer cuts that show main circulation, vertical connections, and primary spaces

VERTICAL CONSTRAINTS (MUST MATCH CONCEPT SEED):
- Storeys: ${storeysDescription}
- Roof profile: ${roofDescription}

STYLE CONTINUITY (CRITICAL):
- Match the same ConstructaOS ink-on-paper style as the axonometric reference
- Off-white paper texture (not pure white), thin black ink linework, calm composition, subtle tonal shading
- Do NOT switch to blueprint style, CAD style, or technical drawing conventions
- Maintain the same visual language and aesthetic quality as the axon reference
- The section should feel like it was drawn by the same hand as the axonometric

CONTENT RESTRICTIONS (ABSOLUTE):
- Focus on floor plates, walls, and roof profile - architectural structure
- Show floor levels clearly - horizontal lines indicating floor plates
- Show roof as outline/profile matching roof type from seed
- Can show walls as vertical lines - minimal structural representation
- NO people, NO materials, NO textures, NO detailed construction details
- NO labels, NO text, NO dimensions, NO annotations
- Can include simple ground line/context if helpful for understanding

GEOMETRIC REPRESENTATION:
- Floor plates as horizontal lines showing levels
- Roof as geometric profile matching roof type
- Walls as vertical lines showing building edges
- Simplified cut representation - show elements cut by section plane
- Can include minimal landscape/ground context if appropriate (trees, garden)
- Can use slightly thicker lines for cut elements (restrained architectural convention)

OUTPUT: A conceptual orthographic section in the same ink-on-paper style as the axonometric reference. Simplified, legible, restrained. Vertical cut showing floor plates, walls, and roof profile. Can include simple ground line. No people, no labels, no dimensions.`;
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
