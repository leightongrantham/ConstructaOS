/**
 * Concept range addendum strings for prompt generation
 * 
 * These strings guide the AI's interpretation of design constraints
 * based on the selected concept range (Grounded, Exploratory, or Speculative).
 * 
 * Updated: More concise and actionable language for better AI interpretation
 */

/**
 * Returns the concept range addendum text for inclusion in prompts
 * 
 * @param range - The concept range level: "Grounded", "Exploratory", or "Speculative"
 * @returns The exact addendum text to append to the prompt
 */
export function conceptRangeAddendum(range: "Grounded" | "Exploratory" | "Speculative"): string {
  switch (range) {
    case "Grounded":
      return "DESIGN APPROACH: Grounded, constraint-led interpretation.\n\n- Massing: Conservative, context-aware proportions typical of UK residential development\n- Forms: Simple, legible, restrained — clarity over expression\n- Articulation: Subtle and rational, driven by layout logic\n- Composition: Plausible, calm, planning-conscious — explore ideas within conventional expectations\n- Avoid: Bold gestures, dramatic cantilevers, sculptural forms\n\nThis is an early-stage concept study that should remain close to established norms.";
    
    case "Exploratory":
      return "DESIGN APPROACH: Exploratory interpretation with greater design freedom.\n\n- Maintain: Overall scale and programmatic logic\n- Allow: More articulated volumes, stepping, offset forms to test alternatives\n- Explore: Alternative spatial relationships to improve light, flow, and hierarchy\n- Challenge: Typical forms while remaining coherent and readable as viable architecture\n- Goal: Push ideas while respecting core constraints — permission to be more expressive than planning-led schemes\n\nThis study explores options and variations, not a final answer.";
    
    case "Speculative":
      return "DESIGN APPROACH: Speculative interpretation — explore outer limits of the idea.\n\n- Use constraints as starting point, but allow them to be stretched, exaggerated, or abstracted\n- Massing: Bold, proportions intentionally pushed\n- Relationships: Heightened to provoke discussion rather than resolve detail\n- Coherence: Remain spatially legible and architecturally coherent\n- Freedom: Need NOT conform to typical residential norms or planning expectations\n- Goal: Conceptual 'what if?' study designed to expand thinking, not imply buildability\n\nBe ambitious and provocative with form, proportion, and composition. Push boundaries.";
  }
}
