/**
 * v0.8 trusted Host ModelPort channel — INTERNAL protected (#1013, I04).
 * =======================================================================
 *
 * FR08: a selected Standard-SDK package may mark model-call evidence
 * `measured(count)` ONLY for invocations physically observed through a
 * Host-provisioned ModelPort binding. The factory on the SDK side
 * (`createHostBoundModelResolver`, T-D) explicitly does not authenticate
 * Host authority — the trust comes from HERE: a one-shot, governance/
 * Host-bootstrap-only installation that is never re-exported from the
 * public `@kaicreator/domain-harness/v8` surface (same protection pattern
 * as kernel-host.ts and trust.ts).
 *
 * Who may install: `bootstrapTrustedHost` (host-v8/bootstrap.ts), carrying
 * a deployment-provisioned port object. A process that installed nothing
 * resolves NO port — the loader then wires the SDK's plain `interpret` and
 * model-call evidence stays honestly `unsupported`/`unmeasured`. There is
 * deliberately no synthetic measured-zero anywhere on this path.
 */

import { QualifiedPackageError } from './contracts.js';

/** The Host-provisioned model port shape the selected SDK consumes. */
export interface V8HostModelPort {
  readonly invoke: (request: { readonly operation: string; readonly input: unknown }) => unknown;
}

let hostModelPort: V8HostModelPort | undefined;

function isDirectCallable(owner: object, key: string): boolean {
  // The SDK refuses accessor/getter properties on this field; the channel
  // enforces the same shape at installation so a hostile object cannot pass
  // here and fail later inside sealed module bytes.
  const descriptor = Object.getOwnPropertyDescriptor(owner, key);
  return descriptor !== undefined
    && Object.hasOwn(descriptor, 'value')
    && typeof descriptor.value === 'function';
}

/**
 * Install the trusted Host ModelPort for this process. Internal protected
 * bootstrap: one-shot (a second installation attempt fails typed).
 */
export function installHostModelPort(port: unknown): void {
  if (hostModelPort !== undefined) {
    throw new QualifiedPackageError(
      'MODEL_PORT_ALREADY_INSTALLED',
      'a Host ModelPort is already installed in this process; the protected ModelPort channel is one-shot',
    );
  }
  if (typeof port !== 'object' || port === null || !isDirectCallable(port, 'invoke')) {
    throw new QualifiedPackageError(
      'MODEL_PORT_INVALID',
      'installHostModelPort requires a port object with a direct callable invoke({operation, input}) data property',
    );
  }
  hostModelPort = Object.freeze({ invoke: (port as V8HostModelPort).invoke.bind(port) });
}

/**
 * The installed trusted ModelPort, or `undefined` when this process
 * bootstrapped without one. Absence is a legitimate honest state (FR08:
 * `unsupported`/`unmeasured`), never an error and never a fallback port.
 */
export function currentHostModelPort(): V8HostModelPort | undefined {
  return hostModelPort;
}
