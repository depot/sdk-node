import {timestampDate, type Timestamp} from '@bufbuild/protobuf/wkt'
import {
  SandboxCommandExecutionStatus as CommandStatusProto,
  type SandboxCommandExecutionEvent,
  type SandboxCommandExecution as SandboxCommandExecutionProto,
} from './gen/depot/sandbox/v1/command_pb.js'
import {BufferedEventLog} from './k-streaming.js'
import type {SandboxCommandExecutionStatus} from './types.js'

/**
 * A single decoded chunk of output yielded by {@link SandboxCommandExecution.logs}. Output
 * arrives over the wire as raw bytes; the SDK decodes it as UTF-8 here before handing it
 * to you.
 */
export interface SandboxCommandExecutionLogChunk {
  stream: 'stdout' | 'stderr'
  data: string
  /**
   * The running total of bytes seen on this stream, up to and including this chunk. You can
   * use it to resume from where you left off when re-attaching to a command.
   */
  byteOffset: number
  timestamp: Date
}

/**
 * A command running in a sandbox, or one that has already finished. You get one back from
 * {@link Sandbox.runCommand}.
 *
 * Once the command finishes, the same instance can be viewed through the narrower
 * {@link SandboxCommandExecutionFinished} type, which guarantees `exitCode` and `finishedAt`
 * are present. The object identity stays the same; `wait()` simply returns that narrower type.
 */
export class SandboxCommandExecution {
  /** Unique identifier for this command, assigned by the server. */
  readonly cmdId: string
  readonly sandboxId: string
  readonly cmd: string
  readonly args: ReadonlyArray<string>
  readonly cwd: string | undefined
  readonly env: Readonly<Record<string, string>>
  readonly sudo: boolean
  readonly detached: boolean
  readonly startedAt: Date

  protected _status: SandboxCommandExecutionStatus
  protected _exitCode: number | undefined
  protected _finishedAt: Date | undefined
  protected _stdoutBytesEmitted: number
  protected _stderrBytesEmitted: number

  // The event log for this command. Every `logs()` consumer reads from it, and `wait()`
  // observes it to learn when the command settles. As the command runs, the background task
  // started by `Sandbox.runCommand` feeds events from the server stream into this log.
  //
  // The log keeps a bounded replay buffer so a consumer that attaches late, or falls a little
  // behind, can still catch up on recent events. A consumer that falls too far behind for the
  // buffer to hold its place will receive a SlowConsumerError.
  protected readonly events: BufferedEventLog<SandboxCommandExecutionEvent>

  // A promise that resolves (or rejects) when the command reaches a terminal state. This is
  // kept separate from the event log on purpose: wait() waits on this promise instead of
  // reading the log as an ordinary consumer. An ordinary consumer advances past each event it
  // reads, which would let the replay buffer drop early output that no one has read yet — so a
  // later output() or logs() call would only see the tail of the output rather than the whole
  // thing.
  protected _terminalPromise: Promise<void>
  protected _terminalResolve!: () => void
  protected _terminalReject!: (err: unknown) => void
  protected _terminalSettled = false
  // The reason from the most recent mid-stream error event, if any. We remember it so that if
  // the stream ends before a Finished event arrives, we can report that original error rather
  // than a generic "stream closed without a Finished event" message.
  protected _lastErrorReason: string | undefined

  protected constructor(opts: {
    cmdId: string
    sandboxId: string
    cmd: string
    args: string[]
    cwd: string | undefined
    env: Record<string, string>
    sudo: boolean
    detached: boolean
    startedAt: Date
    status: SandboxCommandExecutionStatus
    stdoutBytesEmitted: number
    stderrBytesEmitted: number
  }) {
    this.cmdId = opts.cmdId
    this.sandboxId = opts.sandboxId
    this.cmd = opts.cmd
    this.args = Object.freeze([...opts.args])
    this.cwd = opts.cwd
    this.env = Object.freeze({...opts.env})
    this.sudo = opts.sudo
    this.detached = opts.detached
    this.startedAt = opts.startedAt
    this._status = opts.status
    this._stdoutBytesEmitted = opts.stdoutBytesEmitted
    this._stderrBytesEmitted = opts.stderrBytesEmitted
    // Size each buffered event by the size of its output payload, so the SDK measures the
    // replay buffer the same way the server does. This keeps byte accounting consistent and
    // accurate even though the SDK doesn't impose its own cap.
    this.events = new BufferedEventLog<SandboxCommandExecutionEvent>({
      byteCostOf: (e) => commandEventByteCost(e),
    })
    this._terminalPromise = new Promise<void>((resolve, reject) => {
      this._terminalResolve = resolve
      this._terminalReject = reject
    })
  }

