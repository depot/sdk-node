import {depot, wkt} from '@depot/sdk-node'

// Run with DEPOT_TOKEN set to an organization token. Also usable in MCP execute_code.
const [previousStart, currentStart, currentEnd, ...repositories] = process.argv.slice(2)
const dates = [previousStart, currentStart, currentEnd].map((value) => new Date(value))
if (dates.some((date) => !Number.isFinite(date.getTime())) || !(dates[0] < dates[1] && dates[1] < dates[2])) {
  throw new Error(
    'Usage: node examples/usage-compare.mjs <previous-start> <current-start> <current-end> [owner/repo ...]',
  )
}
if (dates[1] - dates[0] !== dates[2] - dates[1]) throw new Error('Use equal-length periods for this comparison')
if (dates[0] < new Date('2026-05-22T00:00:00Z')) throw new Error('Depot CI usage is unavailable before 2026-05-22')
if (dates[1] - dates[0] > 93 * 86400000) throw new Error('Each period must be at most 93 days')

async function read(start, end) {
  const result = new Map()
  const tokens = new Set()
  let pageToken = ''
  do {
    const page = await depot.core.v1.UsageAnalyticsService.listDepotCIUsageByWorkflow(
      {
        timeRange: {startAt: wkt.timestampFromDate(start), endAt: wkt.timestampFromDate(end)},
        repositories,
        pageSize: 500,
        pageToken,
      },
      {timeoutMs: 30000},
    )
    for (const row of page.workflows) {
      // Display names and workflow IDs can change between runs. Compare the stable workflow key.
      const key = JSON.stringify([row.repository, row.workflowKey])
      const prior = result.get(key)
      result.set(key, {
        repository: row.repository,
        workflowKey: row.workflowKey,
        workflowPath: row.workflowPath,
        vcpuMinutes: (prior?.vcpuMinutes ?? 0) + row.vcpuSeconds / 60,
      })
    }
    pageToken = page.nextPageToken
    if (pageToken && tokens.has(pageToken)) throw new Error('Server repeated a page token; comparison is incomplete')
    tokens.add(pageToken)
  } while (pageToken)
  return result
}

const before = await read(dates[0], dates[1])
const after = await read(dates[1], dates[2])
const changes = [...new Set([...before.keys(), ...after.keys()])]
  .map((key) => {
    const row = after.get(key) ?? before.get(key)
    const previous = before.get(key)?.vcpuMinutes ?? 0
    const current = after.get(key)?.vcpuMinutes ?? 0
    return {
      ...row,
      unit: 'vCPU-minutes',
      attribution: row.repository && row.workflowKey ? 'workflow' : 'unattributed',
      previous,
      current,
      delta: current - previous,
      percentChange: previous === 0 ? null : ((current - previous) / previous) * 100,
    }
  })
  .sort((a, b) => b.delta - a.delta)
console.log(JSON.stringify({previousStart, currentStart, currentEnd, changes}, null, 2))
