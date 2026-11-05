import { FAKE_ACCOUNT_ID } from '../../product';

/** The console's mark for an empty value, as captured ("–", en dash). */
export const DASH = '–';

/** Owner of every resource: the obviously fake account (AGENTS.md, branding). */
export const OWNER_ID = FAKE_ACCOUNT_ID;

export function orDash(value: string | number | null | undefined): string {
  return value === undefined || value === null || value === '' ? DASH : String(value);
}

/** "Yes" / "No", as the captured tables show booleans. */
export function yesNo(value: boolean): string {
  return value ? 'Yes' : 'No';
}

/** ARN of a VPC resource in the fake account. */
export function arn(region: string, type: string, id: string): string {
  return `arn:aws:ec2:${region}:${OWNER_ID}:${type}/${id}`;
}

/** Details panel title: "id / name", or the ID alone. */
export function titleOf(id: string, name: string | undefined): string {
  return name === undefined ? id : `${id} / ${name}`;
}
