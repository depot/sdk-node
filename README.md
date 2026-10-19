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
- [`depot.core.v1.BillingService`](https://buf.build/depot/api/docs/main:depot.core.v1#depot.core.v1.BillingService)
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

Run `pnpm test` to build the ESM and CommonJS packages and run the Vitest suite.
Automated tests live in `test/` and use local HTTP/2 endpoints without Depot credentials.
The `src/test.ts` script is a separate manual smoke test against the live API.

## License

MIT License, see `LICENSE`.
