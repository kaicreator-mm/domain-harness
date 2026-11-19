/**
 * AOT lock and Function implementation binding for the Element-first contract
 * layer (DIS Runtime 0.11.0-dev D1, issue #1530).
 *
 * `lockAot` seals a validated manifest together with one implementation
 * artifact pin (`path` + `sha256` + `target`, the shape of
 * `Selection['providerArtifact']`) per public Function into a single lock
 * digest. After sealing, the lock is deeply frozen: resolution only accepts
 * entries inside the lock (no hot insertion, no unlocked paths) and binding
 * verification fails closed on unbound Functions, digest mismatches and
 * target mismatches.
 */
import { canonicalDigest, digest } from '../knowledge.js';
import type { Selection } from '../types.js';
import { ELEMENT_MANIFEST_SCHEMA, type ElementManifest } from './manifest.js';
import { resolveDependencyClosure } from './dependencies.js';
import { ElementContractError } from './errors.js';

/** Implementation artifact pin, read-only reuse of the existing Selection contract shape. */
export type AotArtifactPin = NonNullable<Selection['providerArtifact']>;

export interface AotLockEntry extends AotArtifactPin {
  readonly elementId: string;
  readonly functionId: string;
}

export interface AotLock {
  readonly schema: typeof ELEMENT_MANIFEST_SCHEMA;
  readonly manifestSha256: string;
  readonly lockSha256: string;
  /** Static dependency order sealed into the lock (AOT resolution subgraph). */
  readonly closure: readonly string[];
  /** functionId -> sealed implementation pin. Deeply frozen. */
  readonly entries: Readonly<Record<string, AotLockEntry>>;
}

/** Candidate implementation bytes presented against a sealed lock. */
export interface AotImplementationCandidate {
  readonly path: string;
  readonly target: string;
  readonly content: string | Uint8Array;
}

const SAFE_PATH = /^[a-zA-Z0-9_./-]+$/;
const SHA256 = /^[a-f0-9]{64}$/;
const TARGET = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function publicFunctions(manifest: ElementManifest): { elementId: string; functionId: string }[] {
  const declared: { elementId: string; functionId: string }[] = [];
  for (const consumer of manifest.consumers) {
    for (const element of consumer.elements) {
      for (const fn of element.functions) declared.push({ elementId: element.id, functionId: fn.id });
    }
  }
  return declared;
}

function sealPath(path: string, at: string): void {
  if (typeof path !== 'string' || !SAFE_PATH.test(path) || path.split('/').some((part) => ['', '.', '..'].includes(part))) {
    throw new ElementContractError('ELEMENT_AOT_PATH_INVALID', at);
  }
}

/**
 * Seal the manifest plus one implementation artifact pin per public Function
 * into a single, deeply frozen AOT lock. `expectedTarget`, when provided,
 * pins every artifact to one platform target at lock time.
 */
export function lockAot(manifest: ElementManifest,
  artifacts: Record<string, AotArtifactPin>,
  options: { expectedTarget?: string } = {}): AotLock {
  const entries: Record<string, AotLockEntry> = {};
  for (const { elementId, functionId } of publicFunctions(manifest)) {
    const pin = artifacts[functionId];
    if (pin === undefined) throw new ElementContractError('ELEMENT_FUNCTION_UNBOUND', functionId);
    sealPath(pin.path, functionId + '.path');
    if (typeof pin.sha256 !== 'string' || !SHA256.test(pin.sha256)) {
      throw new ElementContractError('ELEMENT_AOT_DIGEST_INVALID', functionId);
    }
    if (typeof pin.target !== 'string' || !TARGET.test(pin.target)) {
      throw new ElementContractError('ELEMENT_AOT_TARGET_INVALID', functionId);
    }
    if (options.expectedTarget !== undefined && pin.target !== options.expectedTarget) {
      throw new ElementContractError('ELEMENT_FUNCTION_TARGET_MISMATCH', functionId + ':' + pin.target);
    }
    entries[functionId] = Object.freeze({ elementId, functionId, path: pin.path, sha256: pin.sha256, target: pin.target });
  }
  const closure = resolveDependencyClosure(manifest).order;
  const manifestSha256 = canonicalDigest(manifest);
  const lockSha256 = canonicalDigest({ schema: manifest.schema, manifest: manifestSha256, closure, functions: entries });
  return Object.freeze({
    schema: ELEMENT_MANIFEST_SCHEMA,
    manifestSha256,
    lockSha256,
    closure: Object.freeze(closure),
    entries: Object.freeze(entries),
  });
}

/** Resolve a Function implementation strictly inside the sealed lock; no hot insertion. */
export function resolveLockedFunction(lock: AotLock, functionId: string): AotLockEntry {
  const entry = lock.entries[functionId];
  if (entry === undefined) throw new ElementContractError('ELEMENT_AOT_NOT_LOCKED', functionId);
  return entry;
}

/**
 * Fail-closed binding verification: every sealed Function must be presented
 * with its locked path, an exact digest match and an exact target match;
 * candidates outside the lock (unknown Function ids or unlocked paths) are
 * rejected. Mutates nothing.
 */
export function assertFunctionBindings(lock: AotLock, candidates: Record<string, AotImplementationCandidate>): void {
  for (const functionId of Object.keys(lock.entries)) {
    const candidate = candidates[functionId];
    if (candidate === undefined) throw new ElementContractError('ELEMENT_FUNCTION_UNBOUND', functionId);
  }
  for (const functionId of Object.keys(candidates)) {
    if (lock.entries[functionId] === undefined) throw new ElementContractError('ELEMENT_AOT_NOT_LOCKED', functionId);
    const candidate = candidates[functionId];
    sealPath(candidate.path, functionId + '.path');
    const entry = lock.entries[functionId];
    if (candidate.path !== entry.path) {
      throw new ElementContractError('ELEMENT_AOT_PATH_NOT_LOCKED', functionId + ':' + candidate.path);
    }
    if (candidate.target !== entry.target) {
      throw new ElementContractError('ELEMENT_FUNCTION_TARGET_MISMATCH', functionId + ':' + candidate.target);
    }
    if (digest(candidate.content) !== entry.sha256) {
      throw new ElementContractError('ELEMENT_FUNCTION_DIGEST_MISMATCH', functionId);
    }
  }
}
