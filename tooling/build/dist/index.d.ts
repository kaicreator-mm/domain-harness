/** DomainHarness v0.10.2 BUILD-only public entry; no Microkernel or Host authority. */
export { buildV10App } from './build.js';
export type { V10ModuleInput, V10RouteRowInput, BuildV10AppOptions, V10SealedModule, V10BuiltApp, } from '@kaicreator/domain-harness-contracts';
/** A8b: producer-only Component declarations mapped onto sealed BUILD inputs. */
export { projectSelectedComponents } from './component-view.js';
export type { ComponentClass, SemanticKind, ToolPlacement, SemanticComponent, HookComponent, ToolComponent, ComponentDeclaration, ComponentProjection, } from './component-view.js';
