/**
 * Storeys normalization, validation, and debug metadata for the render pipeline.
 */

import type { ConceptBrief, Storeys } from '../types/conceptInputs.js';
import type { ExistingBaseline } from './site/inferExistingBaseline.js';
import type { StoreyCount } from './generateConceptSeed.js';

/** Normalized conceptual shape mirrored in logs (proposal === proposedDesign). */
export interface NormalizedRenderShape {
  projectType: ConceptBrief['proposedDesign']['projectType'];
  existingContext: ConceptBrief['existingContext'];
  proposal: ConceptBrief['proposedDesign'];
}

export interface ApiStoreysDebug {
  projectType: ConceptBrief['proposedDesign']['projectType'];
  storeysInput: {
    proposalStoreysBefore: Storeys | undefined;
    proposalStoreysAfter: Storeys | undefined;
    existingContextStoreys: Storeys | undefined;
    migratedProposalStoreysToExisting: boolean;
    baselineStoreysRaw: ExistingBaseline['storeys'] | null;
  };
  existingContext: ConceptBrief['existingContext'];
  proposal: ConceptBrief['proposedDesign'];
  /** Human-readable interpretation for clients (temporary debugging). */
  finalStoreysUsed: string;
  conceptSeedStoreys: StoreyCount;
}

export interface StoreysPipelineOutcome {
  brief: ConceptBrief;
  normalizedShape: NormalizedRenderShape;
  debug: ApiStoreysDebug;
  /** True if request already had proposedDesign.storeys before normalization (avoids reusing stored axon storeys when user sent an override). */
  hadProposalStoreysInRequest: boolean;
  hadExistingContextStoreysInRequest: boolean;
  conceptSeedStoreys: StoreyCount;
  /** When seed has existingBaseline attached, caller may patch `storeys` with this unless OSM baseline is authoritative. */
  baselineStoreysCanonical: ExistingBaseline['storeys'];
  /** Synthetic baseline storey string when baseline was null/missing Unknown resolution. */
  hadStoreysFallback: boolean;
  /** Renovation/extension: principal “existing fabric” storey count enum (canonical). */
  existingPrincipalStoreys: Storeys;
  /** Renovation/new_build: storey count fed to massing prompts and seed.height (effective target). */
  effectiveRenderedStoreys: Storeys;
  /** Extension only: storey count of extension volume when known. */
  extensionStoreysAdded: Storeys | undefined;
}

export function parseStoreysValue(input: unknown): Storeys | undefined {
  if (typeof input === 'number' && Number.isFinite(input)) {
    const n = Math.trunc(input);
    if (n === 1) return 'one';
    if (n === 2) return 'two';
    if (n >= 3) return 'three_plus';
    return undefined;
  }
  if (typeof input !== 'string') return undefined;
  const v = input.trim().toLowerCase();

  if (v === '1' || v === 'one' || v === 'single' || v === 'single_storey' || v === 'single-storey') return 'one';
  if (v === '2' || v === 'two' || v === 'double' || v === 'double_storey' || v === 'double-storey') return 'two';
  if (
    v === '3+' ||
    v === '3' ||
    v === 'three' ||
    v === 'three_plus' ||
    v === 'three-plus' ||
    v === 'three_or_more' ||
    v === 'three-or-more'
  ) return 'three_plus';
  return undefined;
}

export function storeysEnumToBaseline(s: Storeys): ExistingBaseline['storeys'] {
  if (s === 'one') return '1';
  if (s === 'two') return '2';
  return '3+';
}

export function baselineStoreysToEnum(b: ExistingBaseline['storeys'] | undefined): Storeys | undefined {
  if (!b || b === 'Unknown') return undefined;
  if (b === '1') return 'one';
  if (b === '2') return 'two';
  return 'three_plus';
}

export function storeysEnumToSeedCount(s: Storeys): StoreyCount {
  return s === 'one' ? '1' : s === 'two' ? '2' : '3+';
}

export function coerceOptionalStoreys(
  proposalStoreys: Storeys | undefined,
  fallback: Storeys,
  ctx: string
): Storeys {
  if (proposalStoreys !== undefined) return proposalStoreys;
  console.warn(`[STOREYS] Missing storeys (${ctx}); falling back to "${fallback}".`);
  return fallback;
}

