import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {appendFileSync, readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {packageName, publicationState, registry} from './release-policy.mjs'

const tarball = resolve(process.argv[2])
const {RELEASE_VERSION: version, RELEASE_COMMIT: commit, RELEASE_INTEGRITY: integrity} = process.env
assert.equal(createHash('sha512').update(readFileSync(tarball)).digest('base64'), integrity, 'Artifact digest mismatch')
const summary = (message) => {
  console.log(message)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`)
}

if ((await publicationState(version)) === 'published') {
  summary(`${packageName}@${version} is already published. Nothing was uploaded and no dist-tag was changed.`)
} else {
  // No SDK dependency install, package lifecycle scripts, or long-lived npm token in
  // this job. npm obtains a short-lived staging credential from GitHub OIDC.
  const result = spawnSync(
    'npm',
    [
      'stage',
      'publish',
      tarball,
      '--ignore-scripts',
      '--access',
      'public',
      '--tag',
      'latest',
      '--provenance',
      '--registry',
      registry,
    ],
    {stdio: 'inherit'},
  )
  if (result.error || result.status !== 0) {
    summary(
      `Staging ${packageName}@${version} did not complete successfully. Check npm Staged Packages before retrying: ` +
        'the upload may already exist. OIDC cannot list, approve, or reject stages. ' +
        'An existing stage must be reviewed by a maintainer; never fall back to direct publishing.',
    )
    throw result.error ?? new Error(`npm stage publish failed (exit ${result.status}, signal ${result.signal})`)
  }
  summary(
    `Staged ${packageName}@${version} from ${commit} with intended dist-tag latest. **Awaiting npm approval; not live.**\n\n` +
      `Artifact integrity: sha512-${integrity}\n\n` +
      'An authorized maintainer must review this version in npm Staged Packages, click Approve, and complete 2FA. ' +
      'Check the source commit, provenance, and current latest version before approving. The stage ID is in the npm output above.',
  )
}
