/**
 * English UI strings: the source of truth for message keys. `es.ts` must define every key
 * (enforced by its type). Catalog names (services, categories, menu views, side-navigation
 * labels) are not here: they stay as captured.
 *
 * Placeholders use `{name}`. Plural messages use `_one` / `_other` suffixes and are read
 * with `tPlural`.
 */
export const en = {
  'banner.text': 'Independent educational simulator — not connected to any AWS account',

  'footer.trademark':
    'Amazon Web Services, AWS and related marks are trademarks of Amazon.com, Inc. or its affiliates.',
  'footer.disclaimer':
    '{product} is an independent educational project. It is not affiliated with, sponsored by or endorsed by Amazon Web Services.',

  'top.logoAlt': '{product} logo',
  'top.language': 'Language',

  'storage.backedUp':
    'Saved settings could not be loaded, so the app started clean. A backup copy of the old data was kept in this browser.',
  'storage.unreadable': 'Saved settings could not be read, so the app started clean.',
  'storage.saveFailed':
    'Settings could not be saved in this browser. Changes last until you close the tab.',
  'storage.dismiss': 'Dismiss',

  'home.labs.title': 'Labs in progress',
  'home.labs.empty': 'No labs in progress',
  'home.labs.emptyHint': 'Labs you start appear here.',
  'home.health.title': 'Topology health',
  'home.health.ok': 'No issues found',
  'home.health.issues_one': '{count} issue found',
  'home.health.issues_other': '{count} issues found',
  'home.health.resources': 'Resources in the topology',
  'home.health.vpcs': 'VPCs',
  'home.health.subnets': 'Subnets',
  'home.health.instances': 'Instances',
  'home.health.severity.error': 'Error',
  'home.health.severity.warning': 'Warning',
  'home.cost.title': 'Estimated cost of this topology',
  'home.cost.empty': 'No price snapshot yet',
  'home.cost.emptyHint':
    'Estimates appear once the build includes a dated snapshot of the AWS Price List.',

  'notFound.title': 'Page not found',
  'notFound.hint': 'This address does not match any page in the console.',
  'notFound.home': 'Go to Console Home',

  'reference.notice': "Reference only: this service isn't simulated",
  'reference.noCard': 'No card yet.',
  'reference.docsLink': 'Official documentation',
  'reference.simulatedNotice': 'This service is simulated',
  'reference.openConsole': 'Open the {name} console',
  'reference.details': 'Details',
  'reference.category': 'Category',
  'reference.examScope': 'Exam scope',
  'reference.examNone': 'Not in the CLF-C02 or SAA-C03 in-scope lists',
  'reference.cardStatus': 'Card status',
  'reference.card': 'Reference card',
  'reference.examCues': 'Exam cues',
  'reference.notToConfuseWith': 'Not to confuse with',
  'reference.pricingModel': 'Pricing model',
  'reference.sharedResponsibility': 'Shared responsibility',
  'reference.responsibilityAws': 'AWS',
  'reference.responsibilityCustomer': 'Customer',
  'reference.sources': 'Sources',
  'reference.accessedOn': 'accessed {date}',
  'storage.topology.backedUp':
    'The saved topology could not be loaded, so the sandbox started empty. A backup copy of the old data was kept in this browser.',
  'storage.topology.unreadable':
    'The saved topology could not be read, so the sandbox started empty.',
  'storage.topology.saveFailed':
    'The topology could not be saved in this browser. Changes last until you close the tab.',

  'fidelity.Exact': 'Exact',
  'fidelity.Inferred': 'Inferred',
  'fidelity.Unsupported': 'Unsupported',
  'fidelity.Exact.description': 'Matches a documented AWS rule.',
  'fidelity.Inferred.description':
    "The simulator's model of something AWS doesn't state in one place, or a simplification.",
  'fidelity.Unsupported.description':
    'Not simulated in this release. Never treat it as allowed, free or instant.',
  'fidelity.title': 'Simulator fidelity: {label}',
  'fidelity.rules': 'Rules: {ruleIds}',
  'fidelity.notSimulated': 'Not simulated in this release',

  'change.rejected': 'AWS would reject this change',
  'change.failed': "This change can't be made",

  'helper.UNKNOWN_REFERENCE': '{id} no longer exists.',
  'helper.INVALID_INPUT': 'Some values are not valid: {details}',
  'helper.NO_FREE_PRIVATE_ADDRESS':
    'Subnet {subnetId} ({cidrBlock}) has no free private IPv4 address.',
  'helper.PUBLIC_POOL_EXHAUSTED': 'The simulated public IPv4 pool ({pool}) has no free address.',
  'helper.IGW_ALREADY_ATTACHED':
    'Internet gateway {internetGatewayId} is already attached to {vpcId}.',
  'helper.VPC_ALREADY_HAS_IGW':
    '{vpcId} already has internet gateway {internetGatewayId}. A VPC can have only one internet gateway.',
  'helper.IGW_NOT_ATTACHED': 'Internet gateway {internetGatewayId} is not attached to a VPC.',
  'helper.IGW_HAS_PUBLIC_ADDRESSES_one':
    "Internet gateway {internetGatewayId} can't be detached: {vpcId} has {count} network interface with a public IPv4 address.",
  'helper.IGW_HAS_PUBLIC_ADDRESSES_other':
    "Internet gateway {internetGatewayId} can't be detached: {vpcId} has {count} network interfaces with a public IPv4 address.",

  'issue.VPC_SIZE_INVALID':
    'VPC CIDR {cidrBlock} is a /{prefixLength}. A VPC CIDR must be between /{minPrefixLength} and /{maxPrefixLength}.',
  'issue.VPC_CIDR_RESTRICTED':
    "VPC CIDR {cidrBlock} is inside {restrictedBlock}, which AWS doesn't allow for a VPC.",
  'issue.SUBNET_SIZE_INVALID':
    'Subnet CIDR {cidrBlock} is a /{prefixLength}. A subnet CIDR must be between /{minPrefixLength} and /{maxPrefixLength}.',
  'issue.SUBNET_CIDR_OUT_OF_VPC':
    'Subnet CIDR {cidrBlock} is not inside the VPC CIDR {vpcCidrBlock}.',
  'issue.CIDR_OVERLAP': 'Subnet CIDR {cidrBlock} overlaps {otherCidrBlock} of subnet {relatedId}.',
  'issue.IP_OUT_OF_SUBNET': 'Private IPv4 address {ipAddress} is not in subnet {subnetCidrBlock}.',
  'issue.IP_RESERVED':
    'Private IPv4 address {ipAddress} is reserved in {subnetCidrBlock}: {purpose}.',
  'issue.IP_DUPLICATE.private': 'Private IPv4 address {ipAddress} is already used by {relatedId}.',
  'issue.IP_DUPLICATE.public': 'Public IPv4 address {ipAddress} is already used by {relatedId}.',
  'issue.PUBLIC_IP_INVALID.rfc1918':
    "Public IPv4 address {ipAddress} is a private address (RFC 1918, {range}), so it can't be a public address.",
  'issue.PUBLIC_IP_INVALID.rfc6598':
    "Public IPv4 address {ipAddress} is in the shared address space (RFC 6598, {range}), so it can't be a public address.",
  'issue.PUBLIC_IP_INVALID.restricted':
    "Public IPv4 address {ipAddress} is in the restricted range {range}, so it can't be a public address.",
  'issue.PUBLIC_IP_INVALID.vpc-cidr':
    "Public IPv4 address {ipAddress} is inside the VPC CIDR {range}, so it can't be a public address.",
  'issue.VPC_MISMATCH': '{resourceId} is in {vpcId}, but {relatedId} belongs to {otherVpcId}.',
  'issue.ROUTE_DUPLICATE_DESTINATION':
    'The route table already has a route to {destinationCidrBlock}.',
  'issue.ROUTE_DESTINATION_RESERVED':
    'Destination {destinationCidrBlock} is inside {reservedBlock}, which AWS reserves for its own services.',
  'issue.LOCAL_ROUTE_CONFLICT':
    'Destination {destinationCidrBlock} is the VPC CIDR {vpcCidrBlock} or inside it. The local route already covers it.',
  'issue.IGW_MULTIPLE_ATTACHED': '{vpcId} already has internet gateway {relatedId} attached.',
  'issue.SG_NAME_INVALID.empty': 'The security group {field} is required.',
  'issue.SG_NAME_INVALID.too-long':
    'The security group {field} can have up to {maxLength} characters.',
  'issue.SG_NAME_INVALID.invalid-characters':
    'The security group {field} can only use a-z, A-Z, 0-9, spaces and ._-:/()#,@[]+=&;{}!$*',
  'issue.SG_NAME_INVALID.sg-prefix': 'A security group name can\'t start with "sg-".',
  'issue.SG_NAME_DUPLICATE': 'A security group named "{name}" already exists in {vpcId}.',
  'issue.NACL_RULE_NUMBER_DUPLICATE':
    'Rule number {ruleNumber} is used twice in the {direction} rules.',
  'issue.QUOTA_EXCEEDED.rules-per-security-group':
    'The security group has {count} {direction} rules. The default quota is {limit}.',
  'issue.QUOTA_EXCEEDED.rules-per-network-acl':
    'The network ACL has {count} {direction} rules. The default quota is {limit}.',
  'issue.QUOTA_EXCEEDED.security-groups-per-network-interface':
    'The network interface has {count} security groups. The default quota is {limit}.',
  'issue.purpose.network': 'network address',
  'issue.purpose.vpc-router': 'VPC router',
  'issue.purpose.dns': 'reserved by AWS (DNS)',
  'issue.purpose.future-use': 'reserved by AWS for future use',
  'issue.purpose.broadcast': 'broadcast address',
  'issue.field.name': 'name',
  'issue.field.description': 'description',
  'issue.direction.inbound': 'inbound',
  'issue.direction.outbound': 'outbound',

  'sim.zoneNoPreference': '"No preference" picks the first Availability Zone of the region.',
  'sim.firstFreeAddress':
    'Without a chosen address, the simulator picks the first free usable address of the subnet.',
  'sim.publicPool':
    'Simulated public IPv4 addresses come from 203.0.113.0/24, a documentation range (RFC 5737).',
  'sim.subnetNoPreference': '"No preference" picks the first subnet of the VPC.',
  'sim.launchTime': 'The simulator keeps no launch time.',
  'sim.amiPlatform': 'The simulator models only the platform of the image: Linux/UNIX or Windows.',
  'sim.software.title': 'Simulated software',
  'sim.software.description':
    'In AWS, software comes from the AMI or user data. The simulator only needs to know which service listens on which port.',
  'sim.software.none': 'None',
  'sim.software.webServer': 'Web server (nginx on TCP port 80)',
} as const;

export type MessageKey = keyof typeof en;
export type Messages = Readonly<Record<MessageKey, string>>;
