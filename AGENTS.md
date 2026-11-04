# AGENTS.md

Rules for AI coding agents (Claude Code, Gemini/Antigravity and others) working in this repository.
Read this file first. Then read the skill for the area you touch:
- `packages/engine` or `packages/labs` → `.claude/skills/aws-network-rules/`
- `packages/catalog` or the console shell in `apps/web` (menus, search, side navigation, Console Home, reference cards) → `.claude/skills/aws-console-catalog/`

## Project

A browser-based simulator for learning AWS at CLF-C02 and SAA-C03 level.
The console shell has the full density of the real AWS console: every service in the services menu and search, and complete side navigation for the consoles we reproduce, so learners build real muscle memory.
Only some services are backed by the engine. They open functional views that edit one topology model. A deterministic TypeScript engine evaluates that model, and a React Flow canvas shows each packet hop by hop: it reaches its target, breaks at a hop, or is routed and then dropped.
Every other service opens a reference card (study mode) or acts as a navigable distractor (lab mode).
Everything runs in the browser. The MVP has no real AWS calls, no backend and no user accounts.

- Product name: not chosen yet. The placeholder is "Untitled Simulator" (`apps/web/src/product.ts` and the `<title>` in `apps/web/index.html`). The final name must not contain "AWS", "Amazon" or the name of an AWS service (for example "X-Ray").
- Package scope placeholder: `@sim/*`. Rename it once the name is chosen.

## Repository layout

```text
apps/web/                         React 19, Vite, Cloudscape, @xyflow/react v12, Zustand, CodeMirror 6
packages/engine/                  Pure TypeScript: Zod schema, CIDR math, evaluators, trace, status
packages/engine/__tests__/golden/ Fixtures from real Reachability Analyzer runs (never edit by hand)
packages/catalog/                 Service catalog data (services, side navigation, reference cards) + Zod schemas
packages/labs/                    Lab scenarios and quiz items, each with its own tests
tools/golden/                     Manual capture: deploy a scenario, run Reachability Analyzer, save fixture, destroy
infra/                            AWS CDK in TypeScript: static hosting on S3 + CloudFront
docs/specs/                       Short specs written before schema or evaluator changes (SDD)
docs/console-capture/             Dated screenshots of the real console (local only, gitignored)
.claude/skills/aws-network-rules/   AWS networking rules with sources, fidelity labels and reason codes
.claude/skills/aws-console-catalog/ Console shell and catalog rules: data sources, cards, modes, branding limits
```

## Commands

```bash
pnpm install
pnpm dev                            # web app dev server
pnpm test                           # all unit tests (Vitest)
pnpm test:engine                    # packages/engine only
pnpm test:e2e                       # Playwright smoke tests
pnpm typecheck                      # tsc --noEmit in every workspace
pnpm lint                           # ESLint + Prettier check
pnpm golden:capture <scenario-id>   # manual only (see "Golden capture")
```

Keep the root `package.json` scripts in sync with this list. Pin Node and pnpm with `engines` and `packageManager`.
Run `pnpm typecheck` and `pnpm test` before you say a task is done.

## Architecture rules

1. TypeScript only, with `strict` and `noUncheckedIndexedAccess`. No other languages, no WASM, no Docker-based emulators (LocalStack, Floci, Kumo).
2. `packages/engine` is pure and deterministic: no React, DOM, Zustand, network access, `Date.now()` or `Math.random()`. The same code runs in the browser and in Node.
3. The engine exposes three functions:
   - `validate(topology): Issue[]` — static problems: CIDR overlap, reserved IP, invalid subnet size, NAT gateway in a subnet without a route to an internet gateway.
   - `trace(topology, query): TraceResult` — immutable, ordered hops for both directions, a verdict (`REACHED` | `BROKE_AT_HOP` | `ROUTED_THEN_DROPPED`) and reason codes.
   - `deriveStatus(topology): Status` — derived facts such as public/private subnet and SSM managed state.
4. One source of truth: the topology model, defined with Zod in `packages/engine/src/schema`. Console forms, canvas and YAML editor are views of it.
5. UI state stays out of the engine schema. Node positions, viewport, selection and panel layout live in a separate UI store. YAML may carry an optional `layout` section that the engine ignores.
6. The YAML editor works on a draft: parse, validate with Zod, and commit to the store only if valid. Otherwise show the errors and keep the last valid model.
7. Persistence: Zustand `persist` with IndexedDB (`idb-keyval`). Saved data has a `version` and a `migrate` function and is validated with Zod on load. If loading fails, keep a backup copy, start clean and tell the user. Never crash. YAML export and import are the user's real backup.
8. Fidelity: every primitive and rule is labeled `Exact`, `Inferred` or `Unsupported` (see the skill). The UI shows the label. Unsupported features are listed and never treated as allowed, free or instant.
9. Reason codes reuse AWS Reachability Analyzer explanation code names when one fits (for example `SUBNET_ACL_RESTRICTION`, `NO_ROUTE_TO_DESTINATION`). Add our own code only when none fits, and document it in the skill.
10. Prices in the UI come from a build-time snapshot of the AWS Price List, with region and date shown. Never hardcode prices in components. Reference cards never show prices.
11. Full-density console: never shorten or hide menus to make things simpler. Each service is `simulated`, `reference` or `nav-only` (see the catalog skill). Only `simulated` services open functional views; the rest open `ServiceReferenceView` or a realistic empty state.

## AWS facts: never from memory

