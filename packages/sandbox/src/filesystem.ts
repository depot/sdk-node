// The per-sandbox FileSystem surface.
//
// Methods mirror `node:fs/promises` so callers can drop the SDK in alongside
// existing fs code with little friction. Every method calls one SandboxService
// method against the bound sandbox and remaps a failure into a Node-shape
// FileSystemError (see errors.ts). A few methods are composed on the client
// from the primitives the server exposes — exists (stat + catch ENOENT),
// realpath (a readlink walk), mkdtemp (mkdir with a random suffix), appendFile
// (writeFile with append) — because the server intentionally doesn't ship a
// dedicated method for them.
//
// A FileSystem is bound to one sandbox and one client at construction; get it
// via `sandbox.fs()`.

import {create} from '@bufbuild/protobuf'
import type {SandboxClient} from './client.js'
import {FileSystemError, toFileSystemError} from './errors.js'
import {FileType, WriteFileRequestSchema} from './gen/depot/sandbox/v1/filesystem_pb.js'

// gRPC's default max message size is 4 MiB. The Connect HTTP transport the SDK
// uses doesn't impose that ceiling, but a gRPC client of this same WriteFile
// stream would, so split the payload into frames a little under 4 MiB — leaving
// room for the proto envelope around the bytes — rather than sending it as a
// single message a gRPC peer could reject.
const WRITE_CHUNK_BYTES = 1024 * 1024 * 4 - 64 * 1024

// Reject a permission mode that isn't a whole number of mode bits before it
// crosses the wire. An invalid octal string (chmod accepts strings) parses to
// NaN, and the server's `& 0o7777` would mask that to 0 — silently applying
// mode 000 instead of failing. Throw EINVAL up front, the way Node rejects an
// out-of-range mode, so the caller sees a clear error instead of a clobbered
// file.
function assertValidMode(mode: number, syscall: string, path: string): void {
  if (!Number.isInteger(mode) || mode < 0 || mode > 0o7777) {
    throw new FileSystemError({code: 'EINVAL', syscall, path, message: `${syscall} '${path}': invalid mode`})
  }
}

/** The SDK-facing file type, mapped from the proto FileType enum. */
export type FileTypeName = 'file' | 'directory' | 'symlink' | 'block' | 'char' | 'fifo' | 'socket' | 'unknown'

function fileTypeName(type: FileType): FileTypeName {
  switch (type) {
    case FileType.FILE:
      return 'file'
    case FileType.DIRECTORY:
      return 'directory'
    case FileType.SYMLINK:
      return 'symlink'
    case FileType.BLOCK_DEVICE:
      return 'block'
    case FileType.CHARACTER_DEVICE:
      return 'char'
    case FileType.FIFO:
      return 'fifo'
    case FileType.SOCKET:
      return 'socket'
    case FileType.UNSPECIFIED:
    default:
      return 'unknown'
  }
}

/**
 * The result of {@link FileSystem.stat}. Mirrors enough of a `node:fs/promises`
 * Stats object that callers can call `.isDirectory()`/`.isFile()` and read
 * size, mode, owner, and mtime without caring the value crossed the wire.
 */
export class StatResult {
  readonly path: string
  readonly size: number
  /** POSIX permission bits as an octal integer (for example `0o644`). */
  readonly mode: number
  readonly uname: string
  readonly gname: string
  readonly mtime: Date
  readonly type: FileTypeName

  constructor(opts: {
    path: string
    size: number
    mode: number
    uname: string
    gname: string
    mtime: Date
    type: FileTypeName
  }) {
    this.path = opts.path
    this.size = opts.size
    this.mode = opts.mode
    this.uname = opts.uname
    this.gname = opts.gname
    this.mtime = opts.mtime
    this.type = opts.type
  }

  isFile(): boolean {
    return this.type === 'file'
  }
  isDirectory(): boolean {
    return this.type === 'directory'
  }
  /** True only when the value came from {@link FileSystem.lstat}. */
  isSymbolicLink(): boolean {
    return this.type === 'symlink'
  }
  isBlockDevice(): boolean {
    return this.type === 'block'
  }
  isCharacterDevice(): boolean {
    return this.type === 'char'
  }
  isFIFO(): boolean {
    return this.type === 'fifo'
  }
  isSocket(): boolean {
    return this.type === 'socket'
  }
}

/** A directory entry returned by {@link FileSystem.readdir} with `withFileTypes`. */
export class DirEntry {
  readonly name: string
  readonly type: FileTypeName
  constructor(opts: {name: string; type: FileTypeName}) {
    this.name = opts.name
    this.type = opts.type
  }
  isFile(): boolean {
    return this.type === 'file'
  }
  isDirectory(): boolean {
    return this.type === 'directory'
  }
  isSymbolicLink(): boolean {
    return this.type === 'symlink'
  }
}

