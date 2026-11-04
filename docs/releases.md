# Releasing @depot/sdk-node

Release Drafter maintains a draft GitHub release with the next patch version and
notes from merged PRs. A maintainer reviews the version and publishes the GitHub
release, which builds, validates, and stages the package on npm. An npm maintainer
approves it with 2FA before it goes live. Conventional commits and enforced PR
titles are not required.

## One-time administrator setup

1. Merge this PR. Release Drafter runs on pushes to `main`, using the built-in
   `GITHUB_TOKEN` with contents write and pull requests read permissions. No PAT,
   GitHub App, or additional GitHub secret is needed. Organization Actions policy
   must allow the Release Drafter action. The first proposed version after the
   existing `v2.3.0` release is `v2.3.1`; review whether the accumulated changes
   require a minor or major bump before publishing it.
2. Sign in to npm with a package administrator account and enable 2FA.
   In [the package settings](https://www.npmjs.com/package/@depot/sdk-node/access),
   add a **GitHub Actions trusted publisher**:

   | Setting                                | Value         |
   | -------------------------------------- | ------------- |
   | Organization or user                   | `depot`       |
   | Repository                             | `sdk-node`    |
   | Workflow filename                      | `publish.yml` |
   | Environment name                       | Leave empty   |
   | Stage publishing (`npm stage publish`) | Allowed       |
   | Direct publishing (`npm publish`)      | Disabled      |
   | Dist-tag management (`npm dist-tag`)   | Disabled      |

3. Set **Publishing access** to **Require two-factor authentication and disallow
   tokens**. No npm token secret is needed in GitHub. Review existing trusted
   publishers too: an older connection permitting direct publishing can bypass
   the approval gate. Remove obsolete connections and revoke unused npm tokens.
4. Restrict package write access to the intended approvers. npm allows any
   maintainer with publish access to approve stages; it does not limit approval
   to organization admins automatically.
5. Complete the first release promptly. npm gives a newly configured trusted
   publisher two days to validate; if it expires, recreate it and retry.

The staging workflow uses GitHub-hosted Ubuntu, Node 24, and npm 11.17.0. npm's
staging-only permission enforces the human approval gate.

References: [Release Drafter](https://github.com/release-drafter/release-drafter),
[npm trusted publishers](https://docs.npmjs.com/trusted-publishers/),
[npm staged publishing](https://docs.npmjs.com/staged-publishing/).

## For each release

1. Merge changes normally. Release Drafter updates the draft in
   [GitHub Releases](https://github.com/depot/sdk-node/releases) with merged PR
   notes and the next patch version. It does not infer whether changes are
   breaking or add features; the release maintainer makes that decision.
2. When ready, edit the draft and review its changes and target commit. Keep the
   proposed patch version for fixes, or change both the tag and release title to
   the appropriate minor or major version. Use a new stable `vX.Y.Z` tag, then
   click **Publish release** yourself. This human action triggers
   [Stage npm release](https://github.com/depot/sdk-node/actions/workflows/publish.yml),
   even though the draft was created using `GITHUB_TOKEN`.
   The workflow checks out the release commit, runs CI checks, sets the package
   version from the tag using `npm version`, then builds, checks, and stages the
   tarball. No version commit or release PR is needed; `package.json` in Git is
   not the source of published release versions. Finalize edits just before
   publishing, since another push to `main` refreshes the draft.
3. After staging succeeds, open npm **Staged Packages** and select `@depot/sdk-node`.
   Review the version, source commit, provenance, package contents, and intended
   `latest` tag. Approve releases in increasing version order so an older stage
   does not move `latest` backwards.
4. Click **Approve** and complete 2FA. The staged artifact becomes public; it is
   not rebuilt. Before this step, users cannot install the new version.
5. Confirm the approved version is `latest` and has provenance on npm. For example,
   replacing `VERSION` with the approved version:

   ```sh
   npm view @depot/sdk-node dist-tags --json
   npm view @depot/sdk-node@VERSION version dist.integrity dist.attestations --json
   ```

   In a clean temporary directory, run `npm init -y`, then:

   ```sh
   npm install --ignore-scripts @depot/sdk-node@VERSION
   node --input-type=module -e "import {createClient} from '@depot/sdk-node'; console.log(typeof createClient)"
   node -e "console.log(typeof require('@depot/sdk-node').createClient)"
   npm audit signatures
   ```

## Local checks

```sh
pnpm install --frozen-lockfile
pnpm run fmt:check
pnpm run lint
pnpm run type-check
pnpm run test
pnpm run package:check
```

Oxfmt handles formatting and Oxlint handles linting. Generated protobuf files in
`src/gen/` are excluded from both; they remain covered by compilation and tests.
`package:check` runs `pnpm pack` (which builds through `prepack`), then Publint and
Are the Types Wrong? in strict mode against `package.tgz`. The staging workflow
uploads that same tarball. Prettier and ESLint are not used.

## Recovery

- Rerun a failed staging job after fixing its cause. An already-public version
  is skipped without changing dist-tags. Registry lookup failures stop the job.
- For an interrupted upload or duplicate-version error, check npm **Staged
  Packages** before retrying. Approve the existing stage if correct, or reject it
  with 2FA before restaging. OIDC cannot list, approve, or reject pending stages.
- To retry an existing release explicitly, use
  `gh workflow run publish.yml --repo depot/sdk-node --ref vX.Y.Z`. The tag must
  contain this workflow and have a published stable GitHub release. Runs on
  branches, drafts, prereleases, and malformed version tags cannot stage.
- Tags predating this setup, including `v2.3.0`, cannot use this workflow. Let
  Release Drafter propose a new version containing the setup instead.
- Keep tags immutable. Fix published code through a new release. Never enable
  direct npm publishing to work around a staging failure.

The first real OIDC upload and post-approval installation/provenance verification
remain dependent on administrator setup and human approval.
