import assert from 'node:assert/strict'
import http2 from 'node:http2'
import {createRequire, syncBuiltinESMExports} from 'node:module'

const [format, localURL, serialized] = process.argv.slice(2)
const scenario = JSON.parse(serialized)
const resolveURL = (value) => (value === 'local' ? localURL : value)

// Each import gets a fresh process and a controlled environment, including when
// the developer running the tests has real Depot credentials in their shell.
delete process.env.DEPOT_TOKEN
delete process.env.DEPOT_API_URL
if (scenario.envToken !== undefined) process.env.DEPOT_TOKEN = scenario.envToken
if (scenario.envURL !== undefined) process.env.DEPOT_API_URL = resolveURL(scenario.envURL)

const connect = http2.connect
const sessions = []
const authorities = []
http2.connect = (authority, options, listener) => {
  const origin = new URL(authority).origin
  authorities.push(origin)
  assert.equal(origin, resolveURL(scenario.expectedURL))
  // Observe the default HTTPS destination without opening a production socket.
  // All bytes still cross the real HTTP/2 + Connect client/server boundary.
  const session = connect(localURL, options, listener)
  sessions.push(session)
  return session
}
syncBuiltinESMExports()

try {
  const sdk = format === 'ESM' ? await import('@depot/sdk-node') : createRequire(import.meta.url)('@depot/sdk-node')
  // The default client captures configuration at import; later env changes must
  // not alter it or affect explicitly constructed clients.
  process.env.DEPOT_TOKEN = 'later-token'
  process.env.DEPOT_API_URL = 'http://later.invalid'
  const options = scenario.options && {...scenario.options}
  if (options?.baseURL) options.baseURL = resolveURL(options.baseURL)
  const client = scenario.defaultClient ? sdk.depot : sdk.createClient(options)
  const result = await client.core.v1.ProjectService.listProjects({}, {headers: scenario.headers})
  assert.deepEqual(
    result.projects.map((project) => project.projectId),
    ['project-1'],
  )
  assert.equal(authorities.length, 1)
} finally {
  for (const session of sessions) session.destroy()
}
