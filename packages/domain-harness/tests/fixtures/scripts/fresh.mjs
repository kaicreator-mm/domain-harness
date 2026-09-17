let calls = 0;

export default async function execute() {
  calls += 1;
  return { calls };
}
