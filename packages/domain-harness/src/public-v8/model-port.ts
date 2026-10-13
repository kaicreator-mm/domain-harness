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

/**
 * A request-scoped cancellation signal (#1003 FR07-KH2, B3) — structurally
 * an `AbortSignal`. It is minted by the H-authenticated kernel gateway for
 * ONE occurrence and only ever propagated as a signal: it carries no
 * authority, and no public facade route can create or reach one.
 */
export interface V8CancellationSignal {
  readonly aborted: boolean;
  addEventListener(type: 'abort', listener: () => void, options?: { readonly once?: boolean }): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

/** The Host-provisioned model port shape the selected SDK consumes. */
export interface V8HostModelPort {
  /**
   * `signal` is present when the turn belongs to a cancellable
   * H-authenticated occurrence (#1003 FR07-KH2): a deployment port SHOULD
   * abort the active model call when it fires; the Kernel latch discards a
   * late result either way.
   */
  readonly invoke: (request: { readonly operation: string; readonly input: unknown; readonly signal?: V8CancellationSignal }) => unknown;
}

let hostModelPort: V8HostModelPort | undefined;

/**
 * #1013 R2 fresh review @5494026032 (NEW_P1_02): the same session-capability
 * boundary the gateway ops seam and kernel-host.ts already enforce. The packed
 * npm distribution ships this module's compiled sibling next to the public
 * entry, and stock Node resolves an absolute `file:` URL past any
 * package-exports map — so `currentHostModelPort` must itself refuse the raw
 * `{invoke}` object to a caller without the bootstrap session capability. The
 * port is stored together with the capability and the getter denies typed
 * before the frozen port can be invoked outside the qualified S decision and
 * measurement path.
 */
let hostModelPortSessionCap: string | undefined;

/**
 * #1013 R3 (@6138090328): preflight-staged ModelPort snapshots. The
 * bootstrap's transactional preflight validates the port and STAGES the
 * exact validated callable here (keyed by the port object itself); the
 * install then consumes the STAGED function and never re-reads the
 * caller's object after the one-shot trust/kernel/session commits — a
 * drifting Proxy cannot make the commit observe different material than
 * the preflight validated. A staged entry from an aborted attempt is keyed
 * to THAT port object, so a later install of a different object simply
 * falls back to its own atomic fresh validation.
 */
const stagedInvokes = new WeakMap<object, V8HostModelPort['invoke']>();

/**
 * Read and validate the direct callable `invoke` data property through its
 * property descriptor EXACTLY ONCE (#1013 R3 @6138090328), and additionally
 * require the descriptor/get REPRESENTATION TO AGREE. The value returned
 * here is simultaneously the validation input and the material the caller
 * of this helper may install; the get result is only compared, never
 * installed — so a Proxy cannot make validation and installation observe
 * different callables, and the pre-repair post-commit `.bind` crash (raw
 * TypeError after trust/kernel/session were consumed) is closed by
 * construction. A descriptor that truthfully reports a callable while the
 * get trap drifts `invoke` (returns a non-function, a different function,
 * or throws) is an unsafe proxy-style representation outside the
 * direct-data-property contract and refuses typed; plain objects always
 * agree.
 */
function validatedDirectInvoke(port: unknown): V8HostModelPort['invoke'] | undefined {
  if (typeof port !== 'object' || port === null) {
    return undefined;
  }
  // The SDK refuses accessor/getter properties on this field; the channel
  // enforces the same shape here so a hostile object cannot pass this check
  // and fail later inside sealed module bytes.
  const descriptor = Object.getOwnPropertyDescriptor(port, 'invoke');
  if (descriptor === undefined || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'function') {
    return undefined;
  }
  let viaGet: unknown;
  try {
    viaGet = (port as { invoke?: unknown }).invoke;
  } catch {
    // A get trap that throws is an unsafe representation, not a channel error.
    return undefined;
  }
  if (viaGet !== descriptor.value) {
    return undefined;
  }
  return descriptor.value as V8HostModelPort['invoke'];
}

function isUnguessableSessionCap(cap: unknown): cap is string {
  return typeof cap === 'string' && cap.length >= 32 && cap.length <= 256;
}

/**
 * Constant-time equality for the session capability (fixed-length host
 * random; pure JS on purpose — this module stays free of byte-decoding
 * machinery by static proof).
 */
function sessionCapMatches(cap: unknown): boolean {
  if (hostModelPortSessionCap === undefined || typeof cap !== 'string' || cap.length !== hostModelPortSessionCap.length) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < cap.length; index += 1) {
    diff |= cap.charCodeAt(index) ^ hostModelPortSessionCap.charCodeAt(index);
  }
  return diff === 0;
}

/**
 * Validate a prospective ModelPort installation WITHOUT consuming the
 * one-shot channel (#1013 R1 F-01): occupancy and the direct-callable
 * shape both fail here first, so the Host bootstrap can preflight ALL
 * one-shot channels (trust, kernel, ModelPort) before committing ANY.
 * The session capability is validated with the port (the boundary can
 * never exist without its key). Internal protected; not re-exported from
 * the public `/v8` surface.
 */
