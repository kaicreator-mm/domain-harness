/**
 * v0.8 kernel Host binding channel — INTERNAL protected (T-B #1001, I01 #1013).
 * ==========================================================================
 *
 * The physically selected Kernel package's mechanism consumes Host ports
 * (immutable docs storage + pinned digest + physical resource dispatch +
 * trusted clock) exactly as the pinned research loader did (#994@b9ea4d1
 * src/microkernel/load.mjs wiring). The production repair of that research
 * (anti-pattern P1-L2-ABI-02): the loader NEVER accepts Host ports from a
 * caller — `load` is strictly one-argument — so the binding can only be
 * established through this protected internal channel, mirroring the load
 * trust channel (trust.ts): a one-shot, governance/Host-bootstrap-only
 * installation that is never re-exported from the public
 * `@kaicreator/domain-harness/v8` surface.
 *
 * Who may install: the Host bootstrap context that owns physical storage
 * (host-v8/bootstrap.ts, #1013 I01, wires the physical channel: true-CAS
 * docs get/put/list, node:crypto sha256, the generic resource dispatcher
 * and the bootstrap clock). A process that installed nothing fails closed
 * — the loader refuses with KERNEL_HOST_NOT_INSTALLED before any import.
 * There is deliberately NO second effect runtime here: the channel stores
 * the ports, it never implements journals/effects/state of its own.
 *
 * [I01 #1013] The port set below is the FULL bounded Host contract the
 * merged T-C kernel mechanism actually consumes at runtime (checked
 * against `kernel-mechanism-v1.mjs`: engine + effect journal + governance
 * pin store + baselines over docs.get/put/list, canonical digests through
 * sha256.digestUtf8, ISO timestamps through clock(), and effect handlers
 * receiving the physical resources port). A partial or missing member is
 * refused typed at installation — before any executable app activation —
 * so a half-bound process can never reach the Kernel.
 */

import { QualifiedPackageError } from './contracts.js';

/**
 * The true-CAS document port the wired Kernel mechanism consumes. This is
 * deliberately the same physical shape as the trusted Host CAS store
 * (get returns the document WITH its physical revision or null; every put
 * carries an exactly-one revision expectation; list enumerates keys under
 * a prefix) — adapted 1:1 by the bootstrap, never reimplemented here.
 */
export interface V8KernelHostDocsPort {
  readonly get: (key: string) => Promise<{ readonly value: unknown; readonly revision: number } | null>;
  readonly put: (
    key: string,
    value: unknown,
    conditions: { readonly mustBeAbsent?: true; readonly mustMatchRevision?: number },
  ) => Promise<{ readonly revision: number }>;
  readonly list: (prefix: string) => Promise<readonly string[]>;
}

/**
 * The physical resource port the wired Kernel mechanism hands to Business
 * effect handlers: generic key/operation dispatch with the Host (not the
 * caller) owning what resources exist (#994@b9ea4d1 memory-host shape; the
 * authenticated-principal binding into K requests is I02's concern).
 */
export interface V8KernelHostResourcesPort {
  readonly call: (resourceKey: string, operation: string, payload: unknown) => Promise<unknown>;
}

/**
 * The generic Host ports the wired Kernel mechanism may consume. Ports are
 * caller-shape-agnostic at the mechanism boundary; this channel only
 * verifies that every required member is a callable.
 */
export interface V8KernelHostPorts {
  readonly docs: V8KernelHostDocsPort;
  readonly sha256: {
    readonly digestUtf8: (value: string) => string;
  };
  /** Trusted clock: ISO-8601 timestamps for journal/state semantics. */
  readonly clock: () => string;
  readonly resources: V8KernelHostResourcesPort;
}

let kernelHost: V8KernelHostPorts | undefined;

function isCallable(value: unknown): value is (...args: never[]) => unknown {
  return typeof value === 'function';
}

/**
 * Install the kernel Host ports for this process. Internal protected
 * bootstrap: one-shot (a second installation attempt fails typed, so a
 * running process can never have its Host storage swapped mid-flight) and
 * FULL-set (every member the selected Kernel consumes must be a callable —
 * a partial port set never installs, so `load` cannot activate a Kernel
 * against half-bound Host storage).
 */
export function installKernelHostPorts(ports: unknown): void {
  if (kernelHost !== undefined) {
    throw new QualifiedPackageError(
      'KERNEL_HOST_ALREADY_INSTALLED',
      'kernel Host ports are already installed in this process; the protected kernel Host channel is one-shot',
    );
  }
  if (typeof ports !== 'object' || ports === null) {
    throw new QualifiedPackageError(
      'KERNEL_HOST_INVALID',
      'installKernelHostPorts requires a ports object {docs:{get,put,list}, sha256:{digestUtf8}, clock, resources:{call}}',
    );
  }
  const candidate = ports as { docs?: unknown; sha256?: unknown; clock?: unknown; resources?: unknown };
  const docs = candidate.docs as { get?: unknown; put?: unknown; list?: unknown } | undefined;
  const sha256 = candidate.sha256 as { digestUtf8?: unknown } | undefined;
  const resources = candidate.resources as { call?: unknown } | undefined;
  const clock = candidate.clock;
  if (
    typeof docs !== 'object'
    || docs === null
    || !isCallable(docs.get)
    || !isCallable(docs.put)
    || !isCallable(docs.list)
    || typeof sha256 !== 'object'
    || sha256 === null
    || !isCallable(sha256.digestUtf8)
    || !isCallable(clock)
    || typeof resources !== 'object'
    || resources === null
    || !isCallable(resources.call)
  ) {
    throw new QualifiedPackageError(
      'KERNEL_HOST_INVALID',
      'kernel Host ports must provide docs.get, docs.put, docs.list, sha256.digestUtf8, clock and resources.call callables (the full bounded set the selected Kernel consumes; partial sets never install)',
    );
  }
  kernelHost = Object.freeze({
    docs: Object.freeze({
      get: docs.get as V8KernelHostDocsPort['get'],
      put: docs.put as V8KernelHostDocsPort['put'],
      list: docs.list as V8KernelHostDocsPort['list'],
    }),
    sha256: Object.freeze({
      digestUtf8: sha256.digestUtf8 as (value: string) => string,
    }),
    clock: clock as () => string,
    resources: Object.freeze({
      call: resources.call as V8KernelHostResourcesPort['call'],
    }),
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
