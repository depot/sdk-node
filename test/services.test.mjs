import {fromJson, toJson} from '@bufbuild/protobuf'
import {Code, ConnectError} from '@connectrpc/connect'
import * as esm from '@depot/sdk-node'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {describe, test} from 'vitest'
import {BuildService as Build} from '../src/gen/depot/build/v1/build_pb.ts'
import {RegistryService as BuildRegistry} from '../src/gen/depot/build/v1/registry_pb.ts'
import {BuildKitService, Platform} from '../src/gen/depot/buildkit/v1/buildkit_pb.ts'
import {CodeService} from '../src/gen/depot/code/v1beta1/code_pb.ts'
import {BuildService as CoreBuild} from '../src/gen/depot/core/v1/build_pb.ts'
import {GithubActionsService} from '../src/gen/depot/core/v1/github_actions_pb.ts'
import {OrganizationService} from '../src/gen/depot/core/v1/org_pb.ts'
import {ProjectService} from '../src/gen/depot/core/v1/project_pb.ts'
import {UsageService} from '../src/gen/depot/core/v1/usage_pb.ts'
import {deferred, startServer} from './helpers/server.mjs'

const require = createRequire(import.meta.url)
const timestamp = '2026-10-19T12:34:56.123456789Z'

for (const [format, sdk] of [
  ['ESM', esm],
  ['CommonJS', require('@depot/sdk-node')],
]) {
  describe(`${format} service contracts`, () => {
    for (const {service, namespace, method, input, output} of [
      {
        service: ProjectService,
        namespace: ['core', 'v1'],
        method: 'listProjects',
        input: {regionId: 'us-east-1', pageSize: 0, pageToken: ''},
        output: {
          projects: [
            {
              projectId: 'project-1',
              name: 'Example',
              hardware: 'HARDWARE_8X16',
              createdAt: timestamp,
              buildTimeoutMinutes: 0,
            },
            {projectId: 'project-2'},
          ],
          nextPageToken: 'next-page',
        },
      },
      {
        service: Build,
        namespace: ['build', 'v1'],
        method: 'getBuildStepLogs',
        input: {projectId: 'project-1', buildId: 'build-1', buildStepDigest: 'sha256:abc', pageSize: 2},
        output: {logs: [{message: 'Compiling 🚀\n', timestamp}], nextPageToken: 'more-logs'},
      },
      {
        service: CoreBuild,
        namespace: ['core', 'v1'],
        method: 'shareBuild',
        input: {buildId: 'build-1'},
        output: {shareUrl: 'https://example.test/build/build-1'},
      },
      {
        service: CodeService,
        namespace: ['code', 'v1beta1'],
        method: 'createRepository',
        input: {standalone: {repository: 'team/service', defaultBranch: 'main'}},
        output: {repositoryId: 'repository-1'},
      },
      {
        service: BuildRegistry,
        namespace: ['build', 'v1'],
        method: 'deleteImage',
        input: {projectId: 'project-1', imageTags: ['latest', 'v1']},
        output: {},
      },
      {
        service: OrganizationService,
        namespace: ['core', 'v1'],
        method: 'listOrganizations',
        input: {},
        output: {organizations: [{orgId: 'organization-1', name: 'Example'}]},
      },
      {
        service: UsageService,
        namespace: ['core', 'v1'],
        method: 'getUsage',
        input: {startAt: timestamp, endAt: '2026-10-20T00:00:00Z'},
        output: {periodStart: timestamp, periodEnd: '2026-10-20T00:00:00Z'},
      },
      {
        service: GithubActionsService,
        namespace: ['core', 'v1'],
        method: 'countGithubActionsLogs',
        input: {query: 'build failed'},
        // Beyond Number.MAX_SAFE_INTEGER: the public result must retain bigint precision.
        output: {count: '9007199254740993', dataThrough: timestamp},
      },
    ]) {
      test(`${service.typeName}.${method} preserves request and response values`, async (t) => {
        const rpc = service.method[method]
        let received
        const {baseURL, requests} = await startServer(
          t,
          (router) => {
            router.rpc(rpc, (request) => {
              received = toJson(rpc.input, request)
              return fromJson(rpc.output, output)
            })
          },
          {requestPathPrefix: '/api'},
        )
        const client = sdk.createClient({baseURL: `${baseURL}/api/`, token: 'test-token'})
        const serviceClient = client[namespace[0]][namespace[1]][service.name]
        const result = await serviceClient[method](fromJson(rpc.input, input))
        assert.deepEqual(received, input)
        assert.deepEqual(toJson(rpc.output, result), output)
        assert.equal(requests.length, 1)
        assert.equal(requests[0].path, `/api/${service.typeName}/${rpc.name}`)
        assert.equal(requests[0].headers.authorization, 'Bearer test-token')
        if (method === 'countGithubActionsLogs') {
          assert.equal(result.count, 9007199254740993n)
          assert.equal(result.dataThrough.nanos, 123456789)
          assert.equal(sdk.wkt.timestampDate(result.dataThrough).toISOString(), '2026-10-19T12:34:56.123Z')
        }
        if (method === 'listProjects') {
          assert.equal(result.projects[0].buildTimeoutMinutes, 0)
          assert.equal(result.projects[1].buildTimeoutMinutes, undefined)
        }
      })
    }

    test('BuildKit streams pending and active connections in order', async (t) => {
      let received
      const {baseURL, requests} = await startServer(t, (router) => {
        router.service(BuildKitService, {
          getEndpoint: async function* (request) {
            received = request
            yield {connection: {case: 'pending', value: {}}}
            yield {
              connection: {
                case: 'active',
                value: {endpoint: 'tcp://builder.test:443', serverName: 'builder.test', caCert: {cert: 'test-ca'}},
              },
            }
          },
        })
      })
      const client = sdk.createClient({baseURL, token: 'build-token'})
      const responses = []
      for await (const response of client.buildkit.v1.BuildKitService.getEndpoint({
        buildId: 'build-1',
        platform: Platform.ARM64,
      })) {
        responses.push(response)
      }
      assert.equal(received.buildId, 'build-1')
      assert.equal(received.platform, Platform.ARM64)
      assert.deepEqual(
        responses.map((response) => response.connection.case),
        ['pending', 'active'],
      )
      assert.equal(responses[1].connection.value.endpoint, 'tcp://builder.test:443')
      assert.equal(responses[1].connection.value.serverName, 'builder.test')
      assert.equal(responses[1].connection.value.caCert.cert, 'test-ca')
      assert.equal(requests[0].path, '/depot.buildkit.v1.BuildKitService/GetEndpoint')
      assert.equal(requests[0].headers.authorization, 'Bearer build-token')
    })

    for (const ending of ['error', 'abort']) {
      test(`BuildKit propagates ${ending} after a partial stream`, async (t) => {
        const release = deferred()
        const finished = deferred()
        let started = false
        const controller = new AbortController()
        const {baseURL} = await startServer(t, (router) => {
          router.service(BuildKitService, {
            getEndpoint: async function* () {
              started = true
              try {
                yield {connection: {case: 'pending', value: {}}}
                if (ending === 'error') throw new ConnectError('Builder unavailable', Code.Unavailable)
                await release.promise
              } finally {
                finished.resolve()
              }
            },
          })
        })
        const stream = sdk
          .createClient({baseURL})
          .buildkit.v1.BuildKitService.getEndpoint({buildId: 'build-1'}, {signal: controller.signal})
          [Symbol.asyncIterator]()
        try {
          const first = await stream.next()
          assert.equal(first.done, false)
          assert.equal(first.value.connection.case, 'pending')
          if (ending === 'abort') controller.abort()
          await assert.rejects(stream.next(), (error) => {
            assert.ok(error instanceof ConnectError)
            assert.equal(error.code, ending === 'error' ? Code.Unavailable : Code.Canceled)
            if (ending === 'error') assert.equal(error.rawMessage, 'Builder unavailable')
            return true
          })
        } finally {
          controller.abort()
          release.resolve()
          if (started) await finished.promise
        }
      })
    }
  })
}
