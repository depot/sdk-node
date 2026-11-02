import {fromJson, toJson} from '@bufbuild/protobuf'
import {Code, ConnectError} from '@connectrpc/connect'
import * as esm from '@depot/sdk-node'
import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {createRequire} from 'node:module'
import {describe, test} from 'vitest'
import {ProjectService} from '../src/gen/depot/core/v1/project_pb.ts'
import {startServer} from './helpers/server.mjs'

const require = createRequire(import.meta.url)
const projectId = 'depot-project'
const trustPolicyId = 'policy-1'
const gitlab = {namespaceId: '123', projectId: '456', protectedRefsOnly: true}

for (const [format, sdk] of [
  ['ESM', esm],
  ['CommonJS', require('@depot/sdk-node')],
]) {
  describe(`${format} trust policies`, () => {
    test('add sends GitLab protection and displays the saved policy', async (t) => {
      let received
      const {baseURL, requests} = await startServer(t, (router) => {
        router.service(ProjectService, {
          addTrustPolicy(request) {
            received = request
            return {trustPolicy: {trustPolicyId, provider: {case: 'gitlab', value: gitlab}}}
          },
        })
      })
      const service = sdk.createClient({baseURL, token: 'org-token'}).core.v1.ProjectService
      const {trustPolicy} = await service.addTrustPolicy({projectId, provider: {case: 'gitlab', value: gitlab}})
      assert.equal(received.projectId, projectId)
      assert.equal(received.provider.case, 'gitlab')
      assert.equal(received.provider.value.namespaceId, '123')
      assert.equal(received.provider.value.projectId, '456')
      assert.equal(received.provider.value.protectedRefsOnly, true)
      assert.equal(trustPolicy.trustPolicyId, trustPolicyId)
      assert.equal(trustPolicy.provider.case, 'gitlab')
      assert.equal(trustPolicy.provider.value.protectedRefsOnly, true)
      assert.equal(requests.length, 1)
      assert.equal(requests[0].path, '/depot.core.v1.ProjectService/AddTrustPolicy')
      assert.equal(requests[0].headers.authorization, 'Bearer org-token')
      assert.equal(requests[0].headers['x-depot-org'], undefined)
    })

    for (const field of ['protectedRefsOnly', 'allowPublicPullRequests']) {
      for (const value of [undefined, true, false]) {
        test(`update preserves ${field}=${value} and omits the other restriction`, async (t) => {
          const input = {projectId, trustPolicyId, ...(value === undefined ? {} : {[field]: value})}
          let received
          const {baseURL, requests} = await startServer(t, (router) => {
            router.service(ProjectService, {
              updateTrustPolicy(request) {
                received = toJson(ProjectService.method.updateTrustPolicy.input, request)
                // An omitted flag leaves the stored restriction enabled.
                const enabled = value === undefined ? true : value
                const provider =
                  field === 'protectedRefsOnly'
                    ? {case: 'gitlab', value: {...gitlab, protectedRefsOnly: enabled}}
                    : {
                        case: 'github',
                        value: {repositoryOwner: 'acme', repository: 'app', allowPublicPullRequests: enabled},
                      }
                return {trustPolicy: {trustPolicyId, provider}}
              },
            })
          })
          const service = sdk.createClient({baseURL, token: 'org-token'}).core.v1.ProjectService
          const {trustPolicy} = await service.updateTrustPolicy(input)
          assert.deepEqual(received, input)
          assert.equal(trustPolicy.trustPolicyId, trustPolicyId)
          assert.equal(trustPolicy.provider.value[field], value === undefined ? true : value)
          assert.equal(requests.length, 1)
          assert.equal(requests[0].path, '/depot.core.v1.ProjectService/UpdateTrustPolicy')
          assert.equal(requests[0].headers.authorization, 'Bearer org-token')
        })
      }
    }

    test('list retains provider details and follows pagination', async (t) => {
      const received = []
      const {baseURL, requests} = await startServer(t, (router) => {
        router.service(ProjectService, {
          listTrustPolicies(request) {
            received.push(toJson(ProjectService.method.listTrustPolicies.input, request))
            return fromJson(
              ProjectService.method.listTrustPolicies.output,
              request.pageToken
                ? {trustPolicies: [{trustPolicyId: 'policy-2', gitlab: {...gitlab, protectedRefsOnly: false}}]}
                : {trustPolicies: [{trustPolicyId, gitlab}], nextPageToken: 'next-page'},
            )
          },
        })
      })
      const service = sdk.createClient({baseURL, token: 'org-token'}).core.v1.ProjectService
      const first = await service.listTrustPolicies({projectId, pageSize: 1})
      assert.equal(first.trustPolicies[0].provider.value.protectedRefsOnly, true)
      assert.equal(first.nextPageToken, 'next-page')
      const second = await service.listTrustPolicies({projectId, pageSize: 1, pageToken: first.nextPageToken})
      assert.equal(second.trustPolicies[0].provider.value.protectedRefsOnly, false)
      assert.equal(second.nextPageToken, undefined)
      assert.deepEqual(received, [
        {projectId, pageSize: 1},
        {projectId, pageSize: 1, pageToken: 'next-page'},
      ])
      assert.equal(requests.length, 2)
    })

    test('remove targets only the requested project and policy', async (t) => {
      let received
      const {baseURL, requests} = await startServer(t, (router) => {
        router.service(ProjectService, {
          removeTrustPolicy(request) {
            received = toJson(ProjectService.method.removeTrustPolicy.input, request)
            return {}
          },
        })
      })
      const result = await sdk
        .createClient({baseURL, token: 'org-token'})
        .core.v1.ProjectService.removeTrustPolicy({projectId, trustPolicyId})
      assert.deepEqual(received, {projectId, trustPolicyId})
      assert.deepEqual(toJson(ProjectService.method.removeTrustPolicy.output, result), {})
      assert.equal(requests.length, 1)
      assert.equal(requests[0].path, '/depot.core.v1.ProjectService/RemoveTrustPolicy')
      assert.equal(requests[0].headers.authorization, 'Bearer org-token')
    })

    for (const code of [Code.Unimplemented, Code.PermissionDenied, Code.InvalidArgument]) {
      test(`update propagates ${Code[code]} without a destructive fallback`, async (t) => {
        const {baseURL, requests} = await startServer(t, (router) => {
          router.service(ProjectService, {
            updateTrustPolicy() {
              throw new ConnectError('Policy update rejected', code)
            },
          })
        })
        const service = sdk.createClient({baseURL, token: 'org-token'}).core.v1.ProjectService
        await assert.rejects(
          service.updateTrustPolicy({projectId, trustPolicyId, protectedRefsOnly: false}),
          (error) => {
            assert.ok(error instanceof ConnectError)
            assert.equal(error.code, code)
            return true
          },
        )
        assert.equal(requests.length, 1)
        assert.equal(requests[0].path, '/depot.core.v1.ProjectService/UpdateTrustPolicy')
      })
    }
  })
}

// Compile against both published declaration entrypoints without executing API calls.
test('published declarations expose GitLab restrictions to ESM and CommonJS consumers', async () => {
  const {stdout, stderr} = await promisify(execFile)('./node_modules/.bin/tsc', [
    '--ignoreConfig',
    '--noEmit',
    '--strict',
    '--skipLibCheck',
    '--module',
    'nodenext',
    '--target',
    'es2022',
    'test/fixtures/trust-policies.mts',
    'test/fixtures/trust-policies.cts',
  ])
  assert.equal(stdout, '')
  assert.equal(stderr, '')
})
