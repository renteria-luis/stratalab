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

## Capture of 2026-11-05 (page text, agent with the read-only user)

Taken by the agent with the read-only console user (AGENTS.md, "AWS console access for agents (read-only)"), region us-east-1, default VPC only. Page text only, in `docs/console-capture/2026-11-05/` (29 files). Account ID replaced by `<account-id>`.

- Covers what `docs/specs/p7-lab1.md` listed as missing: Create route table, Edit routes, Edit subnet associations (route table and network ACL), Internet gateways list, details, create and Attach to VPC, Create network ACL, network ACL details tabs and Edit inbound/outbound rules, Edit subnet settings, security group list, details tabs and Edit inbound/outbound rules, and the EC2 Security Groups page.
- `vpc-side_navigation.txt` has the full VPC side navigation as text, which fills the gap between "Container associations" and "Verified Access trust providers" noted above.
- New since 2026-11-03: the VPC side navigation shows "Carrier gateways" under "Virtual private cloud"; `nav/vpc.json` doesn't have it yet.
- Attach to VPC with no detached VPC shows: "You do not have any VPCs. You need a VPC in order to attach an internet gateway".
- Instance pages, captured the same day with the user's admin session for that session only (the user watched): one t3.micro `sim-capture-temp` launched in the default VPC with the `default` security group and no key pair, then terminated. Files: launch success page, instance details tabs (Details, Status and alarms, Monitoring, Security, Networking, Storage, Tags), the Terminate (delete) instance dialog, and the Instance state and Actions menu items (`ec2-instances-instances-selection-menus.txt`).
- Same day, read-only user: the subnet Actions pages "Replace route table" (`…-subnets-selection-replace_route_table.txt`, browser title "Modify route table") and "Replace network ACL" (`…-replace_network_acl.txt`, browser title "Edit network ACL").
- Console differences between the two capture dates (2026-11-03 in us-east-2, 2026-11-05 in us-east-1), probably a staged rollout: subnet Actions "Edit network ACL association" / "Edit route table association" became "Replace network ACL" / "Replace route table"; the Subnets table gained "Internet access" ("Yes (public)" for the default subnets) and "Network border group"; the empty details panel says "Select a VPC" instead of "Select a VPC above" (the internet gateways page still says "… above"). The app follows 2026-11-05.
- Open: the "Internet access" value of a private subnet isn't captured (every default subnet is public), so the app doesn't show that column yet. Neither are the subnet details tabs (Route table, Network ACL) nor their buttons. Captured 2026-11-06 (below).

## Capture of 2026-11-06 (page text, admin session for that session only)

Taken by the agent with the user's admin session, approved for that session only (the user signed in). Region us-east-1. Every resource was new, free and named `sim-capture-*` (one VPC 10.99.0.0/16, two subnets, one internet gateway, one route table); the default VPC was not changed. All were deleted at the end and the lists were checked. Page text only, in `docs/console-capture/2026-11-06/` (35 files, with `00-checklist.md`). Account ID replaced by `<account-id>`.

