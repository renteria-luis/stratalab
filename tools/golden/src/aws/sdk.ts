import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  CloudFormationClient,
  CreateStackCommand,
  DeleteStackCommand,
  DescribeStackEventsCommand,
  DescribeStackResourcesCommand,
  DescribeStacksCommand,
  ListStacksCommand,
  UpdateStackCommand,
  waitUntilStackCreateComplete,
  waitUntilStackDeleteComplete,
  waitUntilStackUpdateComplete,
} from '@aws-sdk/client-cloudformation';
import {
  CreateNetworkInsightsPathCommand,
  DeleteInternetGatewayCommand,
  DeleteNetworkAclCommand,
  DeleteNetworkInsightsAnalysisCommand,
  DeleteNetworkInsightsPathCommand,
  DeleteRouteTableCommand,
  DeleteSecurityGroupCommand,
  DeleteSubnetCommand,
  DeleteVpcCommand,
  DescribeInstancesCommand,
  DescribeInternetGatewaysCommand,
  DescribeNetworkAclsCommand,
  DescribeNetworkInsightsAnalysesCommand,
  DescribeNetworkInsightsPathsCommand,
  DescribeRouteTablesCommand,
  DescribeSecurityGroupsCommand,
  DescribeSubnetsCommand,
  DescribeVpcsCommand,
  DetachInternetGatewayCommand,
  EC2Client,
  StartNetworkInsightsAnalysisCommand,
  TerminateInstancesCommand,
  waitUntilInstanceTerminated,
  type Filter,
  type Tag as Ec2Tag,
} from '@aws-sdk/client-ec2';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import {
  GOLDEN_TAG,
  type AwsPorts,
  type RawAnalysis,
  type Tag,
  type TaggedResource,
} from './ports';

/**
 * The real AWS adapter: the only module that imports the AWS SDK (an ESLint rule enforces
 * it). Credentials and region come from the SDK's default chain (`AWS_PROFILE`,
 * `AWS_REGION`). Never imported by tests. Manual use only (docs/specs/p9-golden.md section 8).
 */

const STACK_WAIT_SECONDS = 20 * 60;
const INSTANCE_WAIT_SECONDS = 15 * 60;
const POLL_MS = 5000;

const goldenFilter: Filter = { Name: `tag:${GOLDEN_TAG.key}`, Values: [GOLDEN_TAG.value] };
const toSdkTags = (tags: readonly Tag[]) => tags.map((tag) => ({ Key: tag.key, Value: tag.value }));
const fromSdkTags = (tags: readonly Ec2Tag[] | undefined): Tag[] =>
  (tags ?? []).map((tag) => ({ key: tag.Key ?? '', value: tag.Value ?? '' }));
const isGolden = (tags: readonly Ec2Tag[] | undefined) =>
  (tags ?? []).some((tag) => tag.Key === GOLDEN_TAG.key && tag.Value === GOLDEN_TAG.value);
