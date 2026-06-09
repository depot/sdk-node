import {create} from '@bufbuild/protobuf'
import {timestampDate, timestampFromDate, type Timestamp} from '@bufbuild/protobuf/wkt'
import {Code, ConnectError} from '@connectrpc/connect'
import type {SandboxClient} from './client.js'
import {_commandInternals, type SandboxCommandExecution} from './command.js'
import {FileSystem} from './filesystem.js'
import type {SandboxCommandExecutionEvent} from './gen/depot/sandbox/v1/command_pb.js'
import {
  ListSandboxesRequest_FilterSchema,
  RuntimeSchema,
  SandboxStatus as SandboxStatusProto,
  type ListSandboxesRequest_Filter as ListSandboxesFilterProto,
  type NetworkUsage as NetworkUsageProto,
  type Runtime as RuntimeProto,
  type Sandbox as SandboxProto,
} from './gen/depot/sandbox/v1/sandbox_pb.js'
import type {
  ListFilter,
  NetworkUsage,
  Pagination,
  PaginationResult,
  Resources,
  RunCommandOpts,
  Runtime,
  SandboxStatus,
} from './types.js'

/**
 * A sandbox. Each instance represents one sandbox running on the server.
 *
 * You don't construct this directly; use {@link Sandbox.create},
 * {@link Sandbox.get}, {@link Sandbox.list}, or {@link Sandbox.listAll}.
 */
export class Sandbox {
  readonly sandboxId: string
  readonly organizationId: string
  protected readonly client: SandboxClient

  protected _status: SandboxStatus | undefined
  protected _resources: Resources | undefined
  protected _runtime: Runtime | undefined
  protected _createdAt: Date | undefined
  protected _startedAt: Date | undefined
  protected _stoppedAt: Date | undefined
  protected _expiresAt: Date | undefined
  protected _timeoutMsRemaining: number | undefined
  protected _activeCpuUsageMs: number | undefined
  protected _networkUsage: NetworkUsage | undefined
  protected _exitCode: number | undefined
  protected _errorMessage: string | undefined
  protected _name: string | undefined
  // The sandbox's environment variables, as reported by the server. The
  // server merges these into every command it runs, so callers can read
  // them here without holding onto the original create options.
  protected _env: Record<string, string> = {}

  protected constructor(opts: {client: SandboxClient; sandboxId: string; organizationId: string}) {
    this.client = opts.client
    this.sandboxId = opts.sandboxId
    this.organizationId = opts.organizationId
  }

  /**
   * The sandbox's current lifecycle status. Undefined when the server hasn't
   * yet assigned one.
   */
  get status(): SandboxStatus | undefined {
    return this._status
  }

  /** The resources the server actually allocated to this sandbox. */
  get resources(): Resources | undefined {
    return this._resources
  }

  /** The runtime the server actually resolved for this sandbox. */
  get runtime(): Runtime | undefined {
    return this._runtime
  }

  /** When the sandbox was created. Always set. */
  get createdAt(): Date | undefined {
    return this._createdAt
  }

  /** When the sandbox finished booting and started running. */
  get startedAt(): Date | undefined {
    return this._startedAt
  }

  /** When the sandbox stopped, if it has reached a terminal status. */
  get stoppedAt(): Date | undefined {
    return this._stoppedAt
  }

  /** When the sandbox will expire, if it has a timeout. */
  get expiresAt(): Date | undefined {
    return this._expiresAt
  }

  /**
   * Milliseconds left before the sandbox times out, measured when the server
   * built this response. Undefined when the sandbox has no timeout.
   */
  get timeoutMsRemaining(): number | undefined {
    return this._timeoutMsRemaining
  }

  /**
   * Total CPU time the sandbox used, in milliseconds. Only populated once the
   * sandbox has stopped, and only when the server reports metering. It stays
   * undefined until server-side metering is in place.
   */
  get activeCpuUsageMs(): number | undefined {
    return this._activeCpuUsageMs
  }

  /**
   * Bytes the sandbox sent and received over the network. Populated under the
   * same conditions as {@link activeCpuUsageMs}.
   */
  get networkUsage(): NetworkUsage | undefined {
    return this._networkUsage
  }

  /** Exit code of the sandbox's main process. */
  get exitCode(): number | undefined {
    return this._exitCode
  }

  /** A description of the failure, when the sandbox ended with an error. */
  get errorMessage(): string | undefined {
    return this._errorMessage
  }

  /** The human-readable label set when the sandbox was created, if any. */
  get name(): string | undefined {
    return this._name
  }

