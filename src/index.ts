import {timestampFromDate} from '@bufbuild/protobuf/wkt'
import {createClient} from '@connectrpc/connect'
import {createConnectTransport} from '@connectrpc/connect-node'
import * as buildV1Build from './gen/depot/build/v1/build_pb'
import * as buildV1Registry from './gen/depot/build/v1/registry_pb'
import * as buildkitV1BuildKit from './gen/depot/buildkit/v1/buildkit_pb'
import * as coreV1Build from './gen/depot/core/v1/build_pb'
import * as coreV1Org from './gen/depot/core/v1/org_pb'
import * as coreV1Project from './gen/depot/core/v1/project_pb'
import * as coreV1Usage from './gen/depot/core/v1/usage_pb'

const transport = createConnectTransport({
  baseUrl: process.env.DEPOT_API_URL ?? 'https://api.depot.dev',
  httpVersion: '2',
})

export const depot = {
  build: {
    v1: {
      BuildService: createClient(buildV1Build.BuildService, transport),
      RegistryService: createClient(buildV1Registry.RegistryService, transport),
    },
  },
  buildkit: {
    v1: {
      BuildKitService: createClient(buildkitV1BuildKit.BuildKitService, transport),
    },
  },
  core: {
    v1: {
      BuildService: createClient(coreV1Build.BuildService, transport),
      ProjectService: createClient(coreV1Project.ProjectService, transport),
      UsageService: createClient(coreV1Usage.UsageService, transport),
      OrganizationService: createClient(coreV1Org.OrganizationService, transport),
      timestampFromDate: timestampFromDate,
    },
  },
}
