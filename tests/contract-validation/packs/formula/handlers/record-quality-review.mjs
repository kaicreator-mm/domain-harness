/**
 * recordQualityReview — 把 Skill（design-critique）的结构化评审结果落入业务库。
 * AI 结果只有经此 Tool 才进入权威数据（produce-result-only 边界）。
 */
export default async function recordQualityReview(input, ctx, resources) {
  const { business } = resources;
  const doc = business.peek('formula.reviews', input.designId) ?? { value: { reviews: [] } };
  const reviews = doc.value.reviews;
  const reviewId = 'rev_' + String(reviews.length + 10).padStart(4, '0');
  business.write('formula.reviews', input.designId, {
    reviews: [
      ...reviews,
      {
        reviewId,
        verdict: input.review.verdict,
        score: input.review.score,
        findings: input.review.findings,
        at: ctx.now,
      },
    ],
  });
  return { recorded: true, reviewId, verdict: input.review.verdict };
}
