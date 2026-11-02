import {createClient} from '@depot/sdk-node'

const service = createClient({token: 'typecheck-only'}).core.v1.ProjectService
const projectId = 'depot-project'
const {trustPolicy} = await service.addTrustPolicy({
  projectId,
  provider: {case: 'gitlab', value: {namespaceId: '123', projectId: '456', protectedRefsOnly: true}},
})
if (trustPolicy?.provider.case === 'gitlab') {
  const protectedRefsOnly: boolean = trustPolicy.provider.value.protectedRefsOnly
  await service.updateTrustPolicy({projectId, trustPolicyId: trustPolicy.trustPolicyId, protectedRefsOnly})
  await service.updateTrustPolicy({projectId, trustPolicyId: trustPolicy.trustPolicyId, protectedRefsOnly: false})
  await service.updateTrustPolicy({projectId, trustPolicyId: trustPolicy.trustPolicyId})
  await service.removeTrustPolicy({projectId, trustPolicyId: trustPolicy.trustPolicyId})
}
await service.listTrustPolicies({projectId})
