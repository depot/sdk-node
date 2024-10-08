// @generated by protoc-gen-es v1.10.0 with parameter "target=ts"
// @generated from file depot/build/v1/build.proto (package depot.build.v1, syntax proto3)
/* eslint-disable */
// @ts-nocheck

import type {
  BinaryReadOptions,
  FieldList,
  JsonReadOptions,
  JsonValue,
  PartialMessage,
  PlainMessage,
} from '@bufbuild/protobuf'
import {Message, proto3} from '@bufbuild/protobuf'

/**
 * @generated from message depot.build.v1.CreateBuildRequest
 */
export class CreateBuildRequest extends Message<CreateBuildRequest> {
  /**
   * @generated from field: string project_id = 1;
   */
  projectId = ''

  constructor(data?: PartialMessage<CreateBuildRequest>) {
    super()
    proto3.util.initPartial(data, this)
  }

  static readonly runtime: typeof proto3 = proto3
  static readonly typeName = 'depot.build.v1.CreateBuildRequest'
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    {no: 1, name: 'project_id', kind: 'scalar', T: 9 /* ScalarType.STRING */},
  ])

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): CreateBuildRequest {
    return new CreateBuildRequest().fromBinary(bytes, options)
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): CreateBuildRequest {
    return new CreateBuildRequest().fromJson(jsonValue, options)
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): CreateBuildRequest {
    return new CreateBuildRequest().fromJsonString(jsonString, options)
  }

  static equals(
    a: CreateBuildRequest | PlainMessage<CreateBuildRequest> | undefined,
    b: CreateBuildRequest | PlainMessage<CreateBuildRequest> | undefined,
  ): boolean {
    return proto3.util.equals(CreateBuildRequest, a, b)
  }
}

/**
 * @generated from message depot.build.v1.CreateBuildResponse
 */
export class CreateBuildResponse extends Message<CreateBuildResponse> {
  /**
   * @generated from field: string build_id = 1;
   */
  buildId = ''

  /**
   * @generated from field: string build_token = 2;
   */
  buildToken = ''

  constructor(data?: PartialMessage<CreateBuildResponse>) {
    super()
    proto3.util.initPartial(data, this)
  }

  static readonly runtime: typeof proto3 = proto3
  static readonly typeName = 'depot.build.v1.CreateBuildResponse'
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    {no: 1, name: 'build_id', kind: 'scalar', T: 9 /* ScalarType.STRING */},
    {no: 2, name: 'build_token', kind: 'scalar', T: 9 /* ScalarType.STRING */},
  ])

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): CreateBuildResponse {
    return new CreateBuildResponse().fromBinary(bytes, options)
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): CreateBuildResponse {
    return new CreateBuildResponse().fromJson(jsonValue, options)
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): CreateBuildResponse {
    return new CreateBuildResponse().fromJsonString(jsonString, options)
  }

  static equals(
    a: CreateBuildResponse | PlainMessage<CreateBuildResponse> | undefined,
    b: CreateBuildResponse | PlainMessage<CreateBuildResponse> | undefined,
  ): boolean {
    return proto3.util.equals(CreateBuildResponse, a, b)
  }
}

/**
 * @generated from message depot.build.v1.FinishBuildRequest
 */
export class FinishBuildRequest extends Message<FinishBuildRequest> {
  /**
   * @generated from field: string build_id = 1;
   */
  buildId = ''

  /**
   * @generated from oneof depot.build.v1.FinishBuildRequest.result
   */
  result:
    | {
        /**
         * @generated from field: depot.build.v1.FinishBuildRequest.BuildSuccess success = 2;
         */
        value: FinishBuildRequest_BuildSuccess
        case: 'success'
      }
    | {
        /**
         * @generated from field: depot.build.v1.FinishBuildRequest.BuildError error = 3;
         */
        value: FinishBuildRequest_BuildError
        case: 'error'
      }
    | {case: undefined; value?: undefined} = {case: undefined}

  constructor(data?: PartialMessage<FinishBuildRequest>) {
    super()
    proto3.util.initPartial(data, this)
  }

