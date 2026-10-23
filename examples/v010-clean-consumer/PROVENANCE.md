# T11 App-owned module provenance

The App-owned `.mjs` files under `apps/*/modules/` are byte copies of the
accepted v0.10 sources; they live here so each App can be packed and installed
without a repository source path. `apps/rich/modules/sfeature-shadow-baseline-v1.mjs`
is the T07 physical-shadow baseline fixture. Nothing in this directory is
edited relative to its source at T11 claim time.

| Example module | Accepted source |
|---|---|
| `apps/tiny/modules/business-approval.mjs` | `examples/v08-domain-apps/business-approval.mjs` |
| `apps/tiny/modules/capability-quote-tools.mjs` | `examples/v08-domain-apps/capability-quote-tools.mjs` |
| `apps/rich/modules/business-external-jobs-v1.mjs` | `tests/assembly/fixtures-v010/business-external-jobs-v1.mjs` (C01 #1177) |
| `apps/rich/modules/business-external-b-second-v1.mjs` | `tests/assembly/fixtures-v010/business-external-b-second-v1.mjs` (C01 #1177) |
| `apps/rich/modules/business-agent-workflow-v1.mjs` | `tests/assembly/fixtures-v010/business-agent-workflow-v1.mjs` (T05 #1172) |
| `apps/rich/modules/capability-extjob-runx-v1.mjs` | `tests/assembly/fixtures-v010/capability-extjob-runx-v1.mjs` (C01 #1177) |
| `apps/rich/modules/capability-extnotify-provider-v1.mjs` | `tests/assembly/fixtures-v010/capability-extnotify-provider-v1.mjs` (C01 #1177) |
| `apps/rich/modules/capability-agent-memory-v1.mjs` | `tests/assembly/fixtures-v010/capability-agent-memory-v1.mjs` (T05 #1172) |
| `apps/rich/modules/capability-agent-tool-v1.mjs` | `tests/assembly/fixtures-v010/capability-agent-tool-v1.mjs` (T05 #1172) |
| `apps/rich/modules/kext-advisory-alpha-v1.mjs` | `tests/assembly/fixtures-v010/kext-advisory-alpha-v1.mjs` (E2/T00) |
| `apps/rich/modules/kext-advisory-beta-v1.mjs` | `tests/assembly/fixtures-v010/kext-advisory-beta-v1.mjs` (E2/T00) |
| `apps/rich/modules/sfeature-shadow-baseline-v1.mjs` | `tests/hosts/node/v010-t07-shadow-baseline-v1.mjs` (T07 #1174) |

`apps/rich/modules/business-wait-resume-v1.mjs` is the one App-owned Business
added by T11: a WAIT/RESUME policy whose resume effect uses the accepted C01
`extnotify` adapter. The selected K/S payload bytes are not copied here; the
BUILD reads them from the installed Domain Packages (`@kaicreator/domain-kernel-basic`, `-standard-basic`, `-feature-*`).

`apps/rich/candidates/` holds two non-selected Shadow L4 candidate sources
(match and deliberate difference). They are never part of the BUILD roster.
