import type { JsonObject, JsonSchema, JsonValue } from '../../contracts/json.js';
import type { CapabilityId } from './capability.js';

export type ToolEffectSemantics = 'none' | 'idempotent' | 'non-idempotent';

export interface CompiledMessageContract {
  type: string;
  version?: string;
  payloadSchema: JsonSchema;
}

export interface CompiledWorkflowDescriptor {
  workflowId: string;
  /** Portable compiled control definition; exact private engine encoding is not public authority. */
  definition: JsonObject;
  messageContracts: Readonly<Record<string, CompiledMessageContract>>;
}

export interface CompiledBindingDescriptor {
  kind: string;
  bindingId: string;
  digest?: string;
  config?: JsonValue;
}

export interface CompiledToolDescriptor {
  toolId: string;
  inputSchema?: JsonSchema;
  outputSchema: JsonSchema;
  effect: ToolEffectSemantics;
  execution: CompiledBindingDescriptor;
  requiredCapabilities: readonly CapabilityId[];
}

export type ProjectionDependencyDescriptor =
  | { kind: 'workflow'; selector: JsonObject }
  | { kind: 'business'; source: string; selector: JsonObject }
  | { kind: 'domain-data'; key: string };

export interface CompiledProjectionDescriptor {
  projectionId: string;
  expression: string;
  dependencies: readonly ProjectionDependencyDescriptor[];
  outputSchema: JsonSchema;
}

export interface CompiledPackageManifest {
  formatVersion: string;
  runtimeContractMajor: number;
  executionEngineMajor: number;
  domainId: string;
  domainVersion: string;
  packageId: string;
  targetProfileId: string;
  requiredCapabilities: readonly CapabilityId[];
  workflows: Readonly<Record<string, CompiledWorkflowDescriptor>>;
  tools: Readonly<Record<string, CompiledToolDescriptor>>;
  projections: Readonly<Record<string, CompiledProjectionDescriptor>>;
  schemas: Readonly<Record<string, JsonSchema>>;
  bindingDigests: Readonly<Record<string, string>>;
  compatibility?: JsonObject;
}

export interface TargetExecutableBindings {
  /** Target-compiled implementation handles. Values are opaque to domain semantics. */
  readonly [bindingId: string]: unknown;
}

export interface TargetCompiledDomainPackage {
  manifest: CompiledPackageManifest;
  bindings: TargetExecutableBindings;
}

export interface PackageRegistry {
  readonly defaultPackageId: string;
  get(packageId: string): TargetCompiledDomainPackage | undefined;
  has(packageId: string): boolean;
  listPackageIds(): readonly string[];
}
