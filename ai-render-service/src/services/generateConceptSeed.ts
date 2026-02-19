/**
 * Concept Seed Generator Service
 * Generates structured concept seeds from ConceptBrief using OpenAI
 */

import type { ConceptBrief } from '../types/conceptInputs.js';
import { chatClient, chatModel } from '../utils/openaiClient.js';
import { buildConceptPrompt } from './buildConceptPrompt.js';
import type { ExistingBaseline } from './site/inferExistingBaseline.js';

export interface GenerateConceptSeedOptions {
  /** Pass when building prompt for seed so existing storeys come from baseline (single source of truth) */
  existingBaseline?: ExistingBaseline;
}

export const SEED_PROMPT_VERSION = 'seed_v1';

export type FootprintShape = 'rectangle' | 'l_shape' | 'courtyard' | 'linear' | 'stepped';
export type StoreyCount = '1' | '2' | '3+';
export type RoofType = 'flat' | 'pitched' | 'mixed';
export type ConceptRange = 'Grounded' | 'Exploratory' | 'Speculative';

export interface ConceptSeed {
  footprintShape: FootprintShape;
  storeys: StoreyCount;
  roof: RoofType;
  massingMoves: string[];
  zoningHint: {
    publicZone: string;
    privateZone: string;
  };
  sectionCutHint: string;
  conceptRange: ConceptRange; // Locked at seed generation time
  existingBaseline?: ExistingBaseline; // Optional existing building baseline from OSM
}

/**
 * Default fallback concept seed
 */
const DEFAULT_SEED: ConceptSeed = {
  footprintShape: 'rectangle',
  storeys: '2',
  roof: 'flat',
  massingMoves: [],
  zoningHint: {
    publicZone: 'ground floor living spaces',
    privateZone: 'upper floor bedrooms',
  },
  sectionCutHint: 'cut through main circulation and primary living space',
  conceptRange: 'Grounded',
};

/**
 * Validates and normalizes a concept seed from potentially malformed JSON
 */
function validateAndNormalizeSeed(seed: unknown): ConceptSeed {
  if (!seed || typeof seed !== 'object') {
    console.warn('Invalid seed: not an object, using defaults');
    return DEFAULT_SEED;
  }

  const s = seed as Record<string, unknown>;

  // Validate footprintShape
  const validFootprintShapes: FootprintShape[] = ['rectangle', 'l_shape', 'courtyard', 'linear', 'stepped'];
  const footprintShape: FootprintShape = 
    typeof s.footprintShape === 'string' && validFootprintShapes.includes(s.footprintShape as FootprintShape)
      ? (s.footprintShape as FootprintShape)
      : DEFAULT_SEED.footprintShape;

  // Validate storeys
  const validStoreys: StoreyCount[] = ['1', '2', '3+'];
  const storeys: StoreyCount =
    typeof s.storeys === 'string' && validStoreys.includes(s.storeys as StoreyCount)
      ? (s.storeys as StoreyCount)
      : DEFAULT_SEED.storeys;

  // Validate roof
  const validRoofs: RoofType[] = ['flat', 'pitched', 'mixed'];
  const roof: RoofType =
    typeof s.roof === 'string' && validRoofs.includes(s.roof as RoofType)
      ? (s.roof as RoofType)
      : DEFAULT_SEED.roof;

  // Validate massingMoves (array of strings)
  const massingMoves: string[] =
    Array.isArray(s.massingMoves) && s.massingMoves.every((m) => typeof m === 'string')
      ? s.massingMoves
      : DEFAULT_SEED.massingMoves;

  // Validate zoningHint
  const zoningHint =
    s.zoningHint &&
    typeof s.zoningHint === 'object' &&
    'publicZone' in s.zoningHint &&
    'privateZone' in s.zoningHint &&
    typeof s.zoningHint.publicZone === 'string' &&
    typeof s.zoningHint.privateZone === 'string'
      ? {
          publicZone: s.zoningHint.publicZone as string,
          privateZone: s.zoningHint.privateZone as string,
        }
      : DEFAULT_SEED.zoningHint;

  // Validate sectionCutHint
  const sectionCutHint =
    typeof s.sectionCutHint === 'string' && s.sectionCutHint.trim().length > 0
      ? s.sectionCutHint
      : DEFAULT_SEED.sectionCutHint;

  // Validate conceptRange
  const validConceptRanges: ConceptRange[] = ['Grounded', 'Exploratory', 'Speculative'];
  const conceptRange: ConceptRange =
    typeof s.conceptRange === 'string' && validConceptRanges.includes(s.conceptRange as ConceptRange)
      ? (s.conceptRange as ConceptRange)
      : DEFAULT_SEED.conceptRange;

  // Validate existingBaseline if present
  let existingBaseline: ExistingBaseline | undefined;
  if (s.existingBaseline && typeof s.existingBaseline === 'object') {
    // Basic validation - if it has the required fields, include it
    // Full validation would require importing the full ExistingBaseline type validation
    // For now, we'll accept it if it's an object (will be validated when used)
    existingBaseline = s.existingBaseline as ExistingBaseline;
  }

  return {
    footprintShape,
    storeys,
    roof,
    massingMoves,
    zoningHint,
    sectionCutHint,
    conceptRange,
    ...(existingBaseline !== undefined && { existingBaseline }),
  };
}

