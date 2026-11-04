# Releasing @depot/sdk-node

Publishing a stable GitHub release starts **Stage npm release**. It builds and checks
the exact release commit, then uploads the verified tarball to npm with OIDC and
provenance. The package stays unavailable to users until a maintainer approves it
on npm with 2FA. A green workflow means **staged**, not published.

## One-time setup for the npm administrator

1. Merge the release workflow into `depot/sdk-node` on `main`.
2. Sign in to npm with an account that can manage `@depot/sdk-node`, with 2FA enabled.
3. Open [the package settings](https://www.npmjs.com/package/@depot/sdk-node/access)
   and add a **GitHub Actions trusted publisher** with these exact values:

   | Setting                                | Value                                                        |
   | -------------------------------------- | ------------------------------------------------------------ |
   | Organization or user                   | `depot`                                                      |
   | Repository                             | `sdk-node`                                                   |
   | Workflow filename                      | `publish.yml`                                                |
   | Environment name                       | Leave empty; this workflow does not use a GitHub environment |
   | Stage publishing (`npm stage publish`) | Allowed                                                      |
   | Direct publishing (`npm publish`)      | Disabled                                                     |
   | Dist-tag management (`npm dist-tag`)   | Disabled                                                     |

4. Under **Publishing access**, select **Require two-factor authentication and
   disallow tokens**, then save. No `NPM_TOKEN` or `NODE_AUTH_TOKEN` secret is needed
   in GitHub. Check existing trusted publishers as well: a connection that still
   allows direct publishing can bypass this workflow's approval gate. Remove obsolete
   publishing connections and revoke unused publishing tokens.
5. Review the package's users and team write access. npm allows maintainers with
   package publish access to approve stages; it does not enforce an organization
   admin-only role. To reserve approval for admins, give package write access only
   to the intended approvers.
6. Arrange the first real staging run and human approval promptly. npm documents a
   two-day activation window for a new trusted publisher. If it expires, delete it,
   recreate it, and retry. Check its validation status after the first release.

The workflow uses GitHub-hosted Ubuntu, Node 24 and npm 11.17.0. Staging requires
npm >=11.15.0 and Node >=22.14.0. Only the upload job has `id-token: write`;
dependency installation and package tests run in a separate job. The upload job
checks the tarball's SHA-512 digest and disables lifecycle scripts. npm's
**staging-only permission** is what enforces the human publication gate.

References: [npm trusted publishers](https://docs.npmjs.com/trusted-publishers/),
[staged publishing](https://docs.npmjs.com/staged-publishing/),
[npm stage commands](https://docs.npmjs.com/cli/v11/commands/npm-stage/).

## For each release

1. Update `package.json` to the intended stable version, update the changelog, and
   merge the release changes. Run the checks below before tagging.
2. Create a matching `vMAJOR.MINOR.PATCH` tag on that commit and publish a stable
   [GitHub release](https://github.com/depot/sdk-node/releases). Drafts, prereleases,
   and ordinary pushes do not stage packages. Keep release tags immutable.
3. Wait for [Stage npm release](https://github.com/depot/sdk-node/actions/workflows/publish.yml)
   to succeed. Its summary identifies the source commit and tarball integrity;
   the upload log contains the npm stage ID.
4. The approver opens **Staged Packages** on npm, selects `@depot/sdk-node`, and
   checks the version, intended `latest` tag, GitHub run, source commit, provenance,
   and package contents. If needed, use the CLI to inspect the pending artifact:

   ```sh
   npm login
   npm stage list @depot/sdk-node
   npm stage view <stage-id>
   npm stage download <stage-id>
   ```

5. Check that this is still the intended next release. Approve pending versions in
   increasing version order: an old stage approved later can move `latest`
   backwards. Click **Approve** and complete 2FA. Alternatively run
   `npm stage approve <stage-id>` and complete 2FA. This publishes the existing
   staged artifact; it does not rebuild it. Reject an incorrect stage instead.
6. Verify the live release (replace `2.3.0` with the approved version):

   ```sh
   npm view @depot/sdk-node dist-tags --json
   npm view @depot/sdk-node@2.3.0 version dist.integrity dist.attestations --json
   ```

   Confirm `latest`, integrity, and the provenance link. In a clean temporary
   directory, install that exact version and verify both entrypoints:

   ```sh
   npm init -y
   npm install --ignore-scripts @depot/sdk-node@2.3.0
   node --input-type=module -e "import {createClient} from '@depot/sdk-node'; console.log(typeof createClient)"
   node -e "console.log(typeof require('@depot/sdk-node').createClient)"
   npm audit signatures
   ```

## Checks and local development

```sh
pnpm install --frozen-lockfile
pnpm run fmt:check
pnpm run lint
pnpm run type-check
pnpm run test
pnpm run package:check
```

Use `pnpm run fmt` to apply Oxfmt formatting. Oxlint checks maintained code and
scripts. Generated protobuf code in `src/gen/` is excluded from formatting and
linting and is owned by `buf generate`; it is still compiled, tested, and packed.
Prettier and ESLint are not used.

`package:check` builds, packs once, checks that tarball with Publint (`--strict`)
and Are the Types Wrong? (`--profile strict`), and installs it in an isolated
consumer. It exercises ESM and CommonJS imports plus both TypeScript declaration
entrypoints. CI runs the same package verification after the test build. The
release job uploads exactly the tarball that passed these checks.

## Retries, pending stages, and existing releases

- For a failure before uploading, fix the cause and rerun the workflow. Registry
  errors fail closed. An already-public version is reported as a successful no-op;
  it is never replaced and its dist-tags are never changed by CI.
- After an upload error or interrupted run, inspect npm **Staged Packages** before
  retrying. npm reserves a version while staged, so another upload of that version
  fails. OIDC credentials cannot list, approve, download, or reject stages. If a
  pending artifact is correct, approve it; if incorrect, reject it with 2FA before
  restaging. Never switch the workflow to direct publishing to recover.
- If an artifact has expired in GitHub, rerun **all jobs** to rebuild and verify it.
  The concurrency group serializes release runs. GitHub may replace an older
  pending run when several are queued; manually dispatch any release still needed.
- To stage an existing stable GitHub release such as `v2.3.0`, open **Stage npm
  release → Run workflow**, select branch **main**, and supply the existing tag.
  This uses current workflow tools but builds the exact tagged source. It refuses
  drafts, prereleases, moved tags during a run, mismatched versions, and unpublished
  versions older than npm's current `latest`. Check npm first in case that version
  is already staged or published.
- Old tags must pass the current formatting, lint, and package validation checks.
  If an old release needs source or metadata fixes, release a new version from a
  new commit instead of moving the old tag or bypassing validation.
  In particular, the existing `v2.3.0` tag uses a repository string rejected by
  Publint. The fix is in this change, so the recommended first release is a new
  patch version (for example `v2.3.1`) containing it. This PR does not bump the
  package version or publish that release.
- For a manual backfill, npm's provenance identifies the workflow invocation on
  `main`; the build summary records the separately resolved release tag and commit.
  For automatic release events, the invocation SHA is checked against the tag's
  commit. Review both the invocation and source when approving a backfill.

The first OIDC-authenticated stage and subsequent public installation/provenance
verification require the npm configuration above and a maintainer's approval;
local checks cannot establish that the external trust relationship works.
