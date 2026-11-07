# Private DIS 0.11 development consumer

This workspace is private and versioned `0.11.0-dev.0`. It composes the existing DomainHarness BUILD, public DomainApp and physical SQLite CAS store for the bounded xDownload DIS 0.1.0 proof in #1486.

`selectKnowledge` accepts an explicitly trusted descriptor, closure and selection-lock pin. It checks resource bytes, Unit references, provider bindings and Graph identity before BUILD seals the reference Package's selected data in one capability module. The frozen registry references identify the DIS operations. The executable implementation is the separately identified private capability, whose actual source digest is recorded in BUILD. The frozen standalone Demo runner is not an executable dependency.

`buildConsumer` supplies the selected Kernel, Standard, Business and read-only capability to the real `buildV10App`. The private boot entry `bootKdp` loads one selected assembly using public `DomainApp.load` and delegates `send` unchanged. The existing activation and selected internal Kernel own all admission, state CAS and Journal writes. The evidence reader uses the established journal key derived from the selected BUILD digest, tenant and actual effect ID. It performs reads only.

The DIS evaluator is selected Business intelligence executed through one sealed, local read-only capability. Its DAG processes that operation inside the K-owned turn. It has no scheduler, continuation, database connection, external adapter or direct effect dispatch. A completed local operation appears in the genuine Kernel effect Journal. The tests check absence of external permit and dispatch claim documents for the exact occurrence.

The lane exercises Boot selection of a single KDP assembly backed by the existing internal Kernel implementation. The released public activation remains the loader. Independent successor KDP packaging and general-purpose SDK API coverage are outside this bounded proof. The development Package and its synthetic observations convey no production promotion authority.

Run `npm run typecheck -w @kaicreator/domain-harness-dis-v011-runtime` and `npm test -w @kaicreator/domain-harness-dis-v011-runtime` with Windows-native Node 24. See the [example](../../examples/dis-0.1.0-runtime-consumer/README.md) and [proof](../../validation/dis-0.1.0/RUNTIME_CONSUMER_PROOF.md).
