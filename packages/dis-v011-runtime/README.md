# Private DIS 0.11 development consumer

This workspace is private and versioned `0.11.0-dev.0`. It composes the existing DomainHarness BUILD, public DomainApp and physical SQLite CAS store for a bounded integration probe. #1486 Runtime adoption and independent conformance remain blocked; see the [contract blocker](../../validation/dis-0.1.0/RUNTIME_CONSUMER_PROOF.md).

`selectKnowledge` accepts an explicitly trusted descriptor, closure and selection-lock pin. It checks resource bytes, Unit references and Graph identity before BUILD seals selected data in one capability module. The frozen registry references describe requested DIS operations; the executable implementation is a separate private capability whose source digest is recorded in BUILD. This mapping has not been established as the locked frozen implementation. The frozen standalone Demo runner is not an executable dependency.

`buildConsumer` supplies the selected Kernel, Standard, Business and read-only capability to the real `buildV10App`. The private boot entry `bootKdp` loads one selected assembly using public `DomainApp.load` and delegates `send` unchanged. The existing activation and selected internal Kernel own all admission, state CAS and Journal writes. The evidence reader uses the established journal key derived from the selected BUILD digest, tenant and actual effect ID. It performs reads only.

The probe evaluator executes through one sealed, local read-only capability. Its DAG processes that operation inside the K-owned turn. It has no scheduler, continuation, database connection, external adapter or direct effect dispatch. A completed local operation appears in the genuine Kernel effect Journal. The tests check absence of external permit and dispatch claim documents for the exact occurrence; they do not prove execution of the frozen provider.

The lane exercises Boot selection of a single KDP assembly backed by the existing internal Kernel implementation. The released public activation remains the loader. Independent successor KDP packaging and general-purpose SDK API coverage are outside this bounded proof. The development Package and its synthetic observations convey no production promotion authority.

Run `npm run typecheck -w @kaicreator/domain-harness-dis-v011-runtime` and `npm test -w @kaicreator/domain-harness-dis-v011-runtime` with Windows-native Node 24. See the [example](../../examples/dis-0.1.0-runtime-consumer/README.md) and [proof](../../validation/dis-0.1.0/RUNTIME_CONSUMER_PROOF.md).
