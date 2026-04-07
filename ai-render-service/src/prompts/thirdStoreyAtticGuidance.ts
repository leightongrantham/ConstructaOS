/**
 * Extra prompt text when the building has three storeys or 3+.
 * Models often collapse loft/attic third levels into a two-storey read; this asks for an open attic cutaway.
 */

import type { Storeys } from '../types/conceptInputs.js';
import type { ExistingBaseline } from '../services/site/inferExistingBaseline.js';

export const THIRD_STOREY_ATTIC_GUIDANCE =
  'When the building has three storeys or 3+ (including when the third level is a loft or attic within the roof), the image MUST show three distinct horizontal floor levels. ' +
  'If the third storey is an attic or loft, depict it as an OPEN ATTIC: cut away or remove enough roof so the attic floor plate and internal volume are clearly visible — do not leave the top level hidden under a solid unbroken roof shell.';

/** True when the effective existing / requested massing is 3+ (user request wins over baseline when set). */
export function isThreePlusStoreyForPrompt(
  requested: Storeys | undefined,
  baselineStoreys: ExistingBaseline['storeys'] | undefined
): boolean {
  if (requested === 'three_plus') return true;
  if (requested === undefined && baselineStoreys === '3+') return true;
  return false;
}
