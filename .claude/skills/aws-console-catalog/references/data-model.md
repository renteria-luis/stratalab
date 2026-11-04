# Catalog data model

Package: `packages/catalog`. Pure TypeScript and JSON data, no React. Schemas use Zod; the web app imports typed data from here.

## Files

```text
packages/catalog/
  src/schema.ts                  Zod schemas below
  src/index.ts                   typed exports and the search index builder
  data/services.json             every service shown in the services menu and search
  data/exam-scope.json           copy of the official in-scope lists, with the date copied
  data/nav/<serviceId>.json      side navigation, one file per console we reproduce
  data/cards/<serviceId>.json    reference cards
  __tests__/                     schema and consistency tests
docs/console-capture/<YYYY-MM-DD>/   screenshots (gitignored)
```

## Schemas (shape, not final code)

```ts
Service = {
  id: string                       // kebab-case and stable: "vpc", "ec2", "macie"
  name: string                     // official name as shown in the console capture
  category: string                 // console category as captured
  aliases: string[]                // what people type in search: "s3", "bucket"
  kind: "simulated" | "reference" | "nav-only"
  release?: "R0" | "R1" | "R2"     // required when kind is "simulated"
  exam: { clf: boolean; saa: boolean }   // from exam-scope.json
  docsUrl: string                  // official documentation landing page
  retired?: boolean
  capturedOn: string               // date of the capture this entry came from
}

ExamScope = {
  copiedOn: string
  clf: { url: string; services: string[] }
  saa: { url: string; services: string[]; outOfScopeUrl: string; outOfScope: string[] }
}

ConsoleNav = {
  serviceId: string
  capturedOn: string
  sections: {
    title?: string                 // some consoles have unlabeled groups
    items: { label: string; target: "functional" | "reference" | "empty"; route?: string }[]
  }[]
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

- Every data file parses with its Zod schema.
- Service ids are unique. Every `serviceId` in nav files and cards exists in `services.json`.
- Every `simulated` service has a `release` and at least one functional route.
- Every nav item with `target: "functional"` has a route that exists in the app.
- Every card has at least one source, both `en` and `es`, and a summary of at most 2 sentences.
- `retired` services never appear in the menu or in search results.
- Search: the exact name, the short name and every alias find the service, and results are stable for the same query.
- `exam` flags in `services.json` match `exam-scope.json`.
