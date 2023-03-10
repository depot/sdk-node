// @generated by protoc-gen-es v1.0.0 with parameter "target=ts"
// @generated from file depot/core/v1/namespace.proto (package depot.core.v1, syntax proto3)
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
import {Message, proto3, Timestamp} from '@bufbuild/protobuf'

/**
 * @generated from message depot.core.v1.Namespace
 */
export class Namespace extends Message<Namespace> {
  /**
   * @generated from field: string id = 1;
   */
  id = ''

  /**
   * @generated from field: string name = 2;
   */
  name = ''

  /**
   * @generated from field: string organization_id = 3;
   */
  organizationId = ''

  /**
   * @generated from field: string region_id = 4;
   */
  regionId = ''

  /**
   * @generated from field: int32 volume_size = 5;
   */
  volumeSize = 0

  /**
   * @generated from field: google.protobuf.Timestamp created_at = 6;
   */
  createdAt?: Timestamp

  constructor(data?: PartialMessage<Namespace>) {
    super()
    proto3.util.initPartial(data, this)
  }

  static readonly runtime = proto3
  static readonly typeName = 'depot.core.v1.Namespace'
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    {no: 1, name: 'id', kind: 'scalar', T: 9 /* ScalarType.STRING */},
    {no: 2, name: 'name', kind: 'scalar', T: 9 /* ScalarType.STRING */},
    {no: 3, name: 'organization_id', kind: 'scalar', T: 9 /* ScalarType.STRING */},
    {no: 4, name: 'region_id', kind: 'scalar', T: 9 /* ScalarType.STRING */},
    {no: 5, name: 'volume_size', kind: 'scalar', T: 5 /* ScalarType.INT32 */},
    {no: 6, name: 'created_at', kind: 'message', T: Timestamp},
  ])

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): Namespace {
    return new Namespace().fromBinary(bytes, options)
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): Namespace {
    return new Namespace().fromJson(jsonValue, options)
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): Namespace {
    return new Namespace().fromJsonString(jsonString, options)
  }

  static equals(
    a: Namespace | PlainMessage<Namespace> | undefined,
    b: Namespace | PlainMessage<Namespace> | undefined,
  ): boolean {
    return proto3.util.equals(Namespace, a, b)
  }
}

/**
 * @generated from message depot.core.v1.ListNamespacesRequest
 */
export class ListNamespacesRequest extends Message<ListNamespacesRequest> {
  constructor(data?: PartialMessage<ListNamespacesRequest>) {
    super()
    proto3.util.initPartial(data, this)
  }

  static readonly runtime = proto3
  static readonly typeName = 'depot.core.v1.ListNamespacesRequest'
  static readonly fields: FieldList = proto3.util.newFieldList(() => [])

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): ListNamespacesRequest {
    return new ListNamespacesRequest().fromBinary(bytes, options)
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): ListNamespacesRequest {
    return new ListNamespacesRequest().fromJson(jsonValue, options)
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): ListNamespacesRequest {
    return new ListNamespacesRequest().fromJsonString(jsonString, options)
  }

  static equals(
    a: ListNamespacesRequest | PlainMessage<ListNamespacesRequest> | undefined,
    b: ListNamespacesRequest | PlainMessage<ListNamespacesRequest> | undefined,
  ): boolean {
    return proto3.util.equals(ListNamespacesRequest, a, b)
  }
}

/**
 * @generated from message depot.core.v1.ListNamespacesResponse
 */
export class ListNamespacesResponse extends Message<ListNamespacesResponse> {
  /**
   * @generated from field: repeated depot.core.v1.Namespace namespaces = 1;
   */
  namespaces: Namespace[] = []

  constructor(data?: PartialMessage<ListNamespacesResponse>) {
    super()
    proto3.util.initPartial(data, this)
  }

