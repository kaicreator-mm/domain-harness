/**
 * quoteProvider — 外部履约报价（effect: none；只对事实收敛的条目调用，
 * look-to-book 纪律）。报价 TTL 来自 txn-policy（compiled domain data），
 * 短寿、绝不缓存为事实；旧 active 报价被新报价取代（expired）。
 */
export default async function quoteProvider(input, ctx, resources) {
  const { business, domainData } = resources;
  const policy = domainData['txn-policy'];
  const journey = business.peek('triphub.journey', input.journeyId);
  const item = journey === undefined ? undefined : journey.value.items.find((entry) => entry.itemId === input.itemId);
  if (item === undefined) {
    return { outcome: 'rejected', code: 'unknown_item', commandId: input.commandId };
  }
  const doc = business.peek('triphub.jobs', input.journeyId) ?? { value: { quotes: [] } };
  const quotes = doc.value.quotes.map((entry) =>
    entry.status === 'active' && entry.itemId === input.itemId ? { ...entry, status: 'expired' } : entry,
  );
  const quoteId = 'quote_' + String(quotes.length + 1).padStart(3, '0');
  const totalMinor = 45000 + quotes.length * 500;
  const expiresAt = ctx.plus(policy.quoteTtlSeconds);
  quotes.push({
    quoteId,
    itemId: input.itemId,
    status: 'active',
    totalMinor,
    currency: 'MMK',
    issuedAt: ctx.now,
    expiresAt,
  });
  business.write('triphub.jobs', input.journeyId, { quotes });
  return { outcome: 'applied', quoteId, totalMinor, currency: 'MMK', expiresAt, commandId: input.commandId };
}
