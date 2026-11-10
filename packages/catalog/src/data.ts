import amplifyCardJson from '../data/cards/amplify.json';
import apiGatewayCardJson from '../data/cards/api-gateway.json';
import artifactCardJson from '../data/cards/artifact.json';
import athenaCardJson from '../data/cards/athena.json';
import auroraAndRdsCardJson from '../data/cards/aurora-and-rds.json';
import autoScalingCardJson from '../data/cards/auto-scaling.json';
import backupCardJson from '../data/cards/backup.json';
import batchCardJson from '../data/cards/batch.json';
import billingAndCostManagementCardJson from '../data/cards/billing-and-cost-management.json';
import certificateManagerCardJson from '../data/cards/certificate-manager.json';
import cloudformationCardJson from '../data/cards/cloudformation.json';
import cloudfrontCardJson from '../data/cards/cloudfront.json';
import cloudhsmCardJson from '../data/cards/cloudhsm.json';
import cloudtrailCardJson from '../data/cards/cloudtrail.json';
import cloudwatchCardJson from '../data/cards/cloudwatch.json';
import cognitoCardJson from '../data/cards/cognito.json';
import comprehendCardJson from '../data/cards/comprehend.json';
import computeOptimizerCardJson from '../data/cards/compute-optimizer.json';
import configCardJson from '../data/cards/config.json';
import controlTowerCardJson from '../data/cards/control-tower.json';
import databaseMigrationServiceCardJson from '../data/cards/database-migration-service.json';
import detectiveCardJson from '../data/cards/detective.json';
import directConnectCardJson from '../data/cards/direct-connect.json';
import directoryServiceCardJson from '../data/cards/directory-service.json';
import documentdbCardJson from '../data/cards/documentdb.json';
import dynamodbCardJson from '../data/cards/dynamodb.json';
import efsCardJson from '../data/cards/efs.json';
import elasticBeanstalkCardJson from '../data/cards/elastic-beanstalk.json';
import elasticContainerRegistryCardJson from '../data/cards/elastic-container-registry.json';
import elasticContainerServiceCardJson from '../data/cards/elastic-container-service.json';
import elasticDisasterRecoveryCardJson from '../data/cards/elastic-disaster-recovery.json';
import elasticKubernetesServiceCardJson from '../data/cards/elastic-kubernetes-service.json';
import elasticacheCardJson from '../data/cards/elasticache.json';
import eventbridgeCardJson from '../data/cards/eventbridge.json';
import firewallManagerCardJson from '../data/cards/firewall-manager.json';
import fsxCardJson from '../data/cards/fsx.json';
import globalAcceleratorCardJson from '../data/cards/global-accelerator.json';
import glueCardJson from '../data/cards/glue.json';
import guarddutyCardJson from '../data/cards/guardduty.json';
import healthDashboardCardJson from '../data/cards/health-dashboard.json';
import iamCardJson from '../data/cards/iam.json';
import iamIdentityCenterCardJson from '../data/cards/iam-identity-center.json';
import inspectorCardJson from '../data/cards/inspector.json';
import iotCoreCardJson from '../data/cards/iot-core.json';
import keyManagementServiceCardJson from '../data/cards/key-management-service.json';
import kinesisCardJson from '../data/cards/kinesis.json';
import lambdaCardJson from '../data/cards/lambda.json';
import lexCardJson from '../data/cards/lex.json';
import lightsailCardJson from '../data/cards/lightsail.json';
import macieCardJson from '../data/cards/macie.json';
import marketplaceCardJson from '../data/cards/marketplace.json';
import neptuneCardJson from '../data/cards/neptune.json';
import organizationsCardJson from '../data/cards/organizations.json';
import outpostsCardJson from '../data/cards/outposts.json';
import pollyCardJson from '../data/cards/polly.json';
import redshiftCardJson from '../data/cards/redshift.json';
import rekognitionCardJson from '../data/cards/rekognition.json';
import resourceAccessManagerCardJson from '../data/cards/resource-access-manager.json';
import route53CardJson from '../data/cards/route-53.json';
import s3CardJson from '../data/cards/s3.json';
import sagemakerAiCardJson from '../data/cards/sagemaker-ai.json';
import secretsManagerCardJson from '../data/cards/secrets-manager.json';
import serviceCatalogCardJson from '../data/cards/service-catalog.json';
import serviceQuotasCardJson from '../data/cards/service-quotas.json';
import simpleEmailServiceCardJson from '../data/cards/simple-email-service.json';
import simpleNotificationServiceCardJson from '../data/cards/simple-notification-service.json';
import simpleQueueServiceCardJson from '../data/cards/simple-queue-service.json';
import stepFunctionsCardJson from '../data/cards/step-functions.json';
import storageGatewayCardJson from '../data/cards/storage-gateway.json';
import supportCardJson from '../data/cards/support.json';
import systemsManagerCardJson from '../data/cards/systems-manager.json';
import textractCardJson from '../data/cards/textract.json';
import transcribeCardJson from '../data/cards/transcribe.json';
import translateCardJson from '../data/cards/translate.json';
import trustedAdvisorCardJson from '../data/cards/trusted-advisor.json';
import wafAndShieldCardJson from '../data/cards/waf-and-shield.json';
import wellArchitectedToolCardJson from '../data/cards/well-architected-tool.json';
import workspacesCardJson from '../data/cards/workspaces.json';
import xRayCardJson from '../data/cards/x-ray.json';
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

