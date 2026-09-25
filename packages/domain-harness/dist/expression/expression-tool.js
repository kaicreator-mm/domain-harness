import { Ajv2020 } from 'ajv/dist/2020.js';
import { ExpressionRuntime, ExpressionRuntimeError } from './expression-runtime.js';
export class ExpressionToolExecutor {
    runtime;
    ajv = new Ajv2020({ strict: true, allErrors: true });
    validators = new WeakMap();
    constructor(runtime = new ExpressionRuntime()) {
        this.runtime = runtime;
    }
    async execute(descriptor, input, logicalTime, options = {}) {
        const result = await this.runtime.evaluate(descriptor.expression, { input }, logicalTime, options);
        let validate = this.validators.get(descriptor.outputSchema);
        try {
            if (!validate) {
                validate = this.ajv.compile(descriptor.outputSchema);
                this.validators.set(descriptor.outputSchema, validate);
            }
        }
        catch (error) {
            throw new ExpressionRuntimeError('expression_error', `Expression Tool output schema is invalid: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (!validate(result)) {
            const details = validate.errors?.map((error) => `${error.instancePath || '/'} ${error.message ?? error.keyword}`).join('; ') ?? 'validation failed';
            throw new ExpressionRuntimeError('expression_error', `Expression Tool output does not satisfy JSON Schema: ${details}`);
        }
        return result;
    }
}
//# sourceMappingURL=expression-tool.js.map