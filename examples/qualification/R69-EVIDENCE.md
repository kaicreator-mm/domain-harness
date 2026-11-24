# R69 · R68 corrections / author-side actual verification
Review base ec234792e49528169b70d73b991c3bb21f9b4a3f. All changed source/config blob hashes below were computed locally and matched on GitHub creation. Existing SDK (R63 actual installed dependency bytes, R67 qualified tarball) unchanged. This is a scoped correction candidate, not independent acceptance.
## P1 targeted changes
- 01: explicit MP4 major-brand allowlist, reject MOV disguised as .mp4, strict source decode and conversion -xerror, duration consistency within one frame + tolerance, pixel rounding check; non-square SAR/rotation unsupported -> UNKNOWN rather than incorrect result. Actual 65% truncated faststart MP4 and MOV fixture, wide image and staging cleanup. No claim general MP4 format/geometry coverage.
- 02: independent HTTP readback by authorized tenant, durable metadata/tenant/hash/revision/derivative and actual bytes; same content registered for separate tenant; readback after deleting stage and restarting Host without write approval. Copy and verify both files in exclusively owned temporary dir before rename; predictable second-file failure leaves no visible record or partial pair. No delete of another owner's published files. DB and filesystem not atomic together; published matching pair with missing row may be recovered on re-submission with stage. No full crash recovery/remote production authorization claim.
- 03: explicit order/stage facts, machine mapping, two orders and three required phases/dependencies, unknown/missing vs contradiction, policy bounds/keys/slots. Independent TS oracle handles input permutation. Graph impact is deterministic first inspection downstream, not global downtime impact.
- 04: fixed business minimum calls4/steps8/depth2 prechecked before solver; 3 calls and 7 steps return WORKSHOP_TOTAL_BUDGET, solver count unchanged. SDK per-invocation budget unchanged.
- 05: Linux process group kill, destroy pipes, bounded 250ms reap fallback, safe CLI_EXIT_<code>, direct process reaped in witness. Actual descendant inherits pipes; 200ms configured timeout, assertion <900ms, direct PID ESRCH and descendant marker absent after 1400ms. Non-Linux direct-child fallback only; no arbitrary escaped process group guarantee/Windows witness.
- 06: two independent npm manifests and TS configs with shared module explicitly ESM, root aggregate only. Actual isolated separate retained dependency trees; NODE_PATH/NODE_OPTIONS unset; require.resolve sharp/ffmpeg/ffprobe MODULE_NOT_FOUND for workshop; actual workshop run with PATH=/nonexistent and explicit Node/Python absolute paths passed. Not a fresh registry install. Initial split exposed shared TS interpreted as CJS; fixed by shared/package.json, then both strict compiler and runtime passed.
## P2 dispositions
01 improved safe expected error codes/stages and CLI exit codes; still no raw stderr exposure and not every fault differentiated. 02 independent permutation oracle, H8 infeasible, invalid returned start schedules, nonoptimal and solver timeout; trusted solver optimality contract with only tested instances independently proved. 03 pixel-rounding geometry, explicit unsupported video geometry, independent storage ceiling; wider geometry and media codecs not claimed. 04 current independent manifest and replay guidance; fresh lock/installation remains UNKNOWN (offline attempt ENOTCACHED for @types/node). No fabricated lock, no root CI claim. Reviewer must adjudicate remaining gaps.
## Exact run evidence
Local Debian13 x64 Node22.16.0 with prior retained SDK and existing toolchain (Sharp/libvips, FFmpeg, Python SciPy). Separate isolated dirs, strict TS skipLibCheck:false. Environment unset NODE_PATH/NODE_OPTIONS. Media EXIT0, workshop EXIT0, workshop without media CLI PATH EXIT0. Actual output files and SHA256:
- R69-media.stdout.txt c78462cf4ff98e48cff4dd4ce9af06c2ca597674189fecba634874e01b12d757
- R69-workshop.stdout.txt 4f74f46cd99237672e6c339e14b3177abfd20c22ed9d1610818ced13b1269cf2
- R69-workshop-no-media-tools.stdout.txt bddc71f4c50315609e888489538d3ec6eb8d5aefe542590f89922709c7399de2
- R69-isolation.stdout.txt 965aa3ec26179abc6add7ab3cbc710b42101396bc2a6e23225ef9a5644374680
Offline lock probe EXIT1: npm error code ENOTCACHED, request to registry.npmjs.org/@types%2fnode failed: cache mode is only-if-cached but no cached response is available. No CI or Windows execution. Root CI path excludes these example-only changes. R67B historic evidence remains separate.
## Source/config blobs
shared/cli.ts 0aa119ca73822f2dc5e5d991a1f1af425ed78586
shared/package.json f9ec9b62f616f5c61144ef14c6cbbb1f8454f745
workshop/plan.ts e56977c05661ce920a605f0043a0c3c76bcf11aa
workshop/verify.ts 31dd3f6e6c097301aecfcabb0e1b08a8caedb3ef
workshop/package.json 9ccdd0d344f3faee89affa535ddb0b262528bfde
workshop/tsconfig.json 1c605ef5a3a447f88d4c2a19b0510a6f49160e91
media-archive/media.ts 53859eb7e38fee748dc3ef0b86f94810ae820e4c
media-archive/archive.ts 2f28a80a1cf57b8609459373671753cedc842b8e
media-archive/catalog.ts fb648d835293cd73787ab8b7a68a10a699a862fc
media-archive/client.ts e918a0e4540c8b5410e1d747a977a2c8ee6a022b
media-archive/host.ts 8553d2342d40d930ec4bd0254a4838c2816e602b
media-archive/verify.ts 4101e9bbf138f17c9ac605c3043433bf8cf6d51c
media-archive/package.json f7588bfeef6cfc53d68025ce6b650dc812d7fb57
media-archive/tsconfig.json 1c605ef5a3a447f88d4c2a19b0510a6f49160e91
package.json a9bfcb23964f4eda1067642e5a33d612cf69656f
Unchanged solver.py 05fedb63670e007eec7cd0a443c88dbd4f920aae; requirements.txt 871c966c09f89af68c058514f0f7ecce9f1578d3.
