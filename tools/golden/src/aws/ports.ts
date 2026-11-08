/**
 * The only ways the golden tool reaches AWS (docs/specs/p9-golden.md sections 8 and 11).
 * `sdk.ts` implements them with the AWS SDK; tests use hand-written fakes, so unit tests
 * never make a network call. Every value here is a real AWS value, never a scenario ID.
 */

export interface Tag {
  readonly key: string;
  readonly value: string;
}

export interface Identity {
  /** `sts:GetCallerIdentity`; needs no IAM permission. */
  accountId(): Promise<string>;
  /** The SDK's resolved region (`AWS_REGION` or the profile). */
  region(): Promise<string>;
}

export interface StackResource {
  readonly logicalId: string;
  readonly physicalId: string;
  readonly type: string;
}

export interface Stacks {
  exists(stackName: string): Promise<boolean>;
  /** Creates the stack (`OnFailure: DELETE`) and waits until it is complete. */
  create(stackName: string, templateBody: string, tags: readonly Tag[]): Promise<void>;
  /** Updates the stack and waits until it is complete. */
  update(stackName: string, templateBody: string): Promise<void>;
  /** Deletes the stack and waits. No-op if it doesn't exist. */
  remove(stackName: string): Promise<void>;
  resources(stackName: string): Promise<readonly StackResource[]>;
  /** Stack names that start with `sim-golden-` and are tagged `sim:golden=true`. */
  listGolden(): Promise<readonly string[]>;
}

export interface VpcFacts {
  readonly vpcId: string;
  readonly cidrBlock: string;
  readonly mainRouteTableId: string;
  readonly defaultNetworkAclId: string;
  readonly defaultSecurityGroupId: string;
}

export interface InstanceFacts {
  readonly instanceId: string;
  readonly networkInterfaceId: string;
  readonly privateIpAddress: string;
  readonly publicIpAddress?: string;
}

export interface RouteFacts {
  readonly routeTableId: string;
  readonly destinationCidrBlock: string;
  readonly gatewayId?: string;
  readonly state: string;
}

export interface SubnetFacts {
  readonly subnetId: string;
  readonly cidrBlock: string;
}

/** Read-only facts about the deployed VPCs, used to build the ID map (section 5.1). */
export interface InventorySnapshot {
  readonly vpcs: readonly VpcFacts[];
  readonly subnets: readonly SubnetFacts[];
  readonly routes: readonly RouteFacts[];
  readonly instances: readonly InstanceFacts[];
}

export type TaggedKind =
  | 'instance'
  | 'internet-gateway'
  | 'subnet'
  | 'route-table'
  | 'network-acl'
  | 'security-group'
  | 'vpc';

export interface TaggedResource {
  readonly kind: TaggedKind;
  readonly id: string;
  /** For an internet gateway: the VPC it is attached to, if any. */
  readonly attachedVpcId?: string;
  readonly tags: readonly Tag[];
}

export interface Inventory {
  describe(vpcIds: readonly string[]): Promise<InventorySnapshot>;
  /** EC2 resources tagged `sim:golden=true` (instances that aren't terminated). */
  listTagged(): Promise<readonly TaggedResource[]>;
  /** Deletes one resource (terminates and waits for an instance; detaches a gateway first). */
  remove(resource: TaggedResource): Promise<void>;
}

/** `CreateNetworkInsightsPath` input as the SDK names it (section 2.2). */
export interface PathRequest {
  readonly Source: string;
  readonly Destination: string;
  readonly Protocol: 'tcp';
  readonly FilterAtSource: {
    readonly SourceAddress?: string;
    readonly SourcePortRange: { readonly FromPort: number; readonly ToPort: number };
    readonly DestinationAddress?: string;
    readonly DestinationPortRange: { readonly FromPort: number; readonly ToPort: number };
  };
}

interface RawComponentRef {
  readonly Id?: string | undefined;
  readonly Arn?: string | undefined;
  readonly Name?: string | undefined;
}

interface RawPortRange {
  readonly From?: number | undefined;
  readonly To?: number | undefined;
}

export interface RawAclRule {
  readonly Cidr?: string | undefined;
  readonly Egress?: boolean | undefined;
  readonly PortRange?: RawPortRange | undefined;
  readonly Protocol?: string | undefined;
  readonly RuleAction?: string | undefined;
  readonly RuleNumber?: number | undefined;
}

export interface RawSecurityGroupRule {
  readonly Cidr?: string | undefined;
  readonly Direction?: string | undefined;
  readonly SecurityGroupId?: string | undefined;
  readonly PortRange?: RawPortRange | undefined;
  readonly PrefixListId?: string | undefined;
  readonly Protocol?: string | undefined;
}

export interface RawRouteTableRoute {
  readonly DestinationCidr?: string | undefined;
  readonly GatewayId?: string | undefined;
  readonly Origin?: string | undefined;
  readonly State?: string | undefined;
}