function shallowBriefClone(brief: ConceptBrief): ConceptBrief {
  return {
    ...brief,
    existingContext:
      brief.existingContext !== undefined ? { ...brief.existingContext } : undefined,
    proposedDesign:
      brief.proposedDesign.projectType === 'extension'
        ? { ...(brief.proposedDesign as object) }
        : brief.proposedDesign.projectType === 'new_build'
          ? { ...(brief.proposedDesign as object) }
          : { ...(brief.proposedDesign as object) },
  } as ConceptBrief;
}

function inferExtensionStoreysAdded(
  proposal: ConceptBrief['proposedDesign']
): Storeys | undefined {
  if (proposal.projectType !== 'extension') return undefined;
  if ('storeysAdded' in proposal && proposal.storeysAdded !== undefined) {
    return proposal.storeysAdded;
  }
  if (proposal.extensionType === 'single_storey') return 'one';
  if (proposal.extensionType === 'two_storey') return 'two';
  return undefined;
}

/**
 * Single entry: normalize storey semantics across project types, patch brief fields
 * so extension never uses proposal.storeys as existing + extension height.
 */
export function normalizeBriefStoreys(
  briefInput: ConceptBrief,
  baseline: ExistingBaseline | null
): StoreysPipelineOutcome {
  const hadProposalStoreysInRequest = briefInput.proposedDesign.storeys !== undefined;
  const hadExistingContextStoreysInRequest =
    briefInput.existingContext?.storeys !== undefined;

  const brief = shallowBriefClone(briefInput);
  const { proposedDesign } = brief;
  const proposalStoreysBefore = proposedDesign.storeys;
  let migratedProposalStoreysToExisting = false;

  if (brief.existingContext && proposedDesign.projectType === 'new_build') {
    delete brief.existingContext.storeys;
    if (
      brief.existingContext &&
      brief.existingContext.buildingForm === undefined &&
      !brief.existingContext.orientation &&
      !brief.existingContext.density
    ) {
      delete (brief as unknown as Record<string, unknown>).existingContext;
    }
  }

  const baselineEnum = baselineStoreysToEnum(baseline?.storeys);
  let hadStoreysFallback = false;

  if (proposedDesign.projectType === 'extension') {
    if (
      proposedDesign.storeys !== undefined &&
      brief.existingContext?.storeys !== undefined &&
      proposedDesign.storeys !== brief.existingContext.storeys
    ) {
      console.warn(
        `[STOREYS] Extension: omitting conflicting proposedDesign.storeys (${humanStoreys(proposedDesign.storeys)}); keeping existingContext.storeys (${humanStoreys(brief.existingContext.storeys)}).`
      );
      delete proposedDesign.storeys;
    } else if (
      proposedDesign.storeys !== undefined &&
      brief.existingContext?.storeys === undefined
    ) {
      if (!brief.existingContext) brief.existingContext = {};
      brief.existingContext.storeys = proposedDesign.storeys;
      delete proposedDesign.storeys;
      migratedProposalStoreysToExisting = true;
    } else if (
      proposedDesign.storeys !== undefined &&
      brief.existingContext?.storeys === proposedDesign.storeys
    ) {
      delete proposedDesign.storeys;
    }

    const storeysAddedInferred = inferExtensionStoreysAdded(proposedDesign);
    if (
      storeysAddedInferred !== undefined &&
      proposedDesign.storeysAdded === undefined
    ) {
      (proposedDesign as { storeysAdded?: Storeys }).storeysAdded = storeysAddedInferred;
    }

    let existingPrincipal =
      brief.existingContext?.storeys ??
      baselineEnum ??
      undefined;

    if (existingPrincipal === undefined) {
      hadStoreysFallback = true;
      existingPrincipal = 'two';
      if (!brief.existingContext) brief.existingContext = {};
      brief.existingContext.storeys = existingPrincipal;
    }

    const extensionStoreysAdded = proposedDesign.storeysAdded ?? storeysAddedInferred;

    let finalPhrase = `Existing principal building: ${humanStoreys(existingPrincipal)} storeys`;
    if (extensionStoreysAdded) {
      finalPhrase += ` | Extension volume: ${humanStoreys(extensionStoreysAdded)} storey(s)`;
    } else if (extensionStoreysAdded === undefined && proposedDesign.projectType === 'extension') {
      finalPhrase +=
        ' | Extension volume height from positioning type (explicit storeys_added not set)';
    }

    const canonicalBaseline: ExistingBaseline['storeys'] =
      baseline?.storeys && baseline.storeys !== 'Unknown'
        ? baseline.storeys
        : storeysEnumToBaseline(existingPrincipal);

    return {
      brief,
      hadProposalStoreysInRequest,
      hadExistingContextStoreysInRequest,
      conceptSeedStoreys: storeysEnumToSeedCount(existingPrincipal),
      baselineStoreysCanonical: canonicalBaseline,
      existingPrincipalStoreys: existingPrincipal,
      effectiveRenderedStoreys: existingPrincipal,
      extensionStoreysAdded,
      hadStoreysFallback,
      normalizedShape: {
        projectType: proposedDesign.projectType,
        existingContext: brief.existingContext,
        proposal: proposedDesign,
      },
      debug: {
        projectType: proposedDesign.projectType,
        storeysInput: {
          proposalStoreysBefore,
          proposalStoreysAfter: proposedDesign.storeys,
          existingContextStoreys: brief.existingContext?.storeys,
          migratedProposalStoreysToExisting,
          baselineStoreysRaw: baseline?.storeys ?? null,
        },
        existingContext: brief.existingContext,
        proposal: proposedDesign,
        finalStoreysUsed: finalPhrase,
        conceptSeedStoreys: storeysEnumToSeedCount(existingPrincipal),
      },
    };
  }

  if (proposedDesign.projectType === 'renovation') {
    if (!brief.existingContext) brief.existingContext = {};
    if (!brief.existingContext.storeys) {
      if (baselineEnum) brief.existingContext.storeys = baselineEnum;
    }

    let effectiveRendered =
      proposedDesign.storeys ??
      brief.existingContext.storeys ??
      baselineEnum ??
      undefined;

    if (effectiveRendered === undefined) {
      hadStoreysFallback = true;
      effectiveRendered = coerceOptionalStoreys(undefined, 'two', 'renovation:no baseline or proposal');
    }

    brief.existingContext!.storeys = brief.existingContext!.storeys ?? baselineEnum ?? effectiveRendered;

    const fabricPrincipal = brief.existingContext!.storeys;

    let canonicalBaseline: ExistingBaseline['storeys'];
    if (baseline?.storeys && baseline.storeys !== 'Unknown') {
      canonicalBaseline = baseline.storeys;
    } else if (fabricPrincipal !== undefined) {
      canonicalBaseline = storeysEnumToBaseline(fabricPrincipal);
    } else {
      canonicalBaseline = storeysEnumToBaseline(effectiveRendered);
    }

    let finalPhrase = `Maintain ${humanStoreys(fabricPrincipal ?? effectiveRendered)} storeys unless explicitly changed.`;
    if (proposalStoreysBefore !== undefined && proposalStoreysBefore !== fabricPrincipal) {
      finalPhrase += ` Renovation storey target explicitly set to ${humanStoreys(effectiveRendered)} storeys.`;
    } else if (proposalStoreysBefore !== undefined && fabricPrincipal !== undefined && proposalStoreysBefore === fabricPrincipal) {
      finalPhrase = `Maintain ${humanStoreys(fabricPrincipal)} storeys (no storey-count change indicated).`;
    }

    return {
      brief,
      hadProposalStoreysInRequest,
      hadExistingContextStoreysInRequest,
      conceptSeedStoreys: storeysEnumToSeedCount(effectiveRendered),
      baselineStoreysCanonical: canonicalBaseline,
      existingPrincipalStoreys: fabricPrincipal ?? effectiveRendered,
      effectiveRenderedStoreys: effectiveRendered,
      extensionStoreysAdded: undefined,
      hadStoreysFallback,
      normalizedShape: {
        projectType: proposedDesign.projectType,
        existingContext: brief.existingContext,
        proposal: proposedDesign,
      },
      debug: {
        projectType: proposedDesign.projectType,
        storeysInput: {
          proposalStoreysBefore,
          proposalStoreysAfter: proposedDesign.storeys,
          existingContextStoreys: brief.existingContext?.storeys,
          migratedProposalStoreysToExisting: false,
          baselineStoreysRaw: baseline?.storeys ?? null,
        },
        existingContext: brief.existingContext,
        proposal: proposedDesign,
        finalStoreysUsed: finalPhrase,
        conceptSeedStoreys: storeysEnumToSeedCount(effectiveRendered),
      },
    };
  }

  // new_build
  let total = proposedDesign.storeys;
  if (total === undefined) {
    hadStoreysFallback = true;
    total = coerceOptionalStoreys(undefined, 'two', 'new_build:missing proposedDesign.storeys');
  }

  const canonicalBaseline: ExistingBaseline['storeys'] = storeysEnumToBaseline(total);

  return {
    brief,
    hadProposalStoreysInRequest,
    hadExistingContextStoreysInRequest,
    conceptSeedStoreys: storeysEnumToSeedCount(total),
    baselineStoreysCanonical: canonicalBaseline,
    existingPrincipalStoreys: total,
    effectiveRenderedStoreys: total,
    extensionStoreysAdded: undefined,
    hadStoreysFallback,
    normalizedShape: {
      projectType: proposedDesign.projectType,
      existingContext: brief.existingContext,
      proposal: proposedDesign,
    },
    debug: {
      projectType: proposedDesign.projectType,
      storeysInput: {
        proposalStoreysBefore,
        proposalStoreysAfter: proposedDesign.storeys,
        existingContextStoreys: brief.existingContext?.storeys,
        migratedProposalStoreysToExisting: false,
        baselineStoreysRaw: baseline?.storeys ?? null,
      },
      existingContext: brief.existingContext,
      proposal: proposedDesign,
      finalStoreysUsed: `Design a building with ${humanStoreys(total)} storeys (total).`,
      conceptSeedStoreys: storeysEnumToSeedCount(total),
    },
  };
}

