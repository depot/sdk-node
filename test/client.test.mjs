import {Code, ConnectError} from '@connectrpc/connect'
import {createClient} from '@depot/sdk-node'
import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {createRequire} from 'node:module'
import {promisify} from 'node:util'
import {describe, test} from 'vitest'
import {ProjectService} from '../src/gen/depot/core/v1/project_pb.ts'
import {deferred, startServer} from './helpers/server.mjs'

const require = createRequire(import.meta.url)
const formats = [
  ['ESM', createClient],
  ['CommonJS', require('@depot/sdk-node').createClient],
]

for (const [format, makeClient] of formats) {
  describe(format, () => {
    for (const scenario of [
      {
        name: 'explicit token and URL override environment configuration',
        envToken: 'environment-token',
        envURL: 'http://environment.invalid',
        options: {token: 'explicit-token', baseURL: 'local'},
        expectedURL: 'local',
        authorization: 'Bearer explicit-token',
      },
      {
        name: 'an explicit client without a token does not inherit environment credentials',
        envToken: 'environment-token',
        options: {baseURL: 'local'},
        expectedURL: 'local',
      },
      {
        name: 'createClient() uses the default URL and no environment credentials',
        envToken: 'environment-token',
        envURL: 'http://environment.invalid',
        expectedURL: 'https://api.depot.dev',
      },
      {
        name: 'a token-only client uses the default URL',
        options: {token: 'explicit-token'},
        expectedURL: 'https://api.depot.dev',
        authorization: 'Bearer explicit-token',
      },
      {
        name: 'the default client captures token and URL from the environment at import',
        defaultClient: true,
        envToken: 'environment-token',
        envURL: 'local',
        expectedURL: 'local',
        authorization: 'Bearer environment-token',
      },
      {
        name: 'the default client works without environment configuration',
        defaultClient: true,
        expectedURL: 'https://api.depot.dev',
      },
      {
        name: 'the default client with no token can use per-call authorization',
        defaultClient: true,
        envURL: 'local',
        expectedURL: 'local',
        headers: {authorization: 'Bearer per-call-token'},
        authorization: 'Bearer per-call-token',
      },
      {
        name: 'per-call authorization overrides the default environment token',
        defaultClient: true,
        envToken: 'environment-token',
        envURL: 'local',
        expectedURL: 'local',
        headers: {Authorization: 'Bearer per-call-token'},
        authorization: 'Bearer per-call-token',
      },
    ]) {
      test(scenario.name, async (t) => {
        const {baseURL, requests} = await startServer(t, (router) => {
          router.service(ProjectService, {listProjects: () => ({projects: [{projectId: 'project-1'}]})})
        })
        const {stdout, stderr} = await promisify(execFile)(
          process.execPath,
          ['test/fixtures/configuration.mjs', format, baseURL, JSON.stringify(scenario)],
          {timeout: 5000},
        )
        assert.equal(stdout, '')
        assert.equal(stderr, '')
        assert.equal(requests.length, 1)
        assert.equal(requests[0].path, '/depot.core.v1.ProjectService/ListProjects')
        assert.equal(requests[0].headers.authorization, scenario.authorization)
      })
    }

    test('per-call headers and concurrent clients keep their identities isolated', async (t) => {
      const {baseURL} = await startServer(t, (router) => {
        router.service(ProjectService, {
          listProjects: (_, context) => ({
            projects: [{projectId: context.requestHeader.get('authorization') ?? 'none'}],
          }),
        })
      })
      const first = makeClient({baseURL, token: 'first'}).core.v1.ProjectService
      const second = makeClient({baseURL, token: 'second'}).core.v1.ProjectService
      const anonymous = makeClient({baseURL, token: ''}).core.v1.ProjectService
      const headers = new Headers({aUtHoRiZaTiOn: 'Basic per-call'})
      const responses = await Promise.all([
        first.listProjects({}, {headers}),
        first.listProjects({}),
        second.listProjects({}),
        anonymous.listProjects({}),
        first.listProjects({}, {headers: {Authorization: ''}}),
        anonymous.listProjects({}, {headers: {Authorization: 'Bearer supplied'}}),
      ])
      assert.deepEqual(
        responses.map((response) => response.projects[0].projectId),
        ['Basic per-call', 'Bearer first', 'Bearer second', 'none', '', 'Bearer supplied'],
      )
      assert.equal(headers.get('authorization'), 'Basic per-call')
      assert.equal((await first.listProjects({})).projects[0].projectId, 'Bearer first')
    })

    test('preserves service errors and metadata and allows a later call to succeed', async (t) => {
      const {baseURL, requests} = await startServer(t, (router) => {
        router.service(ProjectService, {
          getProject: (request) => {
            if (request.projectId === 'missing') {
              throw new ConnectError('Project not found', Code.NotFound, {'x-request-id': 'request-123'})
            }
            return {project: {projectId: request.projectId}}
          },
        })
      })
      const client = makeClient({baseURL}).core.v1.ProjectService
      await assert.rejects(client.getProject({projectId: 'missing'}), (error) => {
        assert.ok(error instanceof ConnectError)
        assert.equal(error.code, Code.NotFound)
        assert.equal(error.rawMessage, 'Project not found')
        assert.equal(error.metadata.get('x-request-id'), 'request-123')
        return true
      })
      assert.equal((await client.getProject({projectId: 'found'})).project.projectId, 'found')
      assert.equal(requests.length, 2)
    })

    for (const termination of ['abort', 'timeout']) {
      test(`${termination} rejects a pending call and leaves the client usable`, async (t) => {
        const received = deferred()
        const released = deferred()
        const finished = deferred()
        let started = false
        const controller = new AbortController()
        const {baseURL} = await startServer(t, (router) => {
          router.service(ProjectService, {
            listProjects: async () => {
              started = true
              received.resolve()
              try {
                await released.promise
                return {}
              } finally {
                finished.resolve()
              }
            },
            getProject: (request) => ({project: {projectId: request.projectId}}),
          })
        })
        const client = makeClient({baseURL}).core.v1.ProjectService
        const call = client.listProjects({}, termination === 'abort' ? {signal: controller.signal} : {timeoutMs: 100})
        const settled = call.catch(() => {})
        try {
          // No sleep: abort only after the endpoint has received the request.
          if (termination === 'abort') {
            await Promise.race([received.promise, settled])
            controller.abort()
          }
          await assert.rejects(call, (error) => {
            assert.ok(error instanceof ConnectError)
            assert.equal(error.code, termination === 'abort' ? Code.Canceled : Code.DeadlineExceeded)
            return true
          })
          assert.equal((await client.getProject({projectId: 'still-usable'})).project.projectId, 'still-usable')
        } finally {
          controller.abort()
          released.resolve()
          await settled
          // A short timeout may expire before the server receives the call.
          if (started) await finished.promise
        }
      })
    }
  })
}