  // Settle the terminal promise, but only the first time. Later calls do nothing, so a
  // Finished event followed by a stream failure (or the reverse) won't try to settle it twice.
  // When settling with an error, attach a no-op .catch so Node doesn't warn about an unhandled
  // rejection if the caller never calls wait() — calling wait() is optional.
  protected settleTerminal(err?: unknown): void {
    if (this._terminalSettled) return
    this._terminalSettled = true
    if (err !== undefined) {
      this._terminalReject(err)
      this._terminalPromise.catch(() => {})
    } else {
      this._terminalResolve()
    }
  }

  /** The command's current status. It reaches `finished`, `failed`, or `killed` once the command ends. */
  get status(): SandboxCommandExecutionStatus {
    return this._status
  }

  /** The command's exit code once it has finished, or undefined while it is still running. */
  get exitCode(): number | undefined {
    return this._exitCode
  }

  /** The time the command finished, or undefined while it is still running. */
  get finishedAt(): Date | undefined {
    return this._finishedAt
  }

  /** The total number of stdout bytes the server has produced so far. */
  get stdoutBytesEmitted(): number {
    return this._stdoutBytesEmitted
  }

  /** The total number of stderr bytes the server has produced so far. */
  get stderrBytesEmitted(): number {
    return this._stderrBytesEmitted
  }

  /**
   * Stream the command's output as decoded UTF-8 chunks, with stdout and stderr interleaved in
   * the order they arrived.
   *
   * You can call this more than once. Each call returns its own independent iterator over the
   * same shared output, so several consumers can read the logs at once without interfering with
   * one another. A consumer that attaches after the command has started will replay whatever
   * output is still held in the replay buffer before catching up to live output. A consumer
   * that reads too slowly may fall behind what the buffer can hold, in which case its iterator
   * fails with a SlowConsumerError.
   */
  async *logs(): AsyncGenerator<SandboxCommandExecutionLogChunk, void, void> {
    if (this.detached) throw detachedUnavailable()
    // Decode each stream incrementally with its own decoder so that a multi-byte UTF-8
    // character split across two chunks still decodes correctly instead of turning into
    // replacement characters at the chunk boundary. Each call to logs() keeps its own decoders,
    // so concurrent consumers don't share decoding state.
    const stdoutDecoder = new TextDecoder('utf-8', {fatal: false})
    const stderrDecoder = new TextDecoder('utf-8', {fatal: false})
    // Track the latest byte offset for each stream separately. When we flush a trailing partial
    // character at the end, it needs to carry its own stream's offset rather than whichever
    // stream happened to produce the most recent chunk. Per-stream offsets are what resume and
    // progress tracking rely on, so they must not be mixed.
    let lastStdoutOffset = 0
    let lastStderrOffset = 0
    for await (const event of this.events.iterate()) {
      const chunk = decodeEvent(event, stdoutDecoder, stderrDecoder)
      if (chunk) {
        if (chunk.stream === 'stdout') lastStdoutOffset = chunk.byteOffset
        else lastStderrOffset = chunk.byteOffset
        yield chunk
      }
    }
    // Once the stream ends, flush each decoder so any trailing partial UTF-8 character is
    // emitted as a replacement character rather than silently dropped.
    const stdoutTail = stdoutDecoder.decode()
    const stderrTail = stderrDecoder.decode()
    if (stdoutTail.length > 0) {
      yield {stream: 'stdout', data: stdoutTail, byteOffset: lastStdoutOffset, timestamp: new Date()}
    }
    if (stderrTail.length > 0) {
      yield {stream: 'stderr', data: stderrTail, byteOffset: lastStderrOffset, timestamp: new Date()}
    }
  }

  /**
   * Wait for the command to finish. The returned value is typed as
   * {@link SandboxCommandExecutionFinished}, so once it resolves you can read `exitCode` and
   * `finishedAt` without checking for undefined.
   */
  async wait(): Promise<SandboxCommandExecutionFinished> {
    if (this.detached) throw detachedUnavailable()
    // Wait on the terminal promise instead of reading the event log. Reading the log here would
    // advance a consumer cursor, which could let the replay buffer drop early output during a
    // quiet period — breaking the common pattern of `await cmd.wait()` followed by
    // `await cmd.output()`.
    await this._terminalPromise
    // Only narrow the type once both fields are actually present. The narrowed type declares
    // them as non-optional. A stream-level failure rejects the terminal promise, so we never
    // reach this point in that case.
    if (this._exitCode !== undefined && this._finishedAt !== undefined) {
      return this as SandboxCommandExecutionFinished
    }
    throw new Error(`SandboxCommandExecution ${this.cmdId} stream closed without Finished event`)
  }

