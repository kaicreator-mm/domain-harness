// Reviewed independent public contract: R75 old API inventory. Update only with approved API delta.
export const expectedClasses = {
 KernelLifecycle:['kdp-element','public','start','execute','run','[Symbol.asyncDispose]'],
 WorkflowElement:['abstract-contract','abstract','run'],
 XStateWorkflowElement:['standard-element','public','run'],
 JsonReader:['standard-element','public','read','write'],
 YamlReader:['standard-element','public','read','write'],
 NativeWorkflowContext:['execution-support','borrowed','depth','remaining','invoke','invokeOutcome','child','leaf'],
 StandardWorkflowSession:['execution-support','public','run'],
 BoundedQueryElement:['standard-element','public','select'],
 SQLiteDatabaseError:['error','public','code','stage','primaryCode','rollbackCode'],
 SQLiteDatabaseElement:['standard-element','public','select','transaction','close'],
 VectorQueryElement:['standard-element','public','search'],
 GraphQueryElement:['standard-element','public','search'],
 BoundedExpressionElement:['standard-element','public','evaluate'],
 CliElement:['standard-element','public','run'],
 InteractionElement:['standard-element','public','current','cancel','submit','run'],
};
export const expectedFunctions = ['routeWorkflowOutcome','readJson','readYaml','writeJson','writeYaml',
 'runRecognitionHandling','resolveEvidence','invalidateEvidence','selectNextDecision','prepareCandidates',
 'buildClarification','mapClarificationResponse','runInteractiveRecognitionHandling'];
export const expectedTypes = [
 'CorePackageMetadata','DomainAppContext','LifecycleInitContext','PackageInitElement','StaticCorePackage','LifecycleLogRecord','LifecycleLogger',
 'StandardWorkflowOutcome','WorkflowLimits','WorkflowRoutes','StandardJsonValue','StandardFileOutcome',
 'BoundedQueryLimits','BoundedQueryTruncationReason','BoundedQueryResult','SQLiteScalar','SQLiteNonThenable','SQLiteTransaction',
 'SQLiteDatabaseOptions','SQLiteErrorCode','SQLiteFailureOrigin','SQLiteTerminalFailureDetails','VectorCandidate','VectorQueryOptions',
 'VectorMatch','VectorQueryResult','TypedGraphEdge','GraphQueryLimits','GraphQueryOptions','GraphPath','GraphQueryResult',
 'ExpressionScalar','ExpressionLimits','InteractionCandidate','InteractionField','InteractionEvent','InteractionPrompt','InteractionPromptSpec',
 'InteractionRecord','InteractionResponse','InteractionSubmitResult','InteractionDecision','InteractionScope','EvidenceOrigin','EvidenceObservation',
 'EvidenceRequirement','EvidenceContext','EvidenceResolution','EvidenceDependency','EvidenceInvalidation','DecisionCondition',
 'DecisionDescription','DecisionSelection','CandidateEntry','CandidateSource','CandidateAssessment','CandidateProjection','CandidatePreparation',
 'ClarificationField','ClarificationPreparation','ClarificationResponse',
];
export const expectedSupport = {
 LifecycleInitContext:['appId','enter'],PackageInitElement:['start','[Symbol.asyncDispose]'],StaticCorePackage:['Init','packageMeta'],LifecycleLogger:['error'],
 WorkflowRoutes:['COMPLETE','REJECT','ASK','WAIT','UNKNOWN','FAILED'],SQLiteTransaction:['active','run','get'],
 InteractionScope:['root','signal','resolve','step'],ClarificationField:['applicable','candidates','confirmation','evidenceKey','field','projectPrefill'],
};
export const expectedFamilies={
 lifecycle:['KernelLifecycle','CorePackageMetadata','DomainAppContext','LifecycleInitContext','PackageInitElement','StaticCorePackage','LifecycleLogRecord','LifecycleLogger'],
 workflow:['WorkflowElement','XStateWorkflowElement','NativeWorkflowContext','StandardWorkflowSession','routeWorkflowOutcome','runRecognitionHandling','StandardWorkflowOutcome','WorkflowLimits','WorkflowRoutes'],
 'structured-data':['JsonReader','YamlReader','readJson','readYaml','writeJson','writeYaml','StandardJsonValue','StandardFileOutcome'],
 query:['BoundedQueryElement','BoundedQueryLimits','BoundedQueryTruncationReason','BoundedQueryResult','VectorQueryElement','VectorCandidate','VectorQueryOptions','VectorMatch','VectorQueryResult','GraphQueryElement','TypedGraphEdge','GraphQueryLimits','GraphQueryOptions','GraphPath','GraphQueryResult'],
 database:['SQLiteDatabaseElement','SQLiteDatabaseError','SQLiteScalar','SQLiteNonThenable','SQLiteTransaction','SQLiteDatabaseOptions','SQLiteErrorCode','SQLiteFailureOrigin','SQLiteTerminalFailureDetails'],
 expression:['BoundedExpressionElement','ExpressionScalar','ExpressionLimits'],
 cli:['CliElement'],
 'semantic-interaction':['InteractionElement','runInteractiveRecognitionHandling','resolveEvidence','invalidateEvidence','selectNextDecision','prepareCandidates','buildClarification','mapClarificationResponse','InteractionCandidate','InteractionField','InteractionEvent','InteractionPrompt','InteractionPromptSpec','InteractionRecord','InteractionResponse','InteractionSubmitResult','InteractionDecision','InteractionScope','EvidenceOrigin','EvidenceObservation','EvidenceRequirement','EvidenceContext','EvidenceResolution','EvidenceDependency','EvidenceInvalidation','DecisionCondition','DecisionDescription','DecisionSelection','CandidateEntry','CandidateSource','CandidateAssessment','CandidateProjection','CandidatePreparation','ClarificationField','ClarificationPreparation','ClarificationResponse'],
};
