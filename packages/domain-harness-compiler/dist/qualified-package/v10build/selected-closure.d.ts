/**
 * BUILD-only deterministic closure resolution. Pure data, no import/eval,
 * no clock, no authority or runtime ports.
 *
 * Same role-stable DFS order and refusal codes as the v0.10 T00 baseline.
 * Keep this private to BUILD: no new public package API.
 */
import type { V10ModuleRole } from './digest.js';
export interface V10ClosureModule {
    readonly packageId: string;
    readonly role: V10ModuleRole;
    readonly dependencies: readonly string[];
    readonly provides: readonly string[];
    readonly requires: readonly string[];
}
export interface V10SelectedClosure<M extends V10ClosureModule> {
    readonly selectedIds: ReadonlySet<string>;
    readonly byId: ReadonlyMap<string, M>;
    readonly loadOrder: string[];
}
export declare function resolveV10SelectedClosure<M extends V10ClosureModule>(selected: readonly M[]): V10SelectedClosure<M>;