  /** Create a new sandbox. */
  static async create(client: SandboxClient, opts: CreateSandboxOpts = {}): Promise<Sandbox> {
    const response = await client.rpc.createSandbox({
      name: opts.name,
      resources: opts.resources,
      runtime: opts.runtime !== undefined ? runtimeToProto(opts.runtime) : undefined,
      env: opts.env,
      staging: opts.staging,
    })
    const sandbox = response.sandbox
    if (!sandbox) {
      throw new Error('CreateSandbox response missing `sandbox`')
    }
    return Sandbox.fromProto(sandbox, client)
  }

  /** Fetch a sandbox by its id. */
  static async get(client: SandboxClient, sandboxId: string): Promise<Sandbox> {
    const response = await client.rpc.getSandbox({selector: {case: 'id', value: sandboxId}})
    const sandbox = response.sandbox
    if (!sandbox) {
      throw new Error('GetSandbox response missing `sandbox`')
    }
    return Sandbox.fromProto(sandbox, client)
  }

  /**
   * Fetch a single page of sandboxes. To page through all of them
   * automatically, use {@link Sandbox.listAll}.
   */
  static async list(client: SandboxClient, opts: ListSandboxesOpts = {}): Promise<ListSandboxesResult> {
    const response = await client.rpc.listSandboxes({
      pageSize: opts.pagination?.pageSize,
      pageToken: opts.pagination?.pageToken,
      filter: opts.filter !== undefined ? filterToProto(opts.filter) : undefined,
    })
    return {
      sandboxes: response.sandboxes.map((s) => Sandbox.fromProto(s, client)),
      pagination: {nextPageToken: response.nextPageToken || undefined},
    }
  }

  /** @internal Build a Sandbox from the proto returned by the server. */
  protected static fromProto(sandbox: SandboxProto, client: SandboxClient): Sandbox {
    const instance = new Sandbox({
      client,
      sandboxId: sandbox.sandboxId,
      organizationId: sandbox.organizationId,
    })
    instance.applyProto(sandbox)
    return instance
  }

  /**
   * Iterate over every sandbox, fetching pages as needed. Yields one sandbox
   * at a time and keeps requesting pages until the server has none left.
   */
  static async *listAll(client: SandboxClient, opts: ListAllSandboxesOpts = {}): AsyncIterable<Sandbox> {
    let pageToken: string | undefined = undefined
    while (true) {
      const page: ListSandboxesResult = await Sandbox.list(client, {
        filter: opts.filter,
        pagination: {pageSize: opts.pageSize, pageToken},
      })
      for (const sandbox of page.sandboxes) yield sandbox
      pageToken = page.pagination.nextPageToken
      if (!pageToken) return
    }
  }

  /**
   * Stop the sandbox gracefully. The sandbox ends in the `finished` status.
   *
   * With `opts.blocking` set, the server waits for the sandbox to finish
   * cleaning up before it responds. By default it returns as soon as it has
   * recorded the stop request, and you can poll {@link Sandbox.get} to watch
   * for the status to change.
   *
   * This updates the instance in place from the server's response, and throws
   * if the sandbox has already stopped.
   */
  async stop(opts: StopSandboxOpts = {}): Promise<void> {
    const response = await this.client.rpc.stopSandbox({
      sandbox: {selector: {case: 'id', value: this.sandboxId}},
      blocking: opts.blocking,
    })
    if (response.sandbox) this.applyProto(response.sandbox)
  }

  /**
   * Kill the sandbox immediately. The sandbox ends in the `cancelled` status.
   *
   * `opts.signal` is accepted but currently ignored: every kill is a hard
   * cancel regardless of the signal you pass. Support for forwarding the
   * signal to the sandbox is planned for a later release.
   *
   * Throws if the sandbox has already stopped.
   */
  async kill(opts: KillSandboxOpts = {}): Promise<void> {
    const response = await this.client.rpc.killSandbox({
      sandbox: {selector: {case: 'id', value: this.sandboxId}},
      signal: opts.signal,
    })
    if (response.sandbox) this.applyProto(response.sandbox)
  }

