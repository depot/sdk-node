import {connectNodeAdapter} from '@connectrpc/connect-node'
import {once} from 'node:events'
import {createServer} from 'node:http2'

// Use the real Connect protocol on an ephemeral loopback port. Destroy pooled
// HTTP/2 sessions at teardown so failures and canceled calls cannot leak sockets.
export async function startServer(t, routes, options = {}) {
  const requests = []
  const sessions = new Set()
  const adapter = connectNodeAdapter({routes, ...options})
  const server = createServer((request, response) => {
    requests.push({path: request.url, headers: request.headers})
    adapter(request, response)
  })
  server.on('session', (session) => {
    sessions.add(session)
    session.on('close', () => sessions.delete(session))
  })
  t.onTestFinished(async () => {
    for (const session of sessions) session.destroy()
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return {baseURL: `http://127.0.0.1:${server.address().port}`, requests}
}

export function deferred() {
  let resolve
  const promise = new Promise((done) => (resolve = done))
  return {promise, resolve}
}
