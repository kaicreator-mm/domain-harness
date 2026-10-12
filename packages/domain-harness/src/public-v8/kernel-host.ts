/**
 * v0.8 kernel Host binding channel — INTERNAL protected (T-B, #1001).
 * =====================================================================
 *
 * The physically selected Kernel package's mechanism consumes Host ports
 * (immutable docs storage + pinned digest) exactly as the pinned research
 * loader did (#994@b9ea4d1 src/microkernel/load.mjs wiring). The production
 * repair of that research (anti-pattern P1-L2-ABI-02): the loader NEVER
 * accepts Host ports from a caller — `load` is strictly one-argument — so
 * the binding can only be established through this protected internal
 * channel, mirroring the load trust channel (trust.ts): a one-shot,
 * governance/Host-bootstrap-only installation that is never re-exported
 * from the public `@kaicreator/domain-harness/v8` surface.
 *
 * Who may install: the Host bootstrap context that owns physical storage
 * (successor Host-channel task T-E / #1004 wires the physical channel; a
 * process that installed nothing fails closed — the loader refuses with
 * KERNEL_HOST_NOT_INSTALLED before any import). There is deliberately NO
 * second effect runtime here: the channel stores the ports, it never
 * implements journals/effects/state of its own.
 */

import { QualifiedPackageError } from './contracts.js';

/**
 * The write-condition shape the physical Kernel document port accepts. The
 * channel is condition-transparent: it forwards whatever the mechanism passed
 * to the physical store, and a store that refuses unconditional writes stays
 * the authority (a lost CAS expectation can never degrade into an
 * unconditional write at this boundary).
 */
export interface V8KernelDocsPutConditions {
  readonly mustBeAbsent?: true;
  readonly mustMatchRevision?: number;
}

/**
 * The generic Host ports the wired Kernel mechanism consumes. Ports are
 * caller-shape-agnostic at the mechanism boundary; this channel only
 * verifies that every required member is a callable.
 *
 * #1013 (I01, review repair @6117202798): the selected Kernel mechanism
 * (`kernel-mechanism-v1.mjs`) consumes journal `docs.list`, physical
 * `resources.call` for real Business effect dispatch and the trusted
 * `clock`. The COMPLETE set is REQUIRED at installation — a partial tuple
 * fails typed with KERNEL_HOST_INVALID and installs NOTHING, so a process
 * can never carry a seemingly-installed production Kernel that would
 * silently lack Journal/resource/clock capabilities (#1015 fail-closed
 * contract; no test-only minimal installer exists).
 */
export interface V8KernelHostPorts {
  readonly docs: {
    readonly get: (key: string) => unknown;
    readonly put: (key: string, value: unknown, conditions?: V8KernelDocsPutConditions) => unknown;
    /** Journal read-back (`list(prefix)`). */
    readonly list: (prefix: string) => unknown;
  };
  readonly sha256: {
    readonly digestUtf8: (value: string) => string;
  };
  /** Physical resource dispatch port handed to Business effect handlers. */
  readonly resources: { readonly call: (resourceKey: string, operation: string, payload: unknown) => unknown };
  /** Trusted clock (ISO string) used for Kernel instance/journal timestamps. */
  readonly clock: () => string;
}

let kernelHost: V8KernelHostPorts | undefined;

function isCallable(value: unknown): value is (...args: never[]) => unknown {
  return typeof value === 'function';
}

/**
 * Validate a prospective kernel Host ports installation WITHOUT consuming
 * the one-shot channel (#1013 R1 F-01): occupancy and the COMPLETE port
 * shape are both checked here first, so the Host bootstrap can preflight
 * ALL one-shot channels (trust, kernel, ModelPort) before committing ANY.
 * Internal protected; not re-exported from the public `/v8` surface.
 */