export interface ReadFileOpts {
  /** Decode the bytes as a string under this encoding. Omit to get a Buffer. */
  encoding?: BufferEncoding
}

export interface WriteFileOpts {
  /** POSIX mode applied if the file is created. */
  mode?: number
  /** Create any missing parent directories before writing. */
  recursive?: boolean
}

export interface MkdirOpts {
  recursive?: boolean
  mode?: number
}

export interface RmOpts {
  recursive?: boolean
  force?: boolean
}

export interface ReaddirOpts {
  withFileTypes?: boolean
}

export interface CopyFileOpts {
  /** Preserve mode, owner, and timestamps where possible (cp -p). */
  preserveMetadata?: boolean
}

// realpath's readlink walk is bounded so a symlink cycle the server didn't
// already reject with ELOOP can't spin forever on the client.
const REALPATH_MAX_HOPS = 40

/**
 * A per-sandbox file system. Methods mirror `node:fs/promises`. Get an instance
 * via `sandbox.fs()`.
 */
export class FileSystem {
  /** The sandbox this file system is bound to. */
  readonly sandboxId: string
  private readonly client: SandboxClient

  /** @internal Constructed by `Sandbox.fs`. */
  constructor(opts: {client: SandboxClient; sandboxId: string}) {
    this.client = opts.client
    this.sandboxId = opts.sandboxId
  }

  private ref() {
    return {sandbox: {selector: {case: 'id' as const, value: this.sandboxId}}}
  }

  // ─── File I/O ─────────────────────────────────────────────────────────

  /**
   * Read an entire file. Returns a Buffer, or a string when `opts.encoding` is
   * set. Backed by the streaming ReadFile method; the chunks are concatenated
   * here. For very large files, prefer streaming the chunks yourself.
   */
  async readFile(path: string, opts?: ReadFileOpts): Promise<Buffer | string> {
    const chunks: Uint8Array[] = []
    try {
      for await (const chunk of this.client.rpc.readFile({...this.ref(), path})) {
        if (chunk.data.length > 0) chunks.push(chunk.data)
      }
    } catch (err) {
      throw toFileSystemError(err, 'open', path)
    }
    const buf = Buffer.concat(chunks)
    return opts?.encoding ? buf.toString(opts.encoding) : buf
  }

  /**
   * Write `data` to `path`, replacing any existing contents. With
   * `opts.recursive`, missing parent directories are created first.
   */
  async writeFile(path: string, data: Buffer | Uint8Array | string, opts?: WriteFileOpts): Promise<void> {
    await this.writeStream(path, data, {mode: opts?.mode, recursive: opts?.recursive, append: false}, 'write')
  }

  /**
   * Append `data` to `path`, creating it if needed. Composed from WriteFile
   * with append semantics; there is no dedicated append method.
   */
  async appendFile(path: string, data: Buffer | Uint8Array | string, opts?: WriteFileOpts): Promise<void> {
    await this.writeStream(path, data, {mode: opts?.mode, recursive: opts?.recursive, append: true}, 'open')
  }

