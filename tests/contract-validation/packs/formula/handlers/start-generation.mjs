/**
 * startGeneration — 长耗时生成作业提交（契约草案 §9.5 模式）。
 * 作业登记在业务 jobs 表（S2：流程数据进业务库，workflow 不保存 jobId）；
 * 同 promptHash 的运行中作业直接复用（幂等）；新作业将旧的运行中作业标记
 * superseded（新作业取代旧作业语义）。deadline 供 P2 超时调度器扫描。
 */
export default async function startGeneration(input, ctx, resources) {
  const { business } = resources;
  const doc = business.peek('formula.jobs', input.designId) ?? { value: { jobs: [] } };
  const jobs = doc.value.jobs;

  let hash = 0;
  for (const ch of String(input.prompt)) hash = (hash * 31 + ch.codePointAt(0)) % 1000000007;
  const promptHash = 'ph_' + hash.toString(16);

  const active = jobs.find((job) => job.status === 'running' && job.promptHash === promptHash);
  if (active !== undefined) {
    return { jobId: active.jobId, created: false, supersededCount: 0 };
  }

  let supersededCount = 0;
  const nextJobs = jobs.map((job) => {
    if (job.status === 'running') {
      supersededCount += 1;
      return { ...job, status: 'superseded' };
    }
    return job;
  });
  const jobId = 'job_gen_' + String(jobs.length + 12).padStart(3, '0');
  nextJobs.push({
    jobId,
    kind: 'image-generation',
    status: 'running',
    promptHash,
    prompt: input.prompt,
    submittedAt: ctx.now,
    deadline: ctx.plus(1800),
    commandId: input.commandId,
  });
  business.write('formula.jobs', input.designId, { jobs: nextJobs });
  return { jobId, created: true, supersededCount };
}
