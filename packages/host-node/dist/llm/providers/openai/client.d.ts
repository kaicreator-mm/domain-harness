import type { LlmGenerateResultV1 } from '../../../../../contracts/dist/llm-generate-v1.js';
export interface OpenAISDK {
    readonly chat: {
        readonly completions: {
            create(body: Record<string, unknown>, options: {
                readonly signal: AbortSignal;
                readonly maxRetries: number;
                readonly timeout: number;
            }): Promise<unknown>;
        };
    };
}
export interface OpenAISDKConstructor {
    new (options: {
        apiKey: string;
        baseURL: string;
        maxRetries: number;
        timeout: number;
        fetch: typeof fetch;
    }): OpenAISDK;
}
export interface OpenAIHostPolicy {
    readonly baseURL: string;
    readonly apiKey: string;
    readonly modelId: string;
    readonly maxDeadlineMs: number;
    /** Explicit test/local deployment permission, never inferred from prompt. */
    readonly allowLoopbackHttp?: boolean;
    readonly toolCatalog?: {
        readonly ref: string;
        readonly functions: readonly {
            readonly name: string;
            readonly description: string;
            readonly parameters: Readonly<Record<string, unknown>>;
        }[];
    };
}
export declare const OPENAI_REASON_CODES: readonly string[];
export declare function createOpenAIHostClient(SDK: OpenAISDKConstructor, inputPolicy: OpenAIHostPolicy): Readonly<{
    generate: (value: unknown, hostSignal?: AbortSignal) => Promise<LlmGenerateResultV1>;
    cancel: (id: string) => boolean;
}>;