  /**
   * Run a command in this sandbox. This is a server-streaming call, and it
   * returns the {@link SandboxCommandExecution} as soon as the server reports
   * that the command has started, rather than waiting for it to finish. That
   * lets you attach `.logs()`/`.output()` iterators and watch output while the
   * command is still running. Call `.wait()` on the returned execution to get
   * the settled {@link SandboxCommandExecutionFinished} view:
   *
   * ```ts
   * const cmd = await sandbox.runCommand({cmd: 'echo hi'})
   * const result = await cmd.wait()
   * console.log(result.exitCode, await cmd.output())
   * ```
   *
   * Returning early is what makes concurrent log streaming possible. The
   * stream is buffered with a bounded amount of memory, so if we waited for
   * the command to finish before handing control back, the start of the
   * output could be discarded before any consumer had a chance to read it.
   * Internally we open the stream, build the execution from the start event,
   * then drain the rest of the stream into that buffer in the background;
   * concurrent `.logs()` callers each get an independent iterator backed by
   * the shared buffer.
   *
   * Detached mode is in beta. When `opts.detached` is set, the command runs
   * fire-and-forget: this call returns as soon as the server reports it
   * started, and the command keeps running in the sandbox afterward. Its output
   * is not retained and cannot be retrieved yet (reattach / log replay is a
   * future API), so `logs()`, `output()`, and `wait()` on the returned
   * execution throw, and the SDK logs a warning when detached is used.
   */
  async runCommand(opts: RunCommandOpts): Promise<SandboxCommandExecution> {
    if (opts.detached) {
      // Detached is beta and one-way: we launch the command and return, but its
      // output is never streamed or stored, so there is nothing for
      // logs()/output()/wait() to read. Warn rather than reject so callers can
      // start using it, but make the limitation impossible to miss.
      console.warn(
        '[depot/sandbox] detached commands are in beta: output is not retained and cannot be retrieved yet; ' +
          'logs(), output(), and wait() are unavailable on the returned command',
      )
    }
    const stream = this.client.rpc.runCommand({
      sandbox: {selector: {case: 'id', value: this.sandboxId}},
      cmd: opts.cmd,
      args: opts.args ?? [],
      cwd: opts.cwd,
      env: opts.env ?? {},
      sudo: opts.sudo,
      detached: opts.detached,
    })

    // Pull the first event; it MUST be Started so the SDK can build the
    // SandboxCommandExecution instance with the server-minted cmd_id. Anything else
    // (including a missing oneof case) is a protocol violation. We don't
    // use for-await-of here because we hand the iterator off to
    // drainStream once Started lands; the cost is that the implicit
    // cleanup for-await-of provides doesn't apply, so any early-exit
    // path has to call iterator.return() explicitly or the underlying
    // HTTP/2 stream stays open until GC.
    const iterator = stream[Symbol.asyncIterator]()
    let startedEvent: SandboxCommandExecutionEvent
    try {
      const first = await iterator.next()
      if (first.done) {
        throw new ConnectError('RunCommand stream closed before Started event', Code.Internal)
      }
      startedEvent = first.value
      if (startedEvent.event.case !== 'started') {
        throw new ConnectError(
          `RunCommand stream first event was ${startedEvent.event.case ?? 'unknown'}, expected started`,
          Code.Internal,
        )
      }
    } catch (err) {
      if (typeof iterator.return === 'function') {
        try {
          await iterator.return()
        } catch {
          // ignore — best-effort cleanup
        }
      }
      throw err
    }
    const startedAt =
      startedEvent.event.value.startedAt !== undefined ? timestampDate(startedEvent.event.value.startedAt) : new Date()

    // Merge sandbox-level env + request env (request wins on collisions) so
    // SandboxCommandExecution.env on the returned instance matches what the server actually
    // executes and what a later GetCommand snapshot reads back. The server
    // performs the same merge before persisting the SandboxCommandExecution row.
    const mergedEnv = {...this._env, ...opts.env}
    const command = _commandInternals.fromStartedEvent({
      cmdId: startedEvent.event.value.cmdId,
      sandboxId: this.sandboxId,
      cmd: opts.cmd,
      args: opts.args ?? [],
      cwd: opts.cwd,
      env: mergedEnv,
      sudo: opts.sudo ?? false,
      detached: opts.detached ?? false,
      startedAt,
    })

    // Replay the Started event into the buffer so `logs()` consumers
    // attached before the next event arrives see the same Started → ... →
    // Finished sequence a fresh AttachCommand would receive.
    _commandInternals.ingest(command, startedEvent)

    if (opts.detached) {
      // Fire-and-forget: the server ends the stream right after Started and
      // keeps the command running in the sandbox. There is no further output to
      // pump, so close the iterator instead of draining it — draining would see
      // the stream end without a Finished event and wrongly mark the command
      // failed. logs(), output(), and wait() throw for detached commands.
      if (typeof iterator.return === 'function') {
        try {
          await iterator.return()
        } catch {
          // ignore — best-effort cleanup
        }
      }
      return command
    }

    // Background pump: drain the stream into the buffer. We don't await the
    // pump directly — callers observe Finished via `command.wait()`, which
    // subscribes to the buffer. Errors on the stream propagate via
    // events.error().
    // drainStream owns its own try/catch and routes errors to
    // _commandInternals.fail(), so the returned promise never rejects;
    // a `.catch()` here would be dead code. We still need to consume the
    // promise so an uncaught-rejection lint doesn't fire if drainStream
    // is ever changed to surface errors — void-mark it explicitly.
    void drainStream(command, iterator)

    return command
  }

