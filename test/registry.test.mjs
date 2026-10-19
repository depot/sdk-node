import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
import {createServer} from 'node:http2'
import {createRequire} from 'node:module'
import {once} from 'node:events'
import {test} from 'node:test'
import {Code, ConnectError} from '@connectrpc/connect'
import {createClient} from '../dist/index.mjs'
import {fromBinary, toBinary, fromJson, toJson} from '@bufbuild/protobuf'
import * as registry from '../src/gen/depot/registry/v1beta1/registry_pb.ts'

const require = createRequire(import.meta.url)

// A local Connect endpoint exercises the shipped SDK's encoding, authentication,
// response decoding, and error propagation without changing real retention policies.
async function endpoint(t, response, status = 200) {
  const requests = []
  const sessions = new Set()
  const server = createServer()
  server.on('session', (session) => {
    sessions.add(session)
    session.on('close', () => sessions.delete(session))
  })
  server.on('stream', (stream, headers) => {
    const chunks = []
    stream.on('data', (chunk) => chunks.push(chunk))
    stream.on('end', () => {
      const method = headers[':path'].split('/').at(-1)
      const input = registry[`${method}RequestSchema`]
      const output = registry[`${method}ResponseSchema`]
      requests.push({headers, body: toJson(input, fromBinary(input, Buffer.concat(chunks)))})
      stream.respond({':status': status, 'content-type': status === 200 ? 'application/proto' : 'application/json'})
      stream.end(status === 200 ? toBinary(output, fromJson(output, response)) : JSON.stringify(response))
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    for (const session of sessions) session.destroy()
    await new Promise((resolve) => server.close(resolve))
  })
  return {baseURL: `http://127.0.0.1:${server.address().port}`, requests}
}

for (const [format, makeClient] of [
  ['ESM', createClient],
  ['CommonJS', require('../dist/index.cjs').createClient],
]) {
  for (const [repository, strategy] of [
    ['team/app', {keepCount: 10}],
    ['**', {keepDays: 30}],
  ]) {
    test(`${format}: upsert and decode ${repository} retention`, async (t) => {
      const policy = {repository, enabled: true, ...strategy, createdAt: '2026-10-19T00:00:00Z'}
      const {baseURL, requests} = await endpoint(t, {policy})
      const client = makeClient({baseURL, token: 'organization-token'})
      const result = await client.registry.v1beta1.RegistryService.upsertRetentionPolicy({
        repository,
        enabled: true,
        ...strategy,
      })
      assert.equal(result.policy.repository, repository)
      assert.equal(result.policy.keepCount, strategy.keepCount)
      assert.equal(result.policy.keepDays, strategy.keepDays)
      assert.equal(result.policy.createdAt.seconds, 1792368000n)
      assert.equal(requests.length, 1)
      assert.equal(requests[0].headers[':path'], '/depot.registry.v1beta1.RegistryService/UpsertRetentionPolicy')
      assert.equal(requests[0].headers.authorization, 'Bearer organization-token')
      assert.equal(requests[0].headers['x-depot-org'], undefined)
      assert.deepEqual(requests[0].body, {repository, enabled: true, ...strategy})
    })
  }
}

test('get returns an explicit policy and preserves an absent strategy', async (t) => {
  const {baseURL} = await endpoint(t, {policy: {repository: 'team/app', enabled: true, keepDays: 30}})
  const {policy} = await createClient({
    baseURL,
    token: 'organization-token',
  }).registry.v1beta1.RegistryService.getRetentionPolicy({repository: 'team/app'})
  assert.equal(policy.keepDays, 30)
  assert.equal(policy.keepCount, undefined)
})

test('get without an explicit policy returns no policy', async (t) => {
  const {baseURL, requests} = await endpoint(t, {})
  const {policy} = await createClient({
    baseURL,
    token: 'organization-token',
  }).registry.v1beta1.RegistryService.getRetentionPolicy({repository: 'team/app'})
  assert.equal(policy, undefined)
  assert.deepEqual(requests[0].body, {repository: 'team/app'})
  assert.equal(requests[0].headers[':path'], '/depot.registry.v1beta1.RegistryService/GetRetentionPolicy')
})

for (const repository of ['team/app', '**']) {
  test(`delete explicit policy for ${repository}`, async (t) => {
    const {baseURL, requests} = await endpoint(t, {})
    await createClient({baseURL, token: 'organization-token'}).registry.v1beta1.RegistryService.deleteRetentionPolicy({
      repository,
    })
    assert.equal(requests[0].headers[':path'], '/depot.registry.v1beta1.RegistryService/DeleteRetentionPolicy')
    assert.equal(requests[0].headers.authorization, 'Bearer organization-token')
    assert.deepEqual(requests[0].body, {repository})
  })
}

for (const strategy of [{}, {keepCount: 10, keepDays: 30}, {keepCount: 0}, {keepDays: 0}]) {
  test(`preserve invalid strategy and expose API rejection: ${JSON.stringify(strategy)}`, async (t) => {
    const {baseURL, requests} = await endpoint(
      t,
      {code: 'invalid_argument', message: 'Invalid retention strategy'},
      400,
    )
    await assert.rejects(
      createClient({baseURL, token: 'organization-token'}).registry.v1beta1.RegistryService.upsertRetentionPolicy({
        repository: 'team/app',
        ...strategy,
      }),
      (error) => error instanceof ConnectError && error.code === Code.InvalidArgument,
    )
    assert.deepEqual(requests[0].body, {repository: 'team/app', ...strategy})
  })
}

test('propagate permission denial without falling back to another identity', async (t) => {
  const {baseURL, requests} = await endpoint(t, {code: 'permission_denied', message: 'Permission denied'}, 403)
  await assert.rejects(
    createClient({baseURL, token: 'organization-token'}).registry.v1beta1.RegistryService.getRetentionPolicy({
      repository: 'team/app',
    }),
    (error) => error instanceof ConnectError && error.code === Code.PermissionDenied,
  )
  assert.equal(requests.length, 1)
  assert.equal(requests[0].headers['x-depot-org'], undefined)
})

for (const [args, response, method, body, output] of [
  [['get', 'team/app'], {}, 'GetRetentionPolicy', {repository: 'team/app'}, 'No explicit policy'],
  [
    ['keep-count', 'team/app', '10'],
    {policy: {repository: 'team/app', keepCount: 10}},
    'UpsertRetentionPolicy',
    {repository: 'team/app', enabled: true, keepCount: 10},
    'Retention policy saved',
  ],
  [
    ['keep-days', '**', '30'],
    {policy: {repository: '**', keepDays: 30}},
    'UpsertRetentionPolicy',
    {repository: '**', enabled: true, keepDays: 30},
    'Retention policy saved',
  ],
  [['delete', 'team/app'], {}, 'DeleteRetentionPolicy', {repository: 'team/app'}, 'Explicit policy removed'],
]) {
  test(`runnable example: ${args.join(' ')}`, async (t) => {
    const {baseURL, requests} = await endpoint(t, response)
    const {stdout, stderr} = await promisify(execFile)(process.execPath, ['examples/registry-retention.mjs', ...args], {
      env: {...process.env, DEPOT_TOKEN: 'organization-token', DEPOT_API_URL: baseURL},
    })
    assert.equal(stderr, '')
    assert.equal(stdout.trim(), output)
    assert.equal(requests.length, 1)
    assert.equal(requests[0].headers[':path'], `/depot.registry.v1beta1.RegistryService/${method}`)
    assert.equal(requests[0].headers.authorization, 'Bearer organization-token')
    assert.deepEqual(requests[0].body, body)
  })
}
