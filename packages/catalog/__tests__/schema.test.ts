import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cards, consoleNavs, examScope, servicesFile } from '../src/data';
import {
  cardSchema,
  countSentences,
  examEntrySchema,
  navItemSchema,
  serviceSchema,
} from '../src/schema';

const jsonStems = (folder: string) =>
  readdirSync(new URL(`../data/${folder}/`, import.meta.url))
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.slice(0, -'.json'.length))
    .sort();

describe('data files parse and are registered', () => {
  it('CAT-01: services.json, exam-scope.json and every nav file parse with their schemas', () => {
    // src/data.ts parses at import time; reaching this line means every file parsed.
    expect(servicesFile.services.length).toBeGreaterThan(0);
    expect(examScope.clf.inScope.entries.length).toBeGreaterThan(0);
    expect(Object.keys(consoleNavs).length).toBeGreaterThan(0);
  });

  it('CAT-01: every file in data/nav is registered under its file name', () => {
    expect(Object.keys(consoleNavs).sort()).toEqual(jsonStems('nav'));
    for (const [stem, nav] of Object.entries(consoleNavs)) expect(nav.serviceId).toBe(stem);
  });

  it('CAT-01: every file in data/cards is registered under its file name', () => {
    expect(cards.map((card) => card.serviceId).sort()).toEqual(jsonStems('cards'));
  });
});

const service = {
  id: 'example',
  name: 'Example',
  category: 'Compute',
  aliases: [],
  kind: 'nav-only',
  exam: { clf: false, saa: false },
  capturedOn: '2026-11-03',
};

describe('service schema', () => {
  it('CAT-04: a simulated service needs a release', () => {
    expect(serviceSchema.safeParse({ ...service, kind: 'simulated' }).success).toBe(false);
    expect(serviceSchema.safeParse({ ...service, kind: 'simulated', release: 'R0' }).success).toBe(
      true,
    );
  });

  it('CAT-01: unknown keys are rejected, so transcription typos fail', () => {
    expect(serviceSchema.safeParse({ ...service, catgory: 'Compute' }).success).toBe(false);
  });

  it('CAT-02: ids are kebab-case', () => {
    expect(serviceSchema.safeParse({ ...service, id: 'Example' }).success).toBe(false);
    expect(serviceSchema.safeParse({ ...service, id: 'aurora-and-rds' }).success).toBe(true);
  });
});

describe('nav item schema', () => {
  it('CAT-05: every item needs a route unless it opens another service', () => {
    expect(navItemSchema.safeParse({ label: 'Subnets', target: 'functional' }).success).toBe(false);
    expect(
      navItemSchema.safeParse({ label: 'Subnets', target: 'functional', route: '/vpc/subnets' })
        .success,
    ).toBe(true);
  });

  it('CAT-02: target "service" requires a serviceId and other targets reject one', () => {
    expect(navItemSchema.safeParse({ label: 'AWS Global View', target: 'service' }).success).toBe(
      false,
    );
    expect(
      navItemSchema.safeParse({
        label: 'AWS Global View',
        target: 'service',
        serviceId: 'global-view',
      }).success,
    ).toBe(true);
    expect(
      navItemSchema.safeParse({
        label: 'Subnets',
        target: 'empty',
        route: '/vpc/subnets',
        serviceId: 'vpc',
      }).success,
    ).toBe(false);
  });
});

describe('exam entry schema', () => {
  const entry = { name: 'Amazon EBS', category: 'Storage' };

  it('CAT-09: "none" has no serviceIds and every other match has at least one', () => {
    expect(examEntrySchema.safeParse({ ...entry, match: 'none', serviceIds: [] }).success).toBe(
      true,
    );
    expect(
      examEntrySchema.safeParse({ ...entry, match: 'none', serviceIds: ['ec2'] }).success,
    ).toBe(false);
    expect(examEntrySchema.safeParse({ ...entry, match: 'same', serviceIds: [] }).success).toBe(
      false,
    );
  });

  it('CAT-09: "renamed" and "feature" need evidence', () => {
    expect(
      examEntrySchema.safeParse({ ...entry, match: 'feature', serviceIds: ['ec2'] }).success,
    ).toBe(false);
    expect(
      examEntrySchema.safeParse({
        ...entry,
        match: 'feature',
        serviceIds: ['ec2'],
        evidence: ['capture:2026-11-03/ec2-1.png'],
      }).success,
    ).toBe(true);
  });
});

describe('card schema', () => {
  const text = {
    summary: 'Stores objects in buckets. Scales without capacity planning.',
    examCues: ['cue one', 'cue two'],
    notToConfuseWith: [{ serviceId: 'efs', difference: 'File system, not objects.' }],
    pricingModel: 'Storage used, requests and data transfer out.',
    sharedResponsibility: { aws: ['Hardware'], customer: ['Bucket policies'] },
  };
  const card = {
    serviceId: 's3',
    status: 'to-verify',
    sources: [
      { url: 'https://docs.aws.amazon.com/s3/', title: 'Amazon S3', accessedOn: '2026-11-04' },
    ],
    en: text,
    es: text,
  };

  it('CAT-06: a complete card parses', () => {
    expect(cardSchema.safeParse(card).success).toBe(true);
  });

  it('CAT-06: a card needs at least one source and both languages', () => {
    expect(cardSchema.safeParse({ ...card, sources: [] }).success).toBe(false);
    const withoutEs = Object.fromEntries(Object.entries(card).filter(([key]) => key !== 'es'));
    expect(cardSchema.safeParse(withoutEs).success).toBe(false);
  });

  it('CAT-06: a summary has at most 2 sentences', () => {
    const long = { ...text, summary: 'One. Two. Three.' };
    expect(cardSchema.safeParse({ ...card, en: long }).success).toBe(false);
    expect(countSentences('One sentence only.')).toBe(1);
    expect(countSentences('Uses v2.0 of the API. Done.')).toBe(2);
  });

  it('CAT-06: status is "to-verify" or "verified YYYY-MM-DD"', () => {
    expect(cardSchema.safeParse({ ...card, status: 'verified 2026-11-04' }).success).toBe(true);
    expect(cardSchema.safeParse({ ...card, status: 'verified' }).success).toBe(false);
  });
});
