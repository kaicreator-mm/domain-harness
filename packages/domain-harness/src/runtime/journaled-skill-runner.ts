import type { AIOperationPort } from '../contracts/ai.js';
import type { JsonSchema, JsonValue } from '../contracts/json.js';
import {
  assertCompatibleEffectRecord,
  type ExpectedEffectJournalIdentity,
} from '../execution/journal/effect-journal.js';
import {
  deriveEffectId,
  type EffectIdentitySeed,
} from '../execution/journal/effect-identity.js';
import { SchemaValidator } from '../execution/schema-validator.js';
import type { EffectJournalRecord } from '../v2/contracts/effect.js';
import type { Sha256Port } from '../v2/contracts/host.js';
import type { RuntimeStore } from '../v2/contracts/store.js';

export interface CompiledSkillDefinition {
  readonly skillId: string;
  readonly instructions: string;
  readonly inputSchema?: JsonSchema;
  readonly outputSchema: JsonSchema;
  readonly resources: readonly {
    readonly path: string;
    readonly content: string;
  }[];
  readonly profile?: string;
}

export type SkillJournalStore = Pick<RuntimeStore, 'getEffect' | 'beginEffect' | 'completeEffect'>;

export interface JournaledSkillRunnerOptions {
  readonly store: SkillJournalStore;
  readonly sha256: Sha256Port;
  readonly ai: AIOperationPort;
  readonly now?: () => string;
}

export interface RunSkillRequest extends EffectIdentitySeed {
  readonly skill: CompiledSkillDefinition;
  readonly input: JsonValue;
  readonly timeoutMs?: number;
}

export interface CompletedSkillResult {
  readonly effectId: string;
  readonly output: JsonValue;
  readonly attempt: number;
  readonly replayed: boolean;
}

export class JournaledSkillRunner {
  readonly #store: SkillJournalStore;
  readonly #sha256: Sha256Port;
  readonly #ai: AIOperationPort;
  readonly #now: () => string;
  readonly #schemas = new SchemaValidator();

