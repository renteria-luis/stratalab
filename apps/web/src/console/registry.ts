import { createElement, type ComponentType } from 'react';
import { Ec2Home } from './ec2/Ec2Home';
import { Instances } from './ec2/Instances';
import { LaunchInstance } from './ec2/LaunchInstance';
import { CreateSubnet } from './vpc/CreateSubnet';
import { CreateVpc } from './vpc/CreateVpc';
import { EditSubnetNetworkAcl, EditSubnetRouteTable, EditSubnetSettings } from './vpc/EditSubnet';
import {
  AttachInternetGateway,
  CreateInternetGatewayPage,
  InternetGateways,
} from './vpc/InternetGateways';
import { CreateNatGatewayPage, NatGateways } from './vpc/NatGateways';
import {
  CreateNetworkAclPage,
  EditNetworkAclAssociations,
  EditNetworkAclRules,
  NetworkAcls,
} from './vpc/NetworkAcls';
import {
  CreateRouteTablePage,
  EditRouteTableAssociations,
  EditRoutes,
} from './vpc/RouteTableForms';
import { RouteTables } from './vpc/RouteTables';
import {
  CreateSecurityGroupPage,
  EditSecurityGroupRules,
  SecurityGroups,
} from './vpc/SecurityGroups';
import { Subnets } from './vpc/Subnets';
import { VpcDashboard } from './vpc/VpcDashboard';
import { YourVpcs } from './vpc/YourVpcs';

const bind =
  <P extends object>(Component: ComponentType<P>, props: P): ComponentType =>
  () =>
    createElement(Component, props);

/**
 * Functional console pages (catalog nav items with `target: functional`) and the create and
 * edit pages under them. Paths of sub-pages are ours; the label is the console's page name.
 */
export const FUNCTIONAL_VIEWS: Readonly<Record<string, ComponentType>> = {
  '/vpc': VpcDashboard,
  '/vpc/your-vpcs': YourVpcs,
  '/vpc/subnets': Subnets,
  '/vpc/route-tables': RouteTables,
  '/vpc/internet-gateways': InternetGateways,
  '/vpc/nat-gateways': NatGateways,
  '/vpc/network-acls': NetworkAcls,
  '/vpc/security-groups': bind(SecurityGroups, { base: '/vpc/security-groups' }),
  '/ec2': Ec2Home,
  '/ec2/instances': Instances,
  '/ec2/security-groups': bind(SecurityGroups, { base: '/ec2/security-groups' }),
};

export interface SubPageRoute {
  readonly path: string;
  /** The nav page it belongs to: side navigation and breadcrumbs. */
  readonly parentPath: string;
  readonly label: string;
  readonly Component: ComponentType;
}

const sgPages = (console: 'vpc' | 'ec2'): SubPageRoute[] => {
  const base = `/${console}/security-groups`;
  return [
    {
      path: `/${console}/create-security-group`,
      parentPath: base,
      label: 'Create security group',
      Component: bind(CreateSecurityGroupPage, { base }),
    },
    {
      path: `${base}/:securityGroupId/edit-inbound-rules`,
      parentPath: base,
      label: 'Edit inbound rules',
      Component: bind(EditSecurityGroupRules, { base, direction: 'inbound' }),
    },
    {
      path: `${base}/:securityGroupId/edit-outbound-rules`,
      parentPath: base,
      label: 'Edit outbound rules',
      Component: bind(EditSecurityGroupRules, { base, direction: 'outbound' }),
    },
  ];
};

export const SUB_PAGES: readonly SubPageRoute[] = [
  {
    path: '/vpc/create-vpc',
    parentPath: '/vpc/your-vpcs',
    label: 'Create VPC',
    Component: CreateVpc,
  },
  {
    path: '/vpc/create-subnet',
    parentPath: '/vpc/subnets',
    label: 'Create subnet',
    Component: CreateSubnet,
  },
  {
    path: '/vpc/subnets/:subnetId/edit-subnet-settings',
    parentPath: '/vpc/subnets',
    label: 'Edit subnet settings',
    Component: EditSubnetSettings,
  },
  {
    path: '/vpc/subnets/:subnetId/edit-route-table-association',
    parentPath: '/vpc/subnets',
    label: 'Replace route table',
    Component: EditSubnetRouteTable,
  },
  {
    path: '/vpc/subnets/:subnetId/edit-network-acl-association',
    parentPath: '/vpc/subnets',
    label: 'Replace network ACL',
    Component: EditSubnetNetworkAcl,
  },
  {
    path: '/vpc/create-route-table',
    parentPath: '/vpc/route-tables',
    label: 'Create route table',
    Component: CreateRouteTablePage,
  },
  {
    path: '/vpc/route-tables/:routeTableId/edit-routes',
    parentPath: '/vpc/route-tables',
    label: 'Edit routes',
    Component: EditRoutes,
  },
  {
    path: '/vpc/route-tables/:routeTableId/edit-subnet-associations',
    parentPath: '/vpc/route-tables',
    label: 'Edit subnet associations',
    Component: EditRouteTableAssociations,
  },
  {
    path: '/vpc/create-internet-gateway',
    parentPath: '/vpc/internet-gateways',
    label: 'Create internet gateway',
    Component: CreateInternetGatewayPage,
  },
  {
    path: '/vpc/internet-gateways/:internetGatewayId/attach-to-vpc',
    parentPath: '/vpc/internet-gateways',
    label: 'Attach to VPC',
    Component: AttachInternetGateway,
  },
  {
    path: '/vpc/create-nat-gateway',
    parentPath: '/vpc/nat-gateways',
    label: 'Create NAT gateway',
    Component: CreateNatGatewayPage,
  },
  {
    path: '/vpc/create-network-acl',
    parentPath: '/vpc/network-acls',
    label: 'Create network ACL',
    Component: CreateNetworkAclPage,
  },
  {
    path: '/vpc/network-acls/:networkAclId/edit-inbound-rules',
    parentPath: '/vpc/network-acls',
    label: 'Edit inbound rules',
    Component: bind(EditNetworkAclRules, { direction: 'inbound' }),
  },
  {
    path: '/vpc/network-acls/:networkAclId/edit-outbound-rules',
    parentPath: '/vpc/network-acls',
    label: 'Edit outbound rules',
    Component: bind(EditNetworkAclRules, { direction: 'outbound' }),
  },
  {
    path: '/vpc/network-acls/:networkAclId/edit-subnet-associations',
    parentPath: '/vpc/network-acls',
    label: 'Edit subnet associations',
    Component: EditNetworkAclAssociations,
  },
  ...sgPages('vpc'),
  ...sgPages('ec2'),
  {
    path: '/ec2/launch-instances',
    parentPath: '/ec2/instances',
    label: 'Launch an instance',
    Component: LaunchInstance,
  },
];
