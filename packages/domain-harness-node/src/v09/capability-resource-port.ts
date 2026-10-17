/**
 * v0.9 N02 (#1028) — capability-owned physical storage / resource port.
 * ===========================================================================
 *
 * The minimal REAL resource surface a selected Capability receives from the
 * first-cohort Node Host (L2 Freeze §11 D01: C packages access selected
 * physical Host facilities through authenticated protected ports, not
 * unpinned `node:fs` imports). This module is the physical owner of those
 * calls: open / write / read / close against real filesystem handles, with
 * HOLDER-SIDE disposal — the granting `V09CapabilityResourceSpace` tracks
 * every live OS handle it handed out and can dispose all of them; a disposed
 * or closed handle fails typed afterwards, and a closed file is physically
 * reusable (no leaked descriptor keeps the path locked).
 *
 * Typed failure contract (no false ACK):
 *   - open failures (missing directory, unwritable path, ...) are typed
 *     `resource_unavailable` — the resource did NOT open and nothing was
 *     created through this port;
 *   - use after close/disposal is typed `resource_closed`;
 *   - close() is idempotent and only reports success when the OS handle is
 *     actually released;
 *   - appendBytes treats a short write as INCOMPLETE, never as success: the
 *     not-yet-confirmed suffix is rewritten at its remaining offset (bounded
 *     attempts; the handle is O_APPEND, so this preserves append order), and
 *     an append that cannot be completed is typed `resource_error` with
 *     `indeterminate=true` because a prefix may already have landed;
 *   - readBytes returns ONLY bytes the driver confirmed reading: verified
 *     reads are accumulated until the stat'ed snapshot is filled, and a
 *     0-byte read (EOF, e.g. concurrent truncation) yields the verified
 *     prefix — uninitialized memory is never exposed as file content;
 *   - disposeAll is best-effort: every granted handle's close is attempted
 *     even after earlier closes fail, and all failures are aggregated into
 *     ONE typed `resource_error` (an `AggregateError` cause carries each raw
 *     close failure);
 *   - failures carry `cause` with the raw driver error; unclassifiable
 *     failures are typed `resource_error` without guessing whether any bytes
 *     landed (the caller must read back through the same handle to decide).
 *
 * Authority modeling (WHO may call open/dispose — principal/permit checks) is
 * protected H governance owned by #1032/#1036; this port is deliberately
 * physical only.
 */

import { open } from 'node:fs/promises';

export type V09ResourceErrorCode =
  | 'path_malformed'
  | 'resource_unavailable'
  | 'resource_closed'
  | 'resource_error';

/**
 * Typed physical resource failure. `indeterminate` is true ONLY for
 * `resource_error` outcomes where the landed physical state (e.g. whether a
 * partially written byte range reached the file) cannot be classified — the
 * holder must read back through the handle instead of assuming.
 */
export class V09ResourceError extends Error {
  readonly code: V09ResourceErrorCode;
  readonly path: string;
  readonly indeterminate: boolean;

  constructor(code: V09ResourceErrorCode, path: string, message: string, cause?: unknown) {
    super(message);
    this.name = 'V09ResourceError';
    this.code = code;
    this.path = path;
    this.indeterminate = code === 'resource_error';
    if (cause !== undefined) this.cause = cause;
  }
}

export function isV09ResourceError(error: unknown): error is V09ResourceError {
  return error instanceof V09ResourceError;
}

const OPEN_UNAVAILABLE_FS_CODES = new Set(['ENOENT', 'EACCES', 'EPERM', 'ENOTDIR', 'EISDIR', 'EMFILE', 'ENFILE', 'ENOSPC', 'EROFS', 'EBUSY', 'ELOOP', 'ENAMETOOLONG']);

/**
 * Upper bound on the write calls one `appendBytes` may spend completing the
 * append (short-write completion is bounded — it terminates instead of
 * spinning on a driver that never confirms progress).
 */
const MAX_APPEND_WRITE_ATTEMPTS = 8;

/**
 * The minimal FileHandle-shaped surface this port physically uses. A real
 * `node:fs/promises` FileHandle satisfies it structurally; tests inject
 * instrumented fakes through {@link V09PhysicalFileOpener} to control
 * write/read/close receipts and failures deterministically (no sleeps, no
 * timing dependencies).
 */