  static readonly runtime = proto3
  static readonly typeName = 'depot.core.v1.ListNamespacesResponse'
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    {no: 1, name: 'namespaces', kind: 'message', T: Namespace, repeated: true},
  ])

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): ListNamespacesResponse {
    return new ListNamespacesResponse().fromBinary(bytes, options)
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): ListNamespacesResponse {
    return new ListNamespacesResponse().fromJson(jsonValue, options)
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): ListNamespacesResponse {
    return new ListNamespacesResponse().fromJsonString(jsonString, options)
  }

  static equals(
    a: ListNamespacesResponse | PlainMessage<ListNamespacesResponse> | undefined,
    b: ListNamespacesResponse | PlainMessage<ListNamespacesResponse> | undefined,
  ): boolean {
    return proto3.util.equals(ListNamespacesResponse, a, b)
  }
}

/**
 * @generated from message depot.core.v1.GetNamespaceRequest
 */
export class GetNamespaceRequest extends Message<GetNamespaceRequest> {
  /**
   * @generated from field: string id = 1;
   */
  id = ''

  constructor(data?: PartialMessage<GetNamespaceRequest>) {
    super()
    proto3.util.initPartial(data, this)
  }

  static readonly runtime = proto3
  static readonly typeName = 'depot.core.v1.GetNamespaceRequest'
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    {no: 1, name: 'id', kind: 'scalar', T: 9 /* ScalarType.STRING */},
  ])

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): GetNamespaceRequest {
    return new GetNamespaceRequest().fromBinary(bytes, options)
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): GetNamespaceRequest {
    return new GetNamespaceRequest().fromJson(jsonValue, options)
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): GetNamespaceRequest {
    return new GetNamespaceRequest().fromJsonString(jsonString, options)
  }

  static equals(
    a: GetNamespaceRequest | PlainMessage<GetNamespaceRequest> | undefined,
    b: GetNamespaceRequest | PlainMessage<GetNamespaceRequest> | undefined,
  ): boolean {
    return proto3.util.equals(GetNamespaceRequest, a, b)
  }
}

/**
 * @generated from message depot.core.v1.GetNamespaceResponse
 */
export class GetNamespaceResponse extends Message<GetNamespaceResponse> {
  /**
   * @generated from field: depot.core.v1.Namespace namespace = 1;
   */
  namespace?: Namespace

  constructor(data?: PartialMessage<GetNamespaceResponse>) {
    super()
    proto3.util.initPartial(data, this)
  }

  static readonly runtime = proto3
  static readonly typeName = 'depot.core.v1.GetNamespaceResponse'
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    {no: 1, name: 'namespace', kind: 'message', T: Namespace},
  ])

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): GetNamespaceResponse {
    return new GetNamespaceResponse().fromBinary(bytes, options)
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): GetNamespaceResponse {
    return new GetNamespaceResponse().fromJson(jsonValue, options)
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): GetNamespaceResponse {
    return new GetNamespaceResponse().fromJsonString(jsonString, options)
  }

  static equals(
    a: GetNamespaceResponse | PlainMessage<GetNamespaceResponse> | undefined,
    b: GetNamespaceResponse | PlainMessage<GetNamespaceResponse> | undefined,
  ): boolean {
    return proto3.util.equals(GetNamespaceResponse, a, b)
  }
}

/**
 * @generated from message depot.core.v1.CreateNamespaceRequest
 */
export class CreateNamespaceRequest extends Message<CreateNamespaceRequest> {
  /**
   * @generated from field: string name = 1;
   */
  name = ''

  /**
   * @generated from field: string organization_id = 2;
   */
  organizationId = ''

  /**
   * @generated from field: string region_id = 3;
   */
  regionId = ''

  /**
   * @generated from field: optional int32 volume_size = 4;
   */
  volumeSize?: number

  constructor(data?: PartialMessage<CreateNamespaceRequest>) {
    super()
    proto3.util.initPartial(data, this)
  }

