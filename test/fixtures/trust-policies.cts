import {createClient} from '@depot/sdk-node'

async function typecheck() {
  const service = createClient({token: 'typecheck-only'}).core.v1.ProjectService
  const {trustPolicy} = await service.addTrustPolicy({
    projectId: 'depot-project',
    provider: {case: 'gitlab', value: {namespaceId: '123', projectId: '456', protectedRefsOnly: true}},
  })
  if (trustPolicy?.provider.case === 'gitlab') {
    const protectedRefsOnly: boolean = trustPolicy.provider.value.protectedRefsOnly
    await service.updateTrustPolicy({
      projectId: 'depot-project',
      trustPolicyId: trustPolicy.trustPolicyId,
      protectedRefsOnly,
    })
    await service.updateTrustPolicy({
      projectId: 'depot-project',
      trustPolicyId: trustPolicy.trustPolicyId,
      protectedRefsOnly: false,
    })
  }
}
void typecheck
