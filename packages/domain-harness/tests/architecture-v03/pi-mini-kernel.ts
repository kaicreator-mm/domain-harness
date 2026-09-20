export type MiniToolCall = {
  id: string;
  name: string;
  args: unknown;
};

export type MiniModelDecision =
  | { kind: 'tool_calls'; calls: readonly MiniToolCall[] }
  | { kind: 'final'; value: unknown };

export type MiniTranscriptFact =
  | { kind: 'input'; value: unknown }
  | { kind: 'model'; step: number; decision: MiniModelDecision }
  | {
      kind: 'observation';
      step: number;
      toolCallId: string;
      toolName: string;
      ok: true;
      value: unknown;
    }
  | {
      kind: 'observation';
      step: number;
      toolCallId: string;
      toolName: string;
      ok: false;
      error: string;
    };

export type MiniRunEvent =
  | { type: 'run_started' }
  | { type: 'model_started'; step: number }
  | { type: 'model_completed'; step: number; decision: MiniModelDecision }
  | { type: 'tool_started'; step: number; toolCall: MiniToolCall }
  | { type: 'tool_completed'; step: number; toolCall: MiniToolCall; value: unknown }
  | { type: 'tool_failed'; step: number; toolCall: MiniToolCall; error: string }
  | { type: 'run_completed'; step: number; value: unknown }
  | { type: 'run_failed'; step: number; code: MiniFailureCode; error: string }
  | { type: 'run_cancelled'; step: number };

export type MiniFailureCode = 'model_error' | 'max_steps' | 'invalid_final';

export interface MiniModelPort {
  next(
    request: {
      input: unknown;
      transcript: readonly MiniTranscriptFact[];
      tools: readonly { name: string; description?: string }[];
      step: number;
    },
    signal?: AbortSignal,
  ): Promise<MiniModelDecision>;
}

export interface MiniTool {
  name: string;
  description?: string;
  execute(args: unknown, signal?: AbortSignal): Promise<unknown>;
}

export type MiniRunOutcome<T> =
  | {
      status: 'completed';
      value: T;
      steps: number;
      transcript: readonly MiniTranscriptFact[];
      events: readonly MiniRunEvent[];
    }
  | {
      status: 'failed';
      code: MiniFailureCode;
      error: string;
      steps: number;
      transcript: readonly MiniTranscriptFact[];
      events: readonly MiniRunEvent[];
    }
  | {
      status: 'cancelled';
      steps: number;
      transcript: readonly MiniTranscriptFact[];
      events: readonly MiniRunEvent[];
    };

export interface MiniKernelRequest<T> {
  input: unknown;
  model: MiniModelPort;
  tools?: readonly MiniTool[];
  maxSteps: number;
  validateFinal(value: unknown): value is T;
  signal?: AbortSignal;
  onEvent?: (event: MiniRunEvent) => void | Promise<void>;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runMiniKernel<T>(request: MiniKernelRequest<T>): Promise<MiniRunOutcome<T>> {
  if (!Number.isInteger(request.maxSteps) || request.maxSteps <= 0) {
    throw new Error('maxSteps must be a positive integer');
  }

  const transcript: MiniTranscriptFact[] = [{ kind: 'input', value: request.input }];
  const events: MiniRunEvent[] = [];
  const tools = new Map<string, MiniTool>();
  for (const tool of request.tools ?? []) {
    if (tools.has(tool.name)) throw new Error(`Duplicate tool: ${tool.name}`);
    tools.set(tool.name, tool);
  }
  const toolDescriptions = [...tools.values()].map(({ name, description }) => ({
    name,
    ...(description === undefined ? {} : { description }),
  }));

  const emit = async (event: MiniRunEvent): Promise<void> => {
    events.push(event);
    await request.onEvent?.(event);
  };

  const cancelled = async (step: number): Promise<MiniRunOutcome<T>> => {
    await emit({ type: 'run_cancelled', step });
    return { status: 'cancelled', steps: step, transcript, events };
  };

  const failed = async (
    step: number,
    code: MiniFailureCode,
    error: string,
  ): Promise<MiniRunOutcome<T>> => {
    await emit({ type: 'run_failed', step, code, error });
    return { status: 'failed', code, error, steps: step, transcript, events };
  };

  await emit({ type: 'run_started' });

  for (let step = 1; step <= request.maxSteps; step += 1) {
    if (request.signal?.aborted) return cancelled(step - 1);

    await emit({ type: 'model_started', step });
    let decision: MiniModelDecision;
    try {
      decision = await request.model.next(
        {
          input: request.input,
          transcript: [...transcript],
          tools: toolDescriptions,
          step,
        },
        request.signal,
      );
    } catch (error) {
      if (request.signal?.aborted) return cancelled(step);
      return failed(step, 'model_error', errorText(error));
    }

    if (request.signal?.aborted) return cancelled(step);

    transcript.push({ kind: 'model', step, decision });
    await emit({ type: 'model_completed', step, decision });

    if (decision.kind === 'final') {
      if (!request.validateFinal(decision.value)) {
        return failed(step, 'invalid_final', 'Model final result failed validation');
      }
      await emit({ type: 'run_completed', step, value: decision.value });
      return {
        status: 'completed',
        value: decision.value,
        steps: step,
        transcript,
        events,
      };
    }

    if (decision.calls.length === 0) {
      return failed(step, 'model_error', 'Model requested a tool phase without tool calls');
    }

    for (const toolCall of decision.calls) {
      if (request.signal?.aborted) return cancelled(step);
      await emit({ type: 'tool_started', step, toolCall });

      const tool = tools.get(toolCall.name);
      if (tool === undefined) {
        const error = `Tool not found: ${toolCall.name}`;
        transcript.push({
          kind: 'observation',
          step,
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          ok: false,
          error,
        });
        await emit({ type: 'tool_failed', step, toolCall, error });
        continue;
      }

      try {
        const value = await tool.execute(toolCall.args, request.signal);
        if (request.signal?.aborted) return cancelled(step);
        transcript.push({
          kind: 'observation',
          step,
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          ok: true,
          value,
        });
        await emit({ type: 'tool_completed', step, toolCall, value });
      } catch (error) {
        if (request.signal?.aborted) return cancelled(step);
        const message = errorText(error);
        transcript.push({
          kind: 'observation',
          step,
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          ok: false,
          error: message,
        });
        await emit({ type: 'tool_failed', step, toolCall, error: message });
      }
    }
  }

  return failed(request.maxSteps, 'max_steps', `Maximum model steps reached: ${request.maxSteps}`);
}
