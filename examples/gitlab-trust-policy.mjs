import {createClient} from '@depot/sdk-node'

// Each invocation performs one operation. Mutations require an explicit action.
const [action, projectId, ...args] = process.argv.slice(2)
const token = process.env.DEPOT_TOKEN
const expectedArgs = {list: [0, 1], add: [3], update: [2], remove: [1]}
const validBoolean = (value) => value === 'true' || value === 'false'
if (
  !token ||
  !projectId?.trim() ||
  !Object.hasOwn(expectedArgs, action) ||
  !expectedArgs[action].includes(args.length) ||
  args.some((value) => !value.trim()) ||
  (action === 'add' && (!/^\d+$/.test(args[0]) || !/^\d+$/.test(args[1]) || !validBoolean(args[2]))) ||
  (action === 'update' && !validBoolean(args[1]))
) {
  console.error(`Set DEPOT_TOKEN to an organization API token. Usage:
  node examples/gitlab-trust-policy.mjs list <depot-project-id> [page-token]
  node examples/gitlab-trust-policy.mjs add <depot-project-id> <namespace-id> <gitlab-project-id> <true|false>
  node examples/gitlab-trust-policy.mjs update <depot-project-id> <policy-id> <true|false>
  node examples/gitlab-trust-policy.mjs remove <depot-project-id> <policy-id>`)
  process.exit(1)
}

function policyView(policy) {
  if (!policy) throw new Error('No policy returned')
  const {$typeName, ...conditions} = policy.provider.value ?? {}
  return {trustPolicyId: policy.trustPolicyId, provider: policy.provider.case, conditions}
}

const service = createClient({token, baseURL: process.env.DEPOT_API_URL}).core.v1.ProjectService
try {
  if (action === 'list') {
    const result = await service.listTrustPolicies({projectId, pageToken: args[0]})
    console.log(
      JSON.stringify(
        {trustPolicies: result.trustPolicies.map(policyView), nextPageToken: result.nextPageToken ?? null},
        null,
        2,
      ),
    )
  } else if (action === 'remove') {
    await service.removeTrustPolicy({projectId, trustPolicyId: args[0]})
    console.log('Trust policy removed')
  } else {
    const result =
      action === 'add'
        ? await service.addTrustPolicy({
            projectId,
            provider: {
              case: 'gitlab',
              value: {namespaceId: args[0], projectId: args[1], protectedRefsOnly: args[2] === 'true'},
            },
          })
        : await service.updateTrustPolicy({projectId, trustPolicyId: args[0], protectedRefsOnly: args[1] === 'true'})
    // Duplicate adds preserve existing restrictions, so display the saved policy.
    console.log(JSON.stringify(policyView(result.trustPolicy), null, 2))
  }
} catch {
  console.error('Trust policy operation failed. Check the organization token, project, policy, and GitLab IDs.')
  process.exitCode = 1
}
