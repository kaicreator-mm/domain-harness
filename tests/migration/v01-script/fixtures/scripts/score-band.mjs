export default async function execute(input) {
  const normalized = input.values.map((value, index) =>
    Number((value * input.scale + input.offset + index * 0.1).toFixed(2)),
  );
  const sum = Number(normalized.reduce((total, value) => total + value, 0).toFixed(2));
  const checksum = normalized.reduce(
    (total, value, index) => total + Math.round(value * 100) * (index + 1),
    0,
  );
  return {
    normalized,
    sum,
    checksum,
    decision: sum >= input.reviewAt ? 'review' : 'auto',
  };
}
