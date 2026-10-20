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

/** One answered entry of an explicit multi-target query, correlated by input index. */
export interface V10MultiBQueryManyAnswered<T> {
  readonly status: 'answered';
  /** Zero-based position of the exact input selector this entry answers. */
  readonly index: number;
  readonly target: Readonly<V10MultiBQueryTarget>;
  readonly snapshot: T;
}

/**
 * One truthfully refused entry. The code/message pair never distinguishes a
 * denied selected B from an unselected, absent or hidden one.
 */
export interface V10MultiBQueryManyRefused {
  readonly status: 'refused';
  readonly index: number;
  readonly code: string;
  readonly message: string;
}

export type V10MultiBQueryManyEntry<T> = V10MultiBQueryManyAnswered<T> | V10MultiBQueryManyRefused;

/** Upper bound on one explicit queryMany call; fail closed above it. */
export const MAX_QUERY_MANY_SELECTORS = 32;

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

/**
 * Typed array check: `Array.isArray` alone narrows to `any[]` (its builtin
 * predicate), which would silently degrade every selected route to `any`
 * after the constructor guard; this guard keeps the declared route type.
 */
function isRouteArray(value: unknown): value is readonly V10SelectedBusinessQueryRoute[] {
  return Array.isArray(value);
}

/**
 * Bounded snapshot of ONE explicit queryMany selector. A malformed entry is
 * isolated to its own result: it never aborts the other requested targets.
 */
function manySelector(raw: unknown): V10MultiBQuerySelector | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const candidate = raw as Record<string, unknown>;
  const workflowId = candidate.workflowId;
  const instanceKey = candidate.instanceKey;
  const businessPackageId = candidate.businessPackageId;
  if (typeof workflowId !== 'string' || workflowId.length === 0 || workflowId.length > 512) return null;
  if (typeof instanceKey !== 'string' || instanceKey.length === 0 || instanceKey.length > 512) return null;
  if (businessPackageId !== undefined
    && (typeof businessPackageId !== 'string' || businessPackageId.length === 0 || businessPackageId.length > 512)) return null;
  return businessPackageId === undefined
    ? { workflowId, instanceKey }
    : { workflowId, instanceKey, businessPackageId };
}

function refused(index: number, code: string, message: string): V10MultiBQueryManyRefused {
  return Object.freeze({ status: 'refused', index, code, message });
}

/** Results never expose a denied or unselected Business identity. */
export class V10AuthorizedMultiBQuery<T> {
  readonly #host: V10MultiBQueryHost<T>;
  readonly #routes: readonly V10SelectedBusinessQueryRoute[];

  constructor(host: V10MultiBQueryHost<T>) {
    if (!host || typeof host.authorize !== 'function' || typeof host.readSnapshot !== 'function'
      || host.verifiedPrincipal === null || host.verifiedPrincipal === undefined
      || !host.deployment || !isRouteArray(host.selectedRoutes)) {
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

  /**
   * Single authorization + read path used by query and queryMany. Re-verify
   * authorization immediately before the only physical read; only visible
   * selected identities participate in ambiguity.
   */
  async #resolveOne(selector: V10MultiBQuerySelector): Promise<{
    readonly target: Readonly<V10MultiBQueryTarget>;
    readonly snapshot: T;
  }> {
    const visible: V10MultiBQueryTarget[] = [];
    for (const route of this.#routes) {
      if (route.workflowId !== selector.workflowId
        || (selector.businessPackageId !== undefined && route.businessPackageId !== selector.businessPackageId)) continue;
      const target: V10MultiBQueryTarget = Object.freeze({
        ...this.#host.deployment,
        businessPackageId: route.businessPackageId,
        workflowId: selector.workflowId,
        instanceKey: selector.instanceKey,
      });
      if (await this.#authorized(target)) visible.push(target);
    }
    if (visible.length === 0) reject('QUERY_NOT_FOUND', 'no visible query target');
    if (visible.length !== 1) reject('QUERY_AMBIGUOUS', 'multiple visible Business targets; specify businessPackageId');
    const target = visible[0]!;
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
    return await this.#resolveOne(
      businessPackageId === undefined ? { workflowId, instanceKey } : { workflowId, instanceKey, businessPackageId },
    );
  }

  /**
   * Explicit multi-target variant: every requested selector is authorized and
   * read INDEPENDENTLY, and results are correlated to the input position. A
   * malformed selector, denied/hidden target, authorization fault or physical
   * read fault is reported only for its own entry; the remaining entries still
   * answer. There is deliberately no cross-B transaction, rollback or
   * all-or-nothing assumption: earlier entries are never revoked because a
   * later one failed. Enumeration and denial shapes match `query`, so a hidden
   * B remains indistinguishable from an absent one.
   */
  async queryMany(
    selectors: readonly V10MultiBQuerySelector[],
  ): Promise<readonly V10MultiBQueryManyEntry<T>[]> {
    if (!Array.isArray(selectors)
      || selectors.length === 0
      || selectors.length > MAX_QUERY_MANY_SELECTORS) {
      reject(
        'QUERY_SELECTORS_INVALID',
        'queryMany requires a non-empty explicit array of at most ' + String(MAX_QUERY_MANY_SELECTORS) + ' selectors',
      );
    }
    const results: V10MultiBQueryManyEntry<T>[] = [];
    for (let index = 0; index < selectors.length; index += 1) {
      results.push(await this.#queryManyOne(selectors[index], index));
    }
    return Object.freeze(results);
  }

  async #queryManyOne(raw: unknown, index: number): Promise<V10MultiBQueryManyEntry<T>> {
    const selector = manySelector(raw);
    if (selector === null) {
      return refused(index, 'QUERY_SELECTOR_INVALID', 'query selector is invalid');
    }
    try {
      const { target, snapshot } = await this.#resolveOne(selector);
      return Object.freeze({ status: 'answered', index, target, snapshot });
    } catch (error) {
      if (error instanceof V10MultiBQueryError) {
        return refused(index, error.code, error.message);
      }
      // Never expose unknown infrastructure details from this entry.
      return refused(index, 'QUERY_READ_FAILED', 'the scoped snapshot reader failed');
    }
  }

}

export function createV10AuthorizedMultiBQuery<T>(host: V10MultiBQueryHost<T>): V10AuthorizedMultiBQuery<T> {
  return new V10AuthorizedMultiBQuery(host);
}