  /**
   * Collect the command's output, waiting until the command finishes. Pass `'both'` (the
   * default) to get stdout and stderr interleaved in arrival order, or `'stdout'` / `'stderr'`
   * to get just one stream.
   *
   * This reads the output and watches for the command to finish using a single iterator,
   * rather than calling wait() first and replaying afterward. Replaying after wait() could miss
   * early output that the replay buffer had since dropped during a quiet period. Reading it all
   * in one pass keeps the iterator at the start of the output until output() has actually
   * consumed each chunk, so the only thing that can ever truncate the result is the 16 MiB
   * size limit.
   */
  async output(which: 'both' | 'stdout' | 'stderr' = 'both'): Promise<string> {
    if (this.detached) throw detachedUnavailable()
    const stdoutDecoder = new TextDecoder('utf-8', {fatal: false})
    const stderrDecoder = new TextDecoder('utf-8', {fatal: false})
    let out = ''
    for await (const event of this.events.iterate({fromOffset: 0})) {
      const chunk = decodeEvent(event, stdoutDecoder, stderrDecoder)
      if (chunk && (which === 'both' || which === chunk.stream)) {
        out += chunk.data
      }
      // An error event signals partial degradation mid-stream, not the end: the stream can
      // still recover and go on to deliver a Finished event. So don't stop here — keep
      // collecting output. If the stream really does close without finishing, the failure
      // surfaces as an exception from this loop instead.
      if (event.event.case === 'finished') break
    }
    // Flush the decoders so any trailing partial UTF-8 character is emitted as a replacement
    // character rather than silently dropped.
    if (which === 'both' || which === 'stdout') out += stdoutDecoder.decode()
    if (which === 'both' || which === 'stderr') out += stderrDecoder.decode()
    return out
  }

  /** Shorthand for `output('stdout')`. */
  stdout(): Promise<string> {
    return this.output('stdout')
  }

  /** Shorthand for `output('stderr')`. */
  stderr(): Promise<string> {
    return this.output('stderr')
  }

  /**
   * Build a {@link SandboxCommandExecution} from its wire representation. This is the single
   * place that maps proto fields onto instance fields, mirroring how `Sandbox.fromProto`
   * works.
   *
   * @internal
   */
  protected static fromProto(proto: SandboxCommandExecutionProto): SandboxCommandExecution {
    const instance = new SandboxCommandExecution({
      cmdId: proto.cmdId,
      sandboxId: proto.sandboxId,
      cmd: proto.cmd,
      args: proto.args,
      cwd: proto.cwd,
      env: proto.env,
      sudo: proto.sudo,
      detached: proto.detached,
      startedAt: requireTimestamp(proto.startedAt, 'SandboxCommandExecution.started_at'),
      status: commandStatusFromProto(proto.status) ?? 'running',
      stdoutBytesEmitted: Number(proto.stdoutBytesEmitted),
      stderrBytesEmitted: Number(proto.stderrBytesEmitted),
    })
    instance.applyProto(proto)
    // This builds a point-in-time snapshot of a command, with no live stream feeding new events
    // into its buffer. Close the buffer right away so that output() and logs() iterators
    // terminate normally instead of waiting forever for events that will never arrive.
    instance.events.end()
    // Settle the terminal promise based on the snapshot's status:
    //   - finished: the command exited cleanly, so exit_code and finished_at are present.
    //     Resolve to the narrowed finished type. If either field is missing, the snapshot is
    //     malformed, so reject and say so.
    //   - failed / killed: terminal, but the process may never have produced an exit code (the
    //     wire contract only guarantees one for a finished command). wait() rejects for these
    //     either way, so reject with the status rather than calling a real failure malformed.
    //   - running / pending: not a terminal state. A static snapshot can never go on to finish,
    //     so there is nothing to wait for — reject.
    if (instance._status === 'finished') {
      if (instance._exitCode !== undefined && instance._finishedAt !== undefined) {
        instance.settleTerminal()
      } else {
        instance.settleTerminal(
          new Error(`SandboxCommandExecution ${instance.cmdId} snapshot is FINISHED but missing exit_code/finished_at`),
        )
      }
    } else if (instance._status === 'failed' || instance._status === 'killed') {
      instance.settleTerminal(new Error(`SandboxCommandExecution ${instance.cmdId} ${instance._status}`))
    } else {
      instance.settleTerminal(
        new Error(
          `SandboxCommandExecution ${instance.cmdId} snapshot is not in a terminal state (status=${instance._status})`,
        ),
      )
    }
    return instance
  }

