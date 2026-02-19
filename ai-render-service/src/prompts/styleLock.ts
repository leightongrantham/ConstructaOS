/**
 * ConstructaOS Style Lock
 * Global visual style requirements applied to all render types (axon, plan, section)
 * Ensures consistent Neave Brown-inspired architectural drawing aesthetic across all views
 */

export const CONSTRUCTAOS_STYLE_LOCK = `CONSTRUCTAOS STYLE LOCK (APPLIES TO ALL VIEWS):

Visual Language:
- Neave Brown–inspired architectural language
- Clean, precise black ink linework
- Thin, consistent black linework throughout
- Off-white paper background (not pure white)
- Human-scale proportions
- Calm, neutral presentation suitable for early design discussion

Content Restrictions:
- NO labels, NO text, NO dimensions, NO annotations
- NO room names, NO technical symbols, NO lettering of any kind
- NO cars or vehicles

Composition:
- Professional architectural presentation quality
- Calm, balanced, and quietly aspirational
- Focus on massing, scale, and spatial clarity
- Suitable for early-stage concept discussion`;

/**
 * Isometric Plan Cutaway Style Variant
 * Additional style rules specific to isometric plan cutaway views
 * Appended after CONSTRUCTAOS_STYLE_LOCK for isometric plan cutaway renders
 */
export const ISOMETRIC_PLAN_CUTAWAY_STYLE_VARIANT = `ISOMETRIC CUTAWAY STYLE VARIANT (ADDITIONAL RULES):

Visual Enhancements:
- Allow subtle shading and floor grain/texture
- Minimal furniture linework allowed (kitchen counters, table, sofa) - simple schematic forms only

Content Restrictions:
- NO text, NO dimensions, NO annotations
- NO site landscaping, NO trees, NO external context
- Interior focus only`;

/**
 * Plan/Section Style Variant
 * Additional style rules specific to plan and section views
 * Appended after CONSTRUCTAOS_STYLE_LOCK for plan/section renders
 * @deprecated - Use ISOMETRIC_PLAN_CUTAWAY_STYLE_VARIANT for floor_plan instead
 */
export const PLAN_SECTION_STYLE_VARIANT = `PLAN/SECTION STYLE VARIANT (ADDITIONAL RULES):

Visual Enhancements:
- Allow subtle shading and floor grain/texture
- Minimal furniture linework allowed (kitchen counters, table, sofa) - simple schematic forms only

Content Restrictions:
- NO text, NO dimensions, NO annotations
- NO site landscaping, NO trees, NO external context
- Interior focus only`;