- Console content now renders inside an iframe. Lists are cached across page loads ("Last updated 8 minutes ago"): until the list is refreshed, a new subnet shows "–" (list) or "-" (details) for Route table, Internet access and Network ACL, and its Route table and Network ACL tabs say "There was an error loading route table." / "There was an error loading network ACL.". The app doesn't reproduce the cache.
- Subnets list: "Internet access" is "No (private)" for a subnet whose route table has only the local route and "Yes (public)" with 0.0.0.0/0 → igw. It stays "Yes (public)" when that route is "Blackhole" after detaching the gateway (evidence added to Q8 of the network rules skill; the engine still counts only active routes). Cells of related resources read "id | name" when the resource has a name (VPC, Route table).
- Subnet Route table tab: "Route table: rtb-…", buttons "Edit routes" and "Replace route table", then "Routes (n)" with Destination and Target. Network ACL tab: "Network ACL: acl-…", button "Replace network ACL", "This subnet uses the VPC's default network ACL." (an explicit association wasn't captured), "Inbound rules (n)" with "Edit inbound rules", "Outbound rules (n)" with "Edit outbound rules". The tab list ends with "Related resources".
- Create subnet errors, under the field and as an "Error …" flash after submit: "CIDR Address is not within CIDR Address from VPC.", "CIDR Address overlaps with existing Subnet CIDR: 10.99.1.0/24.", and before submit for /29 "IPv4 block sizes must be between a /16 netmask and /28 netmask.". `10.99.2.5/24` was accepted and created as `10.99.2.0/24`. The CIDR field shows its size ("256 IPs"). "Info" links now read "Q help".
- Success flashes for create VPC, subnet, internet gateway, route table, attach, detach, edit routes, edit subnet associations and every delete.
- Internet gateways: "Detached" state with Actions "Detach from VPC" disabled; Attach to VPC with an available VPC; the Detach dialog (type "detach") and the Delete dialog (type "delete").
- Route tables: a non-main table with an explicit association (list "subnet-… / name", Main "No"), the Subnet associations tab with and without explicit associations, Edit subnet associations ("Main (rtb-…)" in the Route table ID column), Edit routes with a new row (Status "–", Propagated "No", Route Origin "CreateRoute") and the Target type list, the "Blackhole" status, Actions menu states (`…-route_tables-selection-actions_menu.txt`), and the Delete dialog with and without associations ("Route tables have associations and cannot be deleted.").
- Your VPCs: Delete VPC dialog; the page now has the tabs "VPCs" and "VPC encryption controls" and the columns "Encryption control ID" and "Encryption control mode"; Create VPC has "VPC encryption control ($)" (None, Monitor mode, Enforce mode). Not in the app yet.
- Subnet details tab: 27 fields in 4 columns. The page text reads column by column, so the app renders each column as one group (`ColumnPairs`). Done 2026-11-06.
- Details panels as column groups (Inferred from the page text order): Your VPCs (18 fields, 5/5/4/4; the encryption fields end columns 1 and 2), route tables (2/2/1/1), network ACLs (2/1/1/1, "Associated with" as "n Subnets"), internet gateways (1 each). Security groups live in their own frame and keep the row order, which matches the capture. Done 2026-11-06.
- Open: the Your VPCs encryption columns and the "VPC encryption controls" tab of the list; "id | name" cells on the other lists; confirm the column grouping from the page structure in the next console session.

## Capture of 2026-11-08 (page text, agent with the read-only user)

Taken by the agent with the read-only console user, region us-east-1, an account with no NAT gateways. Page text plus notes from the accessibility tree, in `docs/console-capture/2026-11-08/` (4 files). Account ID, alias, user name and resource IDs replaced. Nothing was submitted.

- NAT gateways list: columns, Actions items, filter placeholder "Find NAT gateways by attribute or tag" and the empty state "No NAT gateways found" (no description, no button). `nav/vpc.json` now opens it as `functional`.
- Create NAT gateway now has "Availability mode" with "Regional - new" preselected; "Zonal" swaps "VPC" for "Subnet" and "Method of Elastic IP (EIP) allocation" for "Elastic IP allocation ID" with "Allocate Elastic IP". The docs procedure (nat-gateway-working-with.html) doesn't mention availability mode yet and calls the private IP field "Private IP address - optional"; the console says "Primary private IPv4 address - optional". The app follows the console.
- Edit routes: the Target field is filled with the type's prefix ("nat-") when you choose "NAT Gateway"; the Destination field suggests 0.0.0.0/0, /8, /16, /24, /32, IPv6 blocks and the region's AWS-managed prefix lists.
- Info links read "Info" again (2026-11-06 showed "Q help").
- Open: details panel and cell values of an existing NAT gateway, Create errors, the result of "Allocate Elastic IP".
