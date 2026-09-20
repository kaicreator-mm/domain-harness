export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface PromptSection {
  readonly name: string;
  readonly order: number;
  readonly text: string;
  readonly interpolate?: boolean;
}

export interface ToolSchema {
  readonly name: string;
  readonly description: string;
  readonly parameters: JsonValue;
}

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: JsonValue;
}

export type ModelMessage =
  | { readonly role: 'system'; readonly content: string }
  | { readonly role: 'user'; readonly content: string }
  | {
      readonly role: 'assistant';
      readonly content: string;
      readonly toolCalls: readonly ToolCall[];
    }
  | {
      readonly role: 'tool';
      readonly callId: string;
      readonly name: string;
      readonly content: string;
      readonly isError: boolean;
      readonly code?: string;
    };

export interface ModelRequest {
  readonly step: number;
  readonly messages: readonly ModelMessage[];
  readonly tools: readonly ToolSchema[];
  readonly signal: AbortSignal;
}

export type ModelResponse =
  | { readonly kind: 'tool-calls'; readonly content?: string; readonly calls: readonly ToolCall[] }
  | { readonly kind: 'final'; readonly value: JsonValue };

export interface ModelPort {
  complete(request: ModelRequest): Promise<ModelResponse>;
}

export interface ToolExecutionContext {
  readonly signal: AbortSignal;
  readonly callId: string;
}

export interface ToolDefinition {
  readonly schema: ToolSchema;
  execute(argumentsValue: JsonValue, context: ToolExecutionContext): Promise<JsonValue>;
}

export interface RunFact {
  readonly seq: number;
  readonly type:
    | 'run/start'
    | 'step/start'
    | 'model/request'
    | 'model/response'
    | 'tool/call'
    | 'tool/result'
    | 'step/end'
    | 'run/end';
  readonly step: number | null;
  readonly payload: JsonValue;
}

export type NodeRunResult<T> =
  | { readonly status: 'completed'; readonly value: T; readonly facts: readonly RunFact[] }
  | { readonly status: 'max-steps'; readonly facts: readonly RunFact[] }
  | { readonly status: 'cancelled'; readonly facts: readonly RunFact[] }
  | { readonly status: 'invalid-final'; readonly error: string; readonly facts: readonly RunFact[] }
  | { readonly status: 'failed'; readonly error: string; readonly facts: readonly RunFact[] };

export interface NodeRunInput<T> {
  readonly sections: readonly PromptSection[];
  readonly variables?: Readonly<Record<string, string>>;
  readonly history: readonly ModelMessage[];
  readonly tools: readonly ToolDefinition[];
  readonly model: ModelPort;
  readonly signal: AbortSignal;
  readonly maxSteps: number;
  readonly parseFinal: (value: JsonValue) => T;
}

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function errorText(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) return error.message;
  return String(error);
}

