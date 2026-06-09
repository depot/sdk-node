import {create} from '@bufbuild/protobuf'
import {Code, ConnectError} from '@connectrpc/connect'
import assert from 'node:assert'
import test from 'node:test'
import type {SandboxClient} from './client.js'
import {FileSystemError} from './errors.js'
import {DirEntry, FileSystem, StatResult} from './filesystem.js'
import {
  FileChunkSchema,
  FileSystemErrorCode,
  FileSystemErrorDetailSchema,
  FileType,
  ReadDirResponseSchema,
  StatResponseSchema,
  type WriteFileRequest,
  WriteFileResponseSchema,
} from './gen/depot/sandbox/v1/filesystem_pb.js'

// A fake SandboxClient whose rpc methods record the last request they received
// and either return a scripted response or throw a scripted error. Only the
// methods the FileSystem class touches are stubbed; everything else throws if
// called, so a test that hits an unexpected method fails loudly.
function fakeClient(overrides: Partial<Record<string, (req: unknown) => unknown>>): {
  client: SandboxClient
  lastRequest: () => unknown
} {
  let last: unknown
  const handler = (name: string) => {
    const fn = overrides[name]
    if (!fn) throw new Error(`unexpected RPC call: ${name}`)
    return (req: unknown) => {
      last = req
      return fn(req)
    }
  }
  const rpc = new Proxy(
    {},
    {
      get(_target, prop: string) {
        return handler(prop)
      },
    },
  )
  return {
    client: {rpc, endpoint: 'http://test'} as unknown as SandboxClient,
    lastRequest: () => last,
  }
}

// Build a ConnectError carrying a FileSystemErrorDetail, as the server sends.
function connectErrorWithDetail(
  code: FileSystemErrorCode,
  syscall: string,
  path: string,
  message?: string,
): ConnectError {
  const detail = create(FileSystemErrorDetailSchema, {code, syscall, path, message})
  return new ConnectError(message ?? 'failure', Code.FailedPrecondition, undefined, [
    {desc: FileSystemErrorDetailSchema, value: detail},
  ])
}

test('mkdir sends the request against the bound sandbox', async () => {
  const recording = fakeClient({mkdir: () => ({})})
  const fs = new FileSystem({client: recording.client, sandboxId: 'sbx_1'})
  await fs.mkdir('/work', {recursive: true, mode: 0o755})
  assert.deepEqual(recording.lastRequest(), {
    sandbox: {selector: {case: 'id', value: 'sbx_1'}},
    path: '/work',
    recursive: true,
    mode: 0o755,
  })
})

test('stat maps the response into a StatResult with isFile/isDirectory', async () => {
  const {client} = fakeClient({
    stat: () =>
      create(StatResponseSchema, {
        path: '/f',
        size: 2048n,
        mode: 0o644,
        type: FileType.FILE,
        uname: 'alice',
        gname: 'staff',
        mtimeUnixSeconds: 1700000000n,
      }),
  })
  const fs = new FileSystem({client, sandboxId: 'sbx_1'})
  const stat = await fs.stat('/f')
  assert.ok(stat instanceof StatResult)
  assert.equal(stat.size, 2048)
  assert.equal(stat.mode, 0o644)
  assert.equal(stat.uname, 'alice')
  assert.equal(stat.mtime.getTime(), 1700000000 * 1000)
  assert.equal(stat.isFile(), true)
  assert.equal(stat.isDirectory(), false)
})

test('readdir returns names by default and DirEntry[] with withFileTypes', async () => {
  const response = create(ReadDirResponseSchema, {
    entries: [
      {name: 'a.txt', type: FileType.FILE},
      {name: 'sub', type: FileType.DIRECTORY},
    ],
  })
  const fs = new FileSystem({client: fakeClient({readDir: () => response}).client, sandboxId: 'sbx_1'})
  const names = await fs.readdir('/d')
  assert.deepEqual(names, ['a.txt', 'sub'])

  const fs2 = new FileSystem({client: fakeClient({readDir: () => response}).client, sandboxId: 'sbx_1'})
  const entries = await fs2.readdir('/d', {withFileTypes: true})
  assert.ok((entries[0] as DirEntry) instanceof DirEntry)
  assert.equal((entries[1] as DirEntry).isDirectory(), true)
})

