/** v0.10.3 T-C — selected, trusted Host transport for Anthropic Messages.
 * No BUILD selection or K permit is minted here. The caller must first traverse
 * the existing selected C operation and K external-effect admission.
 */
import type { LlmGenerateResultV1 } from '../../../../../contracts/dist/llm-generate-v1.js';
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
export declare function createTrustedAnthropicMessagesClient(host: TrustedAnthropicHost): (raw: unknown, signal?: AbortSignal) => Promise<LlmGenerateResultV1>;
