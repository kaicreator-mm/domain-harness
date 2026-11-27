import type { StandardJsonValue as J } from './standard-files.js';
import type { ModelUsage } from './workflow-managed-contract.js';
/** 可信调用方显式声明协议、模型、认证来源、能力和有限传输上限。
 * @dhKind type
 * @dhCapability workflow
 */
export interface ModelProfile {
  readonly id: string; readonly protocol: 'openai-chat' | 'anthropic-messages';
  readonly endpoint: string; readonly model: string; readonly credential: () => string | Promise<string>;
  readonly tokenField?: 'max_tokens' | 'max_completion_tokens'; readonly anthropicVersion?: string;
  readonly features: Readonly<{ tools: boolean; jsonSchema: boolean; toolsWithJsonSchema: boolean }>;
  readonly limits: Readonly<{ requestBytes: number; responseBytes: number; maxOutputTokens: number; timeoutMs: number }>;
}
/** 模型可提出的工具描述，不是执行注册表。
 * @dhKind type
 * @dhCapability workflow
 */
export interface ModelToolDescription { readonly name: string; readonly description: string; readonly inputSchema: J }
/** 真实模型响应中的有限工具候选。
 * @dhKind type
 * @dhCapability workflow
 */
export interface ModelToolCall { readonly id: string; readonly name: string; readonly input: J }
/** 调用方实际执行后提供的结果，与原始工具 ID 对应。
 * @dhKind type
 * @dhCapability workflow
 */
export interface ModelToolResult { readonly callId: string; readonly value: J; readonly error: boolean }
/** SDK 已接纳的一轮模型结果，不等价于业务授权。
 * @dhKind type
 * @dhCapability workflow
 */
export interface ModelTurn {
  readonly requestId: string; readonly attempt: number; readonly text: string;
  readonly json?: J; readonly calls: readonly ModelToolCall[]; readonly usage: ModelUsage;
}
/** 单轮请求；显式续接、重试或 fallback，不自动执行工具。
 * @dhKind type
 * @dhCapability workflow
 */
export interface ModelRequest {
  readonly system: string;
  readonly input: readonly (Readonly<{ role: 'user'; text: string }>
    | Readonly<{ role: 'assistant'; turn: ModelTurn }>
    | Readonly<{ role: 'tool-results'; results: readonly ModelToolResult[] }>)[];
  readonly tools: readonly ModelToolDescription[];
  readonly output: Readonly<{ kind: 'text' } | { kind: 'json'; strict: false } | { kind: 'json'; strict: true; schema: J }>;
  readonly maxOutputTokens: number; readonly requestKey: string;
  readonly action: 'initial' | 'retry' | 'fallback' | 'continue'; readonly reason: string;
}
