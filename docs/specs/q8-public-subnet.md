# Q8: a blackhole internet gateway route still makes a subnet public (RT-09)

Status: approved by the user 2026-11-06. Changes `deriveStatus` only.

## Why

Console capture 2026-11-06, us-east-1 (`docs/console-capture/2026-11-06/`):

- `…-route_tables-details-routes_tab-blackhole.txt`: after detaching the internet gateway, the route 0.0.0.0/0 → igw shows Status "Blackhole".
- `…-subnets-public_with_blackhole_route.txt`: the subnet on that route table still shows Internet access "Yes (public)", after refreshing the route tables and subnets lists.
- `…-subnets-private.txt`: a subnet whose route table has only the local route shows "No (private)".

The engine marked the blackhole case private (Inferred, skill question Q8). The user decided to follow the console.

## Rule change (RT-09)

|             | Before                                             | After                                                                 |
| ----------- | -------------------------------------------------- | --------------------------------------------------------------------- |
| Public      | at least one `active` route to an internet gateway | at least one route to an internet gateway, whatever its state (RT-08) |
| Private     | no `active` route to an internet gateway           | no route to an internet gateway                                       |
| Local route | never counts                                       | never counts                                                          |

Fidelity:

- Exact: route to a detached internet gateway (captured).
- Inferred: route to an internet gateway attached to another VPC. It has the same `blackhole` state (RT-08) but wasn't captured.
- A route to a deleted internet gateway can't exist in an R0 topology (the reference must resolve), so it isn't covered.

## Inputs and outputs

- Input: any topology. No schema change.
- Output: `deriveStatus(topology).subnets[id].type`. Nothing else in `Status` changes.
- `trace()` doesn't change: a blackhole route still wins the match and drops the packet (RT-08, `MORE_SPECIFIC_ROUTE` or `BAD_STATE_ROUTE`). "Public" says what the route table contains, not that the internet is reachable (RT-09, IGW-01).
- No new reason or issue code.

## Effects in the app

- Subnets › "Internet access" shows "Yes (public)" for the blackhole case, as captured.
- The canvas draws that subnet with the public subnet icon and label.

## Examples

Subnet `subnet-0000000a` on route table `rtb-00000002` in `vpc-0a1b2c3d`:

| Routes of `rtb-00000002`                                      | Route state | `type`  | Fidelity |
| ------------------------------------------------------------- | ----------- | ------- | -------- |
| local only                                                    | active      | private | Exact    |
| local + 0.0.0.0/0 → `igw-0000000a` attached to `vpc-0a1b2c3d` | active      | public  | Exact    |
| local + 0.0.0.0/0 → `igw-0000000a` detached                   | blackhole   | public  | Exact    |
| local + 0.0.0.0/0 → `igw-0000000a` attached to `vpc-0000000b` | blackhole   | public  | Inferred |

## Test cases (`packages/engine/__tests__/derive-status.test.ts`)

- Keep `RT-09: a subnet with an active route to an IGW is public; without one it is private`.
- Replace `RT-09: a subnet whose only IGW route is blackhole is private (Inferred, Q8)` with `RT-09: a subnet whose only IGW route is blackhole is public, as the console shows (Q8)`: detached gateway, `type` is `public`, the route is still `blackhole`.
- Add `RT-09: a route to an internet gateway of another VPC still makes the subnet public (Inferred, Q8)`.
- The trace tests for RT-08 stay as they are and must still pass.

## Docs to update

- Skill `aws-network-rules`, `references/routing.md`: RT-09 "Engine" line and Q8 (answered).
- `docs/specs/r0-engine.md`: section 6 note, section 8.4 test names, open questions.
- JSDoc of `deriveStatus` and the comment in `apps/web/src/console/vpc/Subnets.tsx`.