export function preflightHostModelPort(port: unknown, sessionCap: unknown): void {
  if (hostModelPort !== undefined) {
    throw new QualifiedPackageError(
      'MODEL_PORT_ALREADY_INSTALLED',
      'a Host ModelPort is already installed in this process; the protected ModelPort channel is one-shot',
    );
  }
  const invoke = validatedDirectInvoke(port);
  if (invoke === undefined) {
    throw new QualifiedPackageError(
      'MODEL_PORT_INVALID',
      'installHostModelPort requires a port object with a direct callable invoke({operation, input}) data property',
    );
  }
  if (!isUnguessableSessionCap(sessionCap)) {
    throw new QualifiedPackageError(
      'MODEL_PORT_SESSION_CAP_INVALID',
      'installHostModelPort requires the bootstrap-minted unguessable session capability string (32–256 chars) that gates currentHostModelPort (#1013 R2 @5494026032: a raw port can never be installed without its boundary)',
    );
  }
  // Stage the EXACT validated callable: the subsequent install consumes this
  // snapshot and never re-reads the caller's object after the one-shot
  // trust/kernel/session commits (#1013 R3 @6138090328).
  stagedInvokes.set(port as object, invoke);
}

/**
 * Install the trusted Host ModelPort for this process together with the
 * session capability that gates every read back. Internal protected
 * bootstrap: one-shot (a second installation attempt fails typed).
 *
 * #1013 R3 (@6138090328): when the bootstrap preflight staged a snapshot
 * for THIS port object, the install consumes exactly that staged callable
 * and performs NO read of the caller's object after the one-shot
 * trust/kernel/session commits — preflight→install drift is neutralized by
 * construction. Without a staged snapshot (direct installation), the
 * callable is captured from its SINGLE descriptor read inside
 * `validatedDirectInvoke` and THAT snapshotted function is what gets
 * installed. Either way the get result is only ever compared, never
 * installed; a Proxy whose descriptor trap is truthful but whose get trap
 * drifts `invoke` refuses TYPED (MODEL_PORT_INVALID) at preflight — BEFORE
 * any channel state mutates — so the pre-repair post-commit `.bind` crash
 * (a half-bootstrapped process that defeated the R1 F-01 zero-residue
 * property) cannot exist in either path.
 */
export function installHostModelPort(port: unknown, sessionCap: unknown): void {
  if (hostModelPort !== undefined) {
    throw new QualifiedPackageError(
      'MODEL_PORT_ALREADY_INSTALLED',
      'a Host ModelPort is already installed in this process; the protected ModelPort channel is one-shot',
    );
  }
  const staged = typeof port === 'object' && port !== null ? stagedInvokes.get(port) : undefined;
  const invoke = staged ?? validatedDirectInvoke(port);
  if (invoke === undefined) {
    throw new QualifiedPackageError(
      'MODEL_PORT_INVALID',
      'installHostModelPort requires a port object with a direct callable invoke({operation, input}) data property',
    );
  }
  if (!isUnguessableSessionCap(sessionCap)) {
    throw new QualifiedPackageError(
      'MODEL_PORT_SESSION_CAP_INVALID',
      'installHostModelPort requires the bootstrap-minted unguessable session capability string (32–256 chars) that gates currentHostModelPort (#1013 R2 @5494026032: a raw port can never be installed without its boundary)',
    );
  }
  hostModelPort = Object.freeze({ invoke: Function.prototype.bind.call(invoke, port) as V8HostModelPort['invoke'] });
  // isUnguessableSessionCap above already proved and narrowed the capability.
  hostModelPortSessionCap = sessionCap;
}

/**
 * The installed trusted ModelPort, or `undefined` when this process
 * bootstrapped without one. Absence is a legitimate honest state (FR08:
 * `unsupported`/`unmeasured`), never an error and never a fallback port.
 *
 * #1013 R2 fresh review @5494026032 (NEW_P1_02): with a port installed, the
 * caller must present the EXACT session capability that was installed with
 * it — a wrong or absent capability is refused typed
 * (MODEL_PORT_SESSION_DENIED) before the frozen `{invoke}` object can be
 * reached, so a same-process deep importer can never invoke the model
 * outside the qualified S `model-decision` declaration selection and the
 * truthful per-domain model-call evidence/accounting path. The capability
 * never exists in this module's exports.
 */
export function currentHostModelPort(sessionCap?: unknown): V8HostModelPort | undefined {
  if (hostModelPort === undefined) {
    return undefined;
  }
  if (!sessionCapMatches(sessionCap)) {
    throw new QualifiedPackageError(
      'MODEL_PORT_SESSION_DENIED',
      'the installed Host ModelPort requires the bootstrap session capability; structural module access carries no authority to invoke the model port outside the qualified decision path (#1013 R2 @5494026032)',
    );
  }
  return hostModelPort;
}
