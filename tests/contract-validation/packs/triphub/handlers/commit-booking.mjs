/**
 * commitBooking — 高影响交易（invariant #1：零 LLM；PRD：确认后才提交）。
 * 事务内重校验：报价存在、未消费、未过期（deadline 重校验，§16）；
 * 提交后 item state → booked，报价 consumed。
 * 注意：模拟实现以 quoteId 状态机保证『最多一次商业效果』；真实实现的
 * provider 侧幂等键缺口见契约草案 §3（[L2-4] 前以 payload commandId 兜底）。
 */
export default async function commitBooking(input, ctx, resources) {
  const { business } = resources;
  const jobsDoc = business.peek('triphub.jobs', input.journeyId);
  const quotes = jobsDoc === undefined ? [] : jobsDoc.value.quotes;
  const quote = quotes.find((entry) => entry.quoteId === input.quoteId);
  if (quote === undefined) {
    return { outcome: 'rejected', code: 'unknown_quote', commandId: input.commandId };
  }
  if (quote.status === 'consumed') {
    return { outcome: 'rejected', code: 'already_committed', commandId: input.commandId };
  }
  if (quote.status === 'expired' || Date.parse(ctx.now) > Date.parse(quote.expiresAt)) {
    business.write('triphub.jobs', input.journeyId, {
      quotes: quotes.map((entry) => (entry.quoteId === input.quoteId ? { ...entry, status: 'expired' } : entry)),
    });
    return { outcome: 'rejected', code: 'quote_expired', commandId: input.commandId };
  }

  const bookingsDoc = business.peek('triphub.bookings', input.journeyId) ?? { value: { bookings: [] } };
  const bookingId = 'bk_' + String(bookingsDoc.value.bookings.length + 1).padStart(3, '0');
  business.write('triphub.bookings', input.journeyId, {
    bookings: [
      ...bookingsDoc.value.bookings,
      {
        bookingId,
        itemId: quote.itemId,
        quoteId: quote.quoteId,
        status: 'committed',
        providerRef: 'liteapi-sim-' + quote.quoteId,
        totalMinor: quote.totalMinor,
        currency: quote.currency,
        committedAt: ctx.now,
      },
    ],
  });
  business.write('triphub.jobs', input.journeyId, {
    quotes: quotes.map((entry) => (entry.quoteId === input.quoteId ? { ...entry, status: 'consumed' } : entry)),
  });
  const journey = business.peek('triphub.journey', input.journeyId);
  business.write('triphub.journey', input.journeyId, {
    ...journey.value,
    items: journey.value.items.map((entry) =>
      entry.itemId === quote.itemId ? { ...entry, state: 'booked' } : entry,
    ),
  });
  return {
    outcome: 'applied',
    bookingId,
    providerRef: 'liteapi-sim-' + quote.quoteId,
    totalMinor: quote.totalMinor,
    currency: quote.currency,
    commandId: input.commandId,
  };
}
