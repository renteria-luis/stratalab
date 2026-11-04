# KICKOFF — how to start with Claude Code

Step-by-step guide for the human. Agents don't need this file.

## 0. Prerequisites (Pop!_OS)

- Node.js LTS, pnpm (run `corepack enable`), git, and `uv` (it provides `uvx`, used by the AWS docs MCP server).
- Claude Code installed and logged in.
- No AWS credentials in this environment. The agent never touches AWS. Golden captures use a separate profile that only you run (see AGENTS.md).

## 1. Create the repo

```bash
mkdir <project> && cd <project>
unzip ~/Downloads/sim-repo-starter.zip
git init && git add -A && git commit -m "chore: add agent rules, skills and kickoff guide"
```

## 2. Set up Claude Code once

In the repo, outside Claude Code:

```bash
# AWS documentation MCP: read-only, no credentials, saved to .mcp.json
claude mcp add aws-docs --scope project -e FASTMCP_LOG_LEVEL=ERROR -- uvx awslabs.aws-documentation-mcp-server@latest

# Optional: Chrome DevTools MCP, for performance traces (60 FPS goal)
claude mcp add chrome-devtools --scope project -- npx chrome-devtools-mcp@latest
```

Inside Claude Code, run `/plugin`, open the official marketplace and install: `typescript-lsp`, `playwright`, `security-guidance`, `pr-review-toolkit`, `frontend-design`, `hookify`.
Optional: `context7` (uses many tokens, so call it only when needed) and `explanatory-output-style` (explains the code it writes).

Optional: Gentle AI for the ODD workflow. Install a pinned version (for example `go install github.com/gentleman-programming/gentle-ai/v4/cmd/gentle-ai@v4.3.1`) and run its setup. Afterwards, check that `CLAUDE.md` still contains the `@AGENTS.md` line.

Check the setup: start `claude` in the repo, run `/mcp` (aws-docs must be connected) and ask "Which skills do you have for this project?". It should list `aws-network-rules` and `aws-console-catalog`.

## 3. Capture the real console (about 20 minutes, manual)

Log in to your AWS account and take screenshots of:
- Console Home.
- The services menu with every category open (several screenshots if needed).
- The full left navigation of VPC, EC2, IAM and Systems Manager, with every group expanded.

Crop or blur your account ID, user name and anything personal. Save the files in `docs/console-capture/<YYYY-MM-DD>/` with clear names (`vpc-nav-1.png`). This folder stays out of git.

## 4. Session prompts, in order

One task per session. Start each one with `/clear`, use plan mode (Shift+Tab) until you approve the plan, review the diff, and commit when the tests pass.
Use Opus (xhigh) for P2, P3, P4 and P9. Sonnet is enough for the UI prompts (P5 to P8).

### P1 · Scaffold
> Read AGENTS.md. Scaffold the monorepo exactly as in "Repository layout": pnpm workspaces, strict TypeScript, Vitest, Playwright, ESLint + Prettier, the root scripts from "Commands", and a `.gitignore` that includes `.env*` and `docs/console-capture/`. Create the packages with one passing smoke test each. No features yet. Show me the plan first.

### P2 · R0 engine spec (SDD)
> Use the aws-network-rules skill. Write `docs/specs/r0-engine.md`: the R0 topology schema (VPC, subnet, route table including the main route table, route, internet gateway, security group and rules, network ACL and entries, EC2 instance with network interface, public IP and running services), TraceQuery (with client type and source port), TraceResult, Issue and reason codes, each with the rule IDs it relies on. List every `to-verify` rule that R0 depends on, check each one with the aws-docs MCP, and update the skill files with what you find. No code yet.

### P3 · CIDR math and validate (TDD)
> Implement `packages/engine/src/cidr` and `validate()` for the ADR rules in `docs/specs/r0-engine.md`. Write the tests first, including fast-check property tests. Name each test by its rule ID.

### P4 · Trace for flows F1 and F2 (TDD)
> Implement `trace()` for flows F1 and F2 from the aws-network-rules skill (TRC-01 to TRC-04), in both directions, with reason codes. Tests first. Add one test for each common mistake: missing route to the internet gateway, no public IP, NACL blocking the return port, security group without the inbound rule, nothing listening on port 80.

### P5 · Catalog from the captures
> Use the aws-console-catalog skill. Read the screenshots in `docs/console-capture/<date>/` and build `packages/catalog`: `services.json`, nav files for VPC and EC2, `exam-scope.json` from the official in-scope pages (via the aws-docs MCP), the schemas and the tests listed in the skill. Transcribe only what the screenshots show, and list anything unreadable instead of guessing.

### P6 · Console shell
> Use the aws-console-catalog skill. Build the console shell in `apps/web` with Cloudscape: persistent banner, TopNavigation with our placeholder name and logo, services menu by category, global search over the catalog (Alt+S focuses it, as in the real console), Console Home board with the simulator widgets from the skill, SideNavigation for VPC and EC2 from the nav files, and `ServiceReferenceView`. Add a Playwright smoke test: search "macie", open it, see the reference notice.

### P7 · Lab 1 end to end
> Build R0 lab 1, "Web server not reachable": VPC and EC2 views that edit the topology store, the React Flow canvas, the YAML editor (draft + validation), the virtual browser (sandboxed iframe) and the trace animation. The lab declares expected verdicts for its initial and solution topologies; add those tests. In lab mode the full menus stay visible with nothing highlighted.

### P8 · Cards, batch 1
> Use the aws-console-catalog skill. Write cards for the first 20 in-scope services by exam relevance, starting with the ones lab 1 links to. Status `to-verify`. Stop after the batch and show me the list with its sources.

### P9 · Golden capture tool (you run it, not the agent)
> Build `tools/golden`: a CDK app that deploys one scenario to a sandbox account, a script that runs Reachability Analyzer for the scenario's queries (split internet flows as TRC-06 says), saves the result as a fixture with date, region and hash, and destroys the stack. Do not run it. Tell me the exact command and the IAM permissions it needs.

## 5. If you run out of Claude quota

Argon (or any other agent) reads AGENTS.md. Point it at the two skill folders under `.claude/skills/` yourself, because other agents may not load skills from that path on their own.
