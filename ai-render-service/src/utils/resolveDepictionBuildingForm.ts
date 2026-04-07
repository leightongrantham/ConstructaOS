/**
 * Reconciles footprint-derived baseline building form with client-provided existingContext.buildingForm
 * for prompt depiction. OSM adjacency often labels end-terraces as semi-detached; the form should still
 * match what the user selected unless they left the default "detached" while mapping says attached.
 */

import type { BuildingForm } from '../types/conceptInputs.js';
import type { ExistingBaseline } from '../services/site/inferExistingBaseline.js';

function buildingFormToBaselineEnum(form: BuildingForm): ExistingBaseline['buildingForm'] {
  switch (form) {
    case 'detached':
      return 'Detached';
    case 'semi_detached':
      return 'Semi-detached';
    case 'terraced':
      return 'Terraced';
    case 'infill':
      return 'Infill';
  }
}

export function resolveDepictionBuildingForm(
  baseline: ExistingBaseline | undefined,
  existingContext: { buildingForm?: BuildingForm } | undefined
): ExistingBaseline['buildingForm'] {
  const baseForm = baseline?.buildingForm ?? 'Unknown';
  const ctx = existingContext?.buildingForm;
  if (ctx === undefined) return baseForm;

  const ctxForm = buildingFormToBaselineEnum(ctx);

  if (baseForm === 'Unknown' || baseForm === ctxForm) return ctxForm;

  if (ctxForm === 'Detached' && baseForm !== 'Detached') {
    return baseForm;
  }

  return ctxForm;
}

export function appendExistingBuildingDepictionLines(
  parts: string[],
  form: ExistingBaseline['buildingForm']
): void {
  if (form === 'Terraced') {
    parts.push(
      'Depict the existing building as terraced: part of a continuous row with party walls to one or both sides (mid-terrace or end-of-terrace).'
    );
  } else if (form === 'Semi-detached') {
    parts.push(
      'Depict the existing building as semi-detached: one shared party wall with a neighbouring house, the other side free.'
    );
  } else if (form === 'Detached') {
    parts.push(
      'Depict the existing building as detached: standalone with clear gaps on both sides, no shared walls with neighbours.'
    );
  }
}
