# Capture notes

What the 2026-11-03 console capture and the 2026-11-04 docs copy do not show, what was matched by a different name, and what is open. Update this file with every new capture.

## Sources

| Data                                    | Screenshots                                            | Page text (select all)                                               |
| --------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------- |
| Services menu views and categories      | `services_per_category.png`                            | `services_per_category.txt`                                          |
| All services (names, categories, order) | `all_services.png`                                     | `all_services.txt`                                                   |
| Menu descriptions (8 services)          | `services_per_category.png` ("Recently visited" panel) | none                                                                 |
| EC2 side navigation                     | `ec2-1.png`, `ec2-2.png`                               | `ec2.txt`                                                            |
| VPC side navigation                     | `vpc-1.png`, `vpc-2.png`, `vpc-3.png`                  | `vpc.txt`                                                            |
| Exam scope                              | none                                                   | CLF-C02 and SAA-C03 in-scope and out-of-scope pages, read 2026-11-04 |
| `docsUrl`                               | none                                                   | Product list on https://docs.aws.amazon.com/, read 2026-11-04        |

The captures show a real account ID and user name in the top bar and in the page text. Neither is transcribed anywhere.

## Cut off or not visible

- `all_services.png` shows only the top of the page (about 90 of 236 services). Names, categories and order of the rest come from `all_services.txt`. The page lays categories out in columns; the text order is column by column, which is the order kept in `services.json`.
- `services_per_category.png` cuts the category list at "Management & Governance". The remaining categories come from `services_per_category.txt`.
- VPC side navigation: no screenshot shows the part between "Container associations" (`vpc-2.png`, bottom) and "Verified Access trust providers" (`vpc-3.png`, top). The sections "Virtual private network (VPN)" and "AWS Verified Access" come from `vpc.txt`, and their grouping is inferred from the text order (`groupingFrom: "page-text"`). Their labels are exact.
- Services menu: only the "Recently visited" panel was captured. The per-category panels (their descriptions and service order) are not captured, so `menuDescription` exists for 8 services only and the menu uses the All services page order.
- "Filter by VPC" placeholder "Choose a VPC" is visible only in `vpc-1.png`; the page text does not include it.
- Badges: "New" on EC2 UltraServers and Capacity Manager, VPC Domain verifications and VPC Settings, from the screenshots. The page text omits the badge on VPC Settings.

## Navigation items without a service entry

These VPC items show the external-link icon but have no entry on the All services page, so they open an empty page (`target: "empty"`) until they are captured: Network Manager, Cloud WAN, VPC IP Address Manager.

## Services with no `docsUrl`

No entry with a matching name on the docs home: AWS Global View, Recycle Bin, Amazon Route 53 Global Resolver, CodeCommit, Activate for Startups, AWS Auto Scaling, AWS for SAP, MediaStore, Elemental Appliances & Software, Amazon Bedrock (mantle endpoint), AWS Agent Registry, Amazon Bio Discovery, QuickSight, AWS Glue DataBrew, Security Hub CSPM, AWS Billing Conductor, AWS FinOps Agent, Amazon WorkDocs.

## `docsUrl` taken from a differently named docs entry (review)

| Console name           | Docs home entry             | URL                                             |
| ---------------------- | --------------------------- | ----------------------------------------------- |
| S3 Glacier             | Amazon Glacier              | https://docs.aws.amazon.com/s3/                 |
| AWS Snow Family        | AWS Snowball Edge           | https://docs.aws.amazon.com/snowball/           |
| AWS Health Dashboard   | AWS Health                  | https://docs.aws.amazon.com/health/             |
| Kinesis Video Streams  | Amazon Kinesis              | https://docs.aws.amazon.com/kinesis/            |
| Amazon Q Business      | Amazon Q                    | https://docs.aws.amazon.com/amazonq/            |
| AWS End User Messaging | AWS End User Messaging Push | https://docs.aws.amazon.com/end-user-messaging/ |

Docs entry names from this table are not used as aliases.

## Exam entries matched by rename (evidence in `exam-scope.json`)

- Amazon Connect: console "Amazon Connect Customer".
- Amazon AppStream 2.0: console "WorkSpaces Applications".
- AWS Application Migration Service: console "AWS Transform MGN".
- AWS Chatbot: console "Amazon Q Developer in chat applications (previously AWS Chatbot)".

## Exam entries with no console entry

In scope (these matter for exam coverage):

- AWS Cost and Usage Reports (CLF) / AWS Cost and Usage Report (SAA): the Billing and Cost Management feature list names "Data exports", not CUR. To verify.
- Migration Evaluator (CLF), AWS Data Pipeline, VMware Cloud on AWS, AWS Wavelength (SAA): not on the All services page.
- AWS CLI, AWS Schema Conversion Tool, AWS Management Console: tools or the console itself, not console services.

Out of scope (listed for completeness): AWS Copilot, AWS Wavelength, AWS Application Cost Profiler, Amazon DevPay, AWS IQ, AWS Application Composer (a Toolkit for VS Code page named `appcomposer.html` is now titled "Working with AWS Infrastructure Composer", but no page states a rename; to verify), Amazon GameLift (the console shows "Amazon GameLift Servers" and "Amazon GameLift Streams"; the list doesn't say which), AWS Migration Hub Refactor Spaces, AWS Network Access Analyzer, Amazon Cloud Directory, Amazon RDS on VMware, AWS CDK, Amazon Corretto, AWS Tools and SDKs, Apache MXNet on AWS, AWS Deep Learning AMIs, AWS Deep Learning Containers, AWS Inferentia, PyTorch on AWS, TensorFlow on AWS, AWS Console Mobile Application (only a footer link in the capture), AWS Distro for OpenTelemetry, Migration Evaluator.

## Conventions used

- Service ids: the console name in kebab-case without a leading "Amazon" or "AWS" and without "(previously …)" or "(now part of …)"; "&" becomes "and" and "@" becomes "at".
- Aliases: official names only, from the docs home, the exam lists ("same" and "renamed" entries) and the capture text. No search keywords such as "bucket": nothing sources them yet.
- Nav routes: `/<serviceId>/<label in kebab-case>`. DNS firewall "Rule groups" is `/vpc/dns-firewall-rule-groups` to keep it apart from "Network Firewall rule groups".
- R0 functional items: VPC dashboard, Your VPCs, Subnets, Route tables, Internet gateways, Network ACLs, Security groups (VPC); EC2 home, Instances, Security Groups (EC2). Everything else opens a realistic empty state.

## Open

- Side navigation for other consoles (IAM and Systems Manager are R1) needs new captures.
