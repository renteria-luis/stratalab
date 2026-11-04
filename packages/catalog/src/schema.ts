import { z } from 'zod';

/**
 * Catalog data model: .claude/skills/aws-console-catalog/references/data-model.md.
 * Objects are strict so a typo in a hand-transcribed JSON file fails instead of being dropped.
 * Rules that span files (ids exist, exam flags match) are consistency tests, not schema rules.
 */

const isoDateSchema = z.iso.date();
const nonEmpty = z.string().trim().min(1);

/** Stable kebab-case id: "vpc", "ec2", "aurora-and-rds". */
export const serviceIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'Expected a kebab-case service id' });

/** App route: "/vpc", "/vpc/subnets". */
export const routeSchema = z
  .string()
  .regex(/^\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/, {
    message: 'Expected an app route like /vpc/subnets',
  });

const httpsUrlSchema = z.url({ protocol: /^https$/ });

export const serviceKindSchema = z.enum(['simulated', 'reference', 'nav-only']);
export const releaseSchema = z.enum(['R0', 'R1', 'R2']);

export const serviceSchema = z
  .strictObject({
    id: serviceIdSchema,
    name: nonEmpty,
    category: nonEmpty,
    aliases: z.array(nonEmpty),
    kind: serviceKindSchema,
    release: releaseSchema.optional(),
    exam: z.strictObject({ clf: z.boolean(), saa: z.boolean() }),
    docsUrl: httpsUrlSchema.optional(),
    menuDescription: nonEmpty.optional(),
    retired: z.boolean().optional(),
    capturedOn: isoDateSchema,
  })
  .refine((service) => service.kind !== 'simulated' || service.release !== undefined, {
    message: 'A simulated service needs a release',
    path: ['release'],
  });

export const servicesFileSchema = z.strictObject({
  capturedOn: isoDateSchema,
  sources: z.array(nonEmpty).min(1),
  menu: z.strictObject({
    views: z.array(nonEmpty).min(1),
    categories: z.array(nonEmpty).min(1),
  }),
  services: z.array(serviceSchema).min(1),
});

export const examMatchSchema = z.enum(['same', 'renamed', 'feature', 'category', 'none']);

export const examEntrySchema = z
  .strictObject({
    name: nonEmpty,
    category: nonEmpty,
    match: examMatchSchema,
    serviceIds: z.array(serviceIdSchema),
    evidence: z.array(nonEmpty).min(1).optional(),
    note: nonEmpty.optional(),
  })
  .refine((entry) => (entry.match === 'none') === (entry.serviceIds.length === 0), {
    message: 'match "none" means no serviceIds, and every other match needs at least one',
    path: ['serviceIds'],
  })
  .refine((entry) => !(entry.match === 'renamed' || entry.match === 'feature') || entry.evidence, {
    message: 'A "renamed" or "feature" match needs evidence',
    path: ['evidence'],
  });

const examListSchema = z.strictObject({
  url: httpsUrlSchema,
  entries: z.array(examEntrySchema).min(1),
});

export const examScopeSchema = z.strictObject({
  copiedOn: isoDateSchema,
  clf: z.strictObject({ inScope: examListSchema, outOfScope: examListSchema }),
  saa: z.strictObject({ inScope: examListSchema, outOfScope: examListSchema }),
});

export const navTargetSchema = z.enum(['functional', 'reference', 'empty', 'service']);

export const navItemSchema = z
  .strictObject({
    label: nonEmpty,
    target: navTargetSchema,
    route: routeSchema.optional(),
    serviceId: serviceIdSchema.optional(),
    external: z.literal(true).optional(),
    badge: z.literal('New').optional(),
  })
  .refine((item) => item.target === 'service' || item.route !== undefined, {
    message: 'Every item needs a route, except one that opens another service',
    path: ['route'],
  })
  .refine((item) => (item.target === 'service') === (item.serviceId !== undefined), {
    message: 'serviceId is required for target "service" and only allowed there',
    path: ['serviceId'],
  });

export const navSectionSchema = z.strictObject({
  title: nonEmpty.optional(),
  dividerBefore: z.literal(true).optional(),
  groupingFrom: z.enum(['screenshot', 'page-text']),
  items: z.array(navItemSchema).min(1),
});

export const consoleNavSchema = z.strictObject({
  serviceId: serviceIdSchema,
  capturedOn: isoDateSchema,
  sources: z.array(nonEmpty).min(1),
  header: navItemSchema,
  filter: z.strictObject({ label: nonEmpty, placeholder: nonEmpty }).optional(),
  sections: z.array(navSectionSchema).min(1),
});

/** Sentences end with ".", "!" or "?" followed by a space or the end of the text. */
export function countSentences(text: string): number {
  return text
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter((part) => part.length > 0).length;
}

const cardTextSchema = z.strictObject({
  summary: nonEmpty.refine((summary) => countSentences(summary) <= 2, {
    message: 'A card summary has at most 2 sentences',
  }),
  examCues: z.array(nonEmpty).min(2).max(4),
  notToConfuseWith: z
    .array(z.strictObject({ serviceId: serviceIdSchema, difference: nonEmpty }))
    .min(1)
    .max(3),
  pricingModel: nonEmpty,
  sharedResponsibility: z.strictObject({
    aws: z.array(nonEmpty).min(1),
    customer: z.array(nonEmpty).min(1),
  }),
});

export const cardSchema = z.strictObject({
  serviceId: serviceIdSchema,
  status: z.union([
    z.literal('to-verify'),
    z.string().regex(/^verified \d{4}-\d{2}-\d{2}$/, {
      message: 'Expected "to-verify" or "verified YYYY-MM-DD"',
    }),
  ]),
  sources: z
    .array(z.strictObject({ url: httpsUrlSchema, title: nonEmpty, accessedOn: isoDateSchema }))
    .min(1),
  en: cardTextSchema,
  es: cardTextSchema,
});

export type Service = z.output<typeof serviceSchema>;
export type ServicesFile = z.output<typeof servicesFileSchema>;
export type ExamEntry = z.output<typeof examEntrySchema>;
export type ExamScope = z.output<typeof examScopeSchema>;
export type NavItem = z.output<typeof navItemSchema>;
export type NavSection = z.output<typeof navSectionSchema>;
export type ConsoleNav = z.output<typeof consoleNavSchema>;
export type Card = z.output<typeof cardSchema>;
