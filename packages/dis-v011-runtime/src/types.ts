export type ObjectData = Record<string, unknown>;
export type UnitRef = { id: string; revision: string; path: string };
export type GraphEdge =
  | { kind: 'control'; from: string; to: string; when?: { path: string; operator: string; value: unknown } }
  | { kind: 'data'; from: { node: string; pointer: string }; to: { node: string; pointer: string } }
  | { kind: 'evidence'; from: { node: string; pointer: string }; to: { node: string; slot: string } };
export interface Graph {
  schemaVersion: string;
  id: string;
  revision: string;
  inputSchemaRef: string;
  outputSchemaRef: string;
  entryNode: string;
  terminalNodes: string[];
  cyclePolicy: string;
  nodes: { nodeId: string; unitRef: Omit<UnitRef, 'path'> }[];
  edges: GraphEdge[];
}
export interface Unit {
  id: string;
  revision: string;
  role: string;
  implementation: { ref: string; artifactRef: string; candidates?: { candidateId: string; ref: string; artifactRef: string; artifactDigest: string; target: string; contractDigest: string }[] };
  capabilities?: { provides: { capabilityId: string; owner: string; authorityRef: string; version: string; contractDigest: string }[] };
  evidence?: { consumes?: string[] };
  failure: { handling: Record<string, { action: string }> };
  input: { schemaRef: string };
  output: { schemaRef: string };
  knowledgeRefs?: { id: string; revision: string; kind: string; path: string; sha256: string }[];
}
export interface Selection {
  providerArtifact?: { path: string; sha256: string; target: string };
  strategyKnowledge?: NonNullable<Unit['knowledgeRefs']>[number];
  packageId: string;
  revision: string;
  closureSha256: string;
  lockSha256: string;
  graphSha256: string;
  graph: Graph;
  unitRefs: Record<string, UnitRef & { sha256: string }>;
  units: Record<string, Unit>;
  providers: Record<string, string>;
  resources: Record<string, string>;
  signatures: { patterns: { playerId: string; markers: string[] }[] };
  strategies: { strategies: Record<string, string> };
}