export interface V09PhysicalFileHandle {
  write(
    buffer: Uint8Array,
    offset?: number | null,
    length?: number | null,
    position?: number | null,
  ): Promise<{ bytesWritten: number }>;
  read(
    buffer: Uint8Array,
    offset?: number | null,
    length?: number | null,
    position?: number | null,
  ): Promise<{ bytesRead: number }>;
  stat(): Promise<{ size: number }>;
  close(): Promise<void>;
}

/** Opens the physical handle behind a granted resource (the test seam). */
export type V09PhysicalFileOpener = (path: string, flags: string) => Promise<V09PhysicalFileHandle>;

const openPhysicalFile: V09PhysicalFileOpener = (path, flags) => open(path, flags);

/** One live grant: the OS handle plus the liveness flag both close paths share. */
interface GrantedResource {
  readonly path: string;
  readonly handle: V09PhysicalFileHandle;
  live: boolean;
}

/** One capability-owned physical file resource handle. */
export interface V09OwnedResourceHandle {
  /** The real filesystem path this handle writes/reads. */
  readonly path: string;
  /** Append bytes at the physical end of file (O_APPEND write — a real syscall per call). */
  appendBytes(bytes: Uint8Array): Promise<void>;
  /** Read the current physical file content (snapshot from position 0). */
  readBytes(): Promise<Uint8Array>;
  /** Release the OS handle. Idempotent; later operations fail typed `resource_closed`. */
  close(): Promise<void>;
}

/** The physical resource port a selected Capability is granted. */
export interface V09CapabilityResourcePort {
  openResource(path: string): Promise<V09OwnedResourceHandle>;
}

/**
 * Holder-side owner of capability resources: every opened FileHandle is
 * tracked so the holder (protected Host / capability runtime owner) can
 * dispose all granted resources — e.g. on teardown/revocation — without
 * depending on each capability handle closing itself cooperatively.
 */
export class V09CapabilityResourceSpace implements V09CapabilityResourcePort {
  readonly #granted = new Set<GrantedResource>();
  readonly #open: V09PhysicalFileOpener;

  /**
   * `openFile` is the physical handle opener; the default opens a real OS
   * file via `node:fs/promises`. Tests inject an opener returning
   * instrumented FileHandle-shaped fakes to exercise short I/O and failing
   * closes deterministically.
   */
  constructor(openFile: V09PhysicalFileOpener = openPhysicalFile) {
    this.#open = openFile;
  }

  /** Number of currently live (granted and not yet closed/disposed) handles. */
  get grantedHandleCount(): number {
    return this.#granted.size;
  }