  /**
   * The sandbox's file system, as a {@link FileSystem} bound to this sandbox.
   * Its methods mirror `node:fs/promises`:
   *
   * ```ts
   * const fs = sandbox.fs()
   * await fs.mkdir('/work', {recursive: true})
   * await fs.writeFile('/work/hello.txt', 'hi')
   * const stat = await fs.stat('/work/hello.txt')
   * ```
   *
   * Each call returns a fresh, lightweight {@link FileSystem} bound to the same
   * sandbox and client.
   */
  fs(): FileSystem {
    return new FileSystem({client: this.client, sandboxId: this.sandboxId})
  }

  /** @internal Refresh this instance's fields from a proto returned by the server. */
  protected applyProto(sandbox: SandboxProto): void {
    this._status = sandboxStatusFromProto(sandbox.status)
    this._resources = resourcesFromProto(sandbox)
    this._runtime = runtimeFromProto(sandbox)
    this._createdAt = timestampToDate(sandbox.createdAt)
    this._startedAt = timestampToDate(sandbox.startedAt)
    this._stoppedAt = timestampToDate(sandbox.stoppedAt)
    this._expiresAt = timestampToDate(sandbox.expiresAt)
    this._timeoutMsRemaining = bigintToNumber(sandbox.timeoutMsRemaining)
    this._activeCpuUsageMs = bigintToNumber(sandbox.activeCpuUsageMs)
    this._networkUsage = networkUsageFromProto(sandbox.networkUsage)
    this._exitCode = sandbox.exitCode
    this._errorMessage = sandbox.errorMessage
    this._name = sandbox.name
    this._env = {...sandbox.env}
  }

  /**
   * The environment variables the server merges into every command run on
   * this sandbox. Empty if the sandbox was created without any, or if it was
   * fetched from a server that doesn't report them.
   */
  get env(): Readonly<Record<string, string>> {
    return this._env
  }
}

/** Options for {@link Sandbox.stop}. */
export interface StopSandboxOpts {
  /**
   * Wait for the sandbox to finish cleaning up before resolving. By default
   * the call resolves as soon as the server records the stop request, and you
   * can poll {@link Sandbox.get} to watch for the status to change.
   */
  blocking?: boolean
}

/** Options for {@link Sandbox.kill}. */
export interface KillSandboxOpts {
  /**
   * Signal name, such as `"SIGKILL"`. Accepted but currently ignored: every
   * kill is a hard cancel regardless of the signal you pass.
   */
  signal?: string
}

/** Options for {@link Sandbox.create}. */
export interface CreateSandboxOpts {
  /** An optional name for the sandbox, unique within your organization. */
  name?: string
  /** The resources to request. The server fills in defaults for anything you leave unset. */
  resources?: Resources
  /** The runtime to use. Set exactly one of `named` or `imageRef`. */
  runtime?: Runtime
  /**
   * Environment variables for the sandbox. The server merges these into every
   * command run on the sandbox. When a command sets the same variable, the
   * command's value wins.
   */
  env?: Record<string, string>
  /**
   * Place the sandbox on a non-production compute pool. This is an unstable
   * option for Depot-supported testing and may be removed without notice.
   * Leave unset for normal placement.
   */
  staging?: boolean
}

/** Options for {@link Sandbox.list}. */
export interface ListSandboxesOpts {
  pagination?: Pagination
  filter?: ListFilter
}

/** Options for {@link Sandbox.listAll}. */
export interface ListAllSandboxesOpts {
  pageSize?: number
  filter?: ListFilter
}

/** Result of {@link Sandbox.list}. */
export interface ListSandboxesResult {
  sandboxes: Sandbox[]
  pagination: PaginationResult
}

function runtimeToProto(runtime: Runtime): RuntimeProto {
  if ('named' in runtime) {
    return create(RuntimeSchema, {runtime: {case: 'named', value: runtime.named}})
  }
  return create(RuntimeSchema, {runtime: {case: 'imageRef', value: runtime.imageRef}})
}

