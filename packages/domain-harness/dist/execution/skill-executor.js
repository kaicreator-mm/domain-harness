import { runAbortable } from './abortable.js';
import { SchemaValidator } from './schema-validator.js';
export class SkillExecutor {
    ai;
    schemas = new SchemaValidator();
    constructor(ai) {
        this.ai = ai;
    }
    async execute(skill, input, identity, options) {
        const normalizedInput = this.schemas.validate(skill.inputSchema, input, 'invalid_input', `Skill '${skill.id}' input`);
        const result = await runAbortable({
            signal: options.signal,
            ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
        }, 'ai_error', `Skill '${skill.id}'`, async (signal) => {
            const request = {
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
        });
        return this.schemas.validate(skill.outputSchema, result, 'invalid_output', `Skill '${skill.id}' output`);
    }
}
//# sourceMappingURL=skill-executor.js.map