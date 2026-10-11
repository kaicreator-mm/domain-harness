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

  /** Host-context provisioning (deployment configuration, not caller surface). */
  provision(resourceKey: string, handler: ResourceHandler): void {
    if (typeof resourceKey !== 'string' || resourceKey.length === 0) {
      throw new HostBoundaryError('HOST_RESOURCE_MALFORMED', 'resource keys must be non-empty strings');
    }
    if (this.#handlers.has(resourceKey)) {
      throw new HostBoundaryError('HOST_RESOURCE_PROVISIONED', `resource ${resourceKey} is already provisioned on this host`);
    }
    this.#handlers.set(resourceKey, handler);
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