  static readonly runtime: typeof proto3 = proto3
  static readonly typeName = 'depot.build.v1.FinishBuildRequest'
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    {no: 1, name: 'build_id', kind: 'scalar', T: 9 /* ScalarType.STRING */},
    {no: 2, name: 'success', kind: 'message', T: FinishBuildRequest_BuildSuccess, oneof: 'result'},
    {no: 3, name: 'error', kind: 'message', T: FinishBuildRequest_BuildError, oneof: 'result'},
  ])

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): FinishBuildRequest {
    return new FinishBuildRequest().fromBinary(bytes, options)
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): FinishBuildRequest {
    return new FinishBuildRequest().fromJson(jsonValue, options)
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): FinishBuildRequest {
    return new FinishBuildRequest().fromJsonString(jsonString, options)
  }

  static equals(
    a: FinishBuildRequest | PlainMessage<FinishBuildRequest> | undefined,
    b: FinishBuildRequest | PlainMessage<FinishBuildRequest> | undefined,
  ): boolean {
    return proto3.util.equals(FinishBuildRequest, a, b)
  }
}

/**
 * @generated from message depot.build.v1.FinishBuildRequest.BuildSuccess
 */
export class FinishBuildRequest_BuildSuccess extends Message<FinishBuildRequest_BuildSuccess> {
  constructor(data?: PartialMessage<FinishBuildRequest_BuildSuccess>) {
    super()
    proto3.util.initPartial(data, this)
  }

  static readonly runtime: typeof proto3 = proto3
  static readonly typeName = 'depot.build.v1.FinishBuildRequest.BuildSuccess'
  static readonly fields: FieldList = proto3.util.newFieldList(() => [])

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): FinishBuildRequest_BuildSuccess {
    return new FinishBuildRequest_BuildSuccess().fromBinary(bytes, options)
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): FinishBuildRequest_BuildSuccess {
    return new FinishBuildRequest_BuildSuccess().fromJson(jsonValue, options)
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): FinishBuildRequest_BuildSuccess {
    return new FinishBuildRequest_BuildSuccess().fromJsonString(jsonString, options)
  }

  static equals(
    a: FinishBuildRequest_BuildSuccess | PlainMessage<FinishBuildRequest_BuildSuccess> | undefined,
    b: FinishBuildRequest_BuildSuccess | PlainMessage<FinishBuildRequest_BuildSuccess> | undefined,
  ): boolean {
    return proto3.util.equals(FinishBuildRequest_BuildSuccess, a, b)
  }
}

/**
 * @generated from message depot.build.v1.FinishBuildRequest.BuildError
 */
export class FinishBuildRequest_BuildError extends Message<FinishBuildRequest_BuildError> {
  /**
   * @generated from field: string error = 1;
   */
  error = ''

  constructor(data?: PartialMessage<FinishBuildRequest_BuildError>) {
    super()
    proto3.util.initPartial(data, this)
  }

  static readonly runtime: typeof proto3 = proto3
  static readonly typeName = 'depot.build.v1.FinishBuildRequest.BuildError'
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    {no: 1, name: 'error', kind: 'scalar', T: 9 /* ScalarType.STRING */},
  ])

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): FinishBuildRequest_BuildError {
    return new FinishBuildRequest_BuildError().fromBinary(bytes, options)
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): FinishBuildRequest_BuildError {
    return new FinishBuildRequest_BuildError().fromJson(jsonValue, options)
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): FinishBuildRequest_BuildError {
    return new FinishBuildRequest_BuildError().fromJsonString(jsonString, options)
  }

  static equals(
    a: FinishBuildRequest_BuildError | PlainMessage<FinishBuildRequest_BuildError> | undefined,
    b: FinishBuildRequest_BuildError | PlainMessage<FinishBuildRequest_BuildError> | undefined,
  ): boolean {
    return proto3.util.equals(FinishBuildRequest_BuildError, a, b)
  }
}

/**
 * @generated from message depot.build.v1.FinishBuildResponse
 */
export class FinishBuildResponse extends Message<FinishBuildResponse> {
  constructor(data?: PartialMessage<FinishBuildResponse>) {
    super()
    proto3.util.initPartial(data, this)
  }

  static readonly runtime: typeof proto3 = proto3
  static readonly typeName = 'depot.build.v1.FinishBuildResponse'
  static readonly fields: FieldList = proto3.util.newFieldList(() => [])

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): FinishBuildResponse {
    return new FinishBuildResponse().fromBinary(bytes, options)
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): FinishBuildResponse {
    return new FinishBuildResponse().fromJson(jsonValue, options)
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): FinishBuildResponse {
    return new FinishBuildResponse().fromJsonString(jsonString, options)
  }

  static equals(
    a: FinishBuildResponse | PlainMessage<FinishBuildResponse> | undefined,
    b: FinishBuildResponse | PlainMessage<FinishBuildResponse> | undefined,
  ): boolean {
    return proto3.util.equals(FinishBuildResponse, a, b)
  }
}
