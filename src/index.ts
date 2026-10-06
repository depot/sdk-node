export * as wkt from '@bufbuild/protobuf/wkt'
import {createClient as createConnectClient} from '@connectrpc/connect'
import {createConnectTransport} from '@connectrpc/connect-node'
import * as buildV1Build from './gen/depot/build/v1/build_pb'
import * as buildV1Registry from './gen/depot/build/v1/registry_pb'
import * as buildkitV1BuildKit from './gen/depot/buildkit/v1/buildkit_pb'
import * as codeV1Beta1Code from './gen/depot/code/v1beta1/code_pb'
import * as coreV1Build from './gen/depot/core/v1/build_pb'
import * as coreV1GithubActions from './gen/depot/core/v1/github_actions_pb'
import * as coreV1Org from './gen/depot/core/v1/org_pb'
import * as coreV1Project from './gen/depot/core/v1/project_pb'
import * as coreV1Usage from './gen/depot/core/v1/usage_pb'
import * as registryV1Beta1Registry from './gen/depot/registry/v1beta1/registry_pb'

export interface ClientOptions {
  /** The token to use for authentication. If not provided, no authentication will be used. */
  token?: string
  /**
   * The base URL to use for the API.
   * @default https://api.depot.dev
   */
  baseURL?: string
}

export function createClient(options?: ClientOptions) {
  const baseUrl = options?.baseURL ?? 'https://api.depot.dev'
  const token = options?.token

  const transport = createConnectTransport({
    baseUrl,
    httpVersion: '2',
    interceptors: [
      (next) => (request) => {
        if (token && !request.header.has('Authorization')) {
          request.header.set('Authorization', `Bearer ${token}`)
        }
        return next(request)
      },
    ],
  })

  return {
    build: {
      v1: {
        BuildService: createConnectClient(buildV1Build.BuildService, transport),
        RegistryService: createConnectClient(buildV1Registry.RegistryService, transport),
      },
    },
    buildkit: {
      v1: {
        BuildKitService: createConnectClient(buildkitV1BuildKit.BuildKitService, transport),
      },
    },
    code: {
      v1beta1: {
        CodeService: createConnectClient(codeV1Beta1Code.CodeService, transport),
      },
    },
    core: {
      v1: {
        BuildService: createConnectClient(coreV1Build.BuildService, transport),
        GithubActionsService: createConnectClient(coreV1GithubActions.GithubActionsService, transport),
        ProjectService: createConnectClient(coreV1Project.ProjectService, transport),
        UsageService: createConnectClient(coreV1Usage.UsageService, transport),
        OrganizationService: createConnectClient(coreV1Org.OrganizationService, transport),
      },
    },
    registry: {
      v1beta1: {
        RegistryService: createConnectClient(registryV1Beta1Registry.RegistryService, transport),
      },
    },
  }
}

export const depot = createClient({
  token: process.env.DEPOT_TOKEN,
  baseURL: process.env.DEPOT_API_URL,
})
