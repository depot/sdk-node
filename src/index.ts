import {createPromiseClient} from '@connectrpc/connect'
import {createGrpcTransport} from '@connectrpc/connect-node'
import * as buildV1Build from './gen/depot/build/v1/build_connect'
import * as buildkitV1BuildKit from './gen/depot/buildkit/v1/buildkit_connect'
import * as coreV1Project from './gen/depot/core/v1/project_connect'

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
      ProjectService: createPromiseClient(coreV1Project.ProjectService, transport),
    },
  },
}
