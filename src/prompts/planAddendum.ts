/**
 * Plan addendum prompts
 * Strict requirements for top-down orthographic plan diagrams
 * Must match conceptSeed footprint + massingMoves
 */

import type { ConceptSeed } from '../services/generateConceptSeed.js';

export const PLAN_ADDENDUM_VERSION = 'plan_addendum_v1';

/**
 * Generates a plan-specific addendum that enforces strict diagrammatic requirements
 * and matches the conceptSeed footprint and massing moves
 */
export function getPlanAddendum(conceptSeed: ConceptSeed): string {
  const footprintDescription = getFootprintDescription(conceptSeed.footprintShape);
  const massingDescription = getMassingMovesDescription(conceptSeed.massingMoves);

  return `PLAN VIEW REQUIREMENTS (CRITICAL - STRICTER THAN AXONOMETRIC):

PROJECTION TYPE (NON-NEGOTIABLE):
- Top-down orthographic projection only - 90-degree vertical view directly from above
- NO isometric, NO axonometric, NO perspective - purely orthographic plan view
- NO depth cues, NO 3D effects, NO vertical lines showing height
- Diagrammatic/abstract block representation - geometric shapes only

FOOTPRINT CONSTRAINTS (MUST MATCH CONCEPT SEED):
- Footprint shape: ${footprintDescription}
${massingDescription}

CONTENT RESTRICTIONS:
- GROUND FLOOR PLAN ONLY - single-level plan diagram showing spatial organization
- Focus on walls, partitions, openings (doors/windows) - architectural structure only
- NO furniture, NO fixtures, NO appliances, NO interior objects
- NO labels, NO text, NO dimensions, NO annotations
- NO room names, NO door swings, NO detailed window representation

GEOMETRIC REPRESENTATION:
- Show walls, partitions, and openings clearly
- Spaces shown as defined by walls and partitions
- Openings indicated by gaps or simple representations
- Can include simple landscape context around building (garden, patio, surrounding area)

STYLE REQUIREMENTS (NEAVE BROWN STYLING - SAME AS AXONOMETRIC):
- Neave Brown–inspired architectural language
- Clean, precise black ink linework with subtle grayscale hatching for depth and material texture
- Thin, consistent black linework
- Off-white paper background
- Subtle tonal variation only
- Can include simple landscape elements: garden, patio, surrounding context (minimalist grayscale rendering)
- Can include minimal line-drawn figures for scale (standing, sitting) - appropriate for plan view
- Human-scale proportions
- Calm, neutral presentation suitable for early design discussion

OUTPUT: A clean architectural concept floor plan diagram in Neave Brown style. Top-down orthographic view showing walls, spaces, and openings. Can include simple landscape context and minimal figures for scale. No furniture, labels, or dimensions.`;
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
