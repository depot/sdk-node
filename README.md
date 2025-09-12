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

Each of the Depot API services is exposed on the main `depot` export. Authentication is provided via an `Authorization` header with an **Organization Token**, for each API request. The service paths match their corresponding gRPC service names.

- [`depot.build.v1.BuildService`](https://buf.build/depot/api/docs/main:depot.build.v1#depot.build.v1.BuildService)
- [`depot.buildkit.v1.BuildKitService`](https://buf.build/depot/api/docs/main:depot.buildkit.v1#depot.buildkit.v1.BuildKitService)
- [`depot.core.v1.ProjectService`](https://buf.build/depot/api/docs/main:depot.core.v1#depot.core.v1.ProjectService)
- [`depot.core.v1.UsageService`](https://buf.build/depot/api/docs/main:depot.core.v1#depot.core.v1.UsageService)

### Example

**List projects:**

```typescript
import {depot} from '@depot/sdk-node'

const headers = {
  Authorization: `Bearer ${process.env.DEPOT_TOKEN}`,
}

async function example() {
  const result = await depot.core.v1.ProjectService.listProjects({}, {headers})
  console.log(result.projects)
}
```

## License

MIT License, see `LICENSE`.
