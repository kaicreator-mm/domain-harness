import type {
  RuntimeEvidenceGovernanceBaselineRef,
  RuntimeEvidenceSourceExecutionRef,
} from '../../src/contracts/runtime-evidence.js';
import {
  RuntimeEvidenceCapture,
  VolatileRuntimeEvidenceStore,
  type ExperimentalArtifactReference,
  type RuntimeEvidenceCaptureContext,
} from '../../src/runtime-evidence/index.js';
import { RuntimeEvidenceIntegrationError } from '../../src/runtime-evidence/index.js';
import { RuntimeEvidenceContractError } from '../../src/contracts/runtime-evidence.js';
import { workflowInstanceId } from '../admission/helpers.js';

export const BASELINE: RuntimeEvidenceGovernanceBaselineRef = {
  domainId: 'orders',
  governanceId: 'orders-governance',
  schemaVersion: '1',
  contentDigest: 'sha256:governance-b1',
};

export function captureContext(
  overrides: Partial<RuntimeEvidenceCaptureContext> = {},
): RuntimeEvidenceCaptureContext {
  return {
    domainId: 'orders',
    packageId: 'pkg-orders-p1',
    governanceBaseline: BASELINE,
    ...overrides,
  };
}

export const EXPERIMENTAL: ExperimentalArtifactReference = {
  subjectArtifact: {
    kind: 'workflow',
    artifactId: 'exp-quote-v7',
    contentDigest: 'sha256:exp-artifact-v7',
  },
  stableFallback: {
    packageId: 'pkg-orders-p1',
    governanceBaselineContentDigest: 'sha256:governance-b1',
    artifact: {
      kind: 'workflow',
      artifactId: 'order-quote',
      contentDigest: 'sha256:stable-quote-v6',
    },
  },
};

export const TURN_ID = 'turn:order-quote:instance%3A42:message:msg%3A1';

export function turnExecution(turnId: string = TURN_ID): RuntimeEvidenceSourceExecutionRef {
  return {
    workflowTarget: 'order-quote',
    workflowInstanceId,
    durableControlTurnId: turnId,
  };
}

export function makeCapture(
  context: RuntimeEvidenceCaptureContext = captureContext(),
  store: VolatileRuntimeEvidenceStore = new VolatileRuntimeEvidenceStore(),
): { readonly capture: RuntimeEvidenceCapture; readonly store: VolatileRuntimeEvidenceStore } {
  return { capture: new RuntimeEvidenceCapture(context, store), store };
}

export function isIntegrationError(error: unknown, code: string): boolean {
  return error instanceof RuntimeEvidenceIntegrationError && error.code === code;
}

export function isContractError(error: unknown, code: string): boolean {
  return error instanceof RuntimeEvidenceContractError && error.code === code;
}
