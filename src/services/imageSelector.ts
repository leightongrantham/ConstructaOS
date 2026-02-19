/**
 * Image Selection Service
 * 
 * Uses a vision-capable GPT model to automatically select the best image
 * from multiple candidates based on visual alignment, line clarity, and
 * resemblance to the input drawing.
 */

import OpenAI from 'openai';
import { detectImageMimeType } from './promptOptimizer.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? '',
});

/**
 * Selects the best image from multiple candidates by comparing them to the input image
 * 
 * @param inputImageBuffer - The original input image buffer
 * @param candidateBuffers - Array of candidate image buffers (base64 strings)
 * @returns Index of the best candidate
 */
export async function selectBestImageFromCandidates(
  inputImageBuffer: Buffer,
  candidateBuffers: string[]
): Promise<number> {
  if (candidateBuffers.length === 0) {
    throw new Error('Cannot select best image from empty candidate array');
  }

  if (candidateBuffers.length === 1) {
    return 0;
  }

  const inputImageBase64 = inputImageBuffer.toString('base64');
  const inputMimeType = detectImageMimeType(inputImageBuffer);

  // Build comparison prompt
  const systemPrompt = `You are an expert architectural image evaluator. Your task is to compare generated architectural drawings against an input reference drawing and select the best match.

Evaluate each candidate based on:
1. **Visual Alignment**: How well does the candidate match the overall composition, layout, and spatial relationships of the input?
2. **Line Clarity**: Which candidate has the clearest, most precise linework that matches the input's line quality?
3. **Resemblance**: Which candidate most closely resembles the input drawing in terms of style, proportions, and visual characteristics?

Return a JSON object with:
- "bestIndex": The zero-based index of the best candidate (0, 1, or 2)
- "scores": An array of scores for each candidate (0-100, where 100 is perfect match)
- "reasoning": Brief explanation of why this candidate was selected

Example response:
{
  "bestIndex": 1,
  "scores": [75, 92, 68],
  "reasoning": "Candidate 1 best preserves the visual alignment and line clarity of the input"
}`;

  // Build user prompt with all candidates
  const candidateImages = candidateBuffers.map((base64) => ({
    type: 'image_url' as const,
    image_url: {
      url: `data:image/png;base64,${base64}`,
    },
  }));

  const userPrompt = `Compare these ${candidateBuffers.length} generated architectural drawings against the input reference drawing.

**Input Reference Drawing** (shown first):
This is the original drawing that the candidates should match.

**Generated Candidates** (shown after input):
Candidate 0, Candidate 1, Candidate 2, etc.

Evaluate which candidate best matches the input in terms of:
- Visual alignment and composition
- Line clarity and precision
- Overall resemblance and style

Return JSON with bestIndex, scores array, and reasoning.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: userPrompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${inputMimeType};base64,${inputImageBase64}`,
              },
            },
            ...candidateImages,
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 500,
      temperature: 0.3, // Lower temperature for more consistent evaluation
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.warn('Vision model returned empty response, selecting first candidate');
      return 0;
    }

    const result = JSON.parse(content) as { bestIndex: number; scores: number[]; reasoning?: string };
    
    if (typeof result.bestIndex !== 'number' || result.bestIndex < 0 || result.bestIndex >= candidateBuffers.length) {
      console.warn(`Invalid bestIndex ${result.bestIndex}, selecting first candidate`);
      return 0;
    }

    console.log(`Selected candidate ${result.bestIndex} (scores: ${result.scores?.join(', ') || 'N/A'})`);
    if (result.reasoning) {
      console.log(`Reasoning: ${result.reasoning}`);
    }

    return result.bestIndex;
  } catch (error) {
    console.error('Error selecting best image:', error);
    // Fall back to first candidate if selection fails
    console.warn('Falling back to first candidate due to selection error');
    return 0;
  }
}

