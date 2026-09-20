/**
 * dispatchTask — 两阶段提交的 claim 段模拟（契约草案 §3）：
 * 只有 ready 节点可 claim；running 节点重复 dispatch = 结构化 rejected
 * （dispatch_conflict 语义），绝不双跑。真实实现中 claim 在 Go 控制面
 * 锁内完成并经 sidecar 回环（[G3] 临时方案）。
 */
export default async function dispatchTask(input, ctx, resources) {
  const { business } = resources;
  const graphDoc = business.peek('tally.taskGraph', input.projectId);
  if (graphDoc === undefined) {
    return { outcome: 'rejected', code: 'unknown_project', commandId: input.commandId };
  }
  const nodes = graphDoc.value.nodes;
  const node = nodes.find((entry) => entry.taskId === input.taskId);
  if (node === undefined) {
    return { outcome: 'rejected', code: 'unknown_task', commandId: input.commandId };
  }
  if (node.status === 'running') {
    return { outcome: 'rejected', code: 'already_running', commandId: input.commandId };
  }
  if (node.status !== 'ready') {
    return { outcome: 'rejected', code: 'not_ready', commandId: input.commandId };
  }
  business.write('tally.taskGraph', input.projectId, {
    ...graphDoc.value,
    nodes: nodes.map((entry) =>
      entry.taskId === input.taskId ? { ...entry, status: 'running' } : entry,
    ),
  });
  return {
    outcome: 'applied',
    commandId: input.commandId,
    taskId: input.taskId,
    runId: 'run_' + input.commandId,
  };
}
