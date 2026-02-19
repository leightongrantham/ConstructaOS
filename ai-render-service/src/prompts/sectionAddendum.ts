/**
 * Section addendum prompts
 * Requirements for isometric/axonometric section cutaway views
 * Must match storeys + roof profile from conceptSeed
 */

import type { ConceptSeed } from '../services/generateConceptSeed.js';

export const SECTION_ADDENDUM_VERSION = 'section_addendum_v6';

/**
 * Generates a section-specific addendum that enforces strict vertical section requirements
 * and matches the conceptSeed storeys and roof profile
 * @param conceptSeed - The concept seed for consistency
 * @param includePeople - Whether to allow people in the section view (default: false)
 */
export function getSectionAddendum(conceptSeed: ConceptSeed, includePeople: boolean = false): string {
  const storeysDescription = getStoreysDescription(conceptSeed.storeys);
  const roofDescription = getRoofDescription(conceptSeed.roof);
  const sectionCutDescription = conceptSeed.sectionCutHint || 'simple vertical cut through building';

  return `ISOMETRIC SECTION CUTAWAY VIEW REQUIREMENTS (CRITICAL):

⚠️⚠️⚠️ CAMERA / VIEW (ISOMETRIC SECTION CUTAWAY - REQUIRED) ⚠️⚠️⚠️:
- Produce an isometric / axonometric section cutaway (3D perspective view).
- View angle: angled to show depth and perspective, revealing interior structure.
- Show floor plate(s) and cut walls with visible thickness.
- The image MUST show depth and perspective - like looking into a dollhouse or architectural model.
- This is a 3D cutaway illustration with visible depth and spatial relationships.

PROJECTION TYPE (ISOMETRIC/AXONOMETRIC):
- Generate an isometric / axonometric section cutaway view of the proposal
- Use isometric or axonometric projection with angled viewing perspective
- Show interior space as a cutaway with visible depth and spatial relationships
- The cutaway should feel like looking into a dollhouse or architectural model
- Maintain consistent perspective throughout the illustration

PRIMARY SOURCE OF TRUTH:
- The structured inputs and concept seed are the primary source of truth for programme, scale, adjacencies, and spatial intent
- Use these structured inputs to define the section geometry and vertical composition

AXONOMETRIC REFERENCE (STYLE GUIDE ONLY):
- Use the axonometric reference to match illustration style and line language, not to exactly trace exterior footprint
- The axonometric reference is a visual style guide (paper texture, line quality, tonal treatment), not a strict geometric template
- Should maintain similar storey count and general vertical composition as indicated in the concept seed
- Do not invent a completely different project type or scale

CUT INSTRUCTION (CRITICAL):
- Use the sectionCutHint from the concept seed to choose a sensible cut line
- Section cut guidance: ${sectionCutDescription}
- Do NOT cut randomly - the cut should reveal key spatial relationships
- Prefer cuts that show main circulation, vertical connections, and primary spaces

VERTICAL CONSTRAINTS (MUST MATCH CONCEPT SEED):
- Storeys: ${storeysDescription}
- Roof profile: ${roofDescription}

CONCEPT BOUNDARIES:
- Should feel consistent with the same concept (programme, scale, adjacency), but does not need to match exterior massing exactly
- Do not invent a completely different project type or scale

STYLE CONTINUITY (CRITICAL):
- Match the same ConstructaOS ink-on-paper style as the axonometric reference
- Off-white paper
- Ink lines
- Subtle grey shading
- Do NOT switch to blueprint style, CAD style, or technical drawing conventions
- Maintain the same visual language and aesthetic quality as the axon reference
- The section should feel like it was drawn by the same hand as the axonometric

CONTENT RESTRICTIONS (ABSOLUTE):
- Focus on floor plates, walls, and roof profile - architectural structure
- Show floor levels clearly - horizontal lines indicating floor plates
- Show roof as outline/profile matching roof type from seed
- Show walls with thickness - minimal structural representation
- Minimal interior elements allowed (furniture, fixtures) - simple schematic forms only
${includePeople ? '- Can include minimal line-drawn figures for scale (standing) - appropriate for section cutaway view' : '- NO people - default none, no figures or human forms'}
- No labels, no dimensions, no symbols
- Can include simple ground line/context if helpful for understanding

GEOMETRIC REPRESENTATION:
- Floor plates as horizontal lines showing levels
- Roof as geometric profile matching roof type
- Walls as vertical lines showing building edges
- Simplified cut representation - show elements cut by section plane
- Can include minimal landscape/ground context if appropriate (trees, garden)
- Can use slightly thicker lines for cut elements (restrained architectural convention)

OUTPUT: A conceptual isometric/axonometric section cutaway in the same ink-on-paper style as the axonometric reference. Simplified, legible, restrained. Angled cutaway view showing floor plates, walls with thickness, and roof profile. Minimal interior elements allowed. Off-white paper, ink lines, subtle grey shading. ${includePeople ? 'Can include minimal line-drawn figures for scale.' : 'No people,'} no labels, no dimensions.`;
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
