import { DOMAIN_OUTCOMES, type ContentDigest, type ValidationEnvironment } from './subworkflow-compilation-model.js';
import {
  alternativeToolDigest,
  dataDigestA,
  dataDigestB,
  lookupContractDigest,
  ruleDigest,
} from './subworkflow-compilation-fixture-contracts.js';

export const environment: ValidationEnvironment = {
  allowedOutcomes: DOMAIN_OUTCOMES,
  tools: [
    { name: 'lookup_account_score', capability: 'query', contractDigest: lookupContractDigest },
    { name: 'lookup_account_segment', capability: 'query', contractDigest: alternativeToolDigest },
  ],
  knownArtifactDigests: new Set<ContentDigest>([ruleDigest, dataDigestA, dataDigestB]),
  maxWorkflowSteps: 12,
  maxReasonedCalls: 2,
};

