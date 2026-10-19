import {createClient} from '@depot/sdk-node'

// Run one operation at a time; mutations always require an explicit action.
const [action, repository, value] = process.argv.slice(2)
const token = process.env.DEPOT_TOKEN
if (!token || !repository || !['get', 'keep-count', 'keep-days', 'delete'].includes(action)) {
  console.error(
    'Set DEPOT_TOKEN to an organization token. Usage: node examples/registry-retention.mjs <get|keep-count|keep-days|delete> <repository|**> [positive-integer]',
  )
  process.exit(1)
}

const service = createClient({token, baseURL: process.env.DEPOT_API_URL}).registry.v1beta1.RegistryService
try {
  if (action === 'get') {
    const {policy} = await service.getRetentionPolicy({repository})
    console.log(policy ? {keepCount: policy.keepCount, keepDays: policy.keepDays} : 'No explicit policy')
  } else if (action === 'delete') {
    await service.deleteRetentionPolicy({repository})
    console.log('Explicit policy removed')
  } else {
    const keep = Number(value)
    if (!Number.isInteger(keep) || keep <= 0 || keep > 2147483647) {
      throw new Error('Invalid retention value')
    }
    await service.upsertRetentionPolicy({
      repository,
      enabled: true,
      ...(action === 'keep-count' ? {keepCount: keep} : {keepDays: keep}),
    })
    console.log('Retention policy saved')
  }
} catch {
  // Avoid logging credentials or organization identifiers from raw responses.
  console.error('Retention operation failed. Check the organization token, repository, and retention value.')
  process.exitCode = 1
}
