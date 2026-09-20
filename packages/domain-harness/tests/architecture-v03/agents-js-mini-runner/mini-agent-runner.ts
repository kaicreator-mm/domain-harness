export type PromptMessage =
  | { role: 'system' | 'developer' | 'user'; content: string }
  | { role: 'assistant'; content?: string; toolCalls?: readonly ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; output: unknown };

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export type ModelTurn =
  | { kind: 'final'; output: unknown; message?: string }
  | { kind: 'tool_calls'; calls: readonly ToolCall[]; message?: string };

export interface ToolAvailabilityContext {
  messages: readonly PromptMessage[];
}

export interface MiniTool {
  name: string;
  description?: string;
  isEnabled?: (context: ToolAvailabilityContext) => boolean;
  requiresApproval?: boolean | ((input: unknown) => boolean);
  execute(input: unknown, context: { signal?: AbortSignal }): Promise<unknown>;
}

export interface GenerateRequest {
  messages: readonly PromptMessage[];
  tools: readonly Pick<MiniTool, 'name' | 'description'>[];
  signal?: AbortSignal;
}

export type Generate = (request: GenerateRequest) => Promise<ModelTurn>;
export type FinalValidator = (output: unknown) => boolean;

export type JournalEvent =
  | { kind: 'model'; step: number; response: ModelTurn }
  | {
      kind: 'tool';
      step: number;
      callId: string;
      name: string;
      input: unknown;
      output: unknown;
    };

export interface MiniRunnerContinuation {
  messages: PromptMessage[];
  nextStep: number;
  journal: JournalEvent[];
}

export interface ApprovalRequest {
  callId: string;
  name: string;
  input: unknown;
}

export type MiniRunnerResult =
  | {
      status: 'completed';
      output: unknown;
      continuation: MiniRunnerContinuation;
    }
  | {
      status: 'approval_required';
      approval: ApprovalRequest;
      continuation: MiniRunnerContinuation;
    }
  | {
      status: 'max_steps';
      continuation: MiniRunnerContinuation;
    };

export interface RunMiniAgentOptions {
  input?: string;
  systemPrompt?: string;
  developerPrompts?: readonly string[];
  continuation?: MiniRunnerContinuation;
  tools?: readonly MiniTool[];
  generate?: Generate;
  validateFinal?: FinalValidator;
  signal?: AbortSignal;
  maxSteps?: number;
  replay?: readonly JournalEvent[];
}

export class InvalidFinalOutputError extends Error {
  constructor() {
    super('Final output did not satisfy the configured validator');
    this.name = 'InvalidFinalOutputError';
  }
}

function abortIfNeeded(signal?: AbortSignal): void {
  signal?.throwIfAborted();
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonicalize(record[key])]),
    );
  }
  return value;
}

function initialMessages(options: RunMiniAgentOptions): PromptMessage[] {
  if (options.continuation) return structuredClone(options.continuation.messages);
  const messages: PromptMessage[] = [];
  if (options.systemPrompt) messages.push({ role: 'system', content: options.systemPrompt });
  for (const content of options.developerPrompts ?? []) {
    messages.push({ role: 'developer', content });
  }
  if (options.input !== undefined) messages.push({ role: 'user', content: options.input });
  return messages;
}

function continuation(
  messages: PromptMessage[],
  nextStep: number,
  journal: JournalEvent[],
): MiniRunnerContinuation {
  return {
    messages: structuredClone(messages),
    nextStep,
    journal: structuredClone(journal),
  };
}

function enabledToolsFor(
  tools: ReadonlyMap<string, MiniTool>,
  messages: readonly PromptMessage[],
): Map<string, MiniTool> {
  const context: ToolAvailabilityContext = { messages: structuredClone(messages) };
  return new Map(
    [...tools.entries()].filter(([, tool]) => tool.isEnabled?.(context) ?? true),
  );
}

function requiresApproval(tool: MiniTool, input: unknown): boolean {
  if (typeof tool.requiresApproval === 'function') {
    return tool.requiresApproval(structuredClone(input));
  }
  return tool.requiresApproval === true;
}

