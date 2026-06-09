// Client-side multi-consumer event log.
//
// The SDK side does not enforce a byte-cap because the server is authoritative
// for that. The SDK buffer sits between RPC arrival and consumer drain.
//
// Used by `Command` to fan out `command.logs()` consumers from a single
// RunCommand stream.

import {SlowConsumerError} from './errors.js'

interface EvictionInfo {
  droppedBytes: number
}

const DEFAULT_MAX_BYTES = 16 * 1024 * 1024
const DEFAULT_IDLE_EVICT_MS = 30_000
const DEFAULT_CONSUMER_QUEUE_LIMIT = 1024

interface BufferedEventLogOpts<T> {
  byteCostOf?: (event: T) => number
  maxBytes?: number
  idleEvictMs?: number
  consumerQueueLimit?: number
}

interface RingEntry<T> {
  event: T
  byteCost: number
  offset: number
}

interface Consumer<T> {
  queue: T[]
  nextOffset: number
  resolve: ((value: IteratorResult<T>) => void) | null
  reject: ((err: unknown) => void) | null
  overflowed: boolean
  cancelled: boolean
  // Number of queue entries that came from initial replay backfill (not
  // live appends). The live-consumer cap measures producer-vs-consumer
  // lag, so it has to ignore the replay backlog or a late subscriber to
  // a long-running command tips over on the next live append before it's
  // had a chance to drain. Decremented as queue entries are pulled by
  // next(); once it hits zero we're in pure live-tail mode and the cap
  // applies normally.
  replayPending: number
}

export class BufferedEventLog<T> {
  private readonly byteCostOf: (event: T) => number
  private readonly maxBytes: number
  private readonly idleEvictMs: number
  private readonly consumerQueueLimit: number

  private readonly ring: RingEntry<T>[] = []
  private head = 0
  private tail = 0

  private retainedBytes = 0
  private droppedBytes = 0
  private closed = false
  private failure: unknown = null
  private lastDrainAt: number = Date.now()

  private readonly consumers = new Set<Consumer<T>>()

  constructor(opts: BufferedEventLogOpts<T> = {}) {
    this.byteCostOf = opts.byteCostOf ?? (() => 1)
    this.maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES
    this.idleEvictMs = opts.idleEvictMs ?? DEFAULT_IDLE_EVICT_MS
    this.consumerQueueLimit = opts.consumerQueueLimit ?? DEFAULT_CONSUMER_QUEUE_LIMIT
  }

  append(event: T): void {
    if (this.closed) {
      throw new Error('BufferedEventLog.append() after end()/error()')
    }
    const byteCost = this.byteCostOf(event)
    const entry: RingEntry<T> = {event, byteCost, offset: this.tail}
    this.ring.push(entry)
    this.tail += 1
    this.retainedBytes += byteCost
    this.evictIfNeeded()
    this.fanOut(entry)
  }

  end(): void {
    if (this.closed) return
    this.closed = true
    for (const consumer of this.consumers) {
      if (consumer.resolve && consumer.queue.length === 0) {
        const resolve = consumer.resolve
        consumer.resolve = null
        consumer.reject = null
        resolve({value: undefined, done: true})
      }
    }
    // Drop the buffer's references to all consumers. A still-live iterator
    // keeps its own consumer via closure and drains its remaining queue
    // (then self-detaches), so this only releases abandoned consumers that
    // would otherwise pin their queued events for the buffer's lifetime.
    this.consumers.clear()
  }

  error(err: unknown): void {
    if (this.closed) return
    this.closed = true
    this.failure = err
    for (const consumer of this.consumers) {
      if (consumer.reject) {
        const reject = consumer.reject
        consumer.resolve = null
        consumer.reject = null
        reject(err)
      }
    }
    // Release references for the same reason as end(); a consumer that never
    // drains after error() must not keep its queue/callbacks alive here.
    this.consumers.clear()
  }

