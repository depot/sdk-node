// @generated by protoc-gen-connect-es v1.4.0 with parameter "target=ts"
// @generated from file depot/buildkit/v1/buildkit.proto (package depot.buildkit.v1, syntax proto3)
/* eslint-disable */
// @ts-nocheck

import {MethodKind} from '@bufbuild/protobuf'
import {
  GetEndpointRequest,
  GetEndpointResponse,
  ReleaseEndpointRequest,
  ReleaseEndpointResponse,
  ReportHealthRequest,
  ReportHealthResponse,
} from './buildkit_pb.js'

/**
 * @generated from service depot.buildkit.v1.BuildKitService
 */
export const BuildKitService = {
  typeName: 'depot.buildkit.v1.BuildKitService',
  methods: {
    /**
     * @generated from rpc depot.buildkit.v1.BuildKitService.GetEndpoint
     */
    getEndpoint: {
      name: 'GetEndpoint',
      I: GetEndpointRequest,
      O: GetEndpointResponse,
      kind: MethodKind.ServerStreaming,
    },
    /**
     * @generated from rpc depot.buildkit.v1.BuildKitService.ReportHealth
     */
    reportHealth: {
      name: 'ReportHealth',
      I: ReportHealthRequest,
      O: ReportHealthResponse,
      kind: MethodKind.ClientStreaming,
    },
    /**
     * @generated from rpc depot.buildkit.v1.BuildKitService.ReleaseEndpoint
     */
    releaseEndpoint: {
      name: 'ReleaseEndpoint',
      I: ReleaseEndpointRequest,
      O: ReleaseEndpointResponse,
      kind: MethodKind.Unary,
    },
  },
} as const