export function preflightKernelHostPorts(ports: unknown): void {
  if (kernelHost !== undefined) {
    throw new QualifiedPackageError(
      'KERNEL_HOST_ALREADY_INSTALLED',
      'kernel Host ports are already installed in this process; the protected kernel Host channel is one-shot',
    );
  }
  if (typeof ports !== 'object' || ports === null) {
    throw new QualifiedPackageError(
      'KERNEL_HOST_INVALID',
      'installKernelHostPorts requires the COMPLETE ports object {docs:{get,put,list}, sha256:{digestUtf8}, resources:{call}, clock} (#1013 I01: no partial install)',
    );
  }
  const candidate = ports as { docs?: unknown; sha256?: unknown; resources?: unknown; clock?: unknown };
  const docs = candidate.docs as { get?: unknown; put?: unknown; list?: unknown } | undefined;
  const sha256 = candidate.sha256 as { digestUtf8?: unknown } | undefined;
  const resources = candidate.resources as { call?: unknown } | undefined;
  if (
    typeof docs !== 'object'
    || docs === null
    || !isCallable(docs.get)
    || !isCallable(docs.put)
    || !isCallable(docs.list)
    || typeof sha256 !== 'object'
    || sha256 === null
    || !isCallable(sha256.digestUtf8)
  ) {
    throw new QualifiedPackageError(
      'KERNEL_HOST_INVALID',
      'kernel Host ports must provide docs.get, docs.put, docs.list and sha256.digestUtf8 callables (the COMPLETE selected-K set; a minimal get/put tuple is not an installable production configuration)',
    );
  }
  if (typeof resources !== 'object' || resources === null || !isCallable(resources.call)) {
    throw new QualifiedPackageError('KERNEL_HOST_INVALID', 'kernel Host ports must provide a resources.call callable (physical Business effect dispatch; #1013 I01 complete-set contract)');
  }
  if (!isCallable(candidate.clock)) {
    throw new QualifiedPackageError('KERNEL_HOST_INVALID', 'kernel Host ports must provide a clock callable returning an ISO timestamp (trusted Kernel timestamps; #1013 I01 complete-set contract)');
  }
}

/**
 * Install the kernel Host ports for this process. Internal protected
 * bootstrap: one-shot (a second installation attempt fails typed, so a
 * running process can never have its Host storage swapped mid-flight).
 *
 * The COMPLETE bounded port set is required: `docs.get/put/list`,
 * `sha256.digestUtf8`, `resources.call` and `clock`. A minimal
 * `{docs:{get,put}, sha256}` tuple is refused typed BEFORE anything is
 * installed — an incomplete production install can never exist.
 */
export function installKernelHostPorts(ports: unknown): void {
  preflightKernelHostPorts(ports);
  const candidate = ports as { docs?: unknown; sha256?: unknown; resources?: unknown; clock?: unknown };
  const docs = candidate.docs as { get?: unknown; put?: unknown; list?: unknown };
  const sha256 = candidate.sha256 as { digestUtf8?: unknown };
  const resources = candidate.resources as { call?: unknown };
  kernelHost = Object.freeze({
    docs: Object.freeze({
      get: docs.get as (key: string) => unknown,
      put: docs.put as (key: string, value: unknown, conditions?: V8KernelDocsPutConditions) => unknown,
      list: docs.list as (prefix: string) => unknown,
    }),
    sha256: Object.freeze({
      digestUtf8: sha256.digestUtf8 as (value: string) => string,
    }),
    resources: Object.freeze({
      call: resources.call as (resourceKey: string, operation: string, payload: unknown) => unknown,
    }),
    clock: candidate.clock as () => string,
  });
}

/** Diagnostics-only probe (tests/evidence); not a trust decision input. */
export function isKernelHostInstalled(): boolean {
  return kernelHost !== undefined;
}

/**
 * The installed kernel Host ports. Fail-closed: a process that never went
 * through the protected bootstrap has NO Host binding, and the loader
 * refuses with KERNEL_HOST_NOT_INSTALLED instead of falling back to an
 * invented in-memory second runtime.
 */
export function currentKernelHostPorts(): V8KernelHostPorts {
  if (kernelHost === undefined) {
    throw new QualifiedPackageError(
      'KERNEL_HOST_NOT_INSTALLED',
      'no kernel Host ports are installed in this process (protected Host bootstrap not established); the loader fails closed and never invents a substitute effect runtime',
    );
  }
  return kernelHost;
}
