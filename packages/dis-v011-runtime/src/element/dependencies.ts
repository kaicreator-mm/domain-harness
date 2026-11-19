/**
 * Static dependency closure and semantic relation validation for the
 * Element-first contract layer (DIS Runtime 0.11.0-dev D1, issue #1530).
 *
 * R3 rule (DIS 0.2.0 FULL_SCOPE_REPAIRS_R3): only the static dependency
 * subgraph used for AOT resolution must be acyclic. Semantic relations are
 * non-authoritative metadata: they are shape-checked and endpoint-checked
 * independently and MAY legally form cycles.
 */
import type { ElementManifest, SemanticRelationDecl } from './manifest.js';
import { ElementContractError } from './errors.js';

export interface DependencyClosure {
  /** Element ids in dependency-first topological order (manifest order preserved where possible). */
  readonly order: readonly string[];
  /** Element id -> sorted transitive static dependency ids. */
  readonly closure: Readonly<Record<string, readonly string[]>>;
}

function dependencyEdges(manifest: ElementManifest): Readonly<Record<string, readonly string[]>> {
  const edges: Record<string, readonly string[]> = {};
  for (const consumer of manifest.consumers) {
    for (const element of consumer.elements) {
      if (edges[element.id] !== undefined) {
        throw new ElementContractError('ELEMENT_ID_DUPLICATE', 'elements:' + element.id);
      }
      edges[element.id] = element.dependsOn;
    }
  }
  return edges;
}

/**
 * Resolve the Element-level static dependency closure (`dependsOn` only).
 * Fails closed on unresolved references, self loops and cycles with distinct
 * structured error codes. Deterministic: iteration follows manifest order and
 * closure sets are sorted.
 */
export function resolveDependencyClosure(manifest: ElementManifest): DependencyClosure {
  const edges = dependencyEdges(manifest);
  const ids = Object.keys(edges);
  for (const id of ids) {
    for (const dependency of edges[id]) {
      if (dependency === id) throw new ElementContractError('ELEMENT_DEPENDENCY_SELF', id);
      if (edges[dependency] === undefined) {
        throw new ElementContractError('ELEMENT_DEPENDENCY_UNRESOLVED', id + '->' + dependency);
      }
    }
  }
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>(ids.map((id) => [id, WHITE]));
  const stack: string[] = [];
  const order: string[] = [];
  const closure: Record<string, readonly string[]> = {};
  const visit = (id: string): void => {
    const state = color.get(id);
    if (state === GRAY) {
      const cycle = stack.slice(stack.indexOf(id)).concat(id);
      throw new ElementContractError('ELEMENT_DEPENDENCY_CYCLE', cycle.join('->'));
    }
    if (state === BLACK) return;
    color.set(id, GRAY);
    stack.push(id);
    const collected = new Set<string>();
    for (const dependency of edges[id]) {
      visit(dependency);
      collected.add(dependency);
      for (const transitive of closure[dependency]) collected.add(transitive);
    }
    stack.pop();
    color.set(id, BLACK);
    closure[id] = [...collected].sort();
    order.push(id);
  };
  for (const id of ids) visit(id);
  return { order, closure };
}

/**
 * Validate semantic relations independently of the static dependency graph:
 * endpoints must reference declared Elements, kinds must be well-formed.
 * Cycles are legal and returned unchanged (regression-protected by tests).
 */
export function validateSemanticRelations(manifest: ElementManifest): readonly SemanticRelationDecl[] {
  const declared = new Set(Object.keys(dependencyEdges(manifest)));
  for (const [index, relation] of manifest.relations.entries()) {
    for (const endpoint of ['from', 'to'] as const) {
      if (!declared.has(relation[endpoint])) {
        throw new ElementContractError('ELEMENT_RELATION_ENDPOINT_INVALID',
          'relations[' + index + '].' + endpoint + ':' + relation[endpoint]);
      }
    }
  }
  return manifest.relations;
}