  private async writeStream(
    path: string,
    data: Buffer | Uint8Array | string,
    init: {mode?: number; recursive?: boolean; append: boolean},
    syscall: string,
  ): Promise<void> {
    if (init.mode !== undefined) assertValidMode(init.mode, syscall, path)
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)
    const ref = this.ref()
    async function* requestStream() {
      yield create(WriteFileRequestSchema, {
        input: {
          case: 'init',
          value: {
            sandbox: ref.sandbox,
            path,
            mode: init.mode,
            append: init.append,
            createDirectories: init.recursive,
          },
        },
      })
      // Split the payload into frames that stay under the gRPC message ceiling.
      // subarray shares the backing buffer, so a small write still allocates
      // nothing extra; an empty write sends no data frame at all (tee creates
      // the empty file from the init message alone).
      for (let offset = 0; offset < bytes.byteLength; offset += WRITE_CHUNK_BYTES) {
        yield create(WriteFileRequestSchema, {
          input: {case: 'data', value: bytes.subarray(offset, offset + WRITE_CHUNK_BYTES)},
        })
      }
    }
    try {
      await this.client.rpc.writeFile(requestStream())
    } catch (err) {
      throw toFileSystemError(err, syscall, path)
    }
  }

  // ─── Directory ops ──────────────────────────────────────────────────────

  async mkdir(path: string, opts?: MkdirOpts): Promise<void> {
    if (opts?.mode !== undefined) assertValidMode(opts.mode, 'mkdir', path)
    try {
      await this.client.rpc.mkdir({...this.ref(), path, recursive: opts?.recursive, mode: opts?.mode})
    } catch (err) {
      throw toFileSystemError(err, 'mkdir', path)
    }
  }

  /**
   * List directory entries. Returns `string[]` by default, or `DirEntry[]` when
   * `opts.withFileTypes` is set.
   */
  async readdir(path: string, opts?: ReaddirOpts): Promise<string[] | DirEntry[]> {
    let response
    try {
      response = await this.client.rpc.readDir({...this.ref(), path, withFileTypes: opts?.withFileTypes})
    } catch (err) {
      throw toFileSystemError(err, 'scandir', path)
    }
    if (opts?.withFileTypes) {
      return response.entries.map((e) => new DirEntry({name: e.name, type: fileTypeName(e.type)}))
    }
    return response.entries.map((e) => e.name)
  }

  /**
   * Create a uniquely named temporary directory. `prefix` is suffixed with a
   * random string. Composed from mkdir with a retry on a name collision; there
   * is no dedicated method.
   */
  async mkdtemp(prefix: string): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const suffix = Math.random().toString(36).slice(2, 8)
      const path = `${prefix}${suffix}`
      try {
        await this.client.rpc.mkdir({...this.ref(), path})
        return path
      } catch (err) {
        const fsErr = toFileSystemError(err, 'mkdir', path)
        // Retry only on a name collision; anything else is a real failure.
        if (fsErr.code !== 'EEXIST') throw fsErr
      }
    }
    throw toFileSystemError(new Error('mkdtemp exhausted its retries'), 'mkdir', prefix)
  }

  // ─── Stat family ──────────────────────────────────────────────────────

  /** Stat, following symlinks. */
  stat(path: string): Promise<StatResult> {
    return this.statImpl(path, true)
  }

  /** Lstat — stat the link itself rather than its target. */
  lstat(path: string): Promise<StatResult> {
    return this.statImpl(path, false)
  }

  private async statImpl(path: string, followSymlinks: boolean): Promise<StatResult> {
    let response
    try {
      response = await this.client.rpc.stat({...this.ref(), path, followSymlinks})
    } catch (err) {
      throw toFileSystemError(err, followSymlinks ? 'stat' : 'lstat', path)
    }
    return new StatResult({
      path: response.path,
      size: Number(response.size),
      mode: response.mode,
      uname: response.uname,
      gname: response.gname,
      mtime: new Date(Number(response.mtimeUnixSeconds) * 1000),
      type: fileTypeName(response.type),
    })
  }

  /**
   * Resolve `path` to its canonical form by walking symlinks. Composed from
   * lstat + readlink with a hop limit, since the server exposes no one-shot
   * realpath; the native backing can optimize this behind the unchanged
   * surface later. Pathological per-component resolution (a symlink in the
   * middle of a path) is not handled here yet — see the SDK reference.
   */
  async realpath(path: string): Promise<string> {
    let current = path
    for (let hop = 0; hop < REALPATH_MAX_HOPS; hop++) {
      let info: StatResult
      try {
        info = await this.lstat(current)
      } catch (err) {
        // A missing or unreadable component surfaces as the underlying lstat
        // error. Pass an already-classified FileSystemError through unchanged:
        // Node's realpath likewise reports the underlying lstat syscall (an
        // ENOENT here carries syscall 'lstat'), so preserving it keeps parity.
        // Only an unclassified error gets wrapped under the realpath syscall.
        if (err instanceof Error && 'code' in err) throw err
        throw toFileSystemError(err, 'realpath', path)
      }
      if (info.type !== 'symlink') return current
      const target = await this.readlink(current)
      // An absolute target replaces the path; a relative one resolves against
      // the link's directory.
      current = target.startsWith('/') ? target : joinPath(dirname(current), target)
    }
    // Hit the hop limit: the chain is circular or pathologically deep. Node
    // reports this as ELOOP, so build the code directly rather than routing a
    // plain Error through toFileSystemError (which would classify as OTHER).
    throw new FileSystemError({
      code: 'ELOOP',
      syscall: 'realpath',
      path,
      message: `ELOOP: too many symbolic links, realpath '${path}'`,
    })
  }

  // ─── Mutation ───────────────────────────────────────────────────────────

  /** Remove a file or symlink. */
  unlink(path: string): Promise<void> {
    return this.removeImpl(path, {recursive: false, force: false}, 'unlink')
  }

  /** Remove a path, optionally recursively and/or ignoring a missing target. */
  rm(path: string, opts?: RmOpts): Promise<void> {
    return this.removeImpl(path, {recursive: opts?.recursive ?? false, force: opts?.force ?? false}, 'unlink')
  }

  /** Remove an empty directory. Fails with ENOTEMPTY if it isn't empty. */
  rmdir(path: string): Promise<void> {
    return this.removeImpl(path, {recursive: false, force: false}, 'rmdir')
  }

  private async removeImpl(path: string, opts: {recursive: boolean; force: boolean}, syscall: string): Promise<void> {
    try {
      await this.client.rpc.remove({...this.ref(), path, recursive: opts.recursive, ignoreMissing: opts.force})
    } catch (err) {
      throw toFileSystemError(err, syscall, path)
    }
  }

  async rename(from: string, to: string): Promise<void> {
    try {
      await this.client.rpc.rename({...this.ref(), fromPath: from, toPath: to})
    } catch (err) {
      throw toFileSystemError(err, 'rename', from)
    }
  }

  async copyFile(from: string, to: string, opts?: CopyFileOpts): Promise<void> {
    try {
      await this.client.rpc.copyFile({
        ...this.ref(),
        fromPath: from,
        toPath: to,
        preserveMetadata: opts?.preserveMetadata,
      })
    } catch (err) {
      throw toFileSystemError(err, 'copyfile', from)
    }
  }

  async truncate(path: string, size = 0): Promise<void> {
    if (!Number.isInteger(size) || size < 0) {
      throw new FileSystemError({
        code: 'EINVAL',
        syscall: 'ftruncate',
        path,
        message: `ftruncate '${path}': size must be a non-negative integer`,
      })
    }
    try {
      await this.client.rpc.truncate({...this.ref(), path, size: BigInt(size)})
    } catch (err) {
      throw toFileSystemError(err, 'ftruncate', path)
    }
  }

  /** chmod. `mode` accepts an octal integer (`0o755`) or an octal string (`"755"`). */
  async chmod(path: string, mode: number | string): Promise<void> {
    const numeric = typeof mode === 'string' ? parseInt(mode, 8) : mode
    assertValidMode(numeric, 'chmod', path)
    try {
      await this.client.rpc.chmod({...this.ref(), path, mode: numeric})
    } catch (err) {
      throw toFileSystemError(err, 'chmod', path)
    }
  }

  async chown(path: string, uid: number, gid: number): Promise<void> {
    try {
      await this.client.rpc.chown({...this.ref(), path, uid, gid})
    } catch (err) {
      throw toFileSystemError(err, 'chown', path)
    }
  }

  // ─── Symlinks ─────────────────────────────────────────────────────────

  async symlink(target: string, linkPath: string): Promise<void> {
    try {
      await this.client.rpc.symlink({...this.ref(), target, linkPath})
    } catch (err) {
      throw toFileSystemError(err, 'symlink', linkPath)
    }
  }

  async readlink(path: string): Promise<string> {
    try {
      const response = await this.client.rpc.readlink({...this.ref(), path})
      return response.target
    } catch (err) {
      throw toFileSystemError(err, 'readlink', path)
    }
  }

  // ─── Access / probe ─────────────────────────────────────────────────────

  /** Check access to `path`. Resolves on success, rejects with a FileSystemError otherwise. */
  async access(path: string, mode?: number): Promise<void> {
    try {
      await this.client.rpc.access({...this.ref(), path, mode})
    } catch (err) {
      throw toFileSystemError(err, 'access', path)
    }
  }

  /**
   * Whether `path` exists. Composed from stat + catching ENOENT. Not part of
   * `node:fs/promises`, but an SDK convenience callers ask for. Errors other
   * than ENOENT (for example EACCES on an unreadable parent) propagate.
   */
  async exists(path: string): Promise<boolean> {
    try {
      await this.stat(path)
      return true
    } catch (err) {
      if (err instanceof Error && 'code' in err && (err as {code: unknown}).code === 'ENOENT') return false
      throw err
    }
  }
}

// ─── Path helpers ─────────────────────────────────────────────────────────
// Minimal POSIX path helpers for the realpath walk; the SDK doesn't pull in
// node:path so it stays usable in non-Node runtimes.

function dirname(path: string): string {
  const idx = path.lastIndexOf('/')
  if (idx < 0) return '.'
  if (idx === 0) return '/'
  return path.slice(0, idx)
}

function joinPath(dir: string, name: string): string {
  if (dir === '/') return `/${name}`
  return `${dir}/${name}`
}
