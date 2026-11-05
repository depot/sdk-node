import {fromJson, toJson} from '@bufbuild/protobuf'
import {Code, ConnectError} from '@connectrpc/connect'
import * as esm from '@depot/sdk-node'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {describe, test} from 'vitest'
import {BillingService} from '../src/gen/depot/core/v1/billing_pb.ts'
import {startServer} from './helpers/server.mjs'

const require = createRequire(import.meta.url)
const invoice = {
  id: 'in_standalone',
  status: 'paid',
  currency: 'usd',
  finalizedAt: '2026-11-03T12:00:00Z',
  total: '9007199254740993',
  startingBalance: '-1500',
  hostedInvoiceUrl: 'https://invoice.example.test/hosted',
}

for (const [format, sdk] of [
  ['ESM', esm],
  ['CommonJS', require('@depot/sdk-node')],
]) {
  describe(`${format} billing`, () => {
    for (const {method, input, output} of [
      {
        method: 'listInvoices',
        input: {pageSize: 2, pageToken: 'signed-page'},
        output: {
          invoices: [invoice, {...invoice, id: 'in_previous', subscriptionId: 'sub_canceled'}],
          nextPageToken: 'next',
        },
      },
      {method: 'getInvoice', input: {invoiceId: invoice.id}, output: {invoice}},
      {
        method: 'listInvoiceLineItems',
        input: {invoiceId: invoice.id, pageSize: 1, pageToken: 'signed-line-page'},
        output: {
          lineItems: [{id: 'il_credit', amount: '-9007199254740993', currency: 'usd', quantity: '2'}],
          nextPageToken: 'next-line',
        },
      },
    ]) {
      test(`${method} preserves invoice fields and exact amounts over HTTP/2`, async (t) => {
        const rpc = BillingService.method[method]
        let received
        const {baseURL, requests} = await startServer(t, (router) => {
          router.rpc(rpc, (request, context) => {
            received = toJson(rpc.input, request)
            context.responseHeader.set('Cache-Control', 'no-store')
            return fromJson(rpc.output, output)
          })
        })
        let cacheControl
        const result = await sdk.createClient({baseURL, token: 'owner-token'}).core.v1.BillingService[method](input, {
          headers: {'X-Depot-Org': 'org-a'},
          onHeader: (headers) => (cacheControl = headers.get('Cache-Control')),
        })
        assert.deepEqual(received, input)
        assert.deepEqual(toJson(rpc.output, result), output)
        assert.equal(requests.length, 1)
        assert.equal(requests[0].path, `/depot.core.v1.BillingService/${rpc.name}`)
        assert.equal(requests[0].headers.authorization, 'Bearer owner-token')
        assert.equal(requests[0].headers['x-depot-org'], 'org-a')
        assert.equal(cacheControl, 'no-store')
        if (method === 'getInvoice') {
          assert.equal(result.invoice.subscriptionId, '')
          assert.equal(result.invoice.total, 9007199254740993n)
          assert.equal(result.invoice.startingBalance, -1500n)
        }
      })
    }

    test('an empty filtered page retains its continuation token', async (t) => {
      const tokens = []
      const {baseURL} = await startServer(t, (router) => {
        router.service(BillingService, {
          listInvoices: (request) => {
            tokens.push(request.pageToken)
            return request.pageToken ? {invoices: [{id: 'in_after_drafts'}]} : {nextPageToken: 'past-drafts'}
          },
        })
      })
      const client = sdk.createClient({baseURL, token: 'org-token'}).core.v1.BillingService
      const first = await client.listInvoices({})
      assert.deepEqual(first.invoices, [])
      assert.equal(first.nextPageToken, 'past-drafts')
      const second = await client.listInvoices({pageToken: first.nextPageToken})
      assert.equal(second.invoices[0].id, 'in_after_drafts')
      assert.equal(second.nextPageToken, '')
      assert.deepEqual(tokens, ['', 'past-drafts'])
    })

    test('preserves not-found and permission errors without retrying', async (t) => {
      const {baseURL, requests} = await startServer(t, (router) => {
        router.service(BillingService, {
          getInvoice: () => {
            throw new ConnectError('Invoice not found', Code.NotFound)
          },
          listInvoices: () => {
            throw new ConnectError('Permission denied', Code.PermissionDenied)
          },
        })
      })
      const client = sdk.createClient({baseURL, token: 'org-token'}).core.v1.BillingService
      await assert.rejects(client.getInvoice({invoiceId: 'in_foreign'}), {
        code: Code.NotFound,
        rawMessage: 'Invoice not found',
      })
      await assert.rejects(client.listInvoices({}), {code: Code.PermissionDenied, rawMessage: 'Permission denied'})
      assert.equal(requests.length, 2)
    })
  })
}
