import { mustGet } from '../internal/lookup';
import type { NetworkAcl, RouteTable, Subnet } from '../schema';
import type { Model } from './index';

/**
 * The route table a subnet uses: its explicit association, or else the main route table of
 * its VPC (implicit association). An explicit association with the main table is `explicit`.
 *
 * Rule: RT-01 · https://docs.aws.amazon.com/vpc/latest/userguide/subnet-route-tables.html
 */
export function routeTableOf(
  model: Model,
  subnet: Subnet,
): { table: RouteTable; association: 'explicit' | 'main' } {
  if (subnet.routeTableId !== undefined) {
    return { table: mustGet(model.routeTables, subnet.routeTableId), association: 'explicit' };
  }
  const vpc = mustGet(model.vpcs, subnet.vpcId);
  return { table: mustGet(model.routeTables, vpc.mainRouteTableId), association: 'main' };
}

/**
 * The network ACL a subnet uses: its explicit association, or else the default network ACL
 * of its VPC.
 *
 * Rule: NACL-01 · https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html
 */
export function networkAclOf(
  model: Model,
  subnet: Subnet,
): { acl: NetworkAcl; association: 'explicit' | 'default' } {
  if (subnet.networkAclId !== undefined) {
    return { acl: mustGet(model.networkAcls, subnet.networkAclId), association: 'explicit' };
  }
  const vpc = mustGet(model.vpcs, subnet.vpcId);
  return { acl: mustGet(model.networkAcls, vpc.defaultNetworkAclId), association: 'default' };
}
