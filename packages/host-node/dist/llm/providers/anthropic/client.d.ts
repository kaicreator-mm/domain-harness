import type { LlmGenerateResultV1 } from '@kaicreator/domain-harness-contracts';
export type AnthropicToolDefinition = Readonly<{
    name: string;
    description: string;
    input_schema: Readonly<{
        type: 'object';
        properties?: Record<string, unknown>;
        required?: readonly string[];
    }>;
}>;
export type TrustedAnthropicHost = Readonly<{
    modelId: string;
    apiKey: string;
    /** The production endpoint is fixed; loopback is solely for a controlled fake endpoint. */
    endpoint?: string;
    allowLoopbackForTest?: boolean;
    now: () => number;
    fetchTransport: typeof fetch;
    assertRequest: (value: unknown) => void;
    assertResult: (value: unknown) => void;
    /** Only Host-approved catalogs may become native Messages tools. */
    resolveTools?: (ref: string) => readonly AnthropicToolDefinition[] | undefined;
    maxDeadlineWindowMs?: number;
}>;
/** Minimal Messages surface the trusted Host may bind; the official SDK satisfies it. */
export interface AnthropicMessagesSDK {
    readonly messages: {
        readonly create: (body: Record<string, unknown>, options: {
            readonly signal: AbortSignal;
            readonly timeout: number;
        }) => Promise<unknown>;
    };
}
export interface AnthropicMessagesSDKConstructor {
    new (options: {
        apiKey: string;
        baseURL: string;
        maxRetries: number;
        timeout: number;
        fetch: typeof fetch;
    }): AnthropicMessagesSDK;
}
export declare function createTrustedAnthropicMessagesClient(SDK: AnthropicMessagesSDKConstructor, host: TrustedAnthropicHost): (raw: unknown, signal?: AbortSignal) => Promise<LlmGenerateResultV1>;
