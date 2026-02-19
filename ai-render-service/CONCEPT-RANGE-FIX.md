# Concept Range Fix

## Problem
Concept range selections (Grounded/Exploratory/Speculative) were not producing visibly different outputs. The design constraint was being ignored or overridden.

## Root Causes

### 1. Placement in Prompt
The concept range addendum was placed **too late** in the prompt structure:
- It came AFTER output instructions and visual guidance
- It came BEFORE the ConstructaOS style lock (which is very prescriptive)
- The AI was prioritizing earlier instructions over the concept range

### 2. Weak Language
The original addendum used soft language:
- "should be" instead of "MUST be"
- "may be" without emphasis
- No clear directive markers

### 3. Plan/Section Override
Plan and section views explicitly override concept range (by design) to maintain consistency with the axonometric reference. This was working correctly, but masked that the axonometric wasn't respecting concept range either.

## Solution

### 1. Early Placement for Axonometric
Moved the concept range addendum **immediately after the proposed intervention** (Section 3B), before:
- Concept seed
- Site context
- Output instructions
- Style lock

This gives it higher priority in the prompt hierarchy.

### 2. Stronger Language
Rewrote all three concept range texts with:
- **CRITICAL DESIGN CONSTRAINT/DIRECTIVE** header
- **MUST**, **ALLOW**, **MAY BE**, **NEED NOT** in caps for emphasis
- Explicit negative constraints (e.g., "Do not introduce bold gestures" for Grounded)
- Permission-granting language for Exploratory/Speculative

### 3. Axonometric-Only Application
The concept range now only applies to the **initial axonometric view**:
- Plan views use the seed's locked concept range but override it with hard geometry constraints
- Section views use the seed's locked concept range but override it with hard geometry constraints
- Axonometric views get the full, emphasized concept range framework

## Updated Concept Range Texts

### Grounded
```
CRITICAL DESIGN CONSTRAINT - Apply a grounded, constraint-led interpretation of the inputs.

Massing MUST be conservative and context-aware, with proportions that would feel familiar 
within typical UK residential development.

Forms MUST be simple, legible, and restrained, prioritising clarity over expression. 
Any articulation should be subtle and rational, driven by layout logic rather than 
formal gesture.

The overall composition MUST feel plausible, calm, and planning-conscious — exploring 
the idea clearly without pushing beyond conventional expectations.

This is an early-stage concept study that MUST remain close to established norms. 
Do not introduce bold gestures, dramatic cantilevers, or sculptural forms.
```

### Exploratory
```
CRITICAL DESIGN DIRECTIVE - Apply an exploratory interpretation of the inputs.

Maintain overall scale and programmatic logic, but ALLOW GREATER FREEDOM in massing, 
stepping, and spatial relationships.

Volumes MAY be more articulated, broken, or offset to test alternative arrangements 
and improve light, flow, or hierarchy.

The design MAY challenge typical forms, but should remain coherent and readable as 
a viable architectural concept.

This study explores options and variations, not a final answer — PUSH IDEAS while 
still respecting the core constraints. You have permission to be more expressive 
than typical planning-led schemes.
```

### Speculative
```
CRITICAL DESIGN DIRECTIVE - Apply a SPECULATIVE interpretation of the inputs.

Use the given constraints as a starting point, but ALLOW them to be STRETCHED, 
EXAGGERATED, or ABSTRACTED to explore the outer limits of the idea.

Massing MAY BE BOLD, proportions intentionally pushed, and relationships heightened 
to provoke discussion rather than resolve detail.

The result should remain spatially legible and architecturally coherent, but NEED NOT 
conform to typical residential norms or planning expectations.

This is a conceptual 'what if?' study — DESIGNED TO EXPAND THINKING, not to imply 
buildability. Be ambitious and provocative with form, proportion, and composition. 
Push boundaries.
```

## Prompt Version Update

Updated `AXON_PROMPT_VERSION` from `'axon_v1'` to `'axon_v2_concept_range'` to track this change.

## Testing

To verify the fix works:

1. **Create three identical renders** with different concept ranges:
   - Use the "Compare: Grounded", "Compare: Exploratory", "Compare: Speculative" presets in the test UI
   - All have identical inputs except `conceptRange`

2. **Expected differences**:
   - **Grounded**: Simple, restrained forms. Familiar proportions. Minimal articulation.
   - **Exploratory**: More articulated volumes. Some stepping or offset. More expressive.
   - **Speculative**: Bold massing. Pushed proportions. Provocative composition.

3. **Plan/Section consistency**:
   - All three concepts should produce identical plan/section views (locked to axon reference)
   - Only the initial axonometric should differ

## Files Changed

- `src/services/buildConceptPrompt.ts`
  - Moved concept range injection to Section 3B (early placement)
  - Made axonometric-only
  - Updated prompt version constant

- `src/prompts/conceptRangeAddendum.ts`
  - Strengthened all three concept range texts
  - Added caps emphasis and directive headers
  - Added explicit permission/constraint language

## Deployment

Run:
```bash
npm run build
vercel --prod  # or npm run dev for local testing
```

The changes are backward-compatible - existing concept seeds will continue to work, and the default remains "Grounded".
