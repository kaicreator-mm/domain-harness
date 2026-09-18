import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ValidateFunction } from 'ajv';

import type { JsonSchema, JsonValue } from '../contracts/json.js';
import { ExpressionRuntime, ExpressionRuntimeError, type ExpressionEvaluationOptions } from './expression-runtime.js';

export interface CompiledExpressionDescriptor {
  readonly expression: string;
  readonly outputSchema: JsonSchema;
}

export class ExpressionToolExecutor {
  private readonly runtime: ExpressionRuntime;
  private readonly ajv = new Ajv2020({ strict: true, allErrors: true });
  private readonly validators = new WeakMap<object, ValidateFunction>();

  constructor(runtime: ExpressionRuntime = new ExpressionRuntime()) {
    this.runtime = runtime;
  }

  async execute(
    descriptor: CompiledExpressionDescriptor,
    input: JsonValue,
    logicalTime: string,
    options: ExpressionEvaluationOptions = {},
  ): Promise<JsonValue> {
    const result = await this.runtime.evaluate(
      descriptor.expression,
      { input },
      logicalTime,
      options,
    );

    let validate = this.validators.get(descriptor.outputSchema);
    try {
      if (!validate) {
        validate = this.ajv.compile(descriptor.outputSchema);
        this.validators.set(descriptor.outputSchema, validate);
      }
    } catch (error) {
      throw new ExpressionRuntimeError(
        'expression_error',
        `Expression Tool output schema is invalid: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!validate(result)) {
      const details = validate.errors?.map((error) =>
        `${error.instancePath || '/'} ${error.message ?? error.keyword}`,
      ).join('; ') ?? 'validation failed';
      throw new ExpressionRuntimeError(
        'expression_error',
        `Expression Tool output does not satisfy JSON Schema: ${details}`,
      );
    }

    return result;
  }
}
