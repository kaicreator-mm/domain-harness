/**
 * v0.8 trusted Node Host — generic resource dispatcher (T-E, #1004).
 * ====================================================================
 *
 * The Host supplies ONLY generic physical resource dispatch with call
 * accounting and typed physical fault injection (adapted from
 * #994@b9ea4d1 src/host/memory-host.mjs `resources` port). It contains NO
 * business policy: what resources exist and what their operations do is a
 * deployment/host-context decision (provisioned at bootstrap, outside the
 * UX transport surface), never a caller capability.
 *
 * Every dispatch carries the AUTHENTICATED principal (verified credential),
 * so a resource can never mistake caller-declared user data for identity.
 *
 * #1023 S05 — the dispatcher's map keys are PHYSICAL keys. Deployment-owned
 * handlers install under their bare logical key (this module's historical
 * shape); capability-owned adapters install under the INJECTIVE composed
 * `<scopeId>\0<logicalKey>` entries the trusted kernel gateway provisions,
 * where the scope is minted per activation by the trusted loader. Two
 * independently approved closures binding the same logical route therefore
 * retain two distinct entries and can never cross-route, and a caller
 * forging a composed string as its logical key only reaches its own
 * deployment's scope-prefixed unknown (the identity never comes from the
 * call itself).
 */

import type { HostPrincipal } from './identity.js';
import { HostBoundaryError } from './errors.js';

/** The authenticated identity attached to every physical dispatch. */
export interface DispatchContext {
  readonly principal: HostPrincipal;
}

export type ResourceHandler = (operation: string, payload: unknown, context: DispatchContext) => unknown;

export interface ResourceCallRecord {
  readonly resourceKey: string;
  readonly operation: string;
  readonly principalSubject: string;
  readonly principalRoles: readonly string[];
}

export class ResourceDispatcher {
  readonly #handlers = new Map<string, ResourceHandler>();
  readonly #calls: { record: ResourceCallRecord; resourceKey: string; operation: string }[] = [];
  #failNextResource: string | null = null;

  /**
   * Host-context retention probe (#1023 S05): the sorted PHYSICAL keys every
   * currently provisioned handler is retained under — the observable
   * registry behind "the Host registers and retains each deployment's
   * unique physical identity". Keys here are the composed
   * `<scopeId>\0<logicalKey>` entries the trusted gateway provisions
   * (capability-owned adapters) plus any deployment-owned bare keys.
   * Read-only diagnostics; never installs, never routes.
   */
  resourceKeys(): readonly string[] {
    return [...this.#handlers.keys()].sort();
  }

  /** Host-context provisioning (deployment configuration, not caller surface). */
  provision(resourceKey: string, handler: ResourceHandler): void {
    this.#assertProvisionableKey(resourceKey);
    if (typeof handler !== 'function') {
      throw new HostBoundaryError('HOST_RESOURCE_MALFORMED', 'resource provisioning requires a callable handler');
    }
    if (this.#handlers.has(resourceKey)) {
      throw new HostBoundaryError('HOST_RESOURCE_PROVISIONED', `resource ${resourceKey} is already provisioned on this host`);
    }
    this.#handlers.set(resourceKey, handler);
  }

  /**
   * All-or-nothing batch provisioning (#1023 S04 R1 P1-01): every key is
   * validated — shape, freedom on this Host and uniqueness inside the batch —
   * BEFORE the first handler installs, and the installs commit in the same
   * synchronous block. A colliding or malformed batch therefore leaves ZERO
   * partial install (the bounded reversible batch the trusted gateway
   * registers app adapters through); a mid-loop throw is structurally
   * impossible because nothing can interleave between the preflight and the
   * commit inside one synchronous call.
   */
  provisionAll(entries: readonly { resourceKey: string; handler: ResourceHandler }[]): void {
    // Runtime shape gate runs through `unknown` on purpose: narrowing a
    // readonly-array parameter with Array.isArray degrades the element type,
    // and this surface is host-context wiring input — every field is checked,
    // nothing is trusted from the declared type alone.
    const batch = entries as unknown;
    if (!Array.isArray(batch)) {
      throw new HostBoundaryError('HOST_RESOURCE_MALFORMED', 'provisionAll requires an array of {resourceKey, handler} entries');
    }
    const seen = new Set<string>();
    const validated: { resourceKey: string; handler: ResourceHandler }[] = [];
    for (const entry of batch as readonly unknown[]) {
      if (typeof entry !== 'object' || entry === null) {
        throw new HostBoundaryError('HOST_RESOURCE_MALFORMED', 'provisionAll entries must be {resourceKey, handler} records');
      }
      const record = entry as { resourceKey?: unknown; handler?: unknown };
      if (typeof record.resourceKey !== 'string' || record.resourceKey.length === 0) {
        throw new HostBoundaryError('HOST_RESOURCE_MALFORMED', 'resource keys must be non-empty strings');
      }
      if (typeof record.handler !== 'function') {
        throw new HostBoundaryError('HOST_RESOURCE_MALFORMED', `resource ${record.resourceKey} batch provisioning requires a callable handler`);
      }
      const resourceKey = record.resourceKey;
      const handler = record.handler as ResourceHandler;
      if (seen.has(resourceKey)) {
        throw new HostBoundaryError('HOST_RESOURCE_MALFORMED', `resource ${resourceKey} appears more than once in one provisioning batch`);
      }
      if (this.#handlers.has(resourceKey)) {
        throw new HostBoundaryError('HOST_RESOURCE_PROVISIONED', `resource ${resourceKey} is already provisioned on this host`);
      }
      seen.add(resourceKey);
      validated.push({ resourceKey, handler });
    }
    for (const { resourceKey, handler } of validated) {
      this.#handlers.set(resourceKey, handler);
    }
  }

  #assertProvisionableKey(resourceKey: string): void {
    if (typeof resourceKey !== 'string' || resourceKey.length === 0) {
      throw new HostBoundaryError('HOST_RESOURCE_MALFORMED', 'resource keys must be non-empty strings');
    }
  }

  /** Host-context probe: is a resource key provisioned? Never installs. */
  has(resourceKey: string): boolean {
    return typeof resourceKey === 'string' && this.#handlers.has(resourceKey);
  }

  /**
   * Host-context rollback of ONE provisioning (#1023 S04 R1 P1-01): removes
   * the key's handler typed, refusing when absent. Deployment/diagnostics
   * surface only — it is never reachable from the UX transport.
   */
  unprovision(resourceKey: string): void {
    this.#assertProvisionableKey(resourceKey);
    if (!this.#handlers.delete(resourceKey)) {
      throw new HostBoundaryError('HOST_RESOURCE_UNKNOWN', `resource ${resourceKey} is not provisioned on this host`);
    }
  }

  /** Physical resource fault: the NEXT call to resourceKey fails after accounting (KPK-06 port). */
  failNextCall(resourceKey: string): void {
    this.#failNextResource = resourceKey;
  }

  async call(resourceKey: string, operation: string, payload: unknown, context: DispatchContext): Promise<unknown> {
    if (typeof resourceKey !== 'string' || resourceKey.length === 0 || typeof operation !== 'string' || operation.length === 0) {
      throw new HostBoundaryError('HOST_RESOURCE_MALFORMED', 'resource dispatch requires non-empty resourceKey and operation strings');
    }
    const handler = this.#handlers.get(resourceKey);
    if (handler === undefined) {
      // Accounting happens BEFORE any refusal: an unprovisioned dispatch is
      // still a physically observed (and refused) call.
      this.#calls.push({
        record: {
          resourceKey,
          operation,
          principalSubject: context.principal.subject,
          principalRoles: [...context.principal.roles],
        },
        resourceKey,
        operation,
      });
      throw new HostBoundaryError('HOST_RESOURCE_UNKNOWN', `host resource ${resourceKey}.${operation} is not provisioned on this host`);
    }
    this.#calls.push({
      record: {
        resourceKey,
        operation,
        principalSubject: context.principal.subject,
        principalRoles: [...context.principal.roles],
      },
      resourceKey,
      operation,
    });
    if (this.#failNextResource !== null && this.#failNextResource === resourceKey) {
      this.#failNextResource = null;
      throw new HostBoundaryError('HOST_FAULT_INJECTED', `physical resource ${resourceKey}.${operation} timed out after dispatch (uncertain outcome)`);
    }
    return handler(operation, payload, context);
  }

  /** Call accounting (diagnostics, host context only). */
  calls(): readonly ResourceCallRecord[] {
    return this.#calls.map((entry) => entry.record);
  }

  callCount(): number {
    return this.#calls.length;
  }
}
