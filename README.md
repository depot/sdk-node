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

## License

MIT License, see `LICENSE`.
