/**
 * DomainHarness v0.10 T10 — Host-owned, authorized, Multi-B snapshot selector.
 *
 * This is an isolated query mechanism, NOT the App facade integration.
 * The trusted Host constructs it from BUILD-selected B identities, a verified
 * principal, the selected K02-scoped snapshot reader, and its own authorization
 * function. A public query may specify only workflow/instance/B, never a
 * principal, authorization callback, store, or deployment scope.
 */
export interface V10QueryDeployment {
  readonly deployedAppId: string;
  readonly tenantId: string;
  readonly appId: string;
}
export interface V10SelectedBusinessQueryRoute {
  readonly businessPackageId: string;
  readonly workflowId: string;
}
export interface V10MultiBQuerySelector {
  readonly workflowId: string;
  readonly instanceKey: string;
  readonly businessPackageId?: string;
}
export interface V10MultiBQueryTarget extends V10QueryDeployment {
  readonly businessPackageId: string;
  readonly workflowId: string;
  readonly instanceKey: string;
}
export interface V10MultiBQueryHost<T> {
  /** Host-authenticated identity: MUST NOT be sourced from a public query. */
  readonly verifiedPrincipal: unknown;
  /** Deployment-pinned identity: never a selector from the caller. */
  readonly deployment: V10QueryDeployment;
  /** BUILD-selected routes; this is not an arbitrary discovered data table. */
  readonly selectedRoutes: readonly V10SelectedBusinessQueryRoute[];
  /** Trusted current authorization; no caller-supplied grant. */
  readonly authorize: (principal: unknown, target: V10MultiBQueryTarget) => boolean | Promise<boolean>;
  /** Real selected K02 reader, physical addressing bound to the entire tuple. */
  readonly readSnapshot: (target: V10MultiBQueryTarget) => T | null | Promise<T | null>;
}

export class V10MultiBQueryError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'V10MultiBQueryError';
  }
}
function reject(code: string, message: string): never {
  throw new V10MultiBQueryError(code, message);
}
function ident(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) {
    reject('QUERY_SELECTOR_INVALID', name + ' must be a bounded nonempty identifier');
  }
  return value;
}
function routeId(route: V10SelectedBusinessQueryRoute): string {
  return JSON.stringify([route.businessPackageId, route.workflowId]);
}

/** Results never expose a denied or unselected Business identity. */
export class V10AuthorizedMultiBQuery<T> {
  readonly #host: V10MultiBQueryHost<T>;
  readonly #routes: readonly V10SelectedBusinessQueryRoute[];

  constructor(host: V10MultiBQueryHost<T>) {
    if (!host || typeof host.authorize !== 'function' || typeof host.readSnapshot !== 'function'
      || host.verifiedPrincipal === null || host.verifiedPrincipal === undefined
      || !host.deployment || !Array.isArray(host.selectedRoutes)) {
      reject('QUERY_HOST_INVALID', 'trusted principal, selected routes, authorization and reader required');
    }
    for (const field of ['deployedAppId', 'tenantId', 'appId'] as const) {
      ident(host.deployment[field], 'deployment ' + field);
    }
    if (host.selectedRoutes.length > 64) {
      reject('QUERY_SELECTED_ROUTES_INVALID', 'too many selected Business routes');
    }
    const seen = new Set<string>();
    const selected: V10SelectedBusinessQueryRoute[] = [];
    for (const route of host.selectedRoutes) {
      if (!route || typeof route !== 'object') {
        reject('QUERY_SELECTED_ROUTES_INVALID', 'selected route must be a record');
      }
      ident(route.businessPackageId, 'selected businessPackageId');
      ident(route.workflowId, 'selected workflowId');
      const id = routeId(route);
      if (seen.has(id)) reject('QUERY_SELECTED_ROUTES_INVALID', 'duplicate selected Business route');
      seen.add(id);
      selected.push(Object.freeze({
        businessPackageId: route.businessPackageId,
        workflowId: route.workflowId,
      }));
    }
    this.#routes = Object.freeze(selected);
    this.#host = host;
  }

  async #authorized(target: V10MultiBQueryTarget): Promise<boolean> {
    try {
      return (await this.#host.authorize(this.#host.verifiedPrincipal, target)) === true;
    } catch {
      // Never expose authorization infrastructure exceptions or partial data.
      reject('QUERY_AUTHORIZATION_UNAVAILABLE', 'cannot verify scoped query authorization');
    }
  }

  async query(selector: V10MultiBQuerySelector): Promise<{
    readonly target: Readonly<V10MultiBQueryTarget>;
    readonly snapshot: T;
  }> {
    if (!selector || typeof selector !== 'object' || Array.isArray(selector)) {
      reject('QUERY_SELECTOR_INVALID', 'query requires an explicit workflow and instance');
    }
    const workflowId = ident(selector.workflowId, 'workflowId');
    const instanceKey = ident(selector.instanceKey, 'instanceKey');
    const businessPackageId = selector.businessPackageId === undefined
      ? undefined : ident(selector.businessPackageId, 'businessPackageId');

    // All candidates are BUILD-selected identities. No physical K lookups
    // happen during enumeration, and unselected B identities are invisible.
    const visible: V10MultiBQueryTarget[] = [];
    for (const route of this.#routes) {
      if (route.workflowId !== workflowId
        || (businessPackageId !== undefined && route.businessPackageId !== businessPackageId)) continue;
      const target: V10MultiBQueryTarget = Object.freeze({
        ...this.#host.deployment,
        businessPackageId: route.businessPackageId,
        workflowId,
        instanceKey,
      });
      if (await this.#authorized(target)) visible.push(target);
    }

    // Denied/unselected/absent all collapse into one non-oracle result.
    if (visible.length === 0) reject('QUERY_NOT_FOUND', 'no visible query target');
    // Ambiguity is determined by VISIBLE candidates only, never by storage
    // existence or the number of hidden/denied Business identities.
    if (visible.length !== 1) reject('QUERY_AMBIGUOUS', 'multiple visible Business targets; specify businessPackageId');

    const target = visible[0]!;
    // Recheck authorization immediately before the only physical read; a
    // capability revoked during prior selection must not yield a snapshot.
    if (!await this.#authorized(target)) reject('QUERY_NOT_FOUND', 'no visible query target');
    let snapshot: T | null;
    try {
      snapshot = await this.#host.readSnapshot(target);
    } catch {
      reject('QUERY_READ_FAILED', 'the scoped snapshot reader failed');
    }
    if (snapshot === null || snapshot === undefined) {
      reject('QUERY_NOT_FOUND', 'no visible query target');
    }
    return { target, snapshot };
  }
}

export function createV10AuthorizedMultiBQuery<T>(host: V10MultiBQueryHost<T>): V10AuthorizedMultiBQuery<T> {
  return new V10AuthorizedMultiBQuery(host);
}
