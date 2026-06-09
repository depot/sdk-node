import {create, type MessageInitShape} from '@bufbuild/protobuf'
import {timestampFromDate} from '@bufbuild/protobuf/wkt'
import assert from 'node:assert'
import test from 'node:test'
import {_commandInternals, SandboxCommandExecution, type SandboxCommandExecutionFinished} from './command.js'
import {
  SandboxCommandExecutionStatus as CommandStatusProto,
  SandboxCommandExecutionEvent_FinishedSchema,
  SandboxCommandExecutionEvent_StartedSchema,
  SandboxCommandExecutionEvent_StderrBytesSchema,
  SandboxCommandExecutionEvent_StdoutBytesSchema,
  SandboxCommandExecutionEventSchema,
  SandboxCommandExecutionSchema,
  type SandboxCommandExecutionEvent,
} from './gen/depot/sandbox/v1/command_pb.js'

// These tests cover the round-trip between a wire proto and a SandboxCommandExecution
// instance. The proto-to-field mapping lives in one place, and if someone adds a new
// field they need to update both fromProto and applyProto. These tests catch the case
// where the constructor populates a field but applyProto forgets to refresh it.

const STARTED_AT = new Date('2026-05-23T10:00:00.000Z')
const FINISHED_AT = new Date('2026-05-23T10:00:05.500Z')

function makeProto(overrides: MessageInitShape<typeof SandboxCommandExecutionSchema> = {}) {
  return create(SandboxCommandExecutionSchema, {
    cmdId: 'cmd_01H9X',
    sandboxId: 'sbx_01H9X',
    cmd: '/bin/echo',
    args: ['hello', 'world'],
    cwd: '/tmp',
    env: {FOO: 'bar'},
    sudo: false,
    detached: false,
    status: CommandStatusProto.RUNNING,
    startedAt: timestampFromDate(STARTED_AT),
    stdoutBytesEmitted: 0n,
    stderrBytesEmitted: 0n,
    ...overrides,
  })
}

test('SandboxCommandExecution.fromProto populates readonly fields from a wire-shape proto', () => {
  const cmd = (
    SandboxCommandExecution as unknown as {fromProto: (p: ReturnType<typeof makeProto>) => SandboxCommandExecution}
  ).fromProto(makeProto())
  assert.equal(cmd.cmdId, 'cmd_01H9X')
  assert.equal(cmd.sandboxId, 'sbx_01H9X')
  assert.equal(cmd.cmd, '/bin/echo')
  assert.deepEqual([...cmd.args], ['hello', 'world'])
  assert.equal(cmd.cwd, '/tmp')
  assert.deepEqual({...cmd.env}, {FOO: 'bar'})
  assert.equal(cmd.sudo, false)
  assert.equal(cmd.detached, false)
  assert.equal(cmd.startedAt.toISOString(), STARTED_AT.toISOString())
  assert.equal(cmd.status, 'running')
  assert.equal(cmd.exitCode, undefined)
  assert.equal(cmd.finishedAt, undefined)
  assert.equal(cmd.stdoutBytesEmitted, 0)
  assert.equal(cmd.stderrBytesEmitted, 0)
})

test('SandboxCommandExecution.applyProto refreshes mutable accessors on settle', () => {
  type CmdInternal = SandboxCommandExecution & {applyProto(p: ReturnType<typeof makeProto>): void}
  const cmd = (
    SandboxCommandExecution as unknown as {fromProto: (p: ReturnType<typeof makeProto>) => SandboxCommandExecution}
  ).fromProto(makeProto())
  assert.equal(cmd.status, 'running')
  assert.equal(cmd.exitCode, undefined)
  ;(cmd as CmdInternal).applyProto(
    makeProto({
      status: CommandStatusProto.FINISHED,
      exitCode: 0,
      finishedAt: timestampFromDate(FINISHED_AT),
      stdoutBytesEmitted: 12n,
      stderrBytesEmitted: 4n,
    }),
  )

  assert.equal(cmd.status, 'finished')
  assert.equal(cmd.exitCode, 0)
  assert.equal(cmd.finishedAt?.toISOString(), FINISHED_AT.toISOString())
  assert.equal(cmd.stdoutBytesEmitted, 12)
  assert.equal(cmd.stderrBytesEmitted, 4)
})

