import { createHash } from 'node:crypto';

export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface SemanticContentResource {
  path: string;
  content: string;
}

export interface SemanticToolSurface {
  name: string;
  description?: string;
  inputSchema: JsonValue;
  capabilities: string[];
}

export interface OutputSchema {
  type: 'object';
  additionalProperties?: boolean;
  required?: string[];
  properties: Record<string, {
    type?: 'string' | 'number' | 'boolean';
    enum?: JsonPrimitive[];
    const?: JsonPrimitive;
  }>;
}

export interface ResolvedSemanticInvocation {
  domainPackage: {
    packageId: string;
    semanticVersion: string;
    contractDigest: string;
  };
  decisionDefinition: {
    machineId: string;
    decisionId: string;
    content: string;
  };
  input: JsonValue;
  selectedContext: JsonValue;
  rules: SemanticContentResource[];
  knowledge: SemanticContentResource[];
  skills: SemanticContentResource[];
  cases: SemanticContentResource[];
  tools: SemanticToolSurface[];
  outputSchema: OutputSchema;
  harnessConfig: JsonValue;
  cacheScope: string;
  cacheable: boolean;
  timeSensitive: boolean;
  execution: {
    workflowInstanceId: string;
    sourceMessageId: string;
    effectId: string;
    transientFilePath?: string;
    registrationOrder?: string[];
  };
  unrelatedContext?: JsonValue;
}

export interface SemanticInvocationIdentity {
  scope: string;
  digest: string;
  canonicalPayload: string;
}

export interface ModelPort {
  execute(invocation: ResolvedSemanticInvocation): Promise<JsonValue>;
}

export interface SemanticInvocationResult {
  source: 'cache' | 'model';
  identity: SemanticInvocationIdentity | null;
  result: JsonValue;
}

function sortJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => sortJson(item));
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortJson(item)] as const);
    return Object.fromEntries(entries) as { [key: string]: JsonValue };
  }
  return value;
}

export function canonicalJson(value: JsonValue): string {
  return JSON.stringify(sortJson(value));
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function digestContent(resources: SemanticContentResource[]): string[] {
  return resources.map((resource) => sha256(resource.content)).sort();
}

function digestTools(tools: SemanticToolSurface[]): string[] {
  return tools.map((tool) => sha256(canonicalJson({
    name: tool.name,
    description: tool.description ?? '',
    inputSchema: tool.inputSchema,
    capabilities: [...tool.capabilities].sort(),
  }))).sort();
}

export function buildSemanticInvocationIdentity(
  invocation: ResolvedSemanticInvocation,
): SemanticInvocationIdentity {
  const canonicalPayload = canonicalJson({
    domainPackage: invocation.domainPackage,
    decisionDefinition: {
      machineId: invocation.decisionDefinition.machineId,
      decisionId: invocation.decisionDefinition.decisionId,
      contentDigest: sha256(invocation.decisionDefinition.content),
    },
    input: invocation.input,
    selectedContext: invocation.selectedContext,
    ruleDigests: digestContent(invocation.rules),
    knowledgeDigests: digestContent(invocation.knowledge),
    skillDigests: digestContent(invocation.skills),
    caseDigests: digestContent(invocation.cases),
    toolSurfaceDigests: digestTools(invocation.tools),
    outputSchemaDigest: sha256(canonicalJson(invocation.outputSchema as unknown as JsonValue)),
    harnessConfig: invocation.harnessConfig,
  });

  return {
    scope: invocation.cacheScope,
    digest: sha256(canonicalPayload),
    canonicalPayload,
  };
}

function deepClone<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class SemanticResultCache {
  readonly #entries = new Map<string, JsonValue>();

  #key(identity: SemanticInvocationIdentity): string {
    return `${identity.scope}:${identity.digest}`;
  }

  get(identity: SemanticInvocationIdentity): JsonValue | null {
    const value = this.#entries.get(this.#key(identity));
    return value === undefined ? null : deepClone(value);
  }

  commit(identity: SemanticInvocationIdentity, result: JsonValue): void {
    this.#entries.set(this.#key(identity), deepClone(result));
  }

  prime(identity: SemanticInvocationIdentity, result: JsonValue): void {
    this.commit(identity, result);
  }

  get size(): number {
    return this.#entries.size;
  }
}

export class SchemaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaValidationError';
  }
}