  static readonly runtime = proto3
  static readonly typeName = 'depot.core.v1.CreateNamespaceRequest'
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    {no: 1, name: 'name', kind: 'scalar', T: 9 /* ScalarType.STRING */},
    {no: 2, name: 'organization_id', kind: 'scalar', T: 9 /* ScalarType.STRING */},
    {no: 3, name: 'region_id', kind: 'scalar', T: 9 /* ScalarType.STRING */},
    {no: 4, name: 'volume_size', kind: 'scalar', T: 5 /* ScalarType.INT32 */, opt: true},
  ])

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): CreateNamespaceRequest {
    return new CreateNamespaceRequest().fromBinary(bytes, options)
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): CreateNamespaceRequest {
    return new CreateNamespaceRequest().fromJson(jsonValue, options)
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): CreateNamespaceRequest {
    return new CreateNamespaceRequest().fromJsonString(jsonString, options)
  }

  static equals(
    a: CreateNamespaceRequest | PlainMessage<CreateNamespaceRequest> | undefined,
    b: CreateNamespaceRequest | PlainMessage<CreateNamespaceRequest> | undefined,
  ): boolean {
    return proto3.util.equals(CreateNamespaceRequest, a, b)
  }
}

/**
 * @generated from message depot.core.v1.CreateNamespaceResponse
 */
export class CreateNamespaceResponse extends Message<CreateNamespaceResponse> {
  /**
   * @generated from field: depot.core.v1.Namespace namespace = 1;
   */
  namespace?: Namespace

  constructor(data?: PartialMessage<CreateNamespaceResponse>) {
    super()
    proto3.util.initPartial(data, this)
  }

  static readonly runtime = proto3
  static readonly typeName = 'depot.core.v1.CreateNamespaceResponse'
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    {no: 1, name: 'namespace', kind: 'message', T: Namespace},
  ])

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): CreateNamespaceResponse {
    return new CreateNamespaceResponse().fromBinary(bytes, options)
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): CreateNamespaceResponse {
    return new CreateNamespaceResponse().fromJson(jsonValue, options)
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): CreateNamespaceResponse {
    return new CreateNamespaceResponse().fromJsonString(jsonString, options)
  }

  static equals(
    a: CreateNamespaceResponse | PlainMessage<CreateNamespaceResponse> | undefined,
    b: CreateNamespaceResponse | PlainMessage<CreateNamespaceResponse> | undefined,
  ): boolean {
    return proto3.util.equals(CreateNamespaceResponse, a, b)
  }
}

/**
 * @generated from message depot.core.v1.UpdateNamespaceRequest
 */
export class UpdateNamespaceRequest extends Message<UpdateNamespaceRequest> {
  /**
   * @generated from field: string id = 1;
   */
  id = ''

  /**
   * @generated from field: optional string name = 2;
   */
  name?: string

  /**
   * @generated from field: optional string region_id = 3;
   */
  regionId?: string

  /**
   * @generated from field: optional int32 volume_size = 4;
   */
  volumeSize?: number

  constructor(data?: PartialMessage<UpdateNamespaceRequest>) {
    super()
    proto3.util.initPartial(data, this)
  }

  static readonly runtime = proto3
  static readonly typeName = 'depot.core.v1.UpdateNamespaceRequest'
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    {no: 1, name: 'id', kind: 'scalar', T: 9 /* ScalarType.STRING */},
    {no: 2, name: 'name', kind: 'scalar', T: 9 /* ScalarType.STRING */, opt: true},
    {no: 3, name: 'region_id', kind: 'scalar', T: 9 /* ScalarType.STRING */, opt: true},
    {no: 4, name: 'volume_size', kind: 'scalar', T: 5 /* ScalarType.INT32 */, opt: true},
  ])

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): UpdateNamespaceRequest {
    return new UpdateNamespaceRequest().fromBinary(bytes, options)
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): UpdateNamespaceRequest {
    return new UpdateNamespaceRequest().fromJson(jsonValue, options)
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): UpdateNamespaceRequest {
    return new UpdateNamespaceRequest().fromJsonString(jsonString, options)
  }

  static equals(
    a: UpdateNamespaceRequest | PlainMessage<UpdateNamespaceRequest> | undefined,
    b: UpdateNamespaceRequest | PlainMessage<UpdateNamespaceRequest> | undefined,
  ): boolean {
    return proto3.util.equals(UpdateNamespaceRequest, a, b)
  }
}

