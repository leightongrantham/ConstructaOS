/**
 * Plan addendum prompts
 * Strict requirements for top-down orthographic plan diagrams
 * Must match conceptSeed footprint + axon reference footprint + ConstructaOS style
 */

import type { ConceptSeed } from '../services/generateConceptSeed.js';

export const PLAN_ADDENDUM_VERSION = 'plan_addendum_v5';

/**
 * Generates a plan-specific addendum that enforces strict alignment with
 * the concept seed and axon reference image
 */
export function getPlanAddendum(conceptSeed: ConceptSeed): string {
  const footprintDescription = getFootprintDescription(conceptSeed.footprintShape);
  const massingDescription = getMassingMovesDescription(conceptSeed.massingMoves);
  const storeysText = conceptSeed.storeys === '1' ? 'single storey' : conceptSeed.storeys === '2' ? 'two storey' : 'three+ storey';
  const roofText = conceptSeed.roof === 'flat' ? 'flat roof' : conceptSeed.roof === 'pitched' ? 'pitched roof' : 'mixed roof';

  return `FLOOR PLAN VIEW REQUIREMENTS (CRITICAL):

PROJECTION TYPE (NON-NEGOTIABLE):
- Top-down orthographic projection only - 90-degree vertical view directly from above
- NO isometric, NO axonometric, NO perspective - purely orthographic plan view
- NO depth cues, NO 3D effects, NO vertical lines showing height
- Purely plan representation - horizontal cut through building at approximately 1.2m above ground floor

STRICT ALIGNMENT WITH AXON REFERENCE (CRITICAL):
- The axonometric reference image shows the EXACT building you must produce the plan of
- Match the axon reference footprint EXACTLY - same building outline, same proportions
- Match the ConstructaOS illustration style of the axon reference EXACTLY - same line quality, same tonal treatment, same overall aesthetic
- The plan is a direct top-down view of what's shown in the axon - they must correlate perfectly
- Study the axon reference carefully and extract the footprint shape, building dimensions, and massing

PLAN GEOMETRY RULE (TRACING REQUIREMENT):
- Derive the overall building outline by tracing/simplifying the footprint implied by the axonometric reference
- Do NOT invent a new footprint
- Keep the plan within the same outline category (rectangular, L-shaped, courtyard, linear) as shown in the axon
- The plan outline must be a faithful top-down projection of the axon's footprint

FOOTPRINT CONSTRAINTS (MUST MATCH CONCEPT SEED AND AXON):
- Building type: ${storeysText} building with ${roofText}
- Footprint shape: ${footprintDescription}
${massingDescription}

HARD CONSTRAINT - NO NEW ELEMENTS:
- Do NOT introduce new wings, courtyards, or extensions not present in the concept seed or axon reference
- Do NOT add new massing moves or roof forms beyond what's specified
- The design must strictly match the footprint and massing already established
- If in doubt, stay simpler - match the axon reference footprint exactly

STYLE CONTINUITY (CRITICAL):
- Match the same ConstructaOS ink-on-paper style as the axonometric reference
- Off-white paper texture (not pure white), thin black ink linework, calm composition, subtle tonal shading
- Do NOT switch to blueprint style, CAD style, or technical drawing conventions
- Maintain the same visual language and aesthetic quality as the axon reference
- The plan should feel like it was drawn by the same hand as the axonometric

LINE HIERARCHY AND REPRESENTATION:
- Outer cut walls (building perimeter): Slightly heavier line weight - emphasize building edge
- Internal partitions: Lighter line weight - secondary hierarchy
- Openings (doors/windows): Indicated by gaps or very light lines in wall plane
- Optional: Very light poche (subtle solid/hatching) for cut walls - use sparingly, keep subtle
- All lines should be clean, precise, consistent with ConstructaOS style from axon reference

CONTENT RESTRICTIONS (ABSOLUTE):
- GROUND FLOOR PLAN ONLY - single-level horizontal cut at approximately 1.2m above floor
- Show walls, partitions, openings (doors/windows) - architectural structure only
- NO people, NO furniture, NO fixtures, NO appliances, NO interior objects
- NO labels, NO text, NO dimensions, NO annotations, NO room names
- NO door swings, NO detailed window frames, NO technical symbols
- Can include simple landscape context around building perimeter (garden, patio, trees) - minimalist rendering only

SPATIAL ORGANIZATION:
- Use zoning hints from concept seed:
  * Public zone: ${conceptSeed.zoningHint.publicZone}
  * Private zone: ${conceptSeed.zoningHint.privateZone}
- Show clear spatial organization through wall and partition placement
- Maintain logical circulation and spatial flow appropriate to building type

OUTPUT: A conceptual orthographic plan in the same ink-on-paper style as the axonometric reference. Simplified, legible, restrained. Top-down view correlating exactly to the axon's footprint and massing. Clear line hierarchy with slightly heavier outer walls. No furniture, no people, no labels, no dimensions.`;
}

function getFootprintDescription(shape: ConceptSeed['footprintShape']): string {
  switch (shape) {
    case 'rectangle':
      return 'Simple rectangular or square footprint - regular geometric form';
    case 'l_shape':
      return 'L-shaped configuration - two perpendicular wings forming L-shape';
    case 'courtyard':
      return 'U-shaped or courtyard arrangement - building wraps around open space';
    case 'linear':
      return 'Elongated linear form - horizontal extension along primary axis';
    case 'stepped':
      return 'Staggered or terraced form - stepped massing with offsets';
    default:
      return 'Geometric footprint as specified in brief';
  }
}

function getMassingMovesDescription(massingMoves: string[]): string {
  if (massingMoves.length === 0) {
    return '- Simple, unmodified massing - no extensions or modifications';
  }

  const descriptions = massingMoves.map((move) => {
    switch (move) {
      case 'rear_extension':
        return 'Extension at rear of building - additional depth to rear elevation';
      case 'side_wing':
        return 'Side wing extension - perpendicular addition to side elevation';
      case 'step_back':
        return 'Stepped-back massing - upper levels set back from ground floor';
      case 'cantilever':
        return 'Cantilevered element - overhanging volume above ground';
      case 'setback':
        return 'Setback configuration - offset volumes creating stepped profile';
      default:
        return `Massing move: ${move} - incorporate as geometric offset/addition`;
    }
  });

  return `- Massing moves to incorporate:
${descriptions.map((d) => `  * ${d}`).join('\n')}`;
}