export interface RawPacketHeader {
  readonly Protocol?: string | undefined;
  readonly SourceAddresses?: readonly string[] | undefined;
  readonly DestinationAddresses?: readonly string[] | undefined;
  readonly SourcePortRanges?: readonly RawPortRange[] | undefined;
  readonly DestinationPortRanges?: readonly RawPortRange[] | undefined;
}

/** The subset of the SDK `Explanation` the normalizer reads; other fields are dropped. */
export interface RawExplanation {
  readonly ExplanationCode?: string | undefined;
  readonly Direction?: string | undefined;
  readonly Component?: RawComponentRef | undefined;
  readonly Acl?: RawComponentRef | undefined;
  readonly SecurityGroup?: RawComponentRef | undefined;
  readonly SecurityGroups?: readonly RawComponentRef[] | undefined;
  readonly RouteTable?: RawComponentRef | undefined;
  readonly SubnetRouteTable?: RawComponentRef | undefined;
  readonly Subnet?: RawComponentRef | undefined;
  readonly Vpc?: RawComponentRef | undefined;
  readonly InternetGateway?: RawComponentRef | undefined;
  readonly NetworkInterface?: RawComponentRef | undefined;
  readonly Destination?: RawComponentRef | undefined;
  readonly AclRule?: RawAclRule | undefined;
  readonly SecurityGroupRule?: RawSecurityGroupRule | undefined;
  readonly RouteTableRoute?: RawRouteTableRoute | undefined;
  readonly Address?: string | undefined;
  readonly Addresses?: readonly string[] | undefined;
  readonly Cidrs?: readonly string[] | undefined;
  readonly PortRanges?: readonly RawPortRange[] | undefined;
  readonly Protocols?: readonly string[] | undefined;
  readonly PacketField?: string | undefined;
  readonly Port?: number | undefined;
  readonly State?: string | undefined;
  readonly MissingComponent?: string | undefined;
}

export interface RawPathComponent {
  readonly SequenceNumber?: number | undefined;
  readonly Component?: RawComponentRef | undefined;
  readonly AttachedTo?: RawComponentRef | undefined;
  readonly Subnet?: RawComponentRef | undefined;
  readonly Vpc?: RawComponentRef | undefined;
  readonly SourceVpc?: RawComponentRef | undefined;
  readonly DestinationVpc?: RawComponentRef | undefined;
  readonly AclRule?: RawAclRule | undefined;
  readonly SecurityGroupRule?: RawSecurityGroupRule | undefined;
  readonly RouteTableRoute?: RawRouteTableRoute | undefined;
  readonly InboundHeader?: RawPacketHeader | undefined;
  readonly OutboundHeader?: RawPacketHeader | undefined;
  readonly Explanations?: readonly RawExplanation[] | undefined;
  readonly AdditionalDetails?:
    readonly { readonly AdditionalDetailType?: string | undefined }[] | undefined;
}

/** The subset of the SDK `NetworkInsightsAnalysis` the normalizer reads. */
export interface RawAnalysis {
  readonly Status?: string | undefined;
  readonly StatusMessage?: string | undefined;
  readonly NetworkPathFound?: boolean | undefined;
  readonly ForwardPathComponents?: readonly RawPathComponent[] | undefined;
  readonly ReturnPathComponents?: readonly RawPathComponent[] | undefined;
  readonly Explanations?: readonly RawExplanation[] | undefined;
}

export interface Reachability {
  createPath(request: PathRequest, tags: readonly Tag[]): Promise<string>;
  startAnalysis(pathId: string, tags: readonly Tag[]): Promise<string>;
  /** Polls until the analysis isn't `running`, or throws after `timeoutMs`. */
  waitForAnalysis(analysisId: string, timeoutMs: number): Promise<RawAnalysis>;
  deleteAnalysis(analysisId: string): Promise<void>;
  deletePath(pathId: string): Promise<void>;
  /** Paths and analyses tagged `sim:golden=true`. */
  listTagged(): Promise<{
    readonly paths: readonly string[];
    readonly analyses: readonly string[];
  }>;
}

export interface AwsPorts {
  readonly identity: Identity;
  readonly stacks: Stacks;
  readonly inventory: Inventory;
  readonly reachability: Reachability;
}

/** Called only after the dry-run check, so a dry run never builds an AWS client. */
export type AwsFactory = () => AwsPorts;

export interface FixtureStore {
  /** Writes the fixture atomically; returns its path. */
  write(scenarioId: string, json: string): Promise<string>;
  /** Saves raw responses outside the repository when a capture can't be normalized. */
  writeDiagnostics(name: string, json: string): Promise<string>;
}

export interface Prompt {
  readonly interactive: boolean;
  /** True when the user types exactly `expected`. */
  confirm(message: string, expected: string): Promise<boolean>;
}

export interface Clock {
  now(): Date;
}

export interface Output {
  line(text: string): void;
}

/** Tags every golden resource carries (stack tags propagate to the stack's resources). */
export const GOLDEN_TAG = { key: 'sim:golden', value: 'true' } as const;