/**
 * @generated from message depot.core.v1.UpdateNamespaceResponse
 */
export class UpdateNamespaceResponse extends Message<UpdateNamespaceResponse> {
  /**
   * @generated from field: depot.core.v1.Namespace namespace = 1;
   */
  namespace?: Namespace

  constructor(data?: PartialMessage<UpdateNamespaceResponse>) {
    super()
    proto3.util.initPartial(data, this)
  }

  static readonly runtime = proto3
  static readonly typeName = 'depot.core.v1.UpdateNamespaceResponse'
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    {no: 1, name: 'namespace', kind: 'message', T: Namespace},
  ])

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): UpdateNamespaceResponse {
    return new UpdateNamespaceResponse().fromBinary(bytes, options)
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): UpdateNamespaceResponse {
    return new UpdateNamespaceResponse().fromJson(jsonValue, options)
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): UpdateNamespaceResponse {
    return new UpdateNamespaceResponse().fromJsonString(jsonString, options)
  }

  static equals(
    a: UpdateNamespaceResponse | PlainMessage<UpdateNamespaceResponse> | undefined,
    b: UpdateNamespaceResponse | PlainMessage<UpdateNamespaceResponse> | undefined,
  ): boolean {
    return proto3.util.equals(UpdateNamespaceResponse, a, b)
  }
}

/**
 * @generated from message depot.core.v1.DeleteNamespaceRequest
 */
export class DeleteNamespaceRequest extends Message<DeleteNamespaceRequest> {
  /**
   * @generated from field: string id = 1;
   */
  id = ''

  constructor(data?: PartialMessage<DeleteNamespaceRequest>) {
    super()
    proto3.util.initPartial(data, this)
  }

  static readonly runtime = proto3
  static readonly typeName = 'depot.core.v1.DeleteNamespaceRequest'
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    {no: 1, name: 'id', kind: 'scalar', T: 9 /* ScalarType.STRING */},
  ])

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): DeleteNamespaceRequest {
    return new DeleteNamespaceRequest().fromBinary(bytes, options)
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): DeleteNamespaceRequest {
    return new DeleteNamespaceRequest().fromJson(jsonValue, options)
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): DeleteNamespaceRequest {
    return new DeleteNamespaceRequest().fromJsonString(jsonString, options)
  }

  static equals(
    a: DeleteNamespaceRequest | PlainMessage<DeleteNamespaceRequest> | undefined,
    b: DeleteNamespaceRequest | PlainMessage<DeleteNamespaceRequest> | undefined,
  ): boolean {
    return proto3.util.equals(DeleteNamespaceRequest, a, b)
  }
}

/**
 * @generated from message depot.core.v1.DeleteNamespaceResponse
 */
export class DeleteNamespaceResponse extends Message<DeleteNamespaceResponse> {
  constructor(data?: PartialMessage<DeleteNamespaceResponse>) {
    super()
    proto3.util.initPartial(data, this)
  }

  static readonly runtime = proto3
  static readonly typeName = 'depot.core.v1.DeleteNamespaceResponse'
  static readonly fields: FieldList = proto3.util.newFieldList(() => [])

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): DeleteNamespaceResponse {
    return new DeleteNamespaceResponse().fromBinary(bytes, options)
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): DeleteNamespaceResponse {
    return new DeleteNamespaceResponse().fromJson(jsonValue, options)
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): DeleteNamespaceResponse {
    return new DeleteNamespaceResponse().fromJsonString(jsonString, options)
  }

  static equals(
    a: DeleteNamespaceResponse | PlainMessage<DeleteNamespaceResponse> | undefined,
    b: DeleteNamespaceResponse | PlainMessage<DeleteNamespaceResponse> | undefined,
  ): boolean {
    return proto3.util.equals(DeleteNamespaceResponse, a, b)
  }
}
