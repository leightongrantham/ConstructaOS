/**
 * Floor plan prompt templates
 */

export const PROMPT_VERSION = 'floor_v2';

export const PROMPT_TEXT = `Create an architectural floor plan drawing in Neave Brown style. Use orthographic top-down projection (90-degree vertical view directly from above).

STYLE REQUIREMENTS (NEAVE BROWN - SAME AS AXONOMETRIC):
- Neave Brown–inspired architectural language
- Clean, precise black ink linework with subtle grayscale hatching for depth and material texture
- Thin, consistent black linework
- Off-white paper background (not pure white)
- Subtle tonal variation only
- Human-scale proportions
- Can include minimal line-drawn figures for scale and everyday life (standing, sitting) - appropriate for plan view
- Can include simple landscape elements: garden, patio, surrounding context (minimalist grayscale rendering)
- Calm, neutral presentation suitable for early design discussion
- No cars, furniture, text, labels, annotations, or technical symbols

CONTENT REQUIREMENTS:
- Focus on building structure: walls, partitions, openings (doors/windows), columns
- Single building floor plan, avoid multiple buildings
- Can include minimal landscape context around building (garden, patio, surrounding area) in minimalist style
- Can include minimal line-drawn figures for scale (standing, sitting) - appropriate for plan view
- Avoid detailed furniture, fixtures, appliances, or interior objects
- Avoid text, labels, annotations, dimensions, or lettering
- Avoid grid lines, scale bars, north arrows, or reference elements

TECHNICAL SPECIFICATIONS:
- Projection type: Orthographic top-down view (plan view) - 90-degree vertical view directly from above
- View angle: Directly above, purely orthographic
- Line rendering: Clean, precise linework with subtle grayscale hatching
- Wall representation: Clear walls and partitions showing spatial organization
- Composition: Floor plan as architectural presentation - calm, balanced, quietly aspirational

OUTPUT: A clean architectural concept floor plan in Neave Brown style. Top-down orthographic view showing walls, spaces, and openings. Can include simple landscape context and minimal figures for scale. No furniture, labels, or dimensions.`;


