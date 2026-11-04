# Releasing @depot/sdk-node

Release Please maintains a release PR with the next version and changelog.
Merging that PR creates a GitHub release, which builds, validates, and stages
the package on npm. A maintainer approves it with 2FA before it goes live.

## One-time administrator setup

1. Add a GitHub Actions repository secret named `RELEASE_PLEASE_TOKEN`: a
   fine-grained GitHub personal access token scoped to `depot/sdk-node`, with
   **Contents**, **Issues**, and **Pull requests** read/write permissions. Complete
   any required organization approval and renew it before it expires. This token
   is only for Release Please; npm authentication uses OIDC.
   The separate token is needed because PRs and releases created with the built-in
   `GITHUB_TOKEN` do not trigger the CI and release workflows.
2. Merge this PR. Release Please runs on pushes to `main`. It starts from the
   existing `v2.3.0` release and selects the next version from conventional commits.
   The first release PR will include the metadata fix required by Publint;
   the old `v2.3.0` tag should not be moved or republished with different contents.
3. Sign in to npm with a package administrator account and enable 2FA.
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

4. Set **Publishing access** to **Require two-factor authentication and disallow
   tokens**. No npm token secret is needed in GitHub. Review existing trusted
   publishers too: an older connection permitting direct publishing can bypass
   the approval gate. Remove obsolete connections and revoke unused npm tokens.
5. Restrict package write access to the intended approvers. npm allows any
   maintainer with publish access to approve stages; it does not limit approval
   to organization admins automatically.
6. Complete the first release promptly. npm gives a newly configured trusted
   publisher two days to validate; if it expires, recreate it and retry.

The staging workflow uses GitHub-hosted Ubuntu, Node 24, and npm 11.17.0. npm's
staging-only permission enforces the human approval gate.

References: [Release Please setup](https://github.com/googleapis/release-please-action#github-credentials),
[npm trusted publishers](https://docs.npmjs.com/trusted-publishers/),
[npm staged publishing](https://docs.npmjs.com/staged-publishing/).

## For each release

1. Use conventional commit messages when merging changes: `fix:` bumps patch,
   `feat:` bumps minor, and `feat!:` or a `BREAKING CHANGE:` footer bumps major.
   Release Please opens or updates a release PR with `package.json`, the version
   manifest, and the changelog. No manual version bump is needed.
2. Review and merge the release PR when ready. Release Please creates the tag and
   GitHub release. [Stage npm release](https://github.com/depot/sdk-node/actions/workflows/publish.yml)
   checks out that exact commit, runs CI checks, and uploads the checked tarball.
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
  branches, drafts, prereleases, and mismatched package versions cannot stage.
- Tags predating this setup, including `v2.3.0`, cannot use this workflow. Let
  Release Please create a new version containing the setup instead.
- Keep tags immutable. Fix published code through a new release. Never enable
  direct npm publishing to work around a staging failure.

The first real OIDC upload and post-approval installation/provenance verification
remain dependent on administrator setup and human approval.
