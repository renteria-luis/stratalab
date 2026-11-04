---
name: aws-console-catalog
description: Rules for the simulator's console shell and its service catalog — Console Home, the services menu, global search, each service's side navigation, and the reference cards for services the engine doesn't simulate. Covers where catalog data must come from (dated console captures and the official CLF-C02 and SAA-C03 in-scope lists, never memory), the data model and its tests, how to write and verify a reference card, study mode vs lab mode behavior, and the branding limits that keep the shell from looking like a phishing copy of AWS. Use this skill whenever you touch apps/web navigation, TopNavigation, SideNavigation, the services menu, search, Console Home, ServiceReferenceView or packages/catalog, or write, review or translate a service card, even if the task only says "menu", "sidebar", "home page" or "add a service".
---

# Console shell and service catalog

The shell shows AWS at full density so learners build real muscle memory: every service in the services menu and search, and complete side navigation for the consoles they use.
Only a few services are backed by the engine. Everything else is a reference card or a navigable distractor.
What the learner sees must match the real console. What it says must be true.

## Three kinds of service

- `simulated`: backed by the engine in the current release (R0: VPC and EC2). Opens functional views.
- `reference`: has a reference card. Opens `ServiceReferenceView`.
- `nav-only`: listed so the menu and search are complete. Opens `ServiceReferenceView` with a short "No card yet" notice and a link to the service's official docs.

Inside a reproduced console, each side-navigation item is `functional`, `reference` or `empty`. `empty` opens a realistic empty state for that page, such as an empty resource table.

## Where the data comes from (never from memory)

1. **Navigation** (service names, categories, order, side-navigation items): transcribe it from dated screenshots of the real console in `docs/console-capture/<YYYY-MM-DD>/`. Record `capturedOn` in the data. If a screenshot doesn't show something, leave it out and list it as unreadable; never fill gaps from memory. Captures are local reference only and stay out of git.
2. **Exam scope**: the official in-scope service lists. Cards for in-scope services come first. AWS says the CLF-C02 list is non-exhaustive and can change, so record the date you copied it.
   - CLF-C02: https://docs.aws.amazon.com/aws-certification/latest/userguide/clf-02-in-scope-services.html
   - SAA-C03: https://docs.aws.amazon.com/aws-certification/latest/solutions-architect-associate-03/saa-03-in-scope-services.html
   - SAA-C03 out of scope: https://docs.aws.amazon.com/aws-certification/latest/solutions-architect-associate-03/saa-03-out-of-scope-services.html
3. **Card facts**: AWS documentation, service pages and FAQs, looked up with the AWS documentation MCP tool. Each card lists its sources and a status (`verified YYYY-MM-DD` or `to-verify`).

AWS renames and retires services. If a capture or a doc shows a service as retired or renamed, update the catalog (`retired: true` hides it from menus and search). Re-capture navigation every 6 months.

## Modes

- **Study mode**: `ServiceReferenceView` shows the card under a notice: "Reference only — this service isn't simulated". Simulated services link to their labs.
- **Lab mode**: the full menus stay visible and clickable. Nothing is highlighted or locked. Pages that aren't part of the lab show the same realistic empty state as the real console would. Never show messages such as "this isn't the cause"; that is a hint. Hints are opt-in (a Hint button) and the lab records how many were used. Record wrong turns locally (pages visited that aren't on the solution path) so learners can review them.

## Branding and trade dress limits

AWS's trademark notice says its trademarks and trade dress may not be used with products that aren't Amazon's in a way that is likely to confuse customers. A full-density console raises that risk and the phishing risk, so:

- The TopNavigation identity shows our product name and our own logo. Never the AWS logo, the "aws" wordmark or "AWS Management Console".
- Menus and search use text plus our own generic category icons. AWS Architecture Icons are offered for architecture diagrams, so use them only on the canvas.
- Console Home keeps the widget-board layout (Cloudscape board components) with simulator data: Recently visited (real local history), Labs in progress, Topology health (results of `validate()`), Estimated cost of this topology (labeled as an estimate). No imitation AWS Health, Trusted Advisor or billing widgets with invented numbers.
- No account IDs, user names or values that look real. Use obvious fakes, for example account `000000000000` and user `learner`.
- The persistent banner from AGENTS.md stays above the TopNavigation.

## Before you change anything

- Data model, file layout and required tests: `references/data-model.md`.
- Writing or reviewing a card: `references/card-writing.md`.
