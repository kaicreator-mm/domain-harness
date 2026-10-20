# T11 R01-R2 #1209 — bounded physical failure forensics

Pinned base: 7cbfaf5ab8e21a0e2ff0e98625694132d7d21bb4. This Draft PR changes only T11 test diagnostics, NOT acceptance criteria. Real Node24 file SQLite official three consecutive Tiny/Rich packed runs remain required, including one admitted winner, typed loser and exactly one provider dispatch, one job and one K permit.

Collect run2 report-a.json / report-b.json full public-safe shape (ok/failure/steps/outcome) and child exit/stderr. If pre-K activation error, diagnose SQLite contention/Host startup and repair root cause narrowly; if test runner dropped a report, repair that writer. Never invent ADMISSION_*/K02_* code or mark failed run PASS. Re-run 3 official T11 packed scenarios, build/lint/typecheck, targeted K01 and exact-head CI. PR #1208 separately handles frozen kernel tests. Then final R01 candidate and Hidden re-pin.
