/**
 * Prompt Optimizer Service
 * 
 * Uses a vision-capable GPT model to analyze uploaded images and optimize
 * the image generation prompt. This approximates ChatGPT's internal
 * orchestration layer that analyzes images before generation.
 * 
 * WORKFLOW:
 * 1. Analyzes the uploaded image using a vision-capable model
 * 2. Interprets user intent, drawing type, and missing information
 * 3. Rewrites the base prompt into an optimal image-generation prompt
 *    that prioritizes visual closeness over strict reconstruction
 */

import type { RenderType } from '../types/render.js';
import { chatClient, chatModel } from '../utils/openaiClient.js';

/**
 * Detects MIME type from image buffer
 */
export function detectImageMimeType(buffer: Buffer): string {
  // Check magic bytes for common image formats
  const header = buffer.subarray(0, 12);
  
  // PNG: 89 50 4E 47
  if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) {
    return 'image/png';
  }
  
  // JPEG: FF D8 FF
  if (header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF) {
    return 'image/jpeg';
  }
  
  // GIF: 47 49 46 38
  if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x38) {
    return 'image/gif';
  }
  
  // WebP: RIFF...WEBP
  if (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46) {
    const webpCheck = buffer.subarray(8, 12).toString('ascii');
    if (webpCheck === 'WEBP') {
      return 'image/webp';
    }
  }
  
  // Default to PNG (preprocessed images are PNG)
  return 'image/png';
}

export async function optimizePromptWithVision(
  imageBuffer: Buffer,
  renderType: RenderType,
  basePrompt: string,
  userRequest?: string
): Promise<string> {
  // Validate buffer
  if (!imageBuffer || imageBuffer.length === 0) {
    console.warn('Empty image buffer provided to vision optimizer, using base prompt');
    return basePrompt;
  }

  // Convert buffer to base64 for vision API
  const imageBase64 = imageBuffer.toString('base64');
  const mimeType = detectImageMimeType(imageBuffer);
  
  // Build the vision analysis prompt (image is optional layout reference — soft influence only)
  const systemPrompt = `You are an expert architectural image analysis assistant. The provided image is a LAYOUT REFERENCE ONLY — not a literal drawing to reproduce. Use it as a soft influence for general layout, proportions, and spatial relationships; the structured brief remains the primary source of truth. Do not treat the image as dimensionally accurate or something to trace.

Your analysis should focus on:
1. **User Intent**: What is the user trying to achieve? What architectural concept or design are they working with?
2. **Drawing Type**: What type of architectural drawing is this? (axonometric, section, elevation, isometric cutaway floor plan, sketch, etc.)
3. **Missing Information**: What geometric or contextual information is ambiguous or missing from the drawing?
4. **Visual Characteristics**: What are the key visual elements, style, line quality, and composition?

Based on your analysis, rewrite the provided base prompt into an optimal image-generation prompt that:

**CRITICAL: Projection Intent (HARD LOCK - Takes Precedence Over Stylistic Instructions)**
When render type is axonometric:
- **MANDATORY: Use 2.5D axonometric projection**. This is non-negotiable.
- **Shallow depth**: Keep the depth dimension restrained and compressed
- **Parallel verticals**: All vertical lines must remain parallel - no perspective convergence
- **No perspective convergence**: Maintain isometric/axonometric parallel projection throughout
- These projection requirements override any stylistic or aesthetic instructions

**CRITICAL: Layout reference is soft influence only**
- The image is a layout reference, not a literal drawing to reproduce. Use it for general layout and proportions as a soft influence; the structured brief is the primary source of truth.
- When the reference suggests layout or proportions, you may reflect that loosely; do not trace or follow it exactly.

**Controlled Visual Inference** (when using the reference as soft influence):
- Prefer visual coherence with the reference where it supports the brief; the structured design intent takes precedence over literal similarity to the image.
- Allow reasonable inference of depth and geometry where the reference is ambiguous; interpret in line with the brief.
- Use the reference for general proportions and layout as a soft guide only; do not trace or reproduce it literally.
- When in doubt, follow the structured brief over the appearance of the reference image.

**Sectional/Diagrammatic Axonometric for Section/Elevation Inputs**:
When the input drawing is a section or elevation and the requested render type is axonometric:
- **Prefer sectional or diagrammatic axonometric representations** over full 3D reconstructions
- **Keep depth shallow and restrained**. Minimize extension of geometry beyond what is visible in the section/elevation
- **Show only reasonably inferred geometry**. When rear geometry is ambiguous, prefer minimal interpretation that maintains visual coherence with the input
- **Present the output as a cutaway or sectional axonometric when appropriate**. The drawing should read as a diagrammatic representation that respects the sectional nature of the input
- Focus on the visible elements and their relationships rather than completing a full building envelope

**Additional Requirements**:
- Preserve the architectural style and aesthetic of the input
- Fill in missing information with architecturally plausible details that match the visual style
- Maintain the drawing type and projection style
- Enhance clarity and visual quality while staying true to the original intent

Return ONLY the optimized prompt text, nothing else. Do not include explanations, analysis, or metadata.`;

  const userPrompt = `Analyze this architectural drawing and optimize the following base prompt for image generation.

**Render Type**: ${renderType === 'floor_plan' ? 'isometric cutaway floor plan' : renderType}
${userRequest ? `**User Request**: ${userRequest}` : ''}

**Base Prompt**:
${basePrompt}

Analyze the image and create an optimized prompt that:
- Prioritizes visual similarity to the input drawing over geometric correctness
- Allows controlled visual inference, interpretation, and reinterpretation when necessary to achieve visual similarity
- Encourages flattening or compression of depth when it improves resemblance
- Preserves visual proportions and thicknesses as they appear in the input
- Biases toward what "looks right" visually rather than what is strictly architecturally correct
- When information is ambiguous, make reasonable interpretations that enhance visual match

${renderType === 'axonometric' ? `**CRITICAL: Hard-lock projection requirements (takes precedence over all other instructions)**:
- MANDATORY: 2.5D axonometric projection - non-negotiable
- Shallow depth - keep depth dimension restrained
- Parallel verticals - all vertical lines must remain parallel
- No perspective convergence - maintain isometric/axonometric parallel projection

**If the input drawing is a section or elevation**:
- Prefer a sectional or diagrammatic axonometric representation
- Keep depth shallow and restrained - minimize extension beyond visible elements
- Show only reasonably inferred geometry when rear elements are ambiguous
- Present as a cutaway or sectional axonometric that respects the sectional nature of the input
- Focus on visible elements and their relationships rather than completing a full building envelope` : ''}

The output should look like the input drawing, prioritizing visual match over perfect reconstruction.`;

  try {
    const response = await chatClient.responses.create({
      model: chatModel('gpt-4o'), // Vision-capable model
      instructions: systemPrompt,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: userPrompt },
            {
              type: 'input_image',
              image_url: `data:${mimeType};base64,${imageBase64}`,
              detail: 'auto',
            },
          ],
        },
      ],
      max_output_tokens: 1000,
      temperature: 0.7,
    });

    const optimizedPrompt = (response.output_text ?? '').trim();
    
    if (!optimizedPrompt) {
      console.warn('Vision model returned empty prompt, falling back to base prompt');
      return basePrompt;
    }

    return optimizedPrompt;
  } catch (error) {
    console.error('Error optimizing prompt with vision model:', error);
    // Fall back to base prompt if vision analysis fails
    console.warn('Falling back to base prompt due to vision analysis error');
    return basePrompt;
  }
}

