import type { AIOperationIdentity, AIOperationPort, AIOperationRequest } from '../contracts/ai.js';
import type { JsonValue } from '../contracts/json.js';
import type { SkillAst } from '../loader/ast.js';
import { runAbortable } from './abortable.js';
import { SchemaValidator } from './schema-validator.js';

export interface SkillExecutionOptions {
  signal: AbortSignal;
  timeoutMs?: number;
}

export class SkillExecutor {
  private readonly schemas = new SchemaValidator();

  constructor(private readonly ai: AIOperationPort) {}

  async execute(
    skill: SkillAst,
    input: unknown,
    identity: AIOperationIdentity,
    options: SkillExecutionOptions,
  ): Promise<JsonValue> {
    const normalizedInput = this.schemas.validate(
      skill.inputSchema,
      input,
      'invalid_input',
      `Skill '${skill.id}' input`,
    );

    const result = await runAbortable(
      { signal: options.signal, timeoutMs: options.timeoutMs },
      'ai_error',
      `Skill '${skill.id}'`,
      async (signal) => {
        const request: AIOperationRequest = {
          identity,
          skillId: skill.id,
          instructions: skill.instructions,
          resources: skill.resources.map((resource) => ({ ...resource })),
          input: normalizedInput,
          outputSchema: skill.outputSchema,
          ...(skill.sidecar.profile ? { profile: skill.sidecar.profile } : {}),
          signal,
        };
        return this.ai.execute(request);
      },
    );

    return this.schemas.validate(
      skill.outputSchema,
      result,
      'invalid_output',
      `Skill '${skill.id}' output`,
    );
  }
}