/** Reference cards (data/cards/<serviceId>.json), batches 1 to 4 of P8. */
export const cards: readonly Card[] = [
  amplifyCardJson,
  apiGatewayCardJson,
  artifactCardJson,
  athenaCardJson,
  auroraAndRdsCardJson,
  autoScalingCardJson,
  backupCardJson,
  batchCardJson,
  billingAndCostManagementCardJson,
  certificateManagerCardJson,
  cloudformationCardJson,
  cloudfrontCardJson,
  cloudhsmCardJson,
  cloudtrailCardJson,
  cloudwatchCardJson,
  cognitoCardJson,
  comprehendCardJson,
  computeOptimizerCardJson,
  configCardJson,
  controlTowerCardJson,
  databaseMigrationServiceCardJson,
  detectiveCardJson,
  directConnectCardJson,
  directoryServiceCardJson,
  documentdbCardJson,
  dynamodbCardJson,
  efsCardJson,
  elasticBeanstalkCardJson,
  elasticContainerRegistryCardJson,
  elasticContainerServiceCardJson,
  elasticDisasterRecoveryCardJson,
  elasticKubernetesServiceCardJson,
  elasticacheCardJson,
  eventbridgeCardJson,
  firewallManagerCardJson,
  fsxCardJson,
  globalAcceleratorCardJson,
  glueCardJson,
  guarddutyCardJson,
  healthDashboardCardJson,
  iamCardJson,
  iamIdentityCenterCardJson,
  inspectorCardJson,
  iotCoreCardJson,
  keyManagementServiceCardJson,
  kinesisCardJson,
  lambdaCardJson,
  lexCardJson,
  lightsailCardJson,
  macieCardJson,
  marketplaceCardJson,
  neptuneCardJson,
  organizationsCardJson,
  outpostsCardJson,
  pollyCardJson,
  redshiftCardJson,
  rekognitionCardJson,
  resourceAccessManagerCardJson,
  route53CardJson,
  s3CardJson,
  sagemakerAiCardJson,
  secretsManagerCardJson,
  serviceCatalogCardJson,
  serviceQuotasCardJson,
  simpleEmailServiceCardJson,
  simpleNotificationServiceCardJson,
  simpleQueueServiceCardJson,
  stepFunctionsCardJson,
  storageGatewayCardJson,
  supportCardJson,
  systemsManagerCardJson,
  textractCardJson,
  transcribeCardJson,
  translateCardJson,
  trustedAdvisorCardJson,
  wafAndShieldCardJson,
  wellArchitectedToolCardJson,
  workspacesCardJson,
  xRayCardJson,
].map((card) => cardSchema.parse(card));
