// Error types surfaced by @depot/sandbox.
//
// Surfaced from command-output consumer iteration and the file system surface.
// Wider sets of SDK errors can be added as new failure modes are exposed.

import {ConnectError} from '@connectrpc/connect'
import {
  FileSystemErrorCode as FileSystemErrorCodeProto,
  FileSystemErrorDetailSchema,
} from './gen/depot/sandbox/v1/filesystem_pb.js'

/**
 * Thrown into a `SandboxCommandExecution.logs()` iterator when its bounded queue
 * overflows because the producer (the underlying RPC stream) outran the
 * consumer's drain rate. Other consumers on the same command (and the
 * underlying stream) are unaffected.
 */
export class SlowConsumerError extends Error {
  override readonly name = 'SlowConsumerError'
  constructor(message = 'event consumer queue overflow') {
    super(message)
  }
}

// File system errors.

/**
 * The Node-style fs error codes the SDK exposes, as a string union. These match
 * the codes Node throws on a real `node:fs/promises` failure, so existing
 * `if (err.code === 'ENOENT')` checks keep working against a sandbox file
 * system. `OTHER` is the catch-all the server uses when it can't classify a
 * failure into a specific code.
 */
export type FileSystemErrorCode =
  | 'EPERM'
  | 'ENOENT'
  | 'EINTR'
  | 'EIO'
  | 'EBADF'
  | 'ENOMEM'
  | 'EACCES'
  | 'EBUSY'
  | 'EEXIST'
  | 'EXDEV'
  | 'ENOTDIR'
  | 'EISDIR'
  | 'EINVAL'
  | 'ENFILE'
  | 'EMFILE'
  | 'ETXTBSY'
  | 'EFBIG'
  | 'ENOSPC'
  | 'EROFS'
  | 'EMLINK'
  | 'ENAMETOOLONG'
  | 'ENOTEMPTY'
  | 'ELOOP'
  | 'EOPNOTSUPP'
  | 'EDQUOT'
  | 'OTHER'

// The proto enum value of each code IS its Linux errno number (OTHER is an
// off-band sentinel), so the generated enum is the only mapping we need — read
// in both directions, with no hand-maintained code<->number or code<->errno
// table to drift from the wire.
const PROTO_PREFIX = 'FILESYSTEM_ERROR_CODE_'

// Wire value (an errno number, or the OTHER sentinel) -> friendly string code,
// taken straight from the generated enum's own reverse lookup. UNSPECIFIED, the
// OTHER sentinel, and any value this build doesn't recognize (a newer peer
// sending a code we don't know) all read as OTHER, so the caller still gets a
// usable error.
function codeFromProto(value: FileSystemErrorCodeProto): FileSystemErrorCode {
  const name = (FileSystemErrorCodeProto as Record<number, string | undefined>)[value]
  if (name === undefined || value === FileSystemErrorCodeProto.FILESYSTEM_ERROR_CODE_UNSPECIFIED) return 'OTHER'
  const stripped = name.slice(PROTO_PREFIX.length)
  return stripped === 'OTHER' ? 'OTHER' : (stripped as FileSystemErrorCode)
}

// Negated Linux errno for a code, for Node-shape parity. The code's proto value
// is its errno, so this is just the negation; OTHER (and anything without a
// real errno) reads as -1, matching libuv's "no match". This is the sandbox's
// errno — the file system runs on Linux — and `code` is the portable key.
function errnoForCode(code: FileSystemErrorCode): number {
  if (code === 'OTHER') return -1
  const value = (FileSystemErrorCodeProto as unknown as Record<string, number | undefined>)[PROTO_PREFIX + code]
  return value === undefined || value <= 0 ? -1 : -value
}

/**
 * A Node-shape file system error, thrown by every `sandbox.fs.*` method on
 * failure. It carries the same `code`/`syscall`/`path`/`errno` fields Node
 * attaches to its own fs errors, so code written against `node:fs/promises`
 * can branch on `err.code` without caring that the operation crossed the wire.
 */
export class FileSystemError extends Error {
  /** Node-style error code, for example `'ENOENT'`. */
  readonly code: FileSystemErrorCode
  /** The operation that failed, for example `'stat'` or `'open'`. */
  readonly syscall: string
  /** The path the operation was attempted on. */
  readonly path: string
  /** Negated Linux errno for the code, for Node-shape parity. */
  readonly errno: number

  constructor(opts: {code: FileSystemErrorCode; syscall: string; path: string; message?: string}) {
    super(opts.message ?? `${opts.code}: ${opts.syscall} '${opts.path}'`)
    this.name = 'FileSystemError'
    this.code = opts.code
    this.syscall = opts.syscall
    this.path = opts.path
    this.errno = errnoForCode(opts.code)
  }
}

/**
 * Turn a thrown RPC error into a `FileSystemError`. The server attaches a
 * `FileSystemErrorDetail` to the Connect error; this reads it back with
 * `findDetails` and rebuilds the Node-shape error. When no detail is attached
 * (a transport failure, or a server that didn't classify the error), it falls
 * back to an `OTHER` error carrying the supplied syscall and path so the caller
 * still gets a `FileSystemError` rather than a raw `ConnectError`.
 *
 * @internal Used by the FileSystem class to remap every RPC rejection.
 */
export function toFileSystemError(err: unknown, syscall: string, path: string): FileSystemError {
  if (err instanceof ConnectError) {
    const details = err.findDetails(FileSystemErrorDetailSchema)
    const detail = details[0]
    if (detail) {
      return new FileSystemError({
        code: codeFromProto(detail.code),
        syscall: detail.syscall || syscall,
        path: detail.path || path,
        message: detail.message,
      })
    }
    return new FileSystemError({code: 'OTHER', syscall, path, message: err.rawMessage})
  }
  const message = err instanceof Error ? err.message : String(err)
  return new FileSystemError({code: 'OTHER', syscall, path, message})
}
