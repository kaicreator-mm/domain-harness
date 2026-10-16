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
 *   - failures carry `cause` with the raw driver error; unclassifiable
 *     failures are typed `resource_error` without guessing whether any bytes
 *     landed (the caller must read back through the same handle to decide).
 *
 * Authority modeling (WHO may call open/dispose — principal/permit checks) is
 * protected H governance owned by #1032/#1036; this port is deliberately
 * physical only.
 */

import { open } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';

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

/** One live grant: the OS handle plus the liveness flag both close paths share. */
interface GrantedResource {
  readonly handle: FileHandle;
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

  /** Number of currently live (granted and not yet closed/disposed) handles. */
  get grantedHandleCount(): number {
    return this.#granted.size;
  }

  async openResource(path: string): Promise<V09OwnedResourceHandle> {
    if (typeof path !== 'string' || path.length === 0) {
      throw new V09ResourceError('path_malformed', String(path), 'resource paths must be non-empty strings');
    }
    let handle: FileHandle;
    try {
      // 'a+' : create if absent, reads allowed, writes append at physical EOF.
      handle = await open(path, 'a+');
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
    const granted: GrantedResource = { handle, live: true };
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
        try {
          await handle.write(bytes, 0, bytes.length);
        } catch (error) {
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
          // Snapshot from position 0: stat for the current physical size, then
          // one positioned read of exactly that range (single-holder port).
          const size = (await handle.stat()).size;
          const buffer = Buffer.allocUnsafe(size);
          if (size > 0) {
            await handle.read(buffer, 0, size, 0);
          }
          return new Uint8Array(buffer);
        } catch (error) {
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
   * never silently), then the OS handle is closed; a failed close is typed
   * with honestly indeterminate handle state rather than claimed released.
   */
  async disposeAll(): Promise<void> {
    const live = [...this.#granted];
    for (const granted of live) {
      granted.live = false;
      this.#granted.delete(granted);
      try {
        await granted.handle.close();
      } catch (error) {
        throw new V09ResourceError(
          'resource_error',
          'disposal batch',
          `disposing a granted resource handle did not confirm; the OS handle state is UNKNOWN (${String(error instanceof Error ? error.message : error)})`,
          error,
        );
      }
    }
  }
}
