/** DomainHarness v0.10.3 — frozen L2, neutral, transport-only LLM DTOs.
 * Proposal is data, not an Effect permit. The physical provider is an
 * explicitly selected C module under the existing BUILD/K route authority.
 * These types intentionally remain private until T-R owns public root exports.
 */
export const LLM_GENERATE_CONTRACT_V1 = 'dh.llm.generate/1' as const;

export type LlmProviderKindV1 = 'openai-compatible' | 'anthropic-messages';
export type LlmErrorCategoryV1 =
  | 'UNAVAILABLE' | 'UNSUPPORTED_FEATURE' | 'RATE_LIMITED' | 'AUTH_DENIED'
  | 'MALFORMED_RESPONSE' | 'CONTEXT_OVERFLOW' | 'CANCELLED' | 'DEADLINE'
  | 'OUTCOME_UNKNOWN';
export type LlmFinishReasonV1 =
  | 'stop' | 'length' | 'tool_proposal' | 'content_filtered' | 'other';
export type LlmTokenUsageV1 =
  | { readonly evidenceMode: 'unavailable' }
  | { readonly evidenceMode: 'provider-reported' | 'measured';
      readonly inputTokens: number; readonly outputTokens: number };

export interface LlmGenerateRequestV1 {
  readonly contractVersion: typeof LLM_GENERATE_CONTRACT_V1;
  /** Local correlation only. Not a remote idempotency or retry grant. */
  readonly requestId: string;
  /** Host checks selected B/BUILD model identity and its trusted allowlist. */
  readonly modelId: string;
  /** Safe epoch-millisecond integer. Host enforces current time/window. */
  readonly deadlineUnixMs: number;
  readonly messages: readonly {
    readonly role: 'system' | 'user' | 'assistant';
    readonly content: string;
  }[];
  readonly maxOutputTokens: number;
  readonly outputFormat: 'text' | 'json';
  readonly temperature?: number;
  /** Ref is data only; Host must bind it to an approved schema/catalog. */
  readonly outputSchemaRef?: string;
  readonly toolCatalogRef?: string;
}

export interface LlmToolProposalV1 {
  readonly name: string;
  /** JSON object data, not an invocation and not an executable grant. */
  readonly argumentsJson: string;
}

interface LlmGenerateResultCommonV1 {
  readonly contractVersion: typeof LLM_GENERATE_CONTRACT_V1;
  readonly requestId: string;
  /** Must come from the bound Host route/model, not model text. */
  readonly providerKind: LlmProviderKindV1;
  readonly modelId: string;
  readonly providerRequestId?: string;
  readonly usage: LlmTokenUsageV1;
  readonly receiptRef?: string;
}
export type LlmGenerateResultV1 =
  | (LlmGenerateResultCommonV1 & {
      readonly status: 'completed';
      readonly text: string;
      readonly finishReason: LlmFinishReasonV1;
      readonly toolProposals?: readonly LlmToolProposalV1[];
    })
  | (LlmGenerateResultCommonV1 & {
      /** Sent call with ambiguous external outcome MUST stay 'unknown'. */
      readonly status: 'refused' | 'failed' | 'unknown';
      readonly errorCategory: LlmErrorCategoryV1;
      /** Sanitized finite Host code, never raw provider exception text. */
      readonly reasonCode: string;
    });