  iterate(opts?: {fromOffset?: number; onEvicted?: (info: EvictionInfo) => void}): AsyncIterableIterator<T> {
    const requestedOffset = opts?.fromOffset ?? 0
    const onEvicted = opts?.onEvicted

    if (onEvicted && requestedOffset < this.head && this.droppedBytes > 0) {
      onEvicted({droppedBytes: this.droppedBytes})
    }

    const consumer: Consumer<T> = {
      queue: [],
      nextOffset: Math.max(requestedOffset, this.head),
      resolve: null,
      reject: null,
      overflowed: false,
      cancelled: false,
      replayPending: 0,
    }

    // Initial backfill bypasses the live-consumer queue limit. The limit
    // exists to detect a *live* subscriber that can't keep up with the rail,
    // not to bound the size of history a late subscriber inherits — both at
    // attach time (a completed command's full ring being prefilled) and on
    // the next live append (the cap would trip before the caller had a
    // chance to drain). Track how many entries came from this backfill so
    // enqueueForConsumer can ignore them when measuring producer lag.
    for (const entry of this.ring) {
      if (entry.offset >= consumer.nextOffset) {
        consumer.queue.push(entry.event)
        consumer.nextOffset = entry.offset + 1
      }
    }
    consumer.replayPending = consumer.queue.length

    this.consumers.add(consumer)
    return this.makeIterator(consumer)
  }

  get size(): number {
    return this.ring.length
  }
  get bytesRetained(): number {
    return this.retainedBytes
  }
  get bytesDropped(): number {
    return this.droppedBytes
  }
  get isClosed(): boolean {
    return this.closed
  }
  get hasFailure(): boolean {
    return this.failure !== null
  }
  get consumerCount(): number {
    return this.consumers.size
  }

  private fanOut(entry: RingEntry<T>): void {
    for (const consumer of this.consumers) {
      if (consumer.cancelled || consumer.overflowed) continue
      if (entry.offset < consumer.nextOffset) continue
      this.enqueueForConsumer(consumer, entry.event)
      consumer.nextOffset = entry.offset + 1
    }
  }

  private enqueueForConsumer(consumer: Consumer<T>, event: T): void {
    if (consumer.resolve) {
      const resolve = consumer.resolve
      consumer.resolve = null
      consumer.reject = null
      this.lastDrainAt = Date.now()
      resolve({value: event, done: false})
      return
    }
    // Cap only the live tail; the replay backlog gets a free pass until
    // the caller drains through it. liveQueued = total queued − replay
    // backlog still pending; once replayPending hits zero, the cap is the
    // ordinary live-only limit.
    const liveQueued = consumer.queue.length - consumer.replayPending
    if (liveQueued >= this.consumerQueueLimit) {
      consumer.overflowed = true
      return
    }
    consumer.queue.push(event)
  }

  private evictIfNeeded(): void {
    const now = Date.now()
    const idleExpired = this.consumers.size > 0 && now - this.lastDrainAt >= this.idleEvictMs

    while (this.ring.length > 0) {
      const overByteCap = this.retainedBytes > this.maxBytes
      const headOffset = this.ring[0]!.offset
      const everyConsumerPast = Array.from(this.consumers).every((c) => c.nextOffset > headOffset)
      if (!overByteCap && !(idleExpired && everyConsumerPast)) break

      const evicted = this.ring.shift()!
      this.retainedBytes -= evicted.byteCost
      this.droppedBytes += evicted.byteCost
      this.head = evicted.offset + 1
    }
  }

  private makeIterator(consumer: Consumer<T>): AsyncIterableIterator<T> {
    const next = async (): Promise<IteratorResult<T>> => {
      if (consumer.overflowed) {
        this.detach(consumer)
        throw new SlowConsumerError()
      }
      if (consumer.cancelled) {
        return {value: undefined, done: true}
      }
      if (consumer.queue.length > 0) {
        const event = consumer.queue.shift()!
        if (consumer.replayPending > 0) consumer.replayPending -= 1
        this.lastDrainAt = Date.now()
        return {value: event, done: false}
      }
      if (this.failure !== null) {
        this.detach(consumer)
        throw this.failure
      }
      if (this.closed) {
        this.detach(consumer)
        return {value: undefined, done: true}
      }
      return new Promise<IteratorResult<T>>((resolve, reject) => {
        consumer.resolve = resolve
        consumer.reject = reject
      })
    }
    const returnFn = async (): Promise<IteratorResult<T>> => {
      this.detach(consumer)
      return {value: undefined, done: true}
    }
    const throwFn = async (err: unknown): Promise<IteratorResult<T>> => {
      this.detach(consumer)
      throw err
    }
    const iterator: AsyncIterableIterator<T> = {
      [Symbol.asyncIterator]() {
        return iterator
      },
      next,
      return: returnFn,
      throw: throwFn,
    }
    return iterator
  }

  private detach(consumer: Consumer<T>): void {
    consumer.cancelled = true
    consumer.resolve = null
    consumer.reject = null
    this.consumers.delete(consumer)
  }
}
