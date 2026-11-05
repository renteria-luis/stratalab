import type { HelperError, Issue } from '@sim/engine';
import type { MessageKey, MessageParams } from './translate';
import type { Translator } from './useT';

/**
 * Translates engine codes. The engine returns codes and params, never text
 * (docs/specs/r0-engine.md section 2); this is the one place that turns them into
 * `issue.<code>` and `helper.<code>` messages.
 */

const param = (params: Readonly<Record<string, string | number>>, name: string): string =>
  String(params[name] ?? '');

function issueKey(issue: Issue): MessageKey {
  const { params } = issue;
  switch (issue.code) {
    case 'IP_DUPLICATE':
      return params.kind === 'public' ? 'issue.IP_DUPLICATE.public' : 'issue.IP_DUPLICATE.private';
    case 'PUBLIC_IP_INVALID':
      switch (params.reason) {
        case 'rfc1918':
          return 'issue.PUBLIC_IP_INVALID.rfc1918';
        case 'rfc6598':
          return 'issue.PUBLIC_IP_INVALID.rfc6598';
        case 'restricted':
          return 'issue.PUBLIC_IP_INVALID.restricted';
        default:
          return 'issue.PUBLIC_IP_INVALID.vpc-cidr';
      }
    case 'SG_NAME_INVALID':
      switch (params.reason) {
        case 'empty':
          return 'issue.SG_NAME_INVALID.empty';
        case 'too-long':
          return 'issue.SG_NAME_INVALID.too-long';
        case 'sg-prefix':
          return 'issue.SG_NAME_INVALID.sg-prefix';
        default:
          return 'issue.SG_NAME_INVALID.invalid-characters';
      }
    case 'QUOTA_EXCEEDED':
      switch (params.quota) {
        case 'rules-per-security-group':
          return 'issue.QUOTA_EXCEEDED.rules-per-security-group';
        case 'rules-per-network-acl':
          return 'issue.QUOTA_EXCEEDED.rules-per-network-acl';
        default:
          return 'issue.QUOTA_EXCEEDED.security-groups-per-network-interface';
      }
    default:
      return `issue.${issue.code}`;
  }
}

const PURPOSE_KEYS: Readonly<Record<string, MessageKey>> = {
  network: 'issue.purpose.network',
  'vpc-router': 'issue.purpose.vpc-router',
  dns: 'issue.purpose.dns',
  'future-use': 'issue.purpose.future-use',
  broadcast: 'issue.purpose.broadcast',
};

/** The message of a `validate()` issue, with related IDs and enum params translated. */
export function issueMessage(issue: Issue, { t }: Translator): string {
  const { params } = issue;
  const purposeKey = PURPOSE_KEYS[param(params, 'purpose')];
  const values: MessageParams = {
    ...params,
    resourceId: issue.resource.id,
    relatedId: issue.related?.[0]?.id ?? '',
    ...(purposeKey === undefined ? {} : { purpose: t(purposeKey) }),
    ...(params.field === 'description'
      ? { field: t('issue.field.description') }
      : params.field === 'name'
        ? { field: t('issue.field.name') }
        : {}),
    ...(params.direction === 'inbound'
      ? { direction: t('issue.direction.inbound') }
      : params.direction === 'outbound'
        ? { direction: t('issue.direction.outbound') }
        : {}),
  };
  return t(issueKey(issue), values);
}

/** The message of a helper error (docs/specs/r0-engine.md sections 3.8 and 3.10). */
export function helperErrorMessage(error: HelperError, { t, tPlural }: Translator): string {
  const { params } = error;
  switch (error.code) {
    case 'IGW_HAS_PUBLIC_ADDRESSES':
      return tPlural('helper.IGW_HAS_PUBLIC_ADDRESSES', Number(params.count ?? 0), params);
    case 'INVALID_INPUT':
      return t('helper.INVALID_INPUT', {
        details: (error.issues ?? [])
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; '),
      });
    default:
      return t(`helper.${error.code}`, params);
  }
}
