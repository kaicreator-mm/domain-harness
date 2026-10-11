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
 * The generic Host ports the wired Kernel mechanism may consume. Ports are
 * caller-shape-agnostic at the mechanism boundary; this channel only
 * verifies that every required member is a callable.
 */
export interface V8KernelHostPorts {
  readonly docs: {
    readonly get: (key: string) => unknown;
    readonly put: (key: string, value: unknown) => unknown;
  };
  readonly sha256: {
    readonly digestUtf8: (value: string) => string;
  };
}

let kernelHost: V8KernelHostPorts | undefined;

function isCallable(value: unknown): value is (...args: never[]) => unknown {
  return typeof value === 'function';
}

/**
 * Install the kernel Host ports for this process. Internal protected
 * bootstrap: one-shot (a second installation attempt fails typed, so a
 * running process can never have its Host storage swapped mid-flight).
 */
export function installKernelHostPorts(ports: unknown): void {
  if (kernelHost !== undefined) {
    throw new QualifiedPackageError(
      'KERNEL_HOST_ALREADY_INSTALLED',
      'kernel Host ports are already installed in this process; the protected kernel Host channel is one-shot',
    );
  }
  if (typeof ports !== 'object' || ports === null) {
    throw new QualifiedPackageError('KERNEL_HOST_INVALID', 'installKernelHostPorts requires a ports object {docs:{get,put}, sha256:{digestUtf8}}');
  }
  const candidate = ports as { docs?: unknown; sha256?: unknown };
  const docs = candidate.docs as { get?: unknown; put?: unknown } | undefined;
  const sha256 = candidate.sha256 as { digestUtf8?: unknown } | undefined;
  if (
    typeof docs !== 'object'
    || docs === null
    || !isCallable(docs.get)
    || !isCallable(docs.put)
    || typeof sha256 !== 'object'
    || sha256 === null
    || !isCallable(sha256.digestUtf8)
  ) {
    throw new QualifiedPackageError('KERNEL_HOST_INVALID', 'kernel Host ports must provide docs.get, docs.put and sha256.digestUtf8 callables');
  }
  kernelHost = Object.freeze({
    docs: Object.freeze({
      get: docs.get as (key: string) => unknown,
      put: docs.put as (key: string, value: unknown) => unknown,
    }),
    sha256: Object.freeze({
      digestUtf8: sha256.digestUtf8 as (value: string) => string,
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
