import type { BuildV10AppOptions, V10BuiltApp } from '@kaicreator/domain-harness-contracts';
export type { V10ModuleInput, V10RouteRowInput, BuildV10AppOptions, V10SealedModule, V10BuiltApp } from '@kaicreator/domain-harness-contracts';
/**
 * Compose one closed-world Node24 Domain App. Purely static and
 * deterministic: zero module evaluation, zero I/O, no clock/randomness.
 */
export declare function buildV10App(options: BuildV10AppOptions): V10BuiltApp;
