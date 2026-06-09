// Public surface of @depot/sandbox.
//
// Lifecycle surface: create + get + list + listAll + stop + kill. Sandbox
// instances carry their client, so instance methods and child objects do not
// require callers to pass it again.

export {DEFAULT_ENDPOINT, createClient, type CreateClientOpts, type SandboxClient} from './client.js'
export {
  SandboxCommandExecution,
  type SandboxCommandExecutionFinished,
  type SandboxCommandExecutionLogChunk,
} from './command.js'
export {FileSystemError, SlowConsumerError, type FileSystemErrorCode} from './errors.js'
export {
  DirEntry,
  FileSystem,
  StatResult,
  type CopyFileOpts,
  type FileTypeName,
  type MkdirOpts,
  type ReadFileOpts,
  type ReaddirOpts,
  type RmOpts,
  type WriteFileOpts,
} from './filesystem.js'
export {
  Sandbox,
  type CreateSandboxOpts,
  type KillSandboxOpts,
  type ListAllSandboxesOpts,
  type ListSandboxesOpts,
  type ListSandboxesResult,
  type StopSandboxOpts,
} from './sandbox.js'
export type {
  ListFilter,
  Pagination,
  PaginationResult,
  Resources,
  RunCommandOpts,
  Runtime,
  SandboxCommandExecutionStatus,
  SandboxStatus,
} from './types.js'
