import apiGatewayCardJson from '../data/cards/api-gateway.json';
import artifactCardJson from '../data/cards/artifact.json';
import athenaCardJson from '../data/cards/athena.json';
import auroraAndRdsCardJson from '../data/cards/aurora-and-rds.json';
import billingAndCostManagementCardJson from '../data/cards/billing-and-cost-management.json';
import cloudformationCardJson from '../data/cards/cloudformation.json';
import cloudfrontCardJson from '../data/cards/cloudfront.json';
import cloudtrailCardJson from '../data/cards/cloudtrail.json';
import cloudwatchCardJson from '../data/cards/cloudwatch.json';
import cognitoCardJson from '../data/cards/cognito.json';
import configCardJson from '../data/cards/config.json';
import directConnectCardJson from '../data/cards/direct-connect.json';
import dynamodbCardJson from '../data/cards/dynamodb.json';
import efsCardJson from '../data/cards/efs.json';
import elasticBeanstalkCardJson from '../data/cards/elastic-beanstalk.json';
import elasticContainerServiceCardJson from '../data/cards/elastic-container-service.json';
import globalAcceleratorCardJson from '../data/cards/global-accelerator.json';
import guarddutyCardJson from '../data/cards/guardduty.json';
import healthDashboardCardJson from '../data/cards/health-dashboard.json';
import iamIdentityCenterCardJson from '../data/cards/iam-identity-center.json';
import iamCardJson from '../data/cards/iam.json';
import inspectorCardJson from '../data/cards/inspector.json';
import keyManagementServiceCardJson from '../data/cards/key-management-service.json';
import lambdaCardJson from '../data/cards/lambda.json';
import lightsailCardJson from '../data/cards/lightsail.json';
import macieCardJson from '../data/cards/macie.json';
import organizationsCardJson from '../data/cards/organizations.json';
import redshiftCardJson from '../data/cards/redshift.json';
import route53CardJson from '../data/cards/route-53.json';
import s3CardJson from '../data/cards/s3.json';
import secretsManagerCardJson from '../data/cards/secrets-manager.json';
import simpleNotificationServiceCardJson from '../data/cards/simple-notification-service.json';
import simpleQueueServiceCardJson from '../data/cards/simple-queue-service.json';
import storageGatewayCardJson from '../data/cards/storage-gateway.json';
import supportCardJson from '../data/cards/support.json';
import systemsManagerCardJson from '../data/cards/systems-manager.json';
import trustedAdvisorCardJson from '../data/cards/trusted-advisor.json';
import wafAndShieldCardJson from '../data/cards/waf-and-shield.json';
import wellArchitectedToolCardJson from '../data/cards/well-architected-tool.json';
import examScopeJson from '../data/exam-scope.json';
import ec2NavJson from '../data/nav/ec2.json';
import vpcNavJson from '../data/nav/vpc.json';
import servicesJson from '../data/services.json';
import {
  type Card,
  type ConsoleNav,
  type ExamScope,
  type ServicesFile,
  cardSchema,
  consoleNavSchema,
  examScopeSchema,
  servicesFileSchema,
} from './schema';

/**
 * Every catalog data file, parsed once at import. The JSON is static and CI checks it,
 * so a parse error here is a build bug, not user input. A test fails when a file in
 * data/nav or data/cards is not registered below under its file name.
 */

export const servicesFile: ServicesFile = servicesFileSchema.parse(servicesJson);

export const examScope: ExamScope = examScopeSchema.parse(examScopeJson);

/** Side navigation by service id (= file name in data/nav). */
export const consoleNavs: Readonly<Record<string, ConsoleNav>> = {
  ec2: consoleNavSchema.parse(ec2NavJson),
  vpc: consoleNavSchema.parse(vpcNavJson),
};

/** Reference cards (data/cards/<serviceId>.json), batches 1 and 2 of P8. */
export const cards: readonly Card[] = [
  apiGatewayCardJson,
  artifactCardJson,
  athenaCardJson,
  auroraAndRdsCardJson,
  billingAndCostManagementCardJson,
  cloudformationCardJson,
  cloudfrontCardJson,
  cloudtrailCardJson,
  cloudwatchCardJson,
  cognitoCardJson,
  configCardJson,
  directConnectCardJson,
  dynamodbCardJson,
  efsCardJson,
  elasticBeanstalkCardJson,
  elasticContainerServiceCardJson,
  globalAcceleratorCardJson,
  guarddutyCardJson,
  healthDashboardCardJson,
  iamCardJson,
  iamIdentityCenterCardJson,
  inspectorCardJson,
  keyManagementServiceCardJson,
  lambdaCardJson,
  lightsailCardJson,
  macieCardJson,
  organizationsCardJson,
  redshiftCardJson,
  route53CardJson,
  s3CardJson,
  secretsManagerCardJson,
  simpleNotificationServiceCardJson,
  simpleQueueServiceCardJson,
  storageGatewayCardJson,
  supportCardJson,
  systemsManagerCardJson,
  trustedAdvisorCardJson,
  wafAndShieldCardJson,
  wellArchitectedToolCardJson,
].map((card) => cardSchema.parse(card));
