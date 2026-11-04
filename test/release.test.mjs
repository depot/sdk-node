import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {createHash} from 'node:crypto'
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {createServer} from 'node:http'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {promisify} from 'node:util'
import {test} from 'vitest'
import {packageName, publicationState, resolveRelease, validatePackage} from '../.github/scripts/release-policy.mjs'

const exec = promisify(execFile)
const commit = 'a'.repeat(40)
const metadata = (versions = ['2.2.0'], latest = '2.2.0') => ({
  name: packageName,
  versions: Object.fromEntries(versions.map((version) => [version, {version}])),
  'dist-tags': {latest},
})

async function registryServer(t, body, status = 200) {
  const server = createServer((_request, response) => {
    response.writeHead(status, {'content-type': 'application/json'})
    response.end(JSON.stringify(body))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.onTestFinished(() => new Promise((resolve) => server.close(resolve)))
  return `http://127.0.0.1:${server.address().port}`
}

test('release resolution pins the tag commit and rejects unpublished or prerelease releases', async () => {
  const repo = {owner: 'depot', repo: 'sdk-node'}
  const release = {tag_name: 'v2.3.0', published_at: '2026-11-03', draft: false, prerelease: false}
  const github = (changes = {}) => ({
    rest: {
      repos: {
        getReleaseByTag: async () => ({data: {...release, ...changes}}),
        getCommit: async ({ref}) => {
          assert.equal(ref, 'refs/tags/v2.3.0')
          return {data: {sha: commit}}
        },
      },
    },
  })
  assert.deepEqual(await resolveRelease(github(), repo, 'v2.3.0'), {tag: 'v2.3.0', version: '2.3.0', commit})
  for (const change of [{draft: true}, {prerelease: true}, {published_at: null}, {tag_name: 'v2.4.0'}]) {
    await assert.rejects(resolveRelease(github(change), repo, 'v2.3.0'), /published stable/)
  }
  for (const tag of ['main', 'v2.3.0-beta.1', 'v2.3.0+build', 'v02.3.0', 'v2.3.0\n', 'v2.3.0\nmalicious']) {
    await assert.rejects(resolveRelease({}, repo, tag), /stable|release tag/)
  }
  validatePackage({name: packageName, version: '2.3.0'}, '2.3.0')
  for (const manifest of [
    {name: 'another-package', version: '2.3.0'},
    {name: packageName, version: '2.2.0'},
    {name: packageName, version: '2.3.0', private: true},
  ])
    assert.throws(() => validatePackage(manifest, '2.3.0'), /does not match/)
})

test('registry lookup distinguishes unpublished, published retries, and a newer latest', async (t) => {
  const url = await registryServer(t, metadata(['2.2.0', '2.10.0'], '2.10.0'))
  const fetchRegistry = () => fetch(url)
  assert.equal(await publicationState('2.11.0', fetchRegistry), 'unpublished')
  assert.equal(await publicationState('2.2.0', fetchRegistry), 'published')
  await assert.rejects(publicationState('2.9.0', fetchRegistry), /latest is already 2.10.0/)
})

for (const [status, body] of [
  [404, {}],
  [503, {}],
  [200, {name: packageName}],
]) {
  test(`registry response ${status} with missing metadata fails closed`, async (t) => {
    const url = await registryServer(t, body, status)
    await assert.rejects(
      publicationState('2.3.0', () => fetch(url)),
      /refusing to stage/,
    )
  })
}

async function stageFixture(t, {body = metadata(), status = 200, exit = 0, tamper = false} = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'sdk-stage-test-'))
  t.onTestFinished(() => rm(directory, {recursive: true, force: true}))
  const tarball = join(directory, 'package.tgz')
  const contents = 'artifact already validated by the build job'
  await writeFile(tarball, tamper ? 'replaced artifact' : contents)
  const url = await registryServer(t, body, status)
  const preload = join(directory, 'registry.mjs')
  await writeFile(
    preload,
    `const originalFetch = globalThis.fetch; globalThis.fetch = () => originalFetch(${JSON.stringify(url)});`,
  )
  const calls = join(directory, 'calls.json')
  await writeFile(
    join(directory, 'npm'),
    `#!/usr/bin/env node
require('node:fs').writeFileSync(${JSON.stringify(calls)}, JSON.stringify(process.argv.slice(2)))
process.exit(${exit})
`,
    {mode: 0o755},
  )
  return {
    calls,
    tarball,
    run: () =>
      exec(process.execPath, ['--import', preload, resolve('.github/scripts/stage-package.mjs'), tarball], {
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH}`,
          RELEASE_VERSION: '2.3.0',
          RELEASE_COMMIT: commit,
          RELEASE_INTEGRITY: createHash('sha512').update(contents).digest('base64'),
          GITHUB_STEP_SUMMARY: join(directory, 'summary.md'),
        },
      }),
  }
}

test('upload stages only the verified artifact with provenance and no lifecycle scripts', async (t) => {
  const fixture = await stageFixture(t)
  const {stdout, stderr} = await fixture.run()
  assert.equal(stderr, '')
  assert.match(stdout, /Awaiting npm approval; not live/)
  assert.deepEqual(JSON.parse(await readFile(fixture.calls, 'utf8')), [
    'stage',
    'publish',
    fixture.tarball,
    '--ignore-scripts',
    '--access',
    'public',
    '--tag',
    'latest',
    '--provenance',
    '--registry',
    'https://registry.npmjs.org',
  ])
})

test('a published rerun succeeds without invoking npm or changing latest', async (t) => {
  const fixture = await stageFixture(t, {body: metadata(['2.2.0', '2.3.0'], '2.3.0')})
  const {stdout, stderr} = await fixture.run()
  assert.equal(stderr, '')
  assert.match(stdout, /already published/)
  await assert.rejects(readFile(fixture.calls), {code: 'ENOENT'})
})

for (const options of [{tamper: true}, {status: 503}, {body: metadata(['2.4.0'], '2.4.0')}]) {
  test(`upload is blocked before npm runs: ${JSON.stringify(options)}`, async (t) => {
    const fixture = await stageFixture(t, options)
    await assert.rejects(fixture.run(), /Artifact digest mismatch|lookup failed|latest is already/)
    await assert.rejects(readFile(fixture.calls), {code: 'ENOENT'})
  })
}

test('a failed or duplicate stage tells the maintainer to inspect npm and never publishes directly', async (t) => {
  const fixture = await stageFixture(t, {exit: 1})
  await assert.rejects(fixture.run(), (error) => {
    assert.match(error.stdout, /Check npm Staged Packages before retrying/)
    assert.match(error.stderr, /npm stage publish failed/)
    return true
  })
  assert.deepEqual(JSON.parse(await readFile(fixture.calls, 'utf8')).slice(0, 2), ['stage', 'publish'])
})