test('readFile concatenates streamed chunks and decodes with an encoding', async () => {
  async function* chunks() {
    yield create(FileChunkSchema, {data: new TextEncoder().encode('hello ')})
    yield create(FileChunkSchema, {data: new TextEncoder().encode('world')})
    yield create(FileChunkSchema, {data: new Uint8Array(0), eof: true})
  }
  const fs = new FileSystem({client: fakeClient({readFile: () => chunks()}).client, sandboxId: 'sbx_1'})
  const text = await fs.readFile('/f', {encoding: 'utf-8'})
  assert.equal(text, 'hello world')
})

test('writeFile streams an init message then the data', async () => {
  const drained: WriteFileRequest[] = []
  const recording = fakeClient({
    writeFile: async (req) => {
      // Drain the request stream so the SDK's generator runs and we can inspect it.
      for await (const m of req as AsyncIterable<WriteFileRequest>) drained.push(m)
      return create(WriteFileResponseSchema, {bytesWritten: BigInt(drained.length)})
    },
  })
  const fs = new FileSystem({client: recording.client, sandboxId: 'sbx_1'})
  await fs.writeFile('/f', 'hi', {recursive: true, mode: 0o600})

  // Exactly two messages: the init naming the file and its options, then the bytes.
  assert.equal(drained.length, 2)
  const init = drained[0]?.input
  assert.equal(init?.case, 'init')
  if (init?.case === 'init') {
    assert.equal(init.value.path, '/f')
    assert.equal(init.value.mode, 0o600)
    assert.equal(init.value.append, false)
    assert.equal(init.value.createDirectories, true)
  }
  const data = drained[1]?.input
  assert.equal(data?.case, 'data')
  if (data?.case === 'data') {
    assert.equal(new TextDecoder().decode(data.value), 'hi')
  }
})

test('writeFile splits a large payload into frames under the gRPC message ceiling', async () => {
  // A payload bigger than one gRPC message must arrive as several data frames,
  // none larger than 4 MiB, behind a single init — so a gRPC client of this
  // same stream wouldn't reject an oversized message.
  const GRPC_MAX = 1024 * 1024 * 4
  const drained: WriteFileRequest[] = []
  const recording = fakeClient({
    writeFile: async (req) => {
      for await (const m of req as AsyncIterable<WriteFileRequest>) drained.push(m)
      return create(WriteFileResponseSchema, {bytesWritten: 0n})
    },
  })
  const fs = new FileSystem({client: recording.client, sandboxId: 'sbx_1'})
  const size = GRPC_MAX * 2 + 99
  await fs.writeFile('/big', new Uint8Array(size))

  assert.equal(drained.filter((m) => m.input.case === 'init').length, 1)
  const dataFrames = drained.filter((m) => m.input.case === 'data')
  assert.ok(dataFrames.length > 1, 'expected the payload to be split across multiple frames')
  let total = 0
  for (const m of dataFrames) {
    if (m.input.case === 'data') {
      assert.ok(m.input.value.byteLength <= GRPC_MAX, 'no frame may exceed the gRPC ceiling')
      total += m.input.value.byteLength
    }
  }
  assert.equal(total, size)
})

test('truncate rejects a negative size with EINVAL before hitting the wire', async () => {
  let called = false
  const fs = new FileSystem({
    client: fakeClient({
      truncate: () => {
        called = true
        return {}
      },
    }).client,
    sandboxId: 'sbx_1',
  })
  await assert.rejects(
    () => fs.truncate('/f', -1),
    (err: unknown) => err instanceof FileSystemError && err.code === 'EINVAL',
  )
  assert.equal(called, false)
})

test('a ConnectError with a detail becomes a Node-shape FileSystemError', async () => {
  const fs = new FileSystem({
    client: fakeClient({
      stat: () => {
        throw connectErrorWithDetail(FileSystemErrorCode.FILESYSTEM_ERROR_CODE_ENOENT, 'stat', '/missing')
      },
    }).client,
    sandboxId: 'sbx_1',
  })
  await assert.rejects(
    () => fs.stat('/missing'),
    (err: unknown) => {
      assert.ok(err instanceof FileSystemError)
      assert.equal(err.code, 'ENOENT')
      assert.equal(err.syscall, 'stat')
      assert.equal(err.path, '/missing')
      assert.equal(err.errno, -2)
      return true
    },
  )
})

