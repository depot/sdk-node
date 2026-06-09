import assert from 'node:assert'
import test from 'node:test'
import {SlowConsumerError} from './errors.js'
import {BufferedEventLog} from './k-streaming.js'

test('append/iterate happy path: producer events arrive in order at the consumer', async () => {
  const log = new BufferedEventLog<number>()
  const it = log.iterate()
  log.append(1)
  log.append(2)
  log.append(3)
  log.end()
  const out: number[] = []
  for await (const ev of it) out.push(ev)
  assert.deepEqual(out, [1, 2, 3])
})

test('multi-consumer isolation: two iterators each see the full sequence', async () => {
  const log = new BufferedEventLog<number>()
  const a = log.iterate()
  log.append(1)
  const b = log.iterate()
  log.append(2)
  log.append(3)
  log.end()
  const aOut: number[] = []
  for await (const ev of a) aOut.push(ev)
  const bOut: number[] = []
  for await (const ev of b) bOut.push(ev)
  assert.deepEqual(aOut, [1, 2, 3])
  assert.deepEqual(bOut, [1, 2, 3])
})

test('end() drains pending events then closes', async () => {
  const log = new BufferedEventLog<number>()
  const it = log.iterate()
  log.append(1)
  log.append(2)
  log.end()
  const out: number[] = []
  for await (const ev of it) out.push(ev)
  assert.deepEqual(out, [1, 2])
  assert.equal(log.isClosed, true)
})

test('slow consumer overflow surfaces SlowConsumerError; healthy consumers are unaffected', async () => {
  const log = new BufferedEventLog<number>({consumerQueueLimit: 2})
  const slow = log.iterate()
  const fast = log.iterate()
  // Lockstep-drain fast so its queue never exceeds the limit; slow never
  // drains so its queue overflows after the third append.
  log.append(1)
  await fast.next()
  log.append(2)
  await fast.next()
  log.append(3)
  await fast.next()
  log.append(4)
  await fast.next()

  await assert.rejects(async () => {
    for await (const _ of slow) {
      // pass
    }
  }, SlowConsumerError)
})