export async function runMiniAgent(options: RunMiniAgentOptions): Promise<MiniRunnerResult> {
  const maxSteps = options.maxSteps ?? 8;
  if (!Number.isInteger(maxSteps) || maxSteps < 1) {
    throw new RangeError('maxSteps must be a positive integer');
  }

  const tools = new Map((options.tools ?? []).map((tool) => [tool.name, tool]));
  const messages = initialMessages(options);
  const journal = options.continuation
    ? structuredClone(options.continuation.journal)
    : [];
  const firstStep = options.continuation?.nextStep ?? 0;
  let replayCursor = 0;

  const takeReplay = <T extends JournalEvent['kind']>(
    kind: T,
    step: number,
  ): Extract<JournalEvent, { kind: T }> => {
    const event = options.replay?.[replayCursor++];
    if (!event || event.kind !== kind || event.step !== step) {
      throw new Error(`Replay mismatch at step ${step}: expected ${kind}`);
    }
    return event as Extract<JournalEvent, { kind: T }>;
  };

  for (let offset = 0; offset < maxSteps; offset += 1) {
    const step = firstStep + offset;
    abortIfNeeded(options.signal);

    const enabledTools = enabledToolsFor(tools, messages);
    const toolDescriptors = [...enabledTools.values()].map(({ name, description }) => ({
      name,
      ...(description === undefined ? {} : { description }),
    }));

    let turn: ModelTurn;
    if (options.replay) {
      turn = structuredClone(takeReplay('model', step).response);
    } else {
      if (!options.generate) throw new Error('generate is required when replay is not supplied');
      turn = await options.generate({
        messages: structuredClone(messages),
        tools: toolDescriptors,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
      journal.push({ kind: 'model', step, response: structuredClone(turn) });
    }

    if (turn.kind === 'final') {
      if (options.validateFinal && !options.validateFinal(structuredClone(turn.output))) {
        throw new InvalidFinalOutputError();
      }
      if (turn.message !== undefined) messages.push({ role: 'assistant', content: turn.message });
      if (options.replay && replayCursor !== options.replay.length) {
        throw new Error('Replay contains unused events after final output');
      }
      return {
        status: 'completed',
        output: structuredClone(turn.output),
        continuation: continuation(
          messages,
          step + 1,
          options.replay ? [...options.replay] : journal,
        ),
      };
    }

    messages.push({
      role: 'assistant',
      ...(turn.message === undefined ? {} : { content: turn.message }),
      toolCalls: structuredClone(turn.calls),
    });

    for (const call of turn.calls) {
      const tool = enabledTools.get(call.name);
      if (!tool) {
        throw new Error(`Tool is disabled or unknown: ${call.name}`);
      }
      if (requiresApproval(tool, call.input)) {
        return {
          status: 'approval_required',
          approval: {
            callId: call.id,
            name: call.name,
            input: structuredClone(call.input),
          },
          continuation: continuation(
            messages,
            step + 1,
            options.replay ? [...options.replay] : journal,
          ),
        };
      }
    }

    for (const call of turn.calls) {
      abortIfNeeded(options.signal);
      const tool = enabledTools.get(call.name);
      if (!tool) throw new Error(`Tool is disabled or unknown: ${call.name}`);

      let output: unknown;
      if (options.replay) {
        const recorded = takeReplay('tool', step);
        if (
          recorded.callId !== call.id ||
          recorded.name !== call.name ||
          !sameValue(recorded.input, call.input)
        ) {
          throw new Error(`Replay tool mismatch for ${call.name}/${call.id}`);
        }
        output = structuredClone(recorded.output);
      } else {
        output = await tool.execute(
          structuredClone(call.input),
          options.signal === undefined ? {} : { signal: options.signal },
        );
        journal.push({
          kind: 'tool',
          step,
          callId: call.id,
          name: call.name,
          input: structuredClone(call.input),
          output: structuredClone(output),
        });
      }
      messages.push({
        toolCallId: call.id,
        role: 'tool',
        name: call.name,
        output: structuredClone(output),
      });
    }
  }

  return {
    status: 'max_steps',
    continuation: continuation(
      messages,
      firstStep + maxSteps,
      options.replay ? [...options.replay] : journal,
    ),
  };
}
