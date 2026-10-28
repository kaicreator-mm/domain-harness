globalThis.__v0103ProviderEvals = (globalThis.__v0103ProviderEvals || 0) + 1;
export function reserve(payload) {
  globalThis.__v0103ProviderCalls = (globalThis.__v0103ProviderCalls || 0) + 1;
  return Object.freeze({ reserved: true, ledgerEntryId: 'verified-ledger', reservedAmount: payload.amount });
}
