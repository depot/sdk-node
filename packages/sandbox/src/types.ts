// Public types for the @depot/sandbox SDK.
//
// The generated proto types in ./gen/ stay close to the wire format: numeric
// enums, camelCase derived from snake_case, and proto Timestamp messages. The
// types here are the friendlier shapes we hand to SDK users instead: string
// unions for enums, Date in place of Timestamp, and discriminated unions in
// place of proto oneofs.

/**
 * The lifecycle status of a sandbox, as a string instead of the wire enum.
 *
 * The underlying proto enum includes an `UNSPECIFIED` zero value that the
 * server never actually returns. Rather than expose it here, the conversion
 * helper `sandboxStatusFromProto` maps that case to `undefined`.
 */
export type SandboxStatus = 'created' | 'assigned' | 'starting' | 'running' | 'finished' | 'cancelled' | 'failed'

/**
 * Bytes transferred over the sandbox's primary network interface. This is only
 * reported once the sandbox reaches a terminal status, and only when a metering
 * source is available server-side; it is `undefined` otherwise.
 */
export interface NetworkUsage {
  ingressBytes: number
  egressBytes: number
}

/**
 * The compute resources to request for a sandbox. Every field is optional;
 * leaving one unset lets the server choose a default.
 */
export interface Resources {
  vcpus?: number
  memoryMb?: number
  diskGb?: number
}

/**
 * Selects which runtime a sandbox boots into. Today the only supported option
 * is `imageRef`, an arbitrary OCI image reference.
 *
 * The `named` variant is reserved for a future catalog of curated runtimes
 * (for example `"node24"`) that the server would resolve by name. It is not
 * usable yet: the server currently rejects any `named` value, so do not set it
 * until the catalog ships.
 */
export type Runtime = {readonly named: string} | {readonly imageRef: string}

/** Narrows the results of {@link Sandbox.list} and {@link Sandbox.listAll}. */
export interface ListFilter {
  /** When set, only return sandboxes whose status is one of these values. */
  states?: readonly SandboxStatus[]
  /** Only return sandboxes created after this time. The bound is exclusive. */
  createdAfter?: Date
  /** Only return sandboxes created before this time. The bound is exclusive. */
  createdBefore?: Date
}

/** Controls how a list request is paginated. */
export interface Pagination {
  /** How many results to return per page. The server caps this, and picks a default when it is unset. */
  pageSize?: number
  /** An opaque cursor from a previous call's `nextPageToken`, used to fetch the next page. */
  pageToken?: string
}

/** The pagination details returned alongside a page of results. `nextPageToken` is undefined on the last page. */
export interface PaginationResult {
  nextPageToken?: string
}

/**
 * Friendly SDK alias of the generated `SandboxCommandExecutionStatus` proto enum.
 *
 * The proto enum carries a sentinel `UNSPECIFIED` zero value that the server
 * never returns; that case is mapped to `undefined` at the SDK boundary
 * rather than leaking into the union.
 */
export type SandboxCommandExecutionStatus = 'pending' | 'running' | 'finished' | 'failed' | 'killed'

/**
 * Options bag for {@link Sandbox.runCommand}.
 *
 * `detached` runs the command fire-and-forget (beta). With it set,
 * {@link Sandbox.runCommand} returns as soon as the command starts, and the
 * command keeps running in the sandbox afterward — but its output is not
 * retained and can't be retrieved yet, so `logs()`, `output()`, and `wait()`
 * on the returned execution throw, and the SDK logs a warning. Reattaching to a
 * detached command's output is a future API. Leave `detached` unset
 * for the normal blocking shape, where you stream output and await the result.
 */
export interface RunCommandOpts {
  cmd: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  sudo?: boolean
  detached?: boolean
}