test('SandboxCommandExecutionFinished is a type-narrowed view of the same instance', () => {
  type CmdInternal = SandboxCommandExecution & {applyProto(p: ReturnType<typeof makeProto>): void}
  const cmd = (
    SandboxCommandExecution as unknown as {fromProto: (p: ReturnType<typeof makeProto>) => SandboxCommandExecution}
  ).fromProto(makeProto())
  ;(cmd as CmdInternal).applyProto(
    makeProto({
      status: CommandStatusProto.FINISHED,
      exitCode: 1,
      finishedAt: timestampFromDate(FINISHED_AT),
    }),
  )
  // SandboxCommandExecutionFinished is just the same instance viewed through a narrower
  // type that marks exitCode and finishedAt as non-undefined. Casting to it preserves
  // object identity, so callers don't have to re-check those fields after wait().
  const finished = cmd as SandboxCommandExecutionFinished
  assert.strictEqual(finished, cmd)
  assert.equal(finished.exitCode, 1)
  assert.equal(finished.finishedAt.toISOString(), FINISHED_AT.toISOString())
})

// The remaining tests cover the runCommand driver: how it ingests a stream of execution
// events and surfaces them through the accessors, logs(), output(), and wait().

function makeStartedEvent(cmdId: string, at: Date): SandboxCommandExecutionEvent {
  return create(SandboxCommandExecutionEventSchema, {
    event: {
      case: 'started',
      value: create(SandboxCommandExecutionEvent_StartedSchema, {cmdId, startedAt: timestampFromDate(at)}),
    },
  })
}

function makeStdoutEvent(data: string, byteOffset: number): SandboxCommandExecutionEvent {
  return create(SandboxCommandExecutionEventSchema, {
    event: {
      case: 'stdout',
      value: create(SandboxCommandExecutionEvent_StdoutBytesSchema, {
        data: new TextEncoder().encode(data),
        byteOffset: BigInt(byteOffset),
        timestamp: timestampFromDate(new Date()),
      }),
    },
  })
}

function makeStderrEvent(data: string, byteOffset: number): SandboxCommandExecutionEvent {
  return create(SandboxCommandExecutionEventSchema, {
    event: {
      case: 'stderr',
      value: create(SandboxCommandExecutionEvent_StderrBytesSchema, {
        data: new TextEncoder().encode(data),
        byteOffset: BigInt(byteOffset),
        timestamp: timestampFromDate(new Date()),
      }),
    },
  })
}

function makeFinishedEvent(exitCode: number, at: Date): SandboxCommandExecutionEvent {
  return create(SandboxCommandExecutionEventSchema, {
    event: {
      case: 'finished',
      value: create(SandboxCommandExecutionEvent_FinishedSchema, {exitCode, finishedAt: timestampFromDate(at)}),
    },
  })
}

test('runCommand driver: ingest pumps Started→stdout→Finished through to accessors and wait()', async () => {
  const cmd = _commandInternals.fromStartedEvent({
    cmdId: 'cmd_01H9X',
    sandboxId: 'sbx_01H9X',
    cmd: '/bin/echo',
    args: ['hello'],
    cwd: undefined,
    env: {},
    sudo: false,
    detached: false,
    startedAt: STARTED_AT,
  })

  _commandInternals.ingest(cmd, makeStartedEvent('cmd_01H9X', STARTED_AT))
  _commandInternals.ingest(cmd, makeStdoutEvent('hello\n', 6))
  _commandInternals.ingest(cmd, makeFinishedEvent(0, FINISHED_AT))
  _commandInternals.end(cmd)

  const finished = await cmd.wait()
  assert.strictEqual(finished, cmd)
  assert.equal(finished.exitCode, 0)
  assert.equal(finished.finishedAt.toISOString(), FINISHED_AT.toISOString())
  assert.equal(cmd.status, 'finished')
  assert.equal(cmd.stdoutBytesEmitted, 6)
})

