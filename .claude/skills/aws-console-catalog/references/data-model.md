# Catalog data model

Package: `packages/catalog`. Pure TypeScript and JSON data, no React. Schemas use Zod; the web app imports typed data from here.

## Files

```text
packages/catalog/
  src/schema.ts                  Zod schemas below
  src/data.ts                    loads and validates every data file
  src/search.ts                  search index builder and menu grouping
  src/index.ts                   typed exports
  data/services.json             every service shown in the services menu and search
  data/exam-scope.json           copy of the official in-scope and out-of-scope lists, with the date copied
  data/nav/<serviceId>.json      side navigation, one file per console we reproduce
  data/cards/<serviceId>.json    reference cards
  data/capture-notes.md          what the captures don't show, unmatched names, open questions
  __tests__/                     schema and consistency tests
docs/console-capture/<YYYY-MM-DD>/   screenshots and page-text copies (gitignored)
```

Every file in `data/nav/` and `data/cards/` must be registered in `src/data.ts`; a test fails if one isn't.

## Schemas (shape, not final code)

```ts
ServicesFile = {
  capturedOn: string               // YYYY-MM-DD of the capture folder
  sources: string[]                // capture file names this file was transcribed from
  menu: {
    views: string[]                // top of the services menu: "Recently visited", "Favorites", ...
    categories: string[]           // menu order, as captured
  }
  services: Service[]              // order of the "All services" page
}

Service = {
  id: string                       // kebab-case and stable: "vpc", "ec2", "macie"
  name: string                     // official name as shown in the console capture
  category: string                 // console category as captured (one of menu.categories)
  aliases: string[]                // other official names: docs home, exam lists, capture text
  kind: "simulated" | "reference" | "nav-only"
  release?: "R0" | "R1" | "R2"     // required when kind is "simulated"
  exam: { clf: boolean; saa: boolean }   // derived from exam-scope.json in-scope lists
  docsUrl?: string                 // docs landing page from https://docs.aws.amazon.com/; absent when no entry matches
  menuDescription?: string         // the one-line description the services menu shows, when captured
  retired?: boolean
  capturedOn: string               // date of the capture this entry came from
}

ExamScope = {
  copiedOn: string
  clf: { inScope: ExamList; outOfScope: ExamList }
  saa: { inScope: ExamList; outOfScope: ExamList }
}

ExamList = { url: string; entries: ExamEntry[] }

ExamEntry = {
  name: string                     // verbatim from the AWS page
  category: string                 // the page's heading, verbatim
  match: "same" | "renamed" | "feature" | "category" | "none"
  serviceIds: string[]             // console services this entry points to
  evidence?: string[]              // doc URLs or "capture:<file>"; required for "renamed" and "feature"
  note?: string
}
```

`match` values:
- `same`: the console shows the same service under a short form (drops or adds a prefix or qualifier, uses the abbreviation, or combines two services in one entry such as "Aurora and RDS").
- `renamed`: the console shows a different name; evidence must show the rename.
- `feature`: part of another console (EBS in EC2, PrivateLink in VPC); evidence must show it.
- `category`: the entry covers a whole console category (SAA out of scope: "Internet of Things: All services").
- `none`: no console entry in the current capture. `serviceIds` is empty.

A service's `exam.clf` / `exam.saa` is true when any in-scope entry of that exam lists its id.

```ts
ConsoleNav = {
  serviceId: string
  capturedOn: string
  sources: string[]
  header: NavItem                  // the clickable title, e.g. "EC2", "VPC dashboard"
  filter?: { label: string; placeholder: string }   // e.g. VPC's "Filter by VPC"
  sections: {
    title?: string                 // untitled groups are top-level links
    dividerBefore?: true           // a divider line precedes the group
    groupingFrom: "screenshot" | "page-text"   // page-text: grouping inferred, not seen
    items: NavItem[]
  }[]
}

NavItem = {
  label: string
  target: "functional" | "reference" | "empty" | "service"
  route?: string                   // required unless target is "service"
  serviceId?: string               // required when target is "service": opens that service
  external?: true                  // the console shows the external-link icon
  badge?: "New"
}

Card = {
  serviceId: string
  status: "to-verify" | `verified ${string}`
  sources: { url: string; title: string; accessedOn: string }[]   // at least one
  en: CardText
  es: CardText
}

CardText = {
  summary: string                  // at most 2 sentences
  examCues: string[]               // 2 to 4 scenario signals, in our own words
  notToConfuseWith: { serviceId: string; difference: string }[]   // 1 to 3
  pricingModel: string             // what you pay for, never prices
  sharedResponsibility: { aws: string[]; customer: string[] }
}
```

## Tests that must exist

Test names start with the rule ID.

- `CAT-01` Every data file parses with its Zod schema (strict: unknown keys fail), and every file in `data/nav/` and `data/cards/` is registered.
- `CAT-02` Service ids are unique kebab-case. Every `serviceId` in nav files, exam entries and cards exists in `services.json`.
- `CAT-03` Every service category is one of `menu.categories`, and every category has at least one service.
- `CAT-04` Every `simulated` service has a `release`, a nav file and at least one functional route.
- `CAT-05` Every nav item has a route (unless it opens another service), routes are unique within a console, and every `functional` route exists in the app (in `apps/web` once the router exists).
- `CAT-06` Every card has at least one source, both `en` and `es`, and a summary of at most 2 sentences.
- `CAT-07` `retired` services never appear in the menu or in search results.
- `CAT-08` Search: the exact name, the short name and every alias find the service, and results are stable for the same query.
- `CAT-09` `exam` flags in `services.json` match `exam-scope.json`, and exam entries follow the `match` rules.
