# T-010 Build Host Validation Prompt

Validate the exact merged descendant of T-010 without reopening product scope or frozen technical choices.

1. Clean checkout and install canonical dependencies/lockfile.
2. Run package typecheck, test and build commands.
3. Run all Child Workflow tests, including nested child, repeated parent visit, active-child recovery, child failure, recursion defence and depth defence.
4. Force process termination at these boundaries and restart against the same SQLite file:
   - after parent Workflow Step `started`, before child frame push;
   - while child internal Step is `started`;
   - after child internal Step is `completed`, before child control advance;
   - with child frame already at successful final before parent reconciliation;
   - after parent Workflow Step terminal + child frame pop, before parent control route advance.
5. Confirm deterministic child instance identities and that completed child internal Steps never rerun.
6. Confirm successful child `workflow.output` becomes only the parent Workflow-Step output, not the child's full internal `steps` object.
7. Confirm child failure maps to `child_workflow_error` and parent `on.error` behavior.
8. Confirm no SQLite transaction spans Tool/AI/Worker execution.
9. Record exact commands, Node/npm versions, OS, logs, and exact commit SHA.
10. If environment/toolchain prevents validation, create/update a GitHub issue with exact evidence rather than changing runtime semantics.