- Before you write or change an evaluator, read the matching reference file of the `aws-network-rules` skill.
- If a rule is marked `to-verify`, confirm it in the current AWS docs (AWS documentation MCP tool or docs.aws.amazon.com) before you implement it. Then update its status and date in the skill.
- Each evaluator's JSDoc lists the rule IDs it implements (for example `RT-05`) and their source URLs.
- Service names, categories and side-navigation items come only from dated console captures. Exam scope comes only from the official in-scope lists. Card facts come only from AWS docs, with sources on each card.
- If the docs are silent or unclear, label the behavior `Inferred`, add it to the skill's open questions and ask the user. Do not guess.
- Change the rule or the data in the skill or catalog first, then the code.

## UI rules

- Cloudscape (`@cloudscape-design/components`, `global-styles`, `design-tokens`, board components) is the only UI kit. The CSS that React Flow and CodeMirror 6 need is allowed. Custom CSS uses Cloudscape design tokens. No Tailwind, shadcn or other UI kits.
- Accessibility: WCAG 2.1 AA. Color is never the only signal. Verdicts use an icon and text (Cloudscape `StatusIndicator`), and on the canvas also a shape or line style. Use a colorblind-safe palette (blue/orange); never rely on red vs green. All text is real DOM text, never drawn on `<canvas>`.
- 60 FPS: never store moving packet positions in React Flow `nodes` or `edges`. Packet components subscribe only to the trace playhead (`currentHopIndex`) through a Zustand selector or DOM refs.
- Lab mode: all menus stay visible and clickable, nothing is highlighted or locked, and pages outside the lab show a realistic empty state. Never show messages that hint at the answer (such as "this isn't the cause"). Hints are opt-in.
- i18n from day one: every user-facing string goes through the i18n layer (`es`, `en`). Code, comments, docs and commit messages are in English.
- Desktop first (1280 px and wider).

## Security, branding and anti-phishing

- No sign-in screen that looks like AWS. The app opens straight into the workspace.
- The TopNavigation shows our product name and our own logo. Never the AWS logo, the "aws" wordmark or "AWS Management Console". No "AWS" or "Amazon" in the product name, `<title>` or domain. Use our own favicon.
- AWS Architecture Icons appear only on the canvas (architecture diagrams). Menus and search use text plus our own generic category icons.
- Console Home uses widgets with simulator data, never imitations of AWS Health, Trusted Advisor or billing with invented numbers. Account IDs and user names are obviously fake (`000000000000`, `learner`).
- A banner is always visible above the TopNavigation (i18n): "Independent educational simulator — not connected to any AWS account". The footer shows the trademark attribution and says the project is not affiliated with or endorsed by AWS.
- The app never calls AWS or third-party APIs. All assets are served from our own origin. No trackers.
- Lab credentials are fake and look fake (prefix `SIMFAKE`). Reject pasted strings that look like real AWS access keys (`AKIA…`, `ASIA…`) or secret keys.
- User-provided HTML (for example `runningServices[].responseHtml` in the virtual browser) renders only inside `<iframe sandbox srcdoc>` without `allow-scripts`. Never insert it into the app DOM.
- YAML import: size limit, safe parser (no custom tags), Zod validation.
- Never commit secrets or console screenshots. Keep `.env*` and `docs/console-capture/` in `.gitignore`.

## Testing

- Vitest everywhere. `packages/engine` is test-first: write the failing test, then the code.
- fast-check property tests for CIDR math, overlap and longest-prefix match.
- NACL tests always check both directions with a concrete client ephemeral port (skill rules `EPH-*`).
- Golden fixtures come only from `tools/golden` (real Reachability Analyzer output). Each one records date, region and scenario hash.
- Every lab declares the expected result per query (verdict and reason code) for both `initialTopology` and `solutionTopology`. A lab may require a query to stay blocked, as in security labs.
- `packages/catalog` has the consistency tests listed in the catalog skill.
- Playwright smoke tests cover the shell: search, open a reference service, open a simulated console, complete lab 1.
- Test names start with the rule ID they cover, for example `NACL-04: same-subnet traffic skips the NACL`.
- CI runs typecheck, lint and tests on every push. CI never touches AWS.

## Golden capture (manual, costs money)

- Agents never run `pnpm golden:capture` or any command that uses AWS credentials. Ask the user to run it.
- Use a dedicated sandbox AWS account with a budget alarm. First check that its plan allows the services (the free plan blocks some).
- Reachability Analyzer is billed per analysis. NAT gateways, transit gateway attachments and public IPv4 addresses bill per hour. Destroy everything right after each capture.

## Workflow

- If Gentle AI is installed, follow its ODD protocol. This file adds project rules on top of it.
- Changes to the schema or to an evaluator need a short spec in `docs/specs/` first (SDD): rule IDs, inputs, outputs, examples and test cases. Then TDD.
- Write reference cards in batches of about 20 and stop for review after each batch.
- Small, focused commits (Conventional Commits). Ask before adding a dependency.
- Done means: typecheck, lint and tests pass; rule IDs are cited; fidelity labels are set; UI strings are in i18n; no color-only signals.

## Release scope

- R0: console shell (Console Home, services menu, global search, full side navigation for VPC and EC2 from captures, `ServiceReferenceView`); engine for VPC, subnets, route tables (including the main route table), internet gateway, security groups, network ACLs, EC2 with a web service; virtual browser, canvas, YAML editor; lab 1 end to end; first batch of reference cards.
- R1: side navigation for IAM and Systems Manager; NAT gateway, IAM instance profile (simplified), SSM managed status, gateway and interface endpoints; cost and shared-responsibility panels; more card batches.
- R2: VPC peering, Transit Gateway, Site-to-Site VPN, Application Load Balancer.
- Not in the MVP: Auto Scaling, other clouds, load simulation, AI agents, accounts and backend, Terraform import.
