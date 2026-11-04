# P7 plan: lab 1 "Web server not reachable"

Status: approved 2026-11-04 · Phases stop for review after each one.
Engine details: `docs/specs/r0-engine.md` sections 3.8, 3.10 and 8.5.

## Decisions

| Topic             | Decision                                                                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language          | Console text is English only, as captured, never translated. Simulator text goes through i18n (`es`, `en`). See AGENTS.md "Language".                                                       |
| Helper gaps       | Deterministic IDs, first free private address, public pool 203.0.113.0/24, `<region>a` for "No preference", "Simulated software" at launch, `newErrors` rejects changes (r0-engine.md 3.8). |
| Deletion          | Deleting resources and terminating instances stay out of P7 (r0-engine.md section 9). YAML can remove them.                                                                                 |
| Lab 1 faults      | Two stacked faults plus a guard query (below).                                                                                                                                              |
| Trace in lab mode | Always available, like Reachability Analyzer in AWS. The learner starts it; the lab records how many traces ran.                                                                            |
| Icons             | Official AWS Architecture Icons asset package (07312025), only the SVGs the canvas needs, used only on the canvas.                                                                          |

## Phase A: engine helpers (TDD)

- `packages/engine/src/helpers/`: creation helpers (3.8), edit helpers (3.10), `nextId`, `newErrors`.
- Tests first, named by rule ID (r0-engine.md 8.5). New rules RT-12 and IGW-07 verified 2026-11-04; Q11 open.

## Phase B: topology store and console views

- `state/persistence.ts`: load, migrate, Zod check and backup extracted from `uiStore`, shared by every persisted store.
- `state/topologyStore.ts`: key `sim-topology`, version 1, workspaces (`sandbox`, one per lab) plus the active one; actions call the helpers and reject on `newErrors`.
- `uiStore` version 2 (migration from 1): canvas positions per workspace and the "Filter by VPC" choice.
- Console views (English only): VPC dashboard, Your VPCs + Create VPC ("VPC and more" shown as Unsupported), Subnets + Create subnet + Edit subnet settings, Route tables + Create + Edit routes + Edit subnet associations + Set main, Internet gateways + Create + Attach + Detach, Network ACLs + Create + Edit rules + Edit subnet associations, Security groups + Create + Edit rules (shared by VPC and EC2), EC2 dashboard, Instances + Launch + details.
- Move the P6 shell strings the real console shows (search, menus, Console Home chrome, empty states) out of i18n into English constants.
- `FidelityLabel`, `IssueText` (`issue.<code>`), `ReasonText` (`reason.<code>`), `HelperErrorText` (`helper.<code>`), translated.
- "Filter by VPC" options and Console Home "Topology health" read the store.
- Labels come from the `.txt` captures. PNG-only pages are read only with the user's OK.

## Phase C: lab 1

- `packages/labs`: Zod `Lab` schema (texts `{ en, es }`, `initialTopology`, `solutionTopology`, queries with the expected verdict, direction, hop and reason codes for both topologies, `relevantRoutes`), pure `checkLab()`, tests.
- Lab 1, built on r0-engine.md 3.9:
  - Fault 1: security group `web` allows only TCP 443. Q1 (internet → web-1 public :80) drops at forward hop 2, `ENI_SG_RULES_MISMATCH`.
  - Fault 2: `public-a` uses the main route table; `public-rt` exists with 0.0.0.0/0 → igw but has no association. After fault 1 is fixed, Q1 breaks at return hop 6, `NO_ROUTE_TO_DESTINATION` (IGW-04).
  - Guard Q2: internet → web-1 public :22 (sshd running) must stay blocked, so opening all traffic doesn't complete the lab.
  - Done when every query matches its expected result on the current topology (any valid fix counts).
- Lab mode: our own `/labs` page; a drawer with the story, Check and Hint (opt-in, counted); `labStore` (persisted) records hints, wrong turns (pages outside `relevantRoutes`) and traces; the review shows only after the lab ends. Menus stay complete, nothing highlighted or locked.
- Workbench split panel with tabs Diagram, YAML, Browser, Trace.
- Canvas: React Flow, custom nodes, deterministic layout, no layout library. A non-persisted `traceStore` holds `currentHopIndex`; one `Packet` subscribes through a selector and moves with requestAnimationFrame and a DOM ref. Nodes and edges never change during playback. A failure shows an icon, text and a dashed outline; palette blue/orange.
- YAML: CodeMirror 6; `yaml` `parseDocument` with the core schema, `customTags: []`, unique keys; any tag, anchor or alias is rejected; 256 KiB limit; `layout` goes to the UI store; Zod decides commit or diagnostics; ADR-05 notice; file export and import.
- Virtual browser: `http://<IPv4>[:port]` from client 198.51.100.7. `REACHED` renders `responseHtml` in `<iframe sandbox srcdoc>` without `allow-scripts` or `allow-same-origin`; anything else shows a generic error.
- Icons copied as files and used through `<img>`, never inlined as markup.
- Playwright: complete lab 1 end to end, with axe checks.

## Dependencies (apps/web, Phase C, approval pending)

All published at least 14 days before 2026-11-04.

| Package                       | Version | Published  |
| ----------------------------- | ------- | ---------- |
| @xyflow/react                 | 12.12.0 | 2026-09-24 |
| yaml                          | 2.9.1   | 2026-09-11 |
| @codemirror/state             | 6.7.6   | 2026-09-22 |
| @codemirror/view              | 6.43.15 | 2026-10-19 |
| @codemirror/commands          | 6.11.1  | 2026-09-15 |
| @codemirror/language          | 6.13.1  | 2026-10-07 |
| @codemirror/lang-yaml         | 6.1.3   | 2026-03-24 |
| @codemirror/lint              | 6.9.7   | 2026-06-09 |
| @codemirror/search (optional) | 6.7.2   | 2026-08-31 |

## Missing console captures (Phase B)

No capture at all: Create route table, Edit subnet associations (route table and network ACL), Attach internet gateway, Create network ACL, Edit subnet settings, instance details tabs, EC2 Security Groups page.
PNG only: Edit routes, Internet gateways list and create, Network ACL tabs and edit, Security group rules and edit.