export function validateStructuredResult(schema: OutputSchema, value: JsonValue): void {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new SchemaValidationError('result must be an object');
  }

  for (const key of schema.required ?? []) {
    if (!(key in value)) {
      throw new SchemaValidationError(`missing required property: ${key}`);
    }
  }

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!(key in schema.properties)) {
        throw new SchemaValidationError(`unexpected property: ${key}`);
      }
    }
  }

  for (const [key, propertySchema] of Object.entries(schema.properties)) {
    const propertyValue = value[key];
    if (propertyValue === undefined) continue;

    if (propertySchema.type !== undefined && typeof propertyValue !== propertySchema.type) {
      throw new SchemaValidationError(`property ${key} must be ${propertySchema.type}`);
    }
    if (propertySchema.enum !== undefined && !propertySchema.enum.includes(propertyValue as JsonPrimitive)) {
      throw new SchemaValidationError(`property ${key} is outside enum`);
    }
    if (propertySchema.const !== undefined && propertyValue !== propertySchema.const) {
      throw new SchemaValidationError(`property ${key} must equal const`);
    }
  }
}

export class ExactSemanticInvocationCacheRunner {
  constructor(
    private readonly cache: SemanticResultCache,
    private readonly model: ModelPort,
  ) {}

  async invoke(invocation: ResolvedSemanticInvocation): Promise<SemanticInvocationResult> {
    if (!invocation.cacheable || invocation.timeSensitive) {
      const result = await this.model.execute(invocation);
      validateStructuredResult(invocation.outputSchema, result);
      return { source: 'model', identity: null, result };
    }

    const identity = buildSemanticInvocationIdentity(invocation);
    const cached = this.cache.get(identity);
    if (cached !== null) {
      validateStructuredResult(invocation.outputSchema, cached);
      return { source: 'cache', identity, result: cached };
    }

    const result = await this.model.execute(invocation);
    validateStructuredResult(invocation.outputSchema, result);
    this.cache.commit(identity, result);
    return { source: 'model', identity, result };
  }
}

export class FakeModelPort implements ModelPort {
  calls = 0;
  readonly invocations: ResolvedSemanticInvocation[] = [];

  constructor(private readonly responder: (invocation: ResolvedSemanticInvocation, call: number) => JsonValue) {}

  async execute(invocation: ResolvedSemanticInvocation): Promise<JsonValue> {
    this.calls += 1;
    this.invocations.push(invocation);
    return deepClone(this.responder(invocation, this.calls));
  }
}

export const DEFAULT_OUTPUT_SCHEMA: OutputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['decision', 'reason'],
  properties: {
    decision: { type: 'string', enum: ['approve', 'changes_required'] },
    reason: { type: 'string' },
  },
};

export function makeInvocation(
  overrides: Partial<ResolvedSemanticInvocation> = {},
): ResolvedSemanticInvocation {
  const base: ResolvedSemanticInvocation = {
    domainPackage: {
      packageId: '@example/quality-domain',
      semanticVersion: '3.0.0-research',
      contractDigest: 'contract-quality-v3',
    },
    decisionDefinition: {
      machineId: 'document-review',
      decisionId: 'review-quality',
      content: 'review-quality: approve when complete and supported by evidence',
    },
    input: {
      documentText: 'complete document',
      requestKind: 'quality-review',
    },
    selectedContext: {
      locale: 'en-US',
      riskTier: 'standard',
    },
    rules: [{ path: '/repo-a/rules/quality.md', content: 'approve only complete documents' }],
    knowledge: [{ path: '/repo-a/knowledge/product.md', content: 'product requires section A and B' }],
    skills: [{ path: '/repo-a/skills/review.md', content: 'inspect completeness then explain decision' }],
    cases: [{ path: '/repo-a/cases/good.md', content: 'complete -> approve' }],
    tools: [{
      name: 'lookup_evidence',
      description: 'lookup approved evidence by id',
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      capabilities: ['read:evidence'],
    }],
    outputSchema: DEFAULT_OUTPUT_SCHEMA,
    harnessConfig: {
      maxSteps: 4,
      toolPolicy: 'evidence-read-only',
    },
    cacheScope: 'tenant-a',
    cacheable: true,
    timeSensitive: false,
    execution: {
      workflowInstanceId: 'workflow-instance-a',
      sourceMessageId: 'message-a',
      effectId: 'effect-a',
      transientFilePath: '/tmp/run-a/input.json',
      registrationOrder: ['rule', 'knowledge', 'skill', 'tool'],
    },
    unrelatedContext: {
      uiTheme: 'dark',
      telemetryTraceId: 'trace-a',
    },
  };

  return {
    ...base,
    ...overrides,
    domainPackage: overrides.domainPackage ?? base.domainPackage,
    decisionDefinition: overrides.decisionDefinition ?? base.decisionDefinition,
    outputSchema: overrides.outputSchema ?? base.outputSchema,
    execution: overrides.execution ?? base.execution,
  };
}