  /**
   * Construct an instance from the initial Started event, which carries only the command ID and
   * start time, together with the caller's original options — the case where no full command
   * proto is available yet. Same-package callers reach this through the {@link _commandInternals}
   * helper.
   *
   * @internal
   */
  protected static _fromStartedEvent(opts: {
    cmdId: string
    sandboxId: string
    cmd: string
    args: string[]
    cwd: string | undefined
    env: Record<string, string>
    sudo: boolean
    detached: boolean
    startedAt: Date
  }): SandboxCommandExecution {
    return new SandboxCommandExecution({
      cmdId: opts.cmdId,
      sandboxId: opts.sandboxId,
      cmd: opts.cmd,
      args: opts.args,
      cwd: opts.cwd,
      env: opts.env,
      sudo: opts.sudo,
      detached: opts.detached,
      startedAt: opts.startedAt,
      status: 'running',
      stdoutBytesEmitted: 0,
      stderrBytesEmitted: 0,
    })
  }

  /**
   * Update this instance's mutable fields from a fresh proto returned by the server. The
   * immutable identity fields are set once by the constructor; only the state-derived fields
   * (status, exit code, byte counts, and so on) are refreshed here.
   *
   * @internal
   */
  protected applyProto(proto: SandboxCommandExecutionProto): void {
    this._status = commandStatusFromProto(proto.status) ?? this._status
    this._exitCode = proto.exitCode
    this._finishedAt = proto.finishedAt !== undefined ? timestampDate(proto.finishedAt) : undefined
    this._stdoutBytesEmitted = Number(proto.stdoutBytesEmitted)
    this._stderrBytesEmitted = Number(proto.stderrBytesEmitted)
  }

  /**
   * Apply a single event to this command: update the instance's mutable fields to reflect it,
   * then append it to the event log. The events arrive in the sequence Started, then any number
   * of Stdout and Stderr events, then Finished. Called by the background task that
   * `Sandbox.runCommand` starts to consume the server's response stream.
   *
   * @internal
   */
  protected _ingestEvent(event: SandboxCommandExecutionEvent): void {
    const e = event.event
    switch (e.case) {
      case 'started':
        this._status = 'running'
        break
      case 'stdout':
        this._stdoutBytesEmitted = Number(e.value.byteOffset)
        break
      case 'stderr':
        this._stderrBytesEmitted = Number(e.value.byteOffset)
        break
      case 'finished':
        this._exitCode = e.value.exitCode
        this._finishedAt = e.value.finishedAt !== undefined ? timestampDate(e.value.finishedAt) : new Date()
        // The exit code is separate from the status. A Finished event means the process exited
        // and produced an exit code, whatever that code is — even a non-zero one still counts as
        // finished. The 'failed' status is reserved for cases where the process never produced
        // an exit code at all, such as the host aborting or the stream dying; those arrive
        // through the 'error' case below or through _failStream().
        this._status = 'finished'
        this.settleTerminal()
        break
      case 'error':
        // An error event signals partial degradation mid-stream; it is not the terminal marker.
        // The stream can still deliver more output and eventually a Finished event. Leave the
        // status unchanged so that code polling status() doesn't see the terminal 'failed' value
        // for a command that ends up succeeding. Just remember the reason, so _endStream can use
        // it if the stream ends without a Finished event. The command settles only on Finished,
        // _endStream, or _failStream.
        this._lastErrorReason = e.value.reason
        break
      case 'evicted':
      case undefined:
        break
    }
    this.events.append(event)
  }

  /**
   * Close the event log so any iterators that are still draining their queues can complete.
   * Called by the background task when the server stream closes normally.
   *
   * @internal
   */
  protected _endStream(): void {
    this.events.end()
    // If a Finished event already settled the command, this does nothing. Otherwise the stream
    // closed cleanly but never delivered a Finished event, which counts as a failure. Use the
    // last mid-stream error reason if one was seen, since it carries the more useful message,
    // and otherwise fall back to a generic message.
    const message =
      this._lastErrorReason !== undefined
        ? `SandboxCommandExecution ${this.cmdId} failed: ${this._lastErrorReason}`
        : `SandboxCommandExecution ${this.cmdId} stream closed without Finished event`
    this.settleTerminal(new Error(message))
  }

