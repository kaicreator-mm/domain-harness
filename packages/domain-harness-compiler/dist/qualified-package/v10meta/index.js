/**
 * v0.10 T09 (#1178) — Host-owned recurring proposal-only Meta Feedback
 * Workflow. Deliberately separate from `v10build/activation.ts` and the
 * T07 Shadow / T06 DecisionEvidence modules: this surface only composes
 * their durable outputs through the real selected App facade.
 */
export { MAX_META_EVIDENCE_KEYS, MAX_META_RECORD_CHARS, MAX_META_ROUNDS, META_FEEDBACK_ABI, META_FEEDBACK_CLAIM_KIND, META_FEEDBACK_CLAIM_PREFIX, META_FEEDBACK_CLAIM_STATE, META_FEEDBACK_EVIDENCE_KEY_PREFIX, META_FEEDBACK_LEDGER_KIND, META_FEEDBACK_LEDGER_PREFIX, META_FEEDBACK_LEDGER_STATE, MetaFeedbackError, metaFeedbackClaimKey, metaFeedbackEvidencePrefix, metaFeedbackLedgerKey, runMetaFeedbackWorkflow, } from './meta-feedback-workflow.js';
