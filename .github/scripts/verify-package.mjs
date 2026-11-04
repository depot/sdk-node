import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {appendFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {validatePackage} from './release-policy.mjs'

const destination = process.argv[2] ? resolve(process.argv[2]) : mkdtempSync(join(tmpdir(), 'sdk-node-package-'))
const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
const version = process.env.RELEASE_VERSION ?? manifest.version
validatePackage(manifest, version)
mkdirSync(destination, {recursive: true})
const [packed] = JSON.parse(
  execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', destination], {encoding: 'utf8'}),
)
validatePackage(packed, version)
for (const file of ['dist/index.mjs', 'dist/index.cjs', 'dist/index.d.mts', 'dist/index.d.cts']) {
  assert(
    packed.files.some(({path}) => path === file),
    `Packed package is missing ${file}`,
  )
}
const tarball = join(destination, 'package.tgz')
renameSync(join(destination, packed.filename), tarball)

// Use the workflow's locked tools, including when checking an older release.
const tool = (name) => fileURLToPath(new URL(`../../node_modules/.bin/${name}`, import.meta.url))
execFileSync(tool('publint'), [tarball, '--strict'], {stdio: 'inherit'})
execFileSync(tool('attw'), [tarball, '--profile', 'strict'], {stdio: 'inherit'})

// Install the actual tarball outside the repository so self-referencing imports
// cannot accidentally validate the working tree instead of the shipped package.
const consumer = mkdtempSync(join(tmpdir(), 'sdk-node-consumer-'))
try {
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({name: 'release-smoke', private: true}))
  execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', tarball], {
    cwd: consumer,
    stdio: 'inherit',
  })
  const installed = JSON.parse(readFileSync(join(consumer, 'node_modules/@depot/sdk-node/package.json'), 'utf8'))
  validatePackage(installed, version)
  const checks = `
    assert.equal(typeof createClient, 'function')
    assert.equal(typeof depot.core.v1.ProjectService.listProjects, 'function')
    assert.equal(typeof createClient({token: 'smoke-only'}).core.v1.ProjectService.listProjects, 'function')
  `
  writeFileSync(
    join(consumer, 'smoke.mjs'),
    `import assert from 'node:assert/strict'; import {createClient, depot} from '@depot/sdk-node'; ${checks}`,
  )
  writeFileSync(
    join(consumer, 'smoke.cjs'),
    `const assert = require('node:assert/strict'); const {createClient, depot} = require('@depot/sdk-node'); ${checks}`,
  )
  for (const file of ['smoke.mjs', 'smoke.cjs'])
    execFileSync(process.execPath, [file], {cwd: consumer, stdio: 'inherit'})

  const types = `import {createClient} from '@depot/sdk-node'
const client = createClient({token: 'typecheck-only'})
client.core.v1.ProjectService.listProjects({}).then(response => { const projects: unknown[] = response.projects })
// @ts-expect-error A token must be a string; catches declarations resolving to any.
createClient({token: 123})
`
  for (const file of ['smoke.mts', 'smoke.cts']) writeFileSync(join(consumer, file), types)
  execFileSync(
    tool('tsc'),
    ['--noEmit', '--strict', '--skipLibCheck', '--target', 'es2022', '--module', 'nodenext', 'smoke.mts', 'smoke.cts'],
    {cwd: consumer, stdio: 'inherit'},
  )
} finally {
  rmSync(consumer, {recursive: true, force: true})
}

const integrity = createHash('sha512').update(readFileSync(tarball)).digest('base64')
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `integrity=${integrity}\n`)
console.log(`Verified ${manifest.name}@${manifest.version}; sha512-${integrity}`)
if (!process.argv[2]) rmSync(destination, {recursive: true, force: true})