const byVpc = (vpcIds: readonly string[]): Filter[] => [{ Name: 'vpc-id', Values: [...vpcIds] }];

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name} ${error.message}` : String(error);
}

export function createAwsPorts(): AwsPorts {
  const sts = new STSClient({});
  const cfn = new CloudFormationClient({});
  const ec2 = new EC2Client({});

  const stackExists = async (stackName: string) => {
    try {
      const result = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
      return (result.Stacks ?? []).some((stack) => stack.StackStatus !== 'DELETE_COMPLETE');
    } catch (error) {
      if (errorText(error).includes('does not exist')) return false;
      throw error;
    }
  };

  /** The `*_FAILED` reasons CloudFormation recorded since `since`, oldest first. */
  const failureReasons = async (stack: string, since: Date) => {
    const result = await cfn.send(new DescribeStackEventsCommand({ StackName: stack }));
    return (result.StackEvents ?? [])
      .filter(
        (event) =>
          (event.Timestamp ?? new Date(0)) >= since &&
          event.ResourceStatus?.endsWith('_FAILED') === true &&
          event.ResourceStatusReason !== undefined,
      )
      .map((event) => `${event.LogicalResourceId ?? '?'}: ${event.ResourceStatusReason ?? ''}`)
      .reverse();
  };

  /** Waits for a stack operation; on failure, throws CloudFormation's own reasons as text. */
  const waitOrExplain = async (stack: string, since: Date, wait: () => Promise<unknown>) => {
    try {
      await wait();
    } catch (error) {
      let reasons: string[] = [];
      try {
        reasons = await failureReasons(stack, since);
      } catch {
        // The events may be gone (a failed create is deleted); fall back to the waiter's error.
      }
      const detail =
        reasons.length > 0 ? `\n  ${reasons.join('\n  ')}` : ` (${errorText(error).slice(0, 300)})`;
      throw new Error(`CloudFormation could not finish the stack operation:${detail}`, {
        cause: error,
      });
    }
  };

  return {
    identity: {
      accountId: async () => (await sts.send(new GetCallerIdentityCommand({}))).Account ?? '',
      region: () => sts.config.region(),
    },

    stacks: {
      exists: stackExists,
      create: async (stackName, templateBody, tags) => {
        const since = new Date();
        const created = await cfn.send(
          new CreateStackCommand({
            StackName: stackName,
            TemplateBody: templateBody,
            Tags: toSdkTags(tags),
            OnFailure: 'DELETE',
            TimeoutInMinutes: 20,
          }),
        );
        // The stack ID still finds the events after a failed create deletes the stack.
        await waitOrExplain(created.StackId ?? stackName, since, () =>
          waitUntilStackCreateComplete(
            { client: cfn, maxWaitTime: STACK_WAIT_SECONDS },
            { StackName: stackName },
          ),
        );
      },
      update: async (stackName, templateBody) => {
        const since = new Date();
        try {
          await cfn.send(
            new UpdateStackCommand({ StackName: stackName, TemplateBody: templateBody }),
          );
        } catch (error) {
          if (errorText(error).includes('No updates are to be performed')) return;
          throw error;
        }
        await waitOrExplain(stackName, since, () =>
          waitUntilStackUpdateComplete(
            { client: cfn, maxWaitTime: STACK_WAIT_SECONDS },
            { StackName: stackName },
          ),
        );
      },
      remove: async (stackName) => {
        if (!(await stackExists(stackName))) return;
        const since = new Date();
        await cfn.send(new DeleteStackCommand({ StackName: stackName }));
        await waitOrExplain(stackName, since, () =>
          waitUntilStackDeleteComplete(
            { client: cfn, maxWaitTime: STACK_WAIT_SECONDS },
            { StackName: stackName },
          ),
        );
      },
      resources: async (stackName) => {
        const result = await cfn.send(new DescribeStackResourcesCommand({ StackName: stackName }));
        return (result.StackResources ?? []).map((resource) => ({
          logicalId: resource.LogicalResourceId ?? '',
          physicalId: resource.PhysicalResourceId ?? '',
          type: resource.ResourceType ?? '',
        }));
      },
      listGolden: async () => {
        const names: string[] = [];
        let stackToken: string | undefined;
        do {
          const page = await cfn.send(new ListStacksCommand({ NextToken: stackToken }));
          for (const summary of page.StackSummaries ?? []) {
            const name = summary.StackName ?? '';
            if (summary.StackStatus !== 'DELETE_COMPLETE' && name.startsWith('sim-golden-'))
              names.push(name);
          }
          stackToken = page.NextToken;
        } while (stackToken !== undefined);
        const tagged: string[] = [];
        for (const name of names) {
          const result = await cfn.send(new DescribeStacksCommand({ StackName: name }));
          const tags = result.Stacks?.[0]?.Tags ?? [];
          if (tags.some((tag) => tag.Key === GOLDEN_TAG.key && tag.Value === GOLDEN_TAG.value))
            tagged.push(name);
        }
        return tagged;
      },
    },

    inventory: {
      describe: async (vpcIds) => {
        const [vpcs, tables, acls, groups, subnets, instances] = await Promise.all([
          ec2.send(new DescribeVpcsCommand({ VpcIds: [...vpcIds] })),
          ec2.send(new DescribeRouteTablesCommand({ Filters: byVpc(vpcIds) })),
          ec2.send(
            new DescribeNetworkAclsCommand({
              Filters: [...byVpc(vpcIds), { Name: 'default', Values: ['true'] }],
            }),
          ),
          ec2.send(
            new DescribeSecurityGroupsCommand({
              Filters: [...byVpc(vpcIds), { Name: 'group-name', Values: ['default'] }],
            }),
          ),
          ec2.send(new DescribeSubnetsCommand({ Filters: byVpc(vpcIds) })),
          ec2.send(
            new DescribeInstancesCommand({
              Filters: [
                ...byVpc(vpcIds),
                { Name: 'instance-state-name', Values: ['pending', 'running'] },
              ],
            }),
          ),
        ]);
        return {
          vpcs: (vpcs.Vpcs ?? []).map((vpc) => ({
            vpcId: vpc.VpcId ?? '',
            cidrBlock: vpc.CidrBlock ?? '',
            mainRouteTableId:
              (tables.RouteTables ?? []).find(
                (table) =>
                  table.VpcId === vpc.VpcId &&
                  (table.Associations ?? []).some((association) => association.Main === true),
              )?.RouteTableId ?? '',
            defaultNetworkAclId:
              (acls.NetworkAcls ?? []).find((acl) => acl.VpcId === vpc.VpcId)?.NetworkAclId ?? '',
            defaultSecurityGroupId:
              (groups.SecurityGroups ?? []).find((group) => group.VpcId === vpc.VpcId)?.GroupId ??
              '',
          })),
          subnets: (subnets.Subnets ?? []).map((subnet) => ({
            subnetId: subnet.SubnetId ?? '',
            cidrBlock: subnet.CidrBlock ?? '',
          })),
          routes: (tables.RouteTables ?? []).flatMap((table) =>
            (table.Routes ?? [])
              .filter((route) => route.GatewayId?.startsWith('igw-') === true)
              .map((route) => ({
                routeTableId: table.RouteTableId ?? '',
                destinationCidrBlock: route.DestinationCidrBlock ?? '',
                ...(route.GatewayId === undefined ? {} : { gatewayId: route.GatewayId }),
                state: route.State ?? '',
              })),
          ),
          instances: (instances.Reservations ?? [])
            .flatMap((reservation) => reservation.Instances ?? [])
            .map((instance) => ({
              instanceId: instance.InstanceId ?? '',
              networkInterfaceId:
                (instance.NetworkInterfaces ?? []).find((nic) => nic.Attachment?.DeviceIndex === 0)
                  ?.NetworkInterfaceId ?? '',
              privateIpAddress: instance.PrivateIpAddress ?? '',
              ...(instance.PublicIpAddress === undefined
                ? {}
                : { publicIpAddress: instance.PublicIpAddress }),
            })),
        };
      },
      listTagged: async () => {
        const filters = [goldenFilter];
        const [instances, gateways, subnets, tables, acls, groups, vpcs] = await Promise.all([
          ec2.send(
            new DescribeInstancesCommand({
              Filters: [
                ...filters,
                {
                  Name: 'instance-state-name',
                  Values: ['pending', 'running', 'stopping', 'stopped', 'shutting-down'],
                },
              ],
            }),
          ),
          ec2.send(new DescribeInternetGatewaysCommand({ Filters: filters })),
          ec2.send(new DescribeSubnetsCommand({ Filters: filters })),
          ec2.send(new DescribeRouteTablesCommand({ Filters: filters })),
          ec2.send(new DescribeNetworkAclsCommand({ Filters: filters })),
          ec2.send(new DescribeSecurityGroupsCommand({ Filters: filters })),
          ec2.send(new DescribeVpcsCommand({ Filters: filters })),
        ]);
        const found: TaggedResource[] = [
          ...(instances.Reservations ?? [])
            .flatMap((reservation) => reservation.Instances ?? [])
            .map((item) => ({
              kind: 'instance' as const,
              id: item.InstanceId ?? '',
              tags: fromSdkTags(item.Tags),
            })),
          ...(gateways.InternetGateways ?? []).map((item) => {
            const attachedVpcId = item.Attachments?.[0]?.VpcId;
            return {
              kind: 'internet-gateway' as const,
              id: item.InternetGatewayId ?? '',
              ...(attachedVpcId === undefined ? {} : { attachedVpcId }),
              tags: fromSdkTags(item.Tags),
            };
          }),
          ...(subnets.Subnets ?? []).map((item) => ({
            kind: 'subnet' as const,
            id: item.SubnetId ?? '',
            tags: fromSdkTags(item.Tags),
          })),
          ...(tables.RouteTables ?? [])
            .filter(
              (item) => !(item.Associations ?? []).some((association) => association.Main === true),
            )
            .map((item) => ({
              kind: 'route-table' as const,
              id: item.RouteTableId ?? '',
              tags: fromSdkTags(item.Tags),
            })),
          ...(acls.NetworkAcls ?? [])
            .filter((item) => item.IsDefault !== true)
            .map((item) => ({
              kind: 'network-acl' as const,
              id: item.NetworkAclId ?? '',
              tags: fromSdkTags(item.Tags),
            })),
          ...(groups.SecurityGroups ?? [])
            .filter((item) => item.GroupName !== 'default')
            .map((item) => ({
              kind: 'security-group' as const,
              id: item.GroupId ?? '',
              tags: fromSdkTags(item.Tags),
            })),
          ...(vpcs.Vpcs ?? []).map((item) => ({
            kind: 'vpc' as const,
            id: item.VpcId ?? '',
            tags: fromSdkTags(item.Tags),
          })),
        ];
        return found.filter((item) => item.id !== '');
      },
      remove: async (resource) => {
        switch (resource.kind) {
          case 'instance':
            await ec2.send(new TerminateInstancesCommand({ InstanceIds: [resource.id] }));
            await waitUntilInstanceTerminated(
              { client: ec2, maxWaitTime: INSTANCE_WAIT_SECONDS },
              { InstanceIds: [resource.id] },
            );
            return;
          case 'internet-gateway':
            if (resource.attachedVpcId !== undefined) {
              await ec2.send(
                new DetachInternetGatewayCommand({
                  InternetGatewayId: resource.id,
                  VpcId: resource.attachedVpcId,
                }),
              );
            }
            await ec2.send(new DeleteInternetGatewayCommand({ InternetGatewayId: resource.id }));
            return;
          case 'subnet':
            await ec2.send(new DeleteSubnetCommand({ SubnetId: resource.id }));
            return;
          case 'route-table':
            await ec2.send(new DeleteRouteTableCommand({ RouteTableId: resource.id }));
            return;
          case 'network-acl':
            await ec2.send(new DeleteNetworkAclCommand({ NetworkAclId: resource.id }));
            return;
          case 'security-group':
            await ec2.send(new DeleteSecurityGroupCommand({ GroupId: resource.id }));
            return;
          case 'vpc':
            await ec2.send(new DeleteVpcCommand({ VpcId: resource.id }));
            return;
        }
      },
    },

    reachability: {
      createPath: async (request, tags) => {
        const result = await ec2.send(
          new CreateNetworkInsightsPathCommand({
            ...request,
            FilterAtSource: { ...request.FilterAtSource },
            TagSpecifications: [{ ResourceType: 'network-insights-path', Tags: toSdkTags(tags) }],
            ClientToken: randomUUID(),
          }),
        );
        const id = result.NetworkInsightsPath?.NetworkInsightsPathId;
        if (id === undefined) throw new Error('CreateNetworkInsightsPath returned no path ID');
        return id;
      },
      startAnalysis: async (pathId, tags) => {
        const result = await ec2.send(
          new StartNetworkInsightsAnalysisCommand({
            NetworkInsightsPathId: pathId,
            TagSpecifications: [
              { ResourceType: 'network-insights-analysis', Tags: toSdkTags(tags) },
            ],
            ClientToken: randomUUID(),
          }),
        );
        const id = result.NetworkInsightsAnalysis?.NetworkInsightsAnalysisId;
        if (id === undefined)
          throw new Error('StartNetworkInsightsAnalysis returned no analysis ID');
        return id;
      },
      waitForAnalysis: async (analysisId, timeoutMs) => {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
          const result = await ec2.send(
            new DescribeNetworkInsightsAnalysesCommand({
              NetworkInsightsAnalysisIds: [analysisId],
            }),
          );
          const analysis: RawAnalysis | undefined = result.NetworkInsightsAnalyses?.[0];
          if (analysis !== undefined && analysis.Status !== 'running') return analysis;
          if (Date.now() > deadline)
            throw new Error(
              `Analysis ${analysisId} still running after ${String(timeoutMs / 1000)} s`,
            );
          await sleep(POLL_MS);
        }
      },
      deleteAnalysis: async (analysisId) => {
        await ec2.send(
          new DeleteNetworkInsightsAnalysisCommand({ NetworkInsightsAnalysisId: analysisId }),
        );
      },
      deletePath: async (pathId) => {
        await ec2.send(new DeleteNetworkInsightsPathCommand({ NetworkInsightsPathId: pathId }));
      },
      listTagged: async () => {
        const paths: string[] = [];
        const analyses: string[] = [];
        let pathToken: string | undefined;
        do {
          const page = await ec2.send(
            new DescribeNetworkInsightsPathsCommand({ NextToken: pathToken, MaxResults: 100 }),
          );
          for (const path of page.NetworkInsightsPaths ?? []) {
            if (isGolden(path.Tags) && path.NetworkInsightsPathId !== undefined)
              paths.push(path.NetworkInsightsPathId);
          }
          pathToken = page.NextToken;
        } while (pathToken !== undefined);
        let analysisToken: string | undefined;
        do {
          const page = await ec2.send(
            new DescribeNetworkInsightsAnalysesCommand({
              NextToken: analysisToken,
              MaxResults: 100,
            }),
          );
          for (const analysis of page.NetworkInsightsAnalyses ?? []) {
            if (isGolden(analysis.Tags) && analysis.NetworkInsightsAnalysisId !== undefined) {
              analyses.push(analysis.NetworkInsightsAnalysisId);
            }
          }
          analysisToken = page.NextToken;
        } while (analysisToken !== undefined);
        return { paths, analyses };
      },
    },
  };
}