  async openResource(path: string): Promise<V09OwnedResourceHandle> {
    if (typeof path !== 'string' || path.length === 0) {
      throw new V09ResourceError('path_malformed', String(path), 'resource paths must be non-empty strings');
    }
    let handle: V09PhysicalFileHandle;
    try {
      // 'a+' : create if absent, reads allowed, writes append at physical EOF.
      handle = await this.#open(path, 'a+');
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      if (typeof code === 'string' && OPEN_UNAVAILABLE_FS_CODES.has(code)) {
        throw new V09ResourceError(
          'resource_unavailable',
          path,
          `the resource at ${path} did not open (${code}); nothing was created or written through this port`,
          error,
        );
      }
      throw new V09ResourceError(
        'resource_error',
        path,
        `opening ${path} failed with an unclassified error; no resource was granted and the physical outcome must not be assumed (${String(error instanceof Error ? error.message : error)})`,
        error,
      );
    }
    const granted: GrantedResource = { path, handle, live: true };
    this.#granted.add(granted);
    const markClosed = (): void => {
      granted.live = false;
      this.#granted.delete(granted);
    };
    return {
      path,
      appendBytes: async (bytes: Uint8Array): Promise<void> => {
        if (!granted.live) {
          throw new V09ResourceError('resource_closed', path, `the resource at ${path} is closed; reopen it to continue`);
        }
        if (bytes.length === 0) return; // appending nothing is trivially complete
        // A short write NEVER resolves as success: the not-yet-confirmed
        // suffix (remaining offset) is rewritten — the handle is O_APPEND, so
        // each write lands at the physical end of file and append order is
        // preserved — under a bounded attempt count.
        let written = 0;
        try {
          for (let attempt = 0; written < bytes.length; attempt += 1) {
            if (attempt >= MAX_APPEND_WRITE_ATTEMPTS) {
              throw new V09ResourceError(
                'resource_error',
                path,
                `appending ${String(bytes.length)} byte(s) to ${path} did not complete after ${String(MAX_APPEND_WRITE_ATTEMPTS)} bounded write attempts; the first ${String(written)} byte(s) may have landed and the physical content must be read back, not assumed`,
              );
            }
            const { bytesWritten } = await handle.write(bytes, written, bytes.length - written);
            if (!Number.isInteger(bytesWritten) || bytesWritten < 0) {
              throw new V09ResourceError(
                'resource_error',
                path,
                `the driver reported an invalid write receipt for ${path} (${String(bytesWritten)}); whether any bytes landed is UNKNOWN and must be read back, not assumed`,
              );
            }
            written += bytesWritten; // 0 counts as a progress-less attempt; the bound ends the loop
          }
        } catch (error) {
          if (error instanceof V09ResourceError) throw error;
          throw new V09ResourceError(
            'resource_error',
            path,
            `writing ${String(bytes.length)} byte(s) to ${path} failed; whether any bytes landed is UNKNOWN and must be read back, not assumed (${String(error instanceof Error ? error.message : error)})`,
            error,
          );
        }
      },
      readBytes: async (): Promise<Uint8Array> => {
        if (!granted.live) {
          throw new V09ResourceError('resource_closed', path, `the resource at ${path} is closed; reopen it to continue`);
        }
        try {
          // Snapshot policy: stat for the current physical size, then
          // accumulate VERIFIED reads from position 0 until the snapshot is
          // filled. A read returning 0 bytes is EOF (e.g. concurrent
          // truncation): the snapshot is the verified prefix actually read.
          // Short reads are never trusted and uninitialized memory is never
          // exposed as file content; at most the stat'ed size is returned
          // (post-stat growth stays outside this snapshot).
          const size = (await handle.stat()).size;
          if (size <= 0) return new Uint8Array(0);
          const buffer = Buffer.alloc(size);
          let total = 0;
          while (total < size) {
            const { bytesRead } = await handle.read(buffer, total, size - total, total);
            if (!Number.isInteger(bytesRead) || bytesRead < 0) {
              throw new V09ResourceError(
                'resource_error',
                path,
                `the driver reported an invalid read receipt for ${path} (${String(bytesRead)}); the current physical content could not be determined`,
              );
            }
            if (bytesRead === 0) break; // EOF: return only the verified prefix
            total += bytesRead;
          }
          return new Uint8Array(buffer.subarray(0, total));
        } catch (error) {
          if (error instanceof V09ResourceError) throw error;
          throw new V09ResourceError(
            'resource_error',
            path,
            `reading ${path} failed; the current physical content could not be determined (${String(error instanceof Error ? error.message : error)})`,
            error,
          );
        }
      },
      close: async (): Promise<void> => {
        if (!granted.live) return;
        markClosed();
        try {
          await handle.close();
        } catch (error) {
          throw new V09ResourceError(
            'resource_error',
            path,
            `closing the resource at ${path} did not confirm; the OS handle state is UNKNOWN (${String(error instanceof Error ? error.message : error)})`,
            error,
          );
        }
      },
    };
  }

  /**
   * Holder-side disposal of EVERY live granted handle (teardown path). Each
   * grant is marked closed FIRST (so later use fails typed `resource_closed`,
   * never silently). Best-effort: every OS handle close is attempted even
   * when earlier closes fail — a failing close never leaves the remaining
   * grants unattempted — and all failures are aggregated into ONE typed
   * `resource_error` whose `AggregateError` cause carries each raw close
   * failure, with honestly indeterminate OS handle state rather than a
   * claimed release.
   */
  async disposeAll(): Promise<void> {
    const live = [...this.#granted];
    const failures: { granted: GrantedResource; error: unknown }[] = [];
    for (const granted of live) {
      granted.live = false;
      this.#granted.delete(granted);
      try {
        await granted.handle.close();
      } catch (error) {
        failures.push({ granted, error });
      }
    }
    if (failures.length === 0) return;
    throw new V09ResourceError(
      'resource_error',
      'disposal batch',
      `disposing ${String(failures.length)} of ${String(live.length)} granted resource handle(s) did not confirm; the OS handle state of the failed closes is UNKNOWN (${failures
        .map(({ granted, error }) => `${granted.path}: ${String(error instanceof Error ? error.message : error)}`)
        .join('; ')})`,
      new AggregateError(
        failures.map(({ error }) => error),
        'v0.9 capability resource disposal: OS handle close failures',
      ),
    );
  }
}
