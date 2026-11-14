# B06-03 / R49 — real HTTP concurrency and stopped KDP ingress

**CI_PENDING.** Independently committed third round. Previous R47/R48 tests/Blobs are unchanged in this full-suite source.

Six actual concurrent HTTP Chat/Form requests use the real AOT-selected xDownload Interaction and must retain their own `requestId`, URL, byte declaration and `channel`. The response is typed `OBSERVATION/NONE` with `READY_FOR_KDP` and no Effect. A missing confirmation stays `AWAITING_CONFIRMATION`; stopping native SDK ingress yields HTTP 503 `DIS_APP_NOT_READY` and does not dispatch an Effect.

This covers actual in-process network transport/lifecycle on the CI OS, not cross-machine deployment, persistent Domain state, independent SAP acceptance, production authentication or physical download effects. [Machine round](round.json) and receipt are final-SHA CI bound.
