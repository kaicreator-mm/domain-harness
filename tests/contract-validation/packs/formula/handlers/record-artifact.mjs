/**
 * recordArtifact — 作业回流登记（契约草案 §2 generation.recording）。
 * 事务内核对 jobs 表：jobId 是否仍是当前作业；过期/被取代回调以结构化
 * rejected 返回（不毒化实例）；产物按内容寻址冻结进 artifacts。
 */
export default async function recordArtifact(input, ctx, resources) {
  const { business } = resources;
  const jobsDoc = business.peek('formula.jobs', input.designId);
  const jobs = jobsDoc === undefined ? [] : jobsDoc.value.jobs;
  const job = jobs.find((entry) => entry.jobId === input.jobId);

  if (job === undefined) {
    return { outcome: 'rejected', code: 'unknown_job', commandId: input.commandId };
  }
  if (job.status === 'superseded') {
    return { outcome: 'rejected', code: 'superseded_job', commandId: input.commandId };
  }
  if (job.status === 'done') {
    return { outcome: 'rejected', code: 'already_recorded', commandId: input.commandId };
  }

  const artifactsDoc = business.peek('formula.artifacts', input.designId) ?? { value: { artifacts: [] } };
  const artifacts = artifactsDoc.value.artifacts;
  const artifactId = 'art_' + String(artifacts.length + 1).padStart(4, '0');

  business.write('formula.artifacts', input.designId, {
    artifacts: [
      ...artifacts,
      {
        artifactId,
        frozenHash: input.artifact.contentHash,
        format: input.artifact.format,
        createdAt: ctx.now,
        jobId: input.jobId,
      },
    ],
  });
  business.write('formula.jobs', input.designId, {
    jobs: jobs.map((entry) =>
      entry.jobId === input.jobId ? { ...entry, status: 'done', finishedAt: ctx.now } : entry,
    ),
  });
  return { outcome: 'applied', artifactId, commandId: input.commandId };
}
