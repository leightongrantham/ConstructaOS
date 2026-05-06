/**
 * STEP 7 — validates storey normalization without OpenAI/network.
 * Run: npx tsx test/storeys-pipeline-validation.ts
 */

import type { ConceptBrief, ExtensionProposedDesign } from '../src/types/conceptInputs.js';
import type { ExistingBaseline } from '../src/services/site/inferExistingBaseline.js';
import {
  normalizeBriefStoreys,
  storeysEnumToSeedCount,
} from '../src/services/storeysPipeline.js';

function nb(t: Case): void {
  const briefInput: ConceptBrief =
    typeof t.input === 'function' ? t.input() : (t.input as ConceptBrief);

  const out = normalizeBriefStoreys(briefInput, t.baseline ?? null);
  try {
    t.assert(out);
  } catch (e) {
    console.error(`❌ FAIL: ${t.name}`, e);
    process.exitCode = 1;
  }
}

type Case = {
  name: string;
  input: ConceptBrief | (() => ConceptBrief);
  baseline?: ExistingBaseline | null;
  assert: (out: ReturnType<typeof normalizeBriefStoreys>) => void;
};

const fakeBaseline2: ExistingBaseline = {
  footprintPolygon: [
    [51.5, -0.1],
    [51.501, -0.1],
    [51.501, -0.099],
    [51.5, -0.099],
  ],
  footprintAreaM2: 120,
  footprintShape: 'Rectangle',
  footprintScale: 'Typical',
  buildingForm: 'Detached',
  storeys: '2',
  roofAssumption: 'Pitched',
  confidence: 'High',
  rationale: [],
};

console.log('\nSTOREYS PIPELINE (STEP 7-style checks)\n');

// 1) Extension: legacy proposal.storeys = existing fabric; single-storey extension
nb({
  name: 'extension: 2-storey house + single-storey rear → principal stays two',
  baseline: fakeBaseline2,
  input: {
    proposedDesign: {
      projectType: 'extension',
      extensionType: 'single_storey',
      bedrooms: 'two',
      bathrooms: 'one',
      kitchenType: 'open_plan',
      livingSpaces: 'single_main_space',
      roofType: 'pitched',
      massingPreference: 'simple_compact',
      outputType: 'concept_axonometric',
      additionalFloorAreaRange: '25_50',
      storeys: 'two',
    } as ExtensionProposedDesign,
  },
  assert: (out) => {
    if (out.extensionStoreysAdded !== 'one') {
      throw new Error(`expected single_storey additive one, got ${out.extensionStoreysAdded}`);
    }
    if (out.existingPrincipalStoreys !== 'two') throw new Error('principal should stay two storeys');
    if (storeysEnumToSeedCount(out.existingPrincipalStoreys) !== '2')
      throw new Error('seed must stay 2 for principal block');
    if (out.brief.proposedDesign.storeys !== undefined) {
      throw new Error('proposed.storeys must be migrated off extension proposal');
    }
    if (out.brief.existingContext?.storeys !== 'two') throw new Error('existing fabric must remain two');
  },
});

nb({
  name: 'renovation: no proposal storeys matches baseline/context',
  baseline: fakeBaseline2,
  input: {
    proposedDesign: {
      projectType: 'renovation',
      renovationScope: 'Light refresh',
      bedrooms: 'two',
      bathrooms: 'one',
      kitchenType: 'open_plan',
      livingSpaces: 'single_main_space',
      roofType: 'pitched',
      massingPreference: 'simple_compact',
      outputType: 'concept_axonometric',
    },
  },
  assert: (out) => {
    if (out.effectiveRenderedStoreys !== 'two')
      throw new Error(`effective should be two, got ${out.effectiveRenderedStoreys}`);
    if (out.conceptSeedStoreys !== '2') throw new Error('seed should be two');
  },
});

nb({
  name: 'renovation: explicit proposal overrides effective storeys',
  baseline: fakeBaseline2,
  input: {
    proposedDesign: {
      projectType: 'renovation',
      renovationScope: 'Deep retrofit',
      storeys: 'three_plus',
      bedrooms: 'three',
      bathrooms: 'two',
      kitchenType: 'semi_open',
      livingSpaces: 'multiple_living_areas',
      roofType: 'pitched',
      massingPreference: 'vertical_tall',
      outputType: 'concept_axonometric',
    },
  },
  assert: (out) => {
    if (out.effectiveRenderedStoreys !== 'three_plus') throw new Error('override to 3+');
    if (out.conceptSeedStoreys !== '3+') throw new Error('seed should follow effective');
    if (
      fakeBaseline2.storeys === '2' &&
      out.baselineStoreysCanonical !== '2'
    ) {
      throw new Error('OSM fabric baseline should remain 2 in canonical when present');
    }
  },
});

nb({
  name: 'new_build: strict client storeys unchanged',
  input: {
    proposedDesign: {
      projectType: 'new_build',
      storeys: 'three_plus',
      totalFloorAreaRange: '100_150',
      bedrooms: 'three',
      bathrooms: 'two',
      kitchenType: 'open_plan',
      livingSpaces: 'multiple_living_areas',
      roofType: 'pitched',
      massingPreference: 'split_volumes',
      outputType: 'concept_axonometric',
      numberOfPlots: 'one',
    },
    existingContext: { orientation: 'south_facing_rear', density: 'suburban' },
  },
  assert: (out) => {
    if (out.brief.existingContext?.storeys !== undefined) {
      throw new Error('new build must ignore stray existingContext.storeys on brief');
    }
    if (out.effectiveRenderedStoreys !== 'three_plus') throw new Error('total massing');
    if (out.conceptSeedStoreys !== '3+') throw new Error('seed storey');
  },
});

if (!process.exitCode) {
  console.log('✅ All storey pipeline checks passed\n');
}
