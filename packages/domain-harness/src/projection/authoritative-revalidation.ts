import type {
  BusinessSnapshot,
  BusinessSnapshotPort,
  BusinessSnapshotRequest,
} from '../v2/contracts/projection.js';

export class AuthoritativeRevalidationError extends Error {
  constructor(
    readonly source: string,
    readonly key: string,
    readonly revision: string,
  ) {
    super(`Authoritative facts rejected the mutation for ${source}/${key} at revision ${revision}`);
    this.name = 'AuthoritativeRevalidationError';
  }
}

/**
 * Mutation-boundary helper: always performs a fresh read from the authoritative
 * business snapshot port before a caller-owned domain predicate is evaluated.
 * A prior ProjectionSnapshot is intentionally not accepted as input.
 */
export async function revalidateAuthoritativeSnapshot(
  port: BusinessSnapshotPort,
  request: BusinessSnapshotRequest,
  accept: (snapshot: BusinessSnapshot) => boolean | Promise<boolean>,
): Promise<BusinessSnapshot> {
  const snapshot = await port.read(request);
  if (snapshot.source !== request.source || snapshot.key !== request.key) {
    throw new Error(
      `BusinessSnapshotPort returned ${snapshot.source}/${snapshot.key} for ${request.source}/${request.key}`,
    );
  }

  if (!(await accept(snapshot))) {
    throw new AuthoritativeRevalidationError(snapshot.source, snapshot.key, snapshot.revision);
  }

  return snapshot;
}
