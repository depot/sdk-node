# Depot API SDK for Node.js

[![CI](https://github.com/depot/sdk-node/actions/workflows/ci.yml/badge.svg)](https://github.com/depot/sdk-node/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@depot/sdk-node.svg)](https://www.npmjs.com/package/@depot/sdk-node)
![Powered by TypeScript](https://img.shields.io/badge/powered%20by-typescript-blue.svg)

A Node.js SDK for the [Depot](https://depot.dev) API.

👉 [**API Documentation**](https://buf.build/depot/api)

## Installation

Use [pnpm](https://pnpm.io) or your favorite package manager:

```bash
pnpm add @depot/sdk-node
```

## Usage

Each of the Depot API services is exposed on the main `depot` export. The service paths match their corresponding gRPC service names. Set the `DEPOT_TOKEN` environment variable to authenticate requests:

```bash
export DEPOT_TOKEN=your-access-token
```

- [`depot.build.v1.BuildService`](https://buf.build/depot/api/docs/main:depot.build.v1#depot.build.v1.BuildService)
- [`depot.build.v1.RegistryService`](https://buf.build/depot/api/docs/main:depot.build.v1#depot.build.v1.RegistryService)
- [`depot.buildkit.v1.BuildKitService`](https://buf.build/depot/api/docs/main:depot.buildkit.v1#depot.buildkit.v1.BuildKitService)
- [`depot.code.v1beta1.CodeService`](https://buf.build/depot/api/docs/main:depot.code.v1beta1#depot.code.v1beta1.CodeService)
- [`depot.core.v1.BuildService`](https://buf.build/depot/api/docs/main:depot.core.v1#depot.core.v1.BuildService)
- [`depot.core.v1.GithubActionsService`](https://buf.build/depot/api/docs/main:depot.core.v1#depot.core.v1.GithubActionsService)
- [`depot.core.v1.ProjectService`](https://buf.build/depot/api/docs/main:depot.core.v1#depot.core.v1.ProjectService)
- [`depot.core.v1.UsageService`](https://buf.build/depot/api/docs/main:depot.core.v1#depot.core.v1.UsageService)
- [`depot.core.v1.OrganizationService`](https://buf.build/depot/api/docs/main:depot.core.v1#depot.core.v1.OrganizationService)
- [`depot.registry.v1beta1.RegistryService`](https://buf.build/depot/api/docs/main:depot.registry.v1beta1#depot.registry.v1beta1.RegistryService)

### Example

**List projects:**

```typescript
import {depot} from '@depot/sdk-node'

async function example() {
  const result = await depot.core.v1.ProjectService.listProjects({})
  console.log(result.projects)
}
```

### Create a client

Use `createClient()` to configure a client explicitly:

```typescript
import {createClient} from '@depot/sdk-node'

const client = createClient({token: 'your-access-token'})
const result = await client.core.v1.ProjectService.listProjects({})
console.log(result.projects)
```

`createClient()` accepts an optional `token` and `baseURL`. It defaults to `https://api.depot.dev` and does not read environment variables. If you omit `token`, supply an authorization header on each call that requires authentication.

To use a different token for an individual call, pass an authorization header:

```typescript
const result = await depot.core.v1.ProjectService.listProjects({}, {headers: {Authorization: `Bearer ${token}`}})
```

## Project OIDC trust policies

Use `core.v1.ProjectService` with an **organization API token** to manage which CI
identities can authenticate to a Depot project. Project tokens and read-only
organization tokens cannot authorize these operations.

For GitLab, use numeric namespace and project IDs. The GitLab project ID is
separate from the Depot project ID:

```typescript
import {createClient} from '@depot/sdk-node'

const projects = createClient({token: process.env.DEPOT_TOKEN}).core.v1.ProjectService
const projectId = 'your-depot-project-id'

const {trustPolicy} = await projects.addTrustPolicy({
  projectId,
  provider: {
    case: 'gitlab',
    value: {namespaceId: '12345', projectId: '67890', protectedRefsOnly: true},
  },
})
if (!trustPolicy) throw new Error('No trust policy returned')
console.log(trustPolicy) // Check the saved settings, especially when adding an existing policy.

const page = await projects.listTrustPolicies({projectId, pageSize: 100})
console.log(page.trustPolicies)
// When page.nextPageToken is present, pass it as pageToken with the same project/filter.

await projects.updateTrustPolicy({
  projectId,
  trustPolicyId: trustPolicy.trustPolicyId,
  protectedRefsOnly: false,
})
```

`protectedRefsOnly: true` restricts GitLab authentication to protected refs.
Omitting it on a new policy defaults to `false`. Adding an existing policy
preserves its saved restrictions; use `updateTrustPolicy` to change them.
Updates preserve omitted fields, while explicit `false` disables the selected
restriction. GitHub policies similarly support `allowPublicPullRequests`; that
field is only valid for GitHub, and `protectedRefsOnly` is only valid for GitLab.
The API also supports CircleCI and Buildkite policies.

To revoke a policy, call `removeTrustPolicy({projectId, trustPolicyId})`. The
[runnable GitLab example](./examples/gitlab-trust-policy.mjs) performs one
explicit operation per invocation. From this repository, run `pnpm run build`,
set `DEPOT_TOKEN`, and choose an operation:

```bash
node examples/gitlab-trust-policy.mjs list <depot-project-id>
node examples/gitlab-trust-policy.mjs add <depot-project-id> <namespace-id> <gitlab-project-id> true
node examples/gitlab-trust-policy.mjs update <depot-project-id> <policy-id> false
node examples/gitlab-trust-policy.mjs remove <depot-project-id> <policy-id>
```

The example lists one page of policies for all providers. Pass the returned
`nextPageToken` as the final argument to `list` to fetch the next page. It prints
the saved restrictions after additions and updates.

## Registry retention policies

Use `depot.registry.v1beta1.RegistryService` with an **organization API token**.
The token determines the organization; you don't need an organization ID or
`x-depot-org` header. Project tokens and Registry pull/push tokens don't authorize
these management calls.

Set `repository` to a repository path such as `team/app`, without a registry host
or organization prefix. Use `**` for the organization-default policy. Supply
exactly one positive integer strategy: `keepCount` or `keepDays`. The `enabled`
field isn't a disable switch: to remove an explicit policy, call
`deleteRetentionPolicy`.

```typescript
import {createClient} from '@depot/sdk-node'

const registry = createClient({token: process.env.DEPOT_TOKEN}).registry.v1beta1.RegistryService

// Keep the most recent 10 images for this repository.
await registry.upsertRetentionPolicy({repository: 'team/app', enabled: true, keepCount: 10})

const {policy} = await registry.getRetentionPolicy({repository: 'team/app'})
// policy is undefined when this scope has no explicit policy.

// Alternatively, set a time-based organization default.
await registry.upsertRetentionPolicy({repository: '**', enabled: true, keepDays: 30})

// Remove only the explicit repository policy; an inherited policy may still apply.
await registry.deleteRetentionPolicy({repository: 'team/app'})
```

`getRetentionPolicy` reads the explicit policy for the requested scope, not the
effective inherited policy. Deleting `**` removes the explicit organization
default. Deleting a policy doesn't delete the repository or its images and
doesn't restore images already removed by retention.

The [runnable example](./examples/registry-retention.mjs) performs one operation
at a time. From this repository, build the SDK with `pnpm run build`, set
`DEPOT_TOKEN`, and choose an operation:

```bash
node examples/registry-retention.mjs get team/app
node examples/registry-retention.mjs keep-count team/app 10
node examples/registry-retention.mjs keep-days '**' 30
node examples/registry-retention.mjs delete team/app
```

## Testing

Use `pnpm run fmt:check` (Oxfmt), `pnpm run lint` (Oxlint), and `pnpm run type-check`
for source checks. Run `pnpm run package:check` to build and validate the packed
package with Publint and Are the Types Wrong?.
See [Releasing](./docs/releases.md) for npm setup, staged releases, and approval.

Run `pnpm test` to build the ESM and CommonJS packages and run the Vitest suite.
Automated tests live in `test/` and use local HTTP/2 endpoints without Depot credentials.
The suite covers configuration, authorization, service serialization, errors, and
cancellation through both package entrypoints. Default-client configuration is
tested in isolated Node processes; even the default API URL is redirected locally.
The `src/manual-smoke.ts` script is a separate manual smoke test against the live API
and is excluded from automated discovery.

## License

MIT License, see `LICENSE`.

## Usage analysis

`depot.core.v1.UsageAnalyticsService` exposes UTC daily usage series and paginated
product/project/repository/workflow breakdowns. These methods require an API deployment
with UsageAnalyticsService support; older deployments return `Unimplemented`.

See the [usage analysis guide](https://depot.dev/docs/api/usage-analysis) for coverage, units,
filters, pagination, and freshness. The contract is owned by
[depot/proto](https://github.com/depot/proto). `pnpm run generate` regenerates the SDK
from the latest published `buf.build/depot/api` contract. MCP consumes this SDK through
the API repository's `@depot/sdk-node` package dependency.

With an organization token in `DEPOT_TOKEN`, compare equal-length periods using:

```sh
node examples/usage-compare.mjs 2026-10-01T00:00:00Z 2026-10-08T00:00:00Z 2026-10-15T00:00:00Z owner/repo
```

The example follows every page, compares stable workflow keys, preserves unattributed
usage, and returns vCPU-minute deltas. It does not estimate invoice amounts or send notifications.
