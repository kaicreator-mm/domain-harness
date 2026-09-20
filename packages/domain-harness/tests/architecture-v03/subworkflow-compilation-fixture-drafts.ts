import { type WorkflowCandidateDraft } from './subworkflow-compilation-model.js';
import {
  dataDigestA,
  dataDigestB,
  inputSchemaDigest,
  lookupContractDigest,
  outputSchemaDigest,
  ruleDigest,
} from './subworkflow-compilation-fixture-contracts.js';

export function baseDraft(): WorkflowCandidateDraft {
  return {
    kind: 'workflow-candidate-v1',
    candidateId: 'rfq-score-routing-v1',
    sourceLocation: 'research/planner-output/a.json',
    inputContract: {
      required: {
        accountId: 'string',
        country: 'string',
        requestKind: 'string',
      },
      schemaDigest: inputSchemaDigest,
    },
    outputContract: {
      allowedEvents: ['TECHNICAL_REVIEW_REQUIRED', 'QUOTE_REQUESTED'],
      schemaDigest: outputSchemaDigest,
    },
    start: 'lookup',
    steps: {
      lookup: {
        id: 'lookup',
        kind: 'query',
        tool: 'lookup_account_score',
        inputField: 'accountId',
        outputKey: 'score',
        next: 'route',
      },
      route: {
        id: 'route',
        kind: 'rule',
        ruleDigest,
        factKey: 'score',
        operator: 'gte',
        value: 70,
        onTrue: 'emit_review',
        onFalse: 'emit_quote',
      },
      emit_review: {
        id: 'emit_review',
        kind: 'emit',
        event: 'TECHNICAL_REVIEW_REQUIRED',
        reasonCode: 'score_requires_review',
      },
      emit_quote: {
        id: 'emit_quote',
        kind: 'emit',
        event: 'QUOTE_REQUESTED',
        reasonCode: 'score_allows_quote',
      },
    },
    edges: [
      { from: 'lookup', label: 'next', to: 'route' },
      { from: 'route', label: 'true', to: 'emit_review' },
      { from: 'route', label: 'false', to: 'emit_quote' },
    ],
    allowedTools: [
      { name: 'lookup_account_score', capability: 'query', contractDigest: lookupContractDigest },
    ],
    referencedDomainDataDigests: [dataDigestA, dataDigestB],
    applicability: {
      all: [
        { field: 'country', op: 'eq', value: 'MM' },
        { field: 'requestKind', op: 'eq', value: 'rfq' },
      ],
    },
    bounds: {
      maxSteps: 4,
      maxReasonedCalls: 0,
    },
  };
}

export function reasonedDraft(): WorkflowCandidateDraft {
  return {
    kind: 'workflow-candidate-v1',
    candidateId: 'explicit-reasoned-step-v1',
    sourceLocation: 'research/planner-output/reasoned.json',
    inputContract: {
      required: { country: 'string', requestKind: 'string' },
      schemaDigest: inputSchemaDigest,
    },
    outputContract: {
      allowedEvents: ['TECHNICAL_REVIEW_REQUIRED', 'QUOTE_REQUESTED'],
      schemaDigest: outputSchemaDigest,
    },
    start: 'reason',
    steps: {
      reason: {
        id: 'reason',
        kind: 'reasoned',
        resolver: 'HarnessMachine',
        allowedOutcomes: ['TECHNICAL_REVIEW_REQUIRED', 'QUOTE_REQUESTED'],
        onOutcome: {
          TECHNICAL_REVIEW_REQUIRED: 'emit_review',
          QUOTE_REQUESTED: 'emit_quote',
        },
      },
      emit_review: {
        id: 'emit_review',
        kind: 'emit',
        event: 'TECHNICAL_REVIEW_REQUIRED',
        reasonCode: 'reasoned_review',
      },
      emit_quote: {
        id: 'emit_quote',
        kind: 'emit',
        event: 'QUOTE_REQUESTED',
        reasonCode: 'reasoned_quote',
      },
    },
    edges: [
      { from: 'reason', label: 'TECHNICAL_REVIEW_REQUIRED', to: 'emit_review' },
      { from: 'reason', label: 'QUOTE_REQUESTED', to: 'emit_quote' },
    ],
    allowedTools: [],
    referencedDomainDataDigests: [dataDigestA],
    applicability: {
      all: [
        { field: 'country', op: 'eq', value: 'MM' },
        { field: 'requestKind', op: 'eq', value: 'rfq' },
      ],
    },
    bounds: { maxSteps: 3, maxReasonedCalls: 1 },
  };
}