/**
 * Generates a concept seed from a ConceptBrief
 * Uses OpenAI text generation to create structured JSON describing the concept
 * The conceptRange from the brief is preserved in the seed (locked at generation time)
 */
export async function generateConceptSeed(brief: ConceptBrief, options?: GenerateConceptSeedOptions): Promise<ConceptSeed> {
  // Extract and preserve conceptRange from brief (defaults to 'Grounded' if missing)
  const conceptRange: ConceptRange = brief.conceptRange || 'Grounded';
  
  // Build a prompt for the LLM to extract concept parameters. Pass existingBaseline when available
  // so existing storeys come from site/footprint (single source of truth) in the prompt text.
  const briefForSeedPrompt: ConceptBrief = {
    ...brief,
    proposedDesign: { ...brief.proposedDesign, outputType: 'concept_axonometric' },
  };
  const promptOptions: Parameters<typeof buildConceptPrompt>[1] = {};
  if (options?.existingBaseline) {
    promptOptions.existingBaseline = options.existingBaseline;
  }
  const promptResult = buildConceptPrompt(briefForSeedPrompt, promptOptions);
  const conceptPrompt = promptResult.prompt;

  const systemPrompt = `You are an architectural concept analyzer. Your task is to analyze an architectural brief and generate a structured concept seed describing the key design parameters.

Analyze the brief and extract:
1. **footprintShape**: The overall shape of the building footprint
   - "rectangle": Simple rectangular or square footprint
   - "l_shape": L-shaped configuration
   - "courtyard": U-shaped or courtyard arrangement
   - "linear": Elongated linear form
   - "stepped": Staggered or terraced form

2. **storeys**: Number of storeys
   - "1": Single storey
   - "2": Two storeys
   - "3+": Three or more storeys

3. **roof**: Roof type
   - "flat": Flat roof
   - "pitched": Pitched/sloped roof
   - "mixed": Combination of flat and pitched elements

4. **massingMoves**: Array of architectural massing strategies (e.g., "rear_extension", "side_wing", "step_back", "cantilever", "setback")

5. **zoningHint**: Suggested spatial organization
   - publicZone: Description of public spaces (e.g., "ground floor living spaces", "south-facing open plan")
   - privateZone: Description of private spaces (e.g., "upper floor bedrooms", "north-facing sleeping areas")

6. **sectionCutHint**: Suggested section cut location/description (e.g., "cut through stair and main living", "cut through entrance and vertical circulation")

Return ONLY valid JSON with no additional text, comments, or markdown formatting.`;

  const userPrompt = `${conceptPrompt}

Generate a concept seed JSON object based on this brief.`;

  try {
    const response = await chatClient.responses.create({
      model: chatModel('gpt-4o-mini'), // Use faster/cheaper model for structured text generation
      instructions: systemPrompt,
      input: userPrompt,
      // Omit text.format - Vercel AI Gateway rejects json_object; prompt instructs JSON output
      temperature: 0.8, // Higher temperature for more variation in concept generation while maintaining structure
      max_output_tokens: 500,
    });

    const content = response.output_text;
    if (!content) {
      console.warn('OpenAI returned empty response for concept seed, using defaults');
      return { ...DEFAULT_SEED, conceptRange };
    }

    try {
      const parsed = JSON.parse(content);
      const normalized = validateAndNormalizeSeed(parsed);
      // Override with the conceptRange from the brief (lock it at generation time)
      return { ...normalized, conceptRange };
    } catch (parseError) {
      console.error('Failed to parse concept seed JSON:', parseError);
      console.warn('Raw response:', content);
      console.warn('Using default seed');
      return { ...DEFAULT_SEED, conceptRange };
    }
  } catch (error) {
    console.error('Error generating concept seed:', error);
    console.warn('Using default seed due to error');
    return { ...DEFAULT_SEED, conceptRange };
  }
}