function humanStoreys(s: Storeys): string {
  switch (s) {
    case 'one':
      return '1';
    case 'two':
      return '2';
    default:
      return '3+';
  }
}

/**
 * Validates storeys enums after normalization. Returns error message if invalid.
 */
export function validateNormalizedStoreys(outcome: StoreysPipelineOutcome): string | null {
  const chk = (s: Storeys | undefined, label: string): string | null => {
    if (s === undefined) return `${label}: missing`;
    if (s !== 'one' && s !== 'two' && s !== 'three_plus') return `${label}: invalid (${String(s)})`;
    return null;
  };

  if (outcome.brief.proposedDesign.projectType === 'new_build') {
    return chk(outcome.effectiveRenderedStoreys, 'new_build.storeys');
  }
  if (outcome.brief.proposedDesign.projectType === 'extension') {
    return chk(outcome.existingPrincipalStoreys, 'extension.existing_principal');
  }

  const r = chk(outcome.effectiveRenderedStoreys, 'renovation.effective');
  if (r) return r;
  return chk(outcome.existingPrincipalStoreys, 'renovation.existing_fabric');
}

export function patchConceptSeedExistingBaselineStoreys(
  seedExisting: ExistingBaseline | undefined,
  canonical: ExistingBaseline['storeys']
): void {
  if (!seedExisting) return;
  if (canonical === 'Unknown') return;
  seedExisting.storeys = canonical;
}

/** Apply storey counts derived from normalization—never mixes extension volume height into baseline fabric unintentionally. */
export function applySeedStoreysOutcome(
  conceptSeed: { storeys: StoreyCount; existingBaseline?: ExistingBaseline },
  outcome: StoreysPipelineOutcome,
  resolvedBaseline: ExistingBaseline | null
): void {
  conceptSeed.storeys = outcome.conceptSeedStoreys;
  if (!conceptSeed.existingBaseline) return;
  const pt = outcome.brief.proposedDesign.projectType;
  if (pt === 'new_build') return;
  if (
    pt === 'renovation' &&
    resolvedBaseline?.storeys &&
    resolvedBaseline.storeys !== 'Unknown'
  ) {
    conceptSeed.existingBaseline.storeys = resolvedBaseline.storeys;
    return;
  }
  if (outcome.baselineStoreysCanonical !== 'Unknown') {
    conceptSeed.existingBaseline.storeys = outcome.baselineStoreysCanonical;
  }
}

