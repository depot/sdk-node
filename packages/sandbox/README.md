# @depot/sandbox

Beta TypeScript SDK for Depot sandboxes.

This package wraps the `depot.sandbox.v1` API with Vercel-shaped classes for creating sandboxes, running commands, streaming command output, and using a `node:fs/promises`-shaped filesystem interface.

## Installation

After the beta package is published:

```bash
pnpm add @depot/sandbox@beta
```

## Usage

Set `DEPOT_TOKEN` in your environment, then create a client and pass it to the static sandbox entry points. Returned sandbox instances keep that client, so instance methods do not take a client argument.

```typescript
import {createClient, Sandbox} from '@depot/sandbox'

const client = createClient({token: process.env.DEPOT_TOKEN!})
const sandbox = await Sandbox.create(client, {
  env: {NODE_ENV: 'development'},
})

const command = await sandbox.runCommand({cmd: 'echo', args: ['hello from depot']})
const finished = await command.wait()

console.log(finished.exitCode)
console.log(await command.stdout())

const fs = sandbox.fs()
await fs.writeFile('/tmp/message.txt', 'hello')
console.log(await fs.readFile('/tmp/message.txt', 'utf8'))

await sandbox.stop({blocking: true})
```

You can also pass organization and endpoint options explicitly:

```typescript
const client = createClient({
  token: process.env.DEPOT_TOKEN!,
  orgID: process.env.DEPOT_ORG_ID,
})
```

## Beta Surface

This beta package currently includes:

- `createClient`
- `Sandbox.create`, `Sandbox.get`, `Sandbox.list`, `Sandbox.listAll`
- `sandbox.stop`, `sandbox.kill`, `sandbox.runCommand`, `sandbox.fs`
- `SandboxCommandExecution.wait`, `logs`, `output`, `stdout`, and `stderr`
- `FileSystem` helpers for common file operations

Other sandbox capabilities, such as piped stdin, command history, create-time secrets, timeout extension, snapshots, and pty support, are not part of this beta surface yet.

## Generated Protos

The generated `depot.sandbox.v1` TypeScript files are vendored in `src/gen` for the beta package so customers do not need a separate published proto module.

## License

MIT License, see the repository `LICENSE`.
