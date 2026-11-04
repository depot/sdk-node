import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {test} from 'vitest'
import {UsageAnalyticsService} from '../src/gen/depot/core/v1/usage_analytics_pb.ts'
import {startServer} from './helpers/server.mjs'

const execute = promisify(execFile)
test('usage comparison follows pages, matches workflow keys, and includes new, removed and unattributed usage', async (t) => {
  const {baseURL, requests} = await startServer(t, (router) =>
    router.service(UsageAnalyticsService, {
      listDepotCIUsageByWorkflow(request) {
        assert.deepEqual(request.repositories, ['owner/repo'])
        const previous = request.timeRange.startAt.seconds === 1790812800n // 2026-10-01
        if (request.pageToken) return {workflows: [{repository: 'owner/repo', workflowKey: '', vcpuSeconds: 60}]}
        return {
          workflows: [
            {
              repository: 'owner/repo',
              workflowKey: 'stable',
              workflowName: previous ? 'Old name' : 'New name',
              vcpuSeconds: previous ? 60 : 180,
            },
            {repository: 'owner/repo', workflowKey: previous ? 'removed' : 'added', vcpuSeconds: 60},
          ],
          nextPageToken: 'next',
        }
      },
    }),
  )
  const {stdout, stderr} = await execute(
    process.execPath,
    [
      'examples/usage-compare.mjs',
      '2026-10-01T00:00:00Z',
      '2026-10-08T00:00:00Z',
      '2026-10-15T00:00:00Z',
      'owner/repo',
    ],
    {env: {...process.env, DEPOT_TOKEN: 'reader-token', DEPOT_API_URL: baseURL}},
  )
  assert.equal(stderr, '')
  const rows = JSON.parse(stdout).changes
  assert.deepEqual(
    rows.map((row) => [row.workflowKey, row.delta, row.percentChange]),
    [
      ['stable', 2, 200],
      ['added', 1, null],
      ['', 0, 0],
      ['removed', -1, -100],
    ],
  )
  assert.equal(rows[2].attribution, 'unattributed')
  assert.equal(requests.length, 4)
  assert.ok(requests.every((request) => request.headers.authorization === 'Bearer reader-token'))
})