  constructor(options: JournaledSkillRunnerOptions) {
    this.#store = options.store;
    this.#sha256 = options.sha256;
    this.#ai = options.ai;
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  async run(request: RunSkillRequest): Promise<CompletedSkillResult> {
    const skill = validateCompiledSkill(request.skill);
    const input = this.#schemas.validate(
      skill.inputSchema,
      request.input,
      'invalid_input',
      `Skill '${skill.skillId}' input`,
    );
    const effectId = await deriveEffectId(this.#sha256, request);
    const expected: ExpectedEffectJournalIdentity = {
      effectId,
      target: request.target,
      sourceMessageId: request.sourceMessageId,
      effectKind: `skill:${skill.skillId}`,
      // Skill execution remains semantically distinct from a Domain Tool side
      // effect. A started-but-uncommitted AI operation is retryable, matching
      // v0.1 Step recovery; a completed structured result is replayed durably.
      effectSemantics: 'none',
      input,
    };

    let record = await this.#store.getEffect(effectId);
    let replayed = record !== null;
    if (record !== null) {
      assertCompatibleEffectRecord(record, expected);
      if (record.status === 'completed') return completedResult(record, true);
      if (record.status === 'failed') {
        throw new Error(`Skill effect ${effectId} has a committed failed journal fact`);
      }
      record = await this.#store.beginEffect({
        effectId,
        target: request.target,
        sourceMessageId: request.sourceMessageId,
        effectKind: expected.effectKind,
        effectSemantics: 'none',
        status: 'started',
        attempt: record.attempt + 1,
        input,
        startedAt: this.#now(),
      });
    } else {
      record = await this.#store.beginEffect({
        effectId,
        target: request.target,
        sourceMessageId: request.sourceMessageId,
        effectKind: expected.effectKind,
        effectSemantics: 'none',
        status: 'started',
        attempt: 1,
        input,
        startedAt: this.#now(),
      });
      replayed = false;
    }

    assertCompatibleEffectRecord(record, expected);
    if (record.status === 'completed') return completedResult(record, true);
    if (record.status === 'failed') {
      throw new Error(`Skill effect ${effectId} has a committed failed journal fact`);
    }

    const output = await this.execute(skill, input, request, effectId, record.attempt);

    try {
      const completed = await this.#store.completeEffect({
        effectId,
        status: 'completed',
        output,
        completedAt: this.#now(),
      });
      assertCompatibleEffectRecord(completed, expected);
      if (completed.status !== 'completed') {
        throw new Error(`completeEffect returned ${completed.status} for ${effectId}`);
      }
      return completedResult(completed, replayed);
    } catch (completeError) {
      let reconciled: EffectJournalRecord | null = null;
      try {
        reconciled = await this.#store.getEffect(effectId);
      } catch {
        // The next explicit message-recovery retry will reconcile/retry this
        // retryable Skill operation. Never claim a completion we cannot read.
      }
      if (reconciled !== null) {
        assertCompatibleEffectRecord(reconciled, expected);
        if (reconciled.status === 'completed') return completedResult(reconciled, true);
        if (reconciled.status === 'failed') {
          throw new Error(`Skill effect ${effectId} has a committed failed journal fact`);
        }
      }
      throw completeError;
    }
  }

  private async execute(
    skill: CompiledSkillDefinition,
    input: JsonValue,
    request: RunSkillRequest,
    effectId: string,
    attempt: number,
  ): Promise<JsonValue> {
    const timeoutMs = request.timeoutMs;
    if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
      throw new Error(`Skill '${skill.skillId}' timeoutMs must be greater than zero`);
    }

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = timeoutMs === undefined
      ? undefined
      : new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            const error = new Error(`Skill '${skill.skillId}' exceeded ${timeoutMs}ms`);
            controller.abort(error);
            reject(error);
          }, timeoutMs);
        });

    try {
      const operation = this.#ai.execute({
        identity: {
          runId: effectId,
          workflowInstanceId: JSON.stringify([
            request.target.workflowId,
            request.target.instanceKey,
          ]),
          stepId: request.workflowStepIdentity,
          attempt,
        },
        skillId: skill.skillId,
        instructions: skill.instructions,
        resources: skill.resources.map((resource) => ({ ...resource })),
        input,
        outputSchema: skill.outputSchema,
        ...(skill.profile === undefined ? {} : { profile: skill.profile }),
        signal: controller.signal,
      });
      const raw = timeout === undefined ? await operation : await Promise.race([operation, timeout]);
      return this.#schemas.validate(
        skill.outputSchema,
        raw,
        'invalid_output',
        `Skill '${skill.skillId}' output`,
      );
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}

function completedResult(record: EffectJournalRecord, replayed: boolean): CompletedSkillResult {
  return {
    effectId: record.effectId,
    output: record.output as JsonValue,
    attempt: record.attempt,
    replayed,
  };
}

function validateCompiledSkill(skill: CompiledSkillDefinition): CompiledSkillDefinition {
  if (skill.skillId.trim().length === 0) throw new Error('Compiled Skill skillId must be non-empty');
  if (skill.instructions.trim().length === 0) {
    throw new Error(`Compiled Skill '${skill.skillId}' instructions must be non-empty`);
  }
  if (!isSchema(skill.outputSchema)) {
    throw new Error(`Compiled Skill '${skill.skillId}' outputSchema must be an object`);
  }
  if (skill.inputSchema !== undefined && !isSchema(skill.inputSchema)) {
    throw new Error(`Compiled Skill '${skill.skillId}' inputSchema must be an object`);
  }
  if (!Array.isArray(skill.resources)) {
    throw new Error(`Compiled Skill '${skill.skillId}' resources must be an array`);
  }
  for (const resource of skill.resources) {
    if (
      resource === null ||
      typeof resource !== 'object' ||
      typeof resource.path !== 'string' ||
      resource.path.length === 0 ||
      typeof resource.content !== 'string'
    ) {
      throw new Error(`Compiled Skill '${skill.skillId}' contains an invalid resource`);
    }
  }
  if (skill.profile !== undefined && skill.profile.trim().length === 0) {
    throw new Error(`Compiled Skill '${skill.skillId}' profile must be non-empty when present`);
  }
  return skill;
}

function isSchema(value: unknown): value is JsonSchema {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
