/**
 * DomainHarness v0.11.0 T03 (#1577) — DomainApp runtime (L2 §7).
 *
 * The App handle exposes exactly three operations: `invoke` (the ONLY
 * runtime entry, direct to the locked Function — no caller replacement,
 * no second Router/Kernel, PRD A05), `inspect` (B06 read-only projection
 * of Lock facts, no private internals) and `dispose` (strict reverse-order
 * teardown, PRD A07 — no concurrent stop/drain engine). FunctionOutcome is
 * the strict three-state discriminated union; the runtime validates input
 * before the call and the SUCCEEDED value after the call (L2 §7.2.4), and
 * never lets an undeclared outcome kind or a malformed implementation
 * result masquerade as SUCCEEDED (PRD A06/AC09).
 */
import type { AppStatus, DomainApp, DomainAppLock, FunctionOutcome, SelectedFunction } from '@kaicreator/domain-harness-contracts/v011';
import { PackageSystem, KdpLoadError } from './package-system.js';
export interface DomainAppDeps {
    readonly lock: DomainAppLock;
    readonly packages: PackageSystem;
    /** ingress id → selected function + resolved implementation export. */
    readonly ingressImpls: ReadonlyMap<string, SelectedFunction & {
        impl: (input: unknown) => unknown;
    }>;
    readonly suppressedIngress: readonly string[];
    readonly initialStatus: AppStatus;
}
/**
 * Normalize a raw implementation return value into the strict
 * FunctionOutcome union. Garbage never propagates: a well-formed outcome
 * kind the contract did not declare is normalized to UNKNOWN (honest
 * doubt), while a malformed implementation result is a runtime
 * enforcement failure reported as FAILED (never re-checked against the
 * declared outcome set — it is the runtime's own refusal, not an
 * implementation outcome).
 */
export declare function normalizeOutcome(raw: unknown, declaredOutcomes: readonly string[]): FunctionOutcome;
export declare function createDomainApp(deps: DomainAppDeps): DomainApp;
export { KdpLoadError };