function isAbortLike(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneMessage(message: ModelMessage): ModelMessage {
  return cloneJson(message as unknown as JsonValue) as unknown as ModelMessage;
}

function cloneToolSchema(schema: ToolSchema): ToolSchema {
  return cloneJson(schema as unknown as JsonValue) as unknown as ToolSchema;
}

export function assemblePrompt(
  sections: readonly PromptSection[],
  variables: Readonly<Record<string, string>> = {},
): string {
  const ordered = [...sections].sort((left, right) => {
    const orderDelta = left.order - right.order;
    return orderDelta === 0 ? compareCodeUnits(left.name, right.name) : orderDelta;
  });

  return ordered
    .map((section) => {
      if (section.interpolate === false) return section.text;
      return section.text.replace(/\{\{([A-Za-z_][A-Za-z0-9_.-]*)\}\}/g, (_match, name: string) => {
        if (!Object.prototype.hasOwnProperty.call(variables, name)) {
          throw new Error(`unknown prompt variable "{{${name}}}" in section "${section.name}"`);
        }
        return variables[name] ?? '';
      });
    })
    .filter((text) => text.length > 0)
    .join('\n\n');
}

export class ToolRegistry {
  readonly #definitions = new Map<string, ToolDefinition>();

  constructor(definitions: readonly ToolDefinition[]) {
    for (const definition of definitions) {
      const name = definition.schema.name;
      if (this.#definitions.has(name)) throw new Error(`duplicate tool "${name}"`);
      this.#definitions.set(name, definition);
    }
  }

  schemas(): readonly ToolSchema[] {
    return [...this.#definitions.values()]
      .map((definition) => cloneToolSchema(definition.schema))
      .sort((left, right) => compareCodeUnits(left.name, right.name));
  }

  definition(name: string): ToolDefinition | undefined {
    return this.#definitions.get(name);
  }
}

class Transcript {
  readonly #facts: RunFact[] = [];

  append(type: RunFact['type'], step: number | null, payload: JsonValue): void {
    this.#facts.push(Object.freeze({
      seq: this.#facts.length,
      type,
      step,
      payload: cloneJson(payload),
    }));
  }

  snapshot(): readonly RunFact[] {
    return Object.freeze([...this.#facts]);
  }
}

function requestPayload(request: ModelRequest): JsonValue {
  return {
    step: request.step,
    messages: request.messages.map((message) => cloneMessage(message)) as unknown as JsonValue,
    tools: request.tools.map((tool) => cloneToolSchema(tool)) as unknown as JsonValue,
  };
}

function responsePayload(response: ModelResponse): JsonValue {
  return cloneJson(response as unknown as JsonValue);
}

function syntheticCancelledObservation(call: ToolCall): ModelMessage {
  return {
    role: 'tool',
    callId: call.id,
    name: call.name,
    content: 'Error: tool call aborted before dispatch',
    isError: true,
    code: 'ABORTED_BEFORE_DISPATCH',
  };
}

function appendSyntheticCancelledCall(
  transcript: Transcript,
  step: number,
  call: ToolCall,
  messages: ModelMessage[],
): void {
  transcript.append('tool/call', step, {
    id: call.id,
    name: call.name,
    arguments: call.arguments,
    dispatched: false,
  });
  const observation = syntheticCancelledObservation(call);
  transcript.append('tool/result', step, observation as unknown as JsonValue);
  messages.push(observation);
}

function finishCancelled(transcript: Transcript, step: number): NodeRunResult<never> {
  transcript.append('step/end', step, { status: 'cancelled' });
  transcript.append('run/end', null, { status: 'cancelled' });
  return { status: 'cancelled', facts: transcript.snapshot() };
}

export async function runNodeMiniCore<T>(input: NodeRunInput<T>): Promise<NodeRunResult<T>> {
  if (!Number.isSafeInteger(input.maxSteps) || input.maxSteps < 1) {
    throw new Error('maxSteps must be a positive safe integer');
  }

  const transcript = new Transcript();
  const registry = new ToolRegistry(input.tools);
  let prompt: string;
  try {
    prompt = assemblePrompt(input.sections, input.variables);
  } catch (error: unknown) {
    const message = errorText(error);
    transcript.append('run/start', null, { maxSteps: input.maxSteps });
    transcript.append('run/end', null, { status: 'failed', error: message });
    return { status: 'failed', error: message, facts: transcript.snapshot() };
  }

  const messages: ModelMessage[] = input.history.map(cloneMessage);
  transcript.append('run/start', null, { maxSteps: input.maxSteps });

  for (let step = 1; step <= input.maxSteps; step += 1) {
    if (input.signal.aborted) {
      transcript.append('run/end', null, { status: 'cancelled' });
      return { status: 'cancelled', facts: transcript.snapshot() };
    }

    transcript.append('step/start', step, {});
    const requestMessages: ModelMessage[] = prompt.length === 0
      ? messages.map(cloneMessage)
      : [{ role: 'system', content: prompt }, ...messages.map(cloneMessage)];
    const request: ModelRequest = {
      step,
      messages: requestMessages,
      tools: registry.schemas(),
      signal: input.signal,
    };
    transcript.append('model/request', step, requestPayload(request));

    let response: ModelResponse;
    try {
      response = await input.model.complete(request);
    } catch (error: unknown) {
      const cancelled = input.signal.aborted || isAbortLike(error);
      if (cancelled) return finishCancelled(transcript, step) as NodeRunResult<T>;
      const message = errorText(error);
      transcript.append('step/end', step, { status: 'failed', error: message });
      transcript.append('run/end', null, { status: 'failed', error: message });
      return { status: 'failed', error: message, facts: transcript.snapshot() };
    }
    transcript.append('model/response', step, responsePayload(response));

    if (response.kind === 'final') {
      try {
        const value = input.parseFinal(response.value);
        transcript.append('step/end', step, { status: 'completed' });
        transcript.append('run/end', null, { status: 'completed' });
        return { status: 'completed', value, facts: transcript.snapshot() };
      } catch (error: unknown) {
        const message = errorText(error);
        transcript.append('step/end', step, { status: 'invalid-final', error: message });
        transcript.append('run/end', null, { status: 'invalid-final', error: message });
        return { status: 'invalid-final', error: message, facts: transcript.snapshot() };
      }
    }

    messages.push({
      role: 'assistant',
      content: response.content ?? '',
      toolCalls: response.calls.map((call) => cloneJson(call as unknown as JsonValue) as unknown as ToolCall),
    });

    for (let index = 0; index < response.calls.length; index += 1) {
      const call = response.calls[index];
      if (call === undefined) continue;

      if (input.signal.aborted) {
        for (const skipped of response.calls.slice(index)) {
          appendSyntheticCancelledCall(transcript, step, skipped, messages);
        }
        return finishCancelled(transcript, step) as NodeRunResult<T>;
      }

      transcript.append('tool/call', step, {
        id: call.id,
        name: call.name,
        arguments: call.arguments,
        dispatched: true,
      });

      const definition = registry.definition(call.name);
      if (definition === undefined) {
        const observation: ModelMessage = {
          role: 'tool',
          callId: call.id,
          name: call.name,
          content: `Error: unknown tool "${call.name}"`,
          isError: true,
          code: 'UNKNOWN_TOOL',
        };
        transcript.append('tool/result', step, observation as unknown as JsonValue);
        messages.push(observation);
        continue;
      }

      try {
        const value = await definition.execute(call.arguments, { signal: input.signal, callId: call.id });
        if (input.signal.aborted) {
          const observation: ModelMessage = {
            role: 'tool',
            callId: call.id,
            name: call.name,
            content: 'Error: tool call aborted',
            isError: true,
            code: 'ABORTED',
          };
          transcript.append('tool/result', step, observation as unknown as JsonValue);
          messages.push(observation);
          for (const skipped of response.calls.slice(index + 1)) {
            appendSyntheticCancelledCall(transcript, step, skipped, messages);
          }
          return finishCancelled(transcript, step) as NodeRunResult<T>;
        }
        const observation: ModelMessage = {
          role: 'tool',
          callId: call.id,
          name: call.name,
          content: JSON.stringify(value),
          isError: false,
        };
        transcript.append('tool/result', step, observation as unknown as JsonValue);
        messages.push(observation);
      } catch (error: unknown) {
        const cancelled = input.signal.aborted || isAbortLike(error);
        const observation: ModelMessage = {
          role: 'tool',
          callId: call.id,
          name: call.name,
          content: cancelled ? 'Error: tool call aborted' : `Error: ${errorText(error)}`,
          isError: true,
          code: cancelled ? 'ABORTED' : 'TOOL_ERROR',
        };
        transcript.append('tool/result', step, observation as unknown as JsonValue);
        messages.push(observation);
        if (cancelled) {
          for (const skipped of response.calls.slice(index + 1)) {
            appendSyntheticCancelledCall(transcript, step, skipped, messages);
          }
          return finishCancelled(transcript, step) as NodeRunResult<T>;
        }
      }
    }

    transcript.append('step/end', step, { status: 'continue' });
  }

  transcript.append('run/end', null, { status: 'max-steps' });
  return { status: 'max-steps', facts: transcript.snapshot() };
}