test('runCommand driver: logs() yields decoded UTF-8 chunks per stream', async () => {
  const cmd = _commandInternals.fromStartedEvent({
    cmdId: 'cmd_01H9Y',
    sandboxId: 'sbx_01H9Y',
    cmd: '/bin/sh',
    args: ['-c', 'echo out; echo err 1>&2'],
    cwd: undefined,
    env: {},
    sudo: false,
    detached: false,
    startedAt: STARTED_AT,
  })

  _commandInternals.ingest(cmd, makeStartedEvent('cmd_01H9Y', STARTED_AT))
  _commandInternals.ingest(cmd, makeStdoutEvent('out\n', 4))
  _commandInternals.ingest(cmd, makeStderrEvent('err\n', 4))
  _commandInternals.ingest(cmd, makeFinishedEvent(0, FINISHED_AT))
  _commandInternals.end(cmd)

  const chunks: Array<{stream: string; data: string}> = []
  for await (const c of cmd.logs()) chunks.push({stream: c.stream, data: c.data})
  assert.deepEqual(chunks, [
    {stream: 'stdout', data: 'out\n'},
    {stream: 'stderr', data: 'err\n'},
  ])
})

test('runCommand driver: output("stdout") returns concatenated stdout only', async () => {
  const cmd = _commandInternals.fromStartedEvent({
    cmdId: 'cmd_01H9Z',
    sandboxId: 'sbx_01H9Z',
    cmd: '/bin/sh',
    args: [],
    cwd: undefined,
    env: {},
    sudo: false,
    detached: false,
    startedAt: STARTED_AT,
  })

  _commandInternals.ingest(cmd, makeStartedEvent('cmd_01H9Z', STARTED_AT))
  _commandInternals.ingest(cmd, makeStdoutEvent('hello ', 6))
  _commandInternals.ingest(cmd, makeStderrEvent('boom\n', 5))
  _commandInternals.ingest(cmd, makeStdoutEvent('world\n', 12))
  _commandInternals.ingest(cmd, makeFinishedEvent(0, FINISHED_AT))
  _commandInternals.end(cmd)

  assert.equal(await cmd.output('stdout'), 'hello world\n')
  assert.equal(await cmd.output('stderr'), 'boom\n')
  assert.equal(await cmd.output('both'), 'hello boom\nworld\n')
})

test('runCommand driver: wait() throws when stream surfaces an Error event', async () => {
  const cmd = _commandInternals.fromStartedEvent({
    cmdId: 'cmd_01HBAD',
    sandboxId: 'sbx_01HBAD',
    cmd: '/bin/false',
    args: [],
    cwd: undefined,
    env: {},
    sudo: false,
    detached: false,
    startedAt: STARTED_AT,
  })
  _commandInternals.ingest(cmd, makeStartedEvent('cmd_01HBAD', STARTED_AT))
  _commandInternals.ingest(
    cmd,
    create(SandboxCommandExecutionEventSchema, {event: {case: 'error', value: {reason: 'vm vanished'}}}),
  )
  _commandInternals.end(cmd)

  await assert.rejects(() => cmd.wait(), /vm vanished/)
})

test('detached command: logs(), output(), and wait() are unavailable', async () => {
  // A detached command runs fire-and-forget; the driver ingests Started and
  // then returns without draining, so the SDK holds no output for it. All three
  // output-facing accessors must reject rather than hang or return empty.
  const cmd = _commandInternals.fromStartedEvent({
    cmdId: 'cmd_01HDETACH',
    sandboxId: 'sbx_01HDETACH',
    cmd: '/bin/sleep',
    args: ['3600'],
    cwd: undefined,
    env: {},
    sudo: false,
    detached: true,
    startedAt: STARTED_AT,
  })
  _commandInternals.ingest(cmd, makeStartedEvent('cmd_01HDETACH', STARTED_AT))

  assert.equal(cmd.detached, true)
  await assert.rejects(() => cmd.wait(), /detached/)
  await assert.rejects(() => cmd.output(), /detached/)
  await assert.rejects(async () => {
    for await (const _ of cmd.logs()) {
      // unreachable — logs() throws as soon as it is iterated
    }
  }, /detached/)
})
