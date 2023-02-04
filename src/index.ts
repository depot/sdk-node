import {createGrpcTransport, createPromiseClient} from '@bufbuild/connect-node'
import * as buildV1Build from './gen/depot/build/v1/build_connectweb'
import * as buildkitV1BuildKit from './gen/depot/buildkit/v1/buildkit_connectweb'
import * as coreV1Namespace from './gen/depot/core/v1/namespace_connectweb'

const transport = createGrpcTransport({
  baseUrl: process.env.DEPOT_API_URL ?? 'https://api.depot.dev',
  httpVersion: '2',
})

export const depot = {
  build: {
    v1: {
      BuildService: createPromiseClient(buildV1Build.BuildService, transport),
    },
  },
  buildkit: {
    v1: {
      BuildKitService: createPromiseClient(buildkitV1BuildKit.BuildKitService, transport),
    },
  },
  core: {
    v1: {
      NamespaceService: createPromiseClient(coreV1Namespace.NamespaceService, transport),
    },
  },
}
