import {fromJson, toJson} from '@bufbuild/protobuf'
import {Code, ConnectError} from '@connectrpc/connect'
import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {test} from 'vitest'
import {ProjectService} from '../src/gen/depot/core/v1/project_pb.ts'
import {startServer} from './helpers/server.mjs'

const execute = promisify(execFile)
const policy = {trustPolicyId: 'policy-1', gitlab: {namespaceId: '123', projectId: '456', protectedRefsOnly: true}}
const view = {trustPolicyId: 'policy-1', provider: 'gitlab', conditions: policy.gitlab}

for (const {args, method, input, output, expected} of [
  {
    args: ['list', 'depot-project'],
    method: 'listTrustPolicies',
    input: {projectId: 'depot-project'},
    output: {trustPolicies: [policy], nextPageToken: 'next-page'},
    expected: {trustPolicies: [view], nextPageToken: 'next-page'},
  },
  {
    args: ['list', 'depot-project', 'next-page'],
    method: 'listTrustPolicies',
    input: {projectId: 'depot-project', pageToken: 'next-page'},
    output: {trustPolicies: []},
    expected: {trustPolicies: [], nextPageToken: null},
  },
  {
    args: ['add', 'depot-project', '123', '456', 'true'],
    method: 'addTrustPolicy',
    input: {projectId: 'depot-project', gitlab: policy.gitlab},
    output: {trustPolicy: policy},
    expected: view,
  },
  {
    args: ['add', 'depot-project', '123', '456', 'false'],
    method: 'addTrustPolicy',
    input: {projectId: 'depot-project', gitlab: {namespaceId: '123', projectId: '456'}},
    output: {trustPolicy: policy},
    expected: view,
  },
  {
    args: ['update', 'depot-project', 'policy-1', 'false'],
    method: 'updateTrustPolicy',
    input: {projectId: 'depot-project', trustPolicyId: 'policy-1', protectedRefsOnly: false},
    output: {trustPolicy: {...policy, gitlab: {...policy.gitlab, protectedRefsOnly: false}}},
    expected: {...view, conditions: {...policy.gitlab, protectedRefsOnly: false}},
  },
  {
    args: ['remove', 'depot-project', 'policy-1'],
    method: 'removeTrustPolicy',
    input: {projectId: 'depot-project', trustPolicyId: 'policy-1'},
    output: {},
    expected: 'Trust policy removed',
  },
]) {
  test(`GitLab example: ${args.join(' ')}`, async (t) => {
    let received
    const rpc = ProjectService.method[method]
    const {baseURL, requests} = await startServer(t, (router) => {
      router.rpc(rpc, (request) => {
        received = toJson(rpc.input, request)
        return fromJson(rpc.output, output)
      })
    })
    const {stdout, stderr} = await execute(process.execPath, ['examples/gitlab-trust-policy.mjs', ...args], {
      env: {...process.env, DEPOT_TOKEN: 'org-token', DEPOT_API_URL: baseURL},
    })
    assert.equal(stderr, '')
    assert.deepEqual(typeof expected === 'string' ? stdout.trim() : JSON.parse(stdout), expected)
    assert.deepEqual(received, input)
    assert.equal(requests.length, 1)
    assert.equal(requests[0].headers.authorization, 'Bearer org-token')
    assert.equal(requests[0].path, `/depot.core.v1.ProjectService/${rpc.name}`)
  })
}

for (const args of [
  ['add', 'depot-project', '123', '456'],
  ['add', 'depot-project', '123', '456', 'yes'],
  ['add', 'depot-project', 'acme', 'app', 'true'],
  ['update', 'depot-project', 'policy-1', 'FALSE'],
  ['update', 'depot-project', 'policy-1'],
  ['remove', 'depot-project'],
  ['remove', 'depot-project', 'policy-1', 'extra'],
]) {
  test(`GitLab example rejects invalid input: ${args.join(' ')}`, async (t) => {
    const {baseURL, requests} = await startServer(t, () => {})
    await assert.rejects(
      execute(process.execPath, ['examples/gitlab-trust-policy.mjs', ...args], {
        env: {...process.env, DEPOT_TOKEN: 'org-token', DEPOT_API_URL: baseURL},
      }),
      (error) => {
        assert.equal(error.code, 1)
        assert.equal(error.stdout, '')
        assert.match(error.stderr, /Usage:/)
        assert.ok(!error.stderr.includes('org-token'))
        return true
      },
    )
    assert.equal(requests.length, 0)
  })
}

test('GitLab example reports API failure without leaking credentials or retrying', async (t) => {
  const {baseURL, requests} = await startServer(t, (router) => {
    router.service(ProjectService, {
      updateTrustPolicy() {
        throw new ConnectError('private org-token detail', Code.PermissionDenied)
      },
    })
  })
  await assert.rejects(
    execute(process.execPath, ['examples/gitlab-trust-policy.mjs', 'update', 'depot-project', 'policy-1', 'true'], {
      env: {...process.env, DEPOT_TOKEN: 'org-token', DEPOT_API_URL: baseURL},
    }),
    (error) => {
      assert.equal(error.code, 1)
      assert.equal(error.stdout, '')
      assert.equal(
        error.stderr.trim(),
        'Trust policy operation failed. Check the organization token, project, policy, and GitLab IDs.',
      )
      return true
    },
  )
  assert.equal(requests.length, 1)
})