function resourcesFromProto(sandbox: SandboxProto): Resources | undefined {
  const r = sandbox.resources
  if (!r) return undefined
  return {vcpus: r.vcpus, memoryMb: r.memoryMb, diskGb: r.diskGb}
}

function runtimeFromProto(sandbox: SandboxProto): Runtime | undefined {
  const r = sandbox.runtime?.runtime
  if (!r || r.case === undefined) return undefined
  if (r.case === 'named') return {named: r.value}
  return {imageRef: r.value}
}

function timestampToDate(ts: Timestamp | undefined): Date | undefined {
  return ts ? timestampDate(ts) : undefined
}

// int64 proto fields arrive as bigint, but the SDK exposes them as plain
// numbers because that's easier to work with. The timeout and metering values
// we deal with stay well within Number.MAX_SAFE_INTEGER, so the conversion is
// safe in practice. Values above 2^53 would lose precision.
function bigintToNumber(value: bigint | undefined): number | undefined {
  return value !== undefined ? Number(value) : undefined
}

async function drainStream(
  command: SandboxCommandExecution,
  iterator: AsyncIterator<SandboxCommandExecutionEvent>,
): Promise<void> {
  let sawFinished = false
  try {
    while (true) {
      const r = await iterator.next()
      if (r.done) break
      _commandInternals.ingest(command, r.value)
      if (r.value.event.case === 'finished') {
        sawFinished = true
        break
      }
    }
    if (sawFinished) {
      _commandInternals.end(command)
    } else {
      // Server stream ended without a Finished event. The handler's
      // no-exit-code path records the row as failed and then returns
      // normally, so end()'ing here would leave the SDK object with
      // status 'running' and output()/wait() resolving as if the
      // command succeeded. Surface as a failure so callers see the
      // discrepancy.
      _commandInternals.fail(
        command,
        new Error(`SandboxCommandExecution ${command.cmdId} stream closed without Finished event`),
      )
    }
  } catch (err) {
    _commandInternals.fail(command, err)
  } finally {
    // We obtained `iterator` by calling stream[Symbol.asyncIterator]()
    // and manually drove it with .next(), so a regular for-await-of's
    // implicit cleanup doesn't apply. If we broke out of the loop on
    // 'finished' (or `_commandInternals.fail` raised), the underlying
    // HTTP/2 stream stays open until GC reclaims the iterator. Signal
    // explicitly so the transport can release it now. .return() is
    // optional on AsyncIterator; guard for that and swallow errors so
    // a misbehaving iterator doesn't shadow whatever we already
    // recorded above.
    if (typeof iterator.return === 'function') {
      try {
        await iterator.return()
      } catch {
        // ignore — best-effort cleanup
      }
    }
  }
}

function networkUsageFromProto(usage: NetworkUsageProto | undefined): NetworkUsage | undefined {
  if (!usage) return undefined
  return {ingressBytes: Number(usage.ingressBytes), egressBytes: Number(usage.egressBytes)}
}

// The SDK's status strings are just the lowercased proto enum names, so we can
// convert by looking up the enum's name for a given numeric value.
function sandboxStatusFromProto(status: SandboxStatusProto): SandboxStatus | undefined {
  if (status === SandboxStatusProto.UNSPECIFIED) return undefined
  // A newer server can send a status this SDK build doesn't know about, which
  // arrives as a raw number with no matching enum name. Return undefined for
  // those rather than throwing, so an older SDK can still read every other
  // field on the sandbox.
  const name = SandboxStatusProto[status]
  return name === undefined ? undefined : (name.toLowerCase() as SandboxStatus)
}

function sandboxStatusToProto(status: SandboxStatus): SandboxStatusProto {
  const value = SandboxStatusProto[status.toUpperCase() as keyof typeof SandboxStatusProto]
  // The status union should always line up with the generated enum, so this
  // can only happen if the two have drifted apart, or a caller forced an
  // invalid value through a cast. Fail with a clear error instead of sending
  // garbage to the server.
  if (value === undefined) {
    throw new Error(`unknown SandboxStatus: ${status}`)
  }
  return value
}

function filterToProto(filter: ListFilter): ListSandboxesFilterProto {
  return create(ListSandboxesRequest_FilterSchema, {
    states: (filter.states ?? []).map(sandboxStatusToProto),
    createdAfter: filter.createdAfter !== undefined ? timestampFromDate(filter.createdAfter) : undefined,
    createdBefore: filter.createdBefore !== undefined ? timestampFromDate(filter.createdBefore) : undefined,
  })
}
