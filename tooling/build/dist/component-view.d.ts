/**
 * v0.10.2 A8b #1364 — published BUILD-only, BUILD-input-preserving Component view.
 *
 * This source is the canonical BUILD workspace's bounded authoring adapter.
 * It is NOT a runtime dispatcher, new manifest authority or Tool executor.
 * Selection, byte digests, imports and effects remain validated by buildV10App.
 */
import { type V10ModuleInput } from '@kaicreator/domain-harness-contracts';
export type ComponentClass = 'semantic' | 'hook' | 'tool';
export type SemanticKind = 'skill' | 'rule' | 'workflow' | 'decision' | 'context' | 'validator' | 'schema' | 'diagnostics' | 'knowledge' | 'evidence';
export type ToolPlacement = 'package-operation' | 'system-operation' | 'remote-operation';
interface ComponentBase {
    /** Declaration identity, not another selected-package or authority identity. */
    readonly componentId: string;
    /** Identity of an already-selected sealed V10ModuleInput, not a file path. */
    readonly modulePackageId: string;
}
export interface SemanticComponent extends ComponentBase {
    readonly class: 'semantic';
    readonly kind: SemanticKind;
    /** Existing standard-feature featureExport, not an arbitrary private function. */
    readonly entry: string;
}
export interface HookComponent extends ComponentBase {
    readonly class: 'hook';
    readonly kind: 'kernel-advisory' | 'event' | 'lifecycle' | 'observer';
    /** Existing K advisory kernel-extension hookExport. */
    readonly entry: string;
}
export interface ToolComponent extends ComponentBase {
    readonly class: 'tool';
    readonly kind: ToolPlacement;
    readonly operationId: string;
    readonly handler: string;
    /** Claimed module-level externalEffect. Never inferred from Tool placement. */
    readonly externalEffect: boolean;
}
export type ComponentDeclaration = SemanticComponent | HookComponent | ToolComponent;
export interface ComponentProjection {
    /** Selected original source objects, in caller's BUILD module order. */
    readonly modules: readonly V10ModuleInput[];
    /** This map is a producer-side explanation only, not a second BUILD artifact. */
    readonly bindings: readonly Readonly<{
        componentId: string;
        modulePackageId: string;
        class: ComponentClass;
        entry: string;
    }>[];
}
/**
 * Map explicitly selected declarations onto already selected V10 BUILD inputs.
 * Never loads/evaluates an ESM module and never registers a Tool or Hook.
 * Unsupported semantics fail closed; BUILD must still seal modules and routes.
 */
export declare function projectSelectedComponents(declarations: readonly ComponentDeclaration[], selectedModules: readonly V10ModuleInput[]): ComponentProjection;
export {};