  /**
   * Fail the event log so its iterators reject. Called by the background task when the server
   * stream errors.
   *
   * @internal
   */
  protected _failStream(err: unknown): void {
    this._status = 'failed'
    this.events.error(err)
    this.settleTerminal(err)
  }
}

/**
 * A typed view of a {@link SandboxCommandExecution} that has finished. It is the same runtime
 * object that `wait()` was called on — identity is preserved — but its type narrows `exitCode`
 * and `finishedAt` to be non-undefined, so you don't have to check for undefined after awaiting.
 *
 * This is deliberately an intersection type rather than a subclass. A subclass would only narrow
 * at runtime if `wait()` built a new instance, which would break identity with any `logs()`
 * consumers still holding the original reference. The intersection lets the return type of
 * `wait()` narrow at the type level while `this` remains the one and only instance.
 */
export type SandboxCommandExecutionFinished = SandboxCommandExecution & {
  readonly exitCode: number
  readonly finishedAt: Date
}

// A detached command runs fire-and-forget: the server never streams its output
// back and nothing is stored, so the SDK has no events to hand out. logs(),
// output(), and wait() raise this rather than hang forever or return empty.
function detachedUnavailable(): Error {
  return new Error(
    'this command was run detached (beta): its output is not retained and cannot be retrieved yet, ' +
      'so logs(), output(), and wait() are unavailable',
  )
}

function commandStatusFromProto(status: CommandStatusProto): SandboxCommandExecutionStatus | undefined {
  switch (status) {
    case CommandStatusProto.PENDING:
      return 'pending'
    case CommandStatusProto.RUNNING:
      return 'running'
    case CommandStatusProto.FINISHED:
      return 'finished'
    case CommandStatusProto.FAILED:
      return 'failed'
    case CommandStatusProto.KILLED:
      return 'killed'
    case CommandStatusProto.UNSPECIFIED:
      return undefined
  }
}

function requireTimestamp(ts: Timestamp | undefined, field: string): Date {
  if (ts === undefined) {
    throw new Error(`SandboxCommandExecution proto missing required ${field}`)
  }
  return timestampDate(ts)
}

function commandEventByteCost(event: SandboxCommandExecutionEvent): number {
  const e = event.event
  if (e.case === 'stdout' || e.case === 'stderr') return e.value.data.byteLength
  return 0
}

function decodeEvent(
  event: SandboxCommandExecutionEvent,
  stdoutDecoder: InstanceType<typeof TextDecoder>,
  stderrDecoder: InstanceType<typeof TextDecoder>,
): SandboxCommandExecutionLogChunk | null {
  const e = event.event
  if (e.case === 'stdout') {
    return {
      stream: 'stdout',
      data: stdoutDecoder.decode(e.value.data, {stream: true}),
      byteOffset: Number(e.value.byteOffset),
      timestamp: e.value.timestamp !== undefined ? timestampDate(e.value.timestamp) : new Date(),
    }
  }
  if (e.case === 'stderr') {
    return {
      stream: 'stderr',
      data: stderrDecoder.decode(e.value.data, {stream: true}),
      byteOffset: Number(e.value.byteOffset),
      timestamp: e.value.timestamp !== undefined ? timestampDate(e.value.timestamp) : new Date(),
    }
  }
  return null
}

// A same-package entry point that lets `Sandbox.runCommand` create a SandboxCommandExecution
// from a Started event and feed events into its log. TypeScript only enforces `protected`
// within the class and its subclasses, so these helpers cast to a structural shape in order to
// call the underscore-prefixed methods. The leading underscore and the fact that this is not
// exported from index.ts keep it off the public API surface. It exists only for
// the runCommand machinery, not as a stable, supported API.
export const _commandInternals = {
  fromStartedEvent(opts: {
    cmdId: string
    sandboxId: string
    cmd: string
    args: string[]
    cwd: string | undefined
    env: Record<string, string>
    sudo: boolean
    detached: boolean
    startedAt: Date
  }): SandboxCommandExecution {
    return (
      SandboxCommandExecution as unknown as {_fromStartedEvent(o: typeof opts): SandboxCommandExecution}
    )._fromStartedEvent(opts)
  },
  ingest(cmd: SandboxCommandExecution, event: SandboxCommandExecutionEvent): void {
    ;(cmd as unknown as {_ingestEvent(e: SandboxCommandExecutionEvent): void})._ingestEvent(event)
  },
  end(cmd: SandboxCommandExecution): void {
    ;(cmd as unknown as {_endStream(): void})._endStream()
  },
  fail(cmd: SandboxCommandExecution, err: unknown): void {
    ;(cmd as unknown as {_failStream(err: unknown): void})._failStream(err)
  },
}
