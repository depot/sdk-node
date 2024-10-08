// @generated by protoc-gen-connect-es v1.4.0 with parameter "target=ts"
// @generated from file depot/core/v1/project.proto (package depot.core.v1, syntax proto3)
/* eslint-disable */
// @ts-nocheck

import {MethodKind} from '@bufbuild/protobuf'
import {
  AddTrustPolicyRequest,
  AddTrustPolicyResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  CreateTokenRequest,
  CreateTokenResponse,
  DeleteProjectRequest,
  DeleteProjectResponse,
  DeleteTokenRequest,
  DeleteTokenResponse,
  GetProjectRequest,
  GetProjectResponse,
  ListProjectsRequest,
  ListProjectsResponse,
  ListTokensRequest,
  ListTokensResponse,
  ListTrustPoliciesRequest,
  ListTrustPoliciesResponse,
  RemoveTrustPolicyRequest,
  RemoveTrustPolicyResponse,
  ResetProjectRequest,
  ResetProjectResponse,
  UpdateProjectRequest,
  UpdateProjectResponse,
  UpdateTokenRequest,
  UpdateTokenResponse,
} from './project_pb.js'

/**
 * @generated from service depot.core.v1.ProjectService
 */
export const ProjectService = {
  typeName: 'depot.core.v1.ProjectService',
  methods: {
    /**
     * List all projects
     *
     * @generated from rpc depot.core.v1.ProjectService.ListProjects
     */
    listProjects: {
      name: 'ListProjects',
      I: ListProjectsRequest,
      O: ListProjectsResponse,
      kind: MethodKind.Unary,
    },
    /**
     * Get a project
     *
     * @generated from rpc depot.core.v1.ProjectService.GetProject
     */
    getProject: {
      name: 'GetProject',
      I: GetProjectRequest,
      O: GetProjectResponse,
      kind: MethodKind.Unary,
    },
    /**
     * Create a new project
     *
     * @generated from rpc depot.core.v1.ProjectService.CreateProject
     */
    createProject: {
      name: 'CreateProject',
      I: CreateProjectRequest,
      O: CreateProjectResponse,
      kind: MethodKind.Unary,
    },
    /**
     * Update a project
     *
     * @generated from rpc depot.core.v1.ProjectService.UpdateProject
     */
    updateProject: {
      name: 'UpdateProject',
      I: UpdateProjectRequest,
      O: UpdateProjectResponse,
      kind: MethodKind.Unary,
    },
    /**
     * Delete a project
     *
     * @generated from rpc depot.core.v1.ProjectService.DeleteProject
     */
    deleteProject: {
      name: 'DeleteProject',
      I: DeleteProjectRequest,
      O: DeleteProjectResponse,
      kind: MethodKind.Unary,
    },
    /**
     * Reset a project will terminate all machines and delete all cached data.
     *
     * @generated from rpc depot.core.v1.ProjectService.ResetProject
     */
    resetProject: {
      name: 'ResetProject',
      I: ResetProjectRequest,
      O: ResetProjectResponse,
      kind: MethodKind.Unary,
    },
    /**
     * List project's trust policies.
     *
     * @generated from rpc depot.core.v1.ProjectService.ListTrustPolicies
     */
    listTrustPolicies: {
      name: 'ListTrustPolicies',
      I: ListTrustPoliciesRequest,
      O: ListTrustPoliciesResponse,
      kind: MethodKind.Unary,
    },
    /**
     * Add a trust policy to a project.
     *
     * @generated from rpc depot.core.v1.ProjectService.AddTrustPolicy
     */
    addTrustPolicy: {
      name: 'AddTrustPolicy',
      I: AddTrustPolicyRequest,
      O: AddTrustPolicyResponse,
      kind: MethodKind.Unary,
    },
    /**
     * Remove a trust policy from a project.
     *
     * @generated from rpc depot.core.v1.ProjectService.RemoveTrustPolicy
     */
    removeTrustPolicy: {
      name: 'RemoveTrustPolicy',
      I: RemoveTrustPolicyRequest,
      O: RemoveTrustPolicyResponse,
      kind: MethodKind.Unary,
    },
    /**
     * List project's API tokens.
     *
     * @generated from rpc depot.core.v1.ProjectService.ListTokens
     */
    listTokens: {
      name: 'ListTokens',
      I: ListTokensRequest,
      O: ListTokensResponse,
      kind: MethodKind.Unary,
    },
    /**
     * Create a project API token.
     *
     * @generated from rpc depot.core.v1.ProjectService.CreateToken
     */
    createToken: {
      name: 'CreateToken',
      I: CreateTokenRequest,
      O: CreateTokenResponse,
      kind: MethodKind.Unary,
    },
    /**
     * Create a project API token.
     *
     * @generated from rpc depot.core.v1.ProjectService.UpdateToken
     */
    updateToken: {
      name: 'UpdateToken',
      I: UpdateTokenRequest,
      O: UpdateTokenResponse,
      kind: MethodKind.Unary,
    },
    /**
     * Delete project API token.
     *
     * @generated from rpc depot.core.v1.ProjectService.DeleteToken
     */
    deleteToken: {
      name: 'DeleteToken',
      I: DeleteTokenRequest,
      O: DeleteTokenResponse,
      kind: MethodKind.Unary,
    },
  },
} as const