test('code and errno are derived from the enum value (no hand-maintained table)', async () => {
  // ENOSPC's enum value is its Linux errno (28), so the negated errno falls out
  // for free — proving the derivation works for codes beyond the original set.
  const full = new FileSystem({
    client: fakeClient({
      stat: () => {
        throw connectErrorWithDetail(FileSystemErrorCode.FILESYSTEM_ERROR_CODE_ENOSPC, 'write', '/disk')
      },
    }).client,
    sandboxId: 'sbx_1',
  })
  await assert.rejects(
    () => full.stat('/disk'),
    (err: unknown) => err instanceof FileSystemError && err.code === 'ENOSPC' && err.errno === -28,
  )

  // OTHER is the off-band sentinel: no real errno, so it reads as -1.
  const other = new FileSystem({
    client: fakeClient({
      stat: () => {
        throw connectErrorWithDetail(FileSystemErrorCode.FILESYSTEM_ERROR_CODE_OTHER, 'stat', '/x')
      },
    }).client,
    sandboxId: 'sbx_1',
  })
  await assert.rejects(
    () => other.stat('/x'),
    (err: unknown) => err instanceof FileSystemError && err.code === 'OTHER' && err.errno === -1,
  )
})

test('a ConnectError without a detail still yields an OTHER FileSystemError', async () => {
  const fs = new FileSystem({
    client: fakeClient({
      mkdir: () => {
        throw new ConnectError('transport blew up', Code.Unavailable)
      },
    }).client,
    sandboxId: 'sbx_1',
  })
  await assert.rejects(
    () => fs.mkdir('/x'),
    (err: unknown) => err instanceof FileSystemError && err.code === 'OTHER' && err.syscall === 'mkdir',
  )
})

test('exists returns false on ENOENT and true otherwise', async () => {
  const missing = new FileSystem({
    client: fakeClient({
      stat: () => {
        throw connectErrorWithDetail(FileSystemErrorCode.FILESYSTEM_ERROR_CODE_ENOENT, 'stat', '/nope')
      },
    }).client,
    sandboxId: 'sbx_1',
  })
  assert.equal(await missing.exists('/nope'), false)

  const present = new FileSystem({
    client: fakeClient({stat: () => create(StatResponseSchema, {path: '/yes', type: FileType.FILE})}).client,
    sandboxId: 'sbx_1',
  })
  assert.equal(await present.exists('/yes'), true)
})

test('exists rethrows a non-ENOENT error rather than reporting absence', async () => {
  const fs = new FileSystem({
    client: fakeClient({
      stat: () => {
        throw connectErrorWithDetail(FileSystemErrorCode.FILESYSTEM_ERROR_CODE_EACCES, 'stat', '/secret')
      },
    }).client,
    sandboxId: 'sbx_1',
  })
  await assert.rejects(
    () => fs.exists('/secret'),
    (err: unknown) => err instanceof FileSystemError && err.code === 'EACCES',
  )
})

test('realpath throws ELOOP after exhausting the symlink hop limit', async () => {
  // Every lstat reports a symlink and every readlink points back into the
  // chain, so the walk never resolves and must bail with ELOOP, not OTHER.
  const fs = new FileSystem({
    client: fakeClient({
      stat: () => create(StatResponseSchema, {path: '/loop', type: FileType.SYMLINK}),
      readlink: () => ({target: '/loop'}),
    }).client,
    sandboxId: 'sbx_1',
  })
  await assert.rejects(
    () => fs.realpath('/loop'),
    (err: unknown) => err instanceof FileSystemError && err.code === 'ELOOP',
  )
})

test('chmod accepts an octal string and converts it', async () => {
  const recording = fakeClient({chmod: () => ({})})
  const fs = new FileSystem({client: recording.client, sandboxId: 'sbx_1'})
  await fs.chmod('/f', '755')
  assert.deepEqual(recording.lastRequest(), {
    sandbox: {selector: {case: 'id', value: 'sbx_1'}},
    path: '/f',
    mode: 0o755,
  })
})

test('chmod rejects an invalid octal string with EINVAL and never hits the wire', async () => {
  let called = false
  const fs = new FileSystem({
    client: fakeClient({
      chmod: () => {
        called = true
        return {}
      },
    }).client,
    sandboxId: 'sbx_1',
  })
  // '9' is not an octal digit, so parseInt('999', 8) is NaN.
  await assert.rejects(
    () => fs.chmod('/f', '999'),
    (err: unknown) => err instanceof FileSystemError && err.code === 'EINVAL',
  )
  assert.equal(called, false)
})

test('chmod rejects an out-of-range numeric mode with EINVAL', async () => {
  const fs = new FileSystem({client: fakeClient({chmod: () => ({})}).client, sandboxId: 'sbx_1'})
  await assert.rejects(
    () => fs.chmod('/f', 0o10000),
    (err: unknown) => err instanceof FileSystemError && err.code === 'EINVAL',
  )
})
