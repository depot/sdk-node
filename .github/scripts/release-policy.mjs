export const packageName = '@depot/sdk-node'
export const registry = 'https://registry.npmjs.org'

export function stableVersion(version) {
  if (
    typeof version !== 'string' ||
    version.trim() !== version ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)
  ) {
    throw new Error(`Expected a stable major.minor.patch version, received ${JSON.stringify(version)}`)
  }
  return version
}

export async function resolveRelease(github, repo, tag) {
  if (typeof tag !== 'string' || !tag.startsWith('v')) throw new Error('Expected a vMAJOR.MINOR.PATCH release tag')
  const version = stableVersion(tag.slice(1))
  const {data: release} = await github.rest.repos.getReleaseByTag({...repo, tag})
  if (release.draft || release.prerelease || !release.published_at || release.tag_name !== tag) {
    throw new Error('Only an existing published stable GitHub release can be staged')
  }
  const {data: commit} = await github.rest.repos.getCommit({...repo, ref: `refs/tags/${tag}`})
  if (!/^[a-f0-9]{40}$/.test(commit.sha)) throw new Error('Invalid release commit')
  return {tag, version, commit: commit.sha}
}

export function validatePackage(manifest, version) {
  stableVersion(version)
  if (manifest.name !== packageName || manifest.version !== version || manifest.private) {
    throw new Error(`Expected public ${packageName}@${version}; package.json does not match the release`)
  }
}

// Fetch anonymously: OIDC cannot list pending stages. Only a successful public
// packument response is evidence of whether this existing package is published.
export async function publicationState(version, fetchRegistry = fetch) {
  stableVersion(version)
  const response = await fetchRegistry(`${registry}/${encodeURIComponent(packageName)}`, {
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`npm registry lookup failed (${response.status}); refusing to stage`)
  const metadata = await response.json()
  if (metadata.name !== packageName || !metadata.versions || !metadata['dist-tags']) {
    throw new Error('Invalid npm registry metadata; refusing to stage')
  }
  if (Object.hasOwn(metadata.versions, version)) return 'published'
  const latest = stableVersion(metadata['dist-tags'].latest)
  const proposed = version.split('.').map(BigInt)
  const current = latest.split('.').map(BigInt)
  const difference = proposed.findIndex((part, i) => part !== current[i])
  if (difference === -1 || proposed[difference] < current[difference]) {
    throw new Error(`Refusing to stage ${version} for latest: npm latest is already ${latest}`)
  }
  return 'unpublished'
}
