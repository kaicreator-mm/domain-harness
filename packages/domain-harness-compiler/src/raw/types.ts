export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type JsonSchema = JsonObject;

export type CapabilityId = `${string}@${number}`;
export type ToolEffectSemantics = 'none' | 'idempotent' | 'non-idempotent';

export interface TargetHostProfile {
  id: string;
  capabilities: readonly CapabilityId[];
  bindings: Readonly<Record<CapabilityId, string>>;
}

export interface RawRoute {
  target: string;
  when?: string;
}

export interface RawMessageEffect {
  kind: 'domain-message';
  targetExpression: string;
  messageType: string;
  payloadExpression?: string;
  contractVersion?: string;
}

export interface RawExternalEvent {
  schemaPath?: string;
  schema?: JsonSchema;
  routes: readonly RawRoute[];
}

export interface RawInvoke {
  kind: 'skill' | 'tool' | 'script' | 'expr' | 'workflow';
  ref?: string;
  expression?: string;
  input?: string;
  timeoutMs?: number;
  /** Build-time only. Never copied into the compiled manifest. */
  scriptSource?: string;
}

export interface RawState {
  id: string;
  final: boolean;
  invoke?: RawInvoke;
  done: readonly RawRoute[];
  error: readonly RawRoute[];
  events: Readonly<Record<string, RawExternalEvent>>;
  effects?: readonly RawMessageEffect[];
}

export interface RawWorkflow {
  id: string;
  sourcePath: string;
  initial: string;
  output?: string;
  states: Readonly<Record<string, RawState>>;
}

export interface RawSkill {
  id: string;
  directory: string;
  instructions: string;
  inputSchema?: JsonSchema;
  outputSchema: JsonSchema;
  resources: readonly { path: string; content: string }[];
  profile?: string;
}

export interface LoadedRawDomainPackage {
  root: string;
  schemaVersion: '0.1';
  domainId: string;
  limits: { maxSteps: number };
  workflows: ReadonlyMap<string, RawWorkflow>;
  skills: ReadonlyMap<string, RawSkill>;
  scripts: ReadonlyMap<string, string>;
  schemas: ReadonlyMap<string, JsonSchema>;
  childDependencies: ReadonlyMap<string, readonly string[]>;
}

/**
 * Closed compile-time logical binding configuration for Tool executables.
 *
 * The field set is the union of logical binding fields defined by the v0.2
 * runtime binding contracts (remote HTTP/JSON: transport/resourceKey/path/
 * method). Every field is logical compile-time metadata — a Runtime Resource
 * *reference*, a logical transport capability id, a logical request path —
 * never a runtime value. `resourceKey` resolves through `RuntimeResources`
 * (frozen host contract) only at activation/execution time.
 *
 * The schema is closed on purpose: no arbitrary keys, no nested structures,
 * value shapes validated per field. Runtime resources, endpoints, credentials
 * and handles are structurally excluded from compilation, not filtered by name.
 * Binding-kind-specific runtime contracts (e.g. remote-http-json@1) apply their
 * own narrower validation on top of this closed set.
 */
export interface LogicalToolBindingConfig {
  /** Logical transport capability id selecting the transport binding, e.g. `http-transport@1`. */
  transport?: string;
  /** Logical Runtime Resource reference; the referenced value is injected at activation time only. */
  resourceKey?: string;
  /** Logical single-root request path beginning with `/`; never an absolute or protocol-relative URL. */
  path?: string;
  /** Logical HTTP method; remote HTTP/JSON v1 supports POST only. */
  method?: 'POST';
}

export interface RawToolDefinition {
  toolId: string;
  inputSchema?: JsonSchema;
  outputSchema: JsonSchema;
  effect: ToolEffectSemantics;
  executionKind: string;
  /** Capability whose target binding executes this Tool. Required when multiple capabilities are declared. */
  bindingCapability?: CapabilityId;
  requiredCapabilities?: readonly CapabilityId[];
  /** Closed logical binding configuration; runtime resources/secrets are structurally unrepresentable. */
  config?: LogicalToolBindingConfig;
}

export type RawProjectionDependency =
  | { kind: 'workflow'; selector: JsonObject }
  | { kind: 'business'; source: string; selector: JsonObject }
  | { kind: 'domain-data'; key: string };

export interface RawProjectionDefinition {
  projectionId: string;
  expression: string;
  dependencies: readonly RawProjectionDependency[];
  outputSchema: JsonSchema;
}
