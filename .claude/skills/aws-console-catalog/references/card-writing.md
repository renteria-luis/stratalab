# Writing a reference card

A card helps a learner recognize a service in an exam question and in the console. It must be short, original and correct.

## Rules

1. Check the official in-scope lists first (`data/exam-scope.json`). In-scope services get cards before the rest.
2. Look up every fact in AWS docs with the AWS documentation MCP tool, and list each page in `sources`.
3. Write in your own words. Don't copy text from AWS pages, exam guides or exam-prep sites. Never use leaked exam questions.
4. Use plain language. The summary has at most 2 sentences. No marketing words ("powerful", "seamless").
5. `examCues`: describe the situation a question would present, then name the service. Keep them general; they are study hints, not an answer key.
6. `notToConfuseWith`: 1 to 3 services people mix up with this one, each with a one-line difference.
7. `pricingModel`: say what you pay for (per hour, per GB, per request, per resource) and compare in relative terms. Never put prices on cards; prices change.
8. `sharedResponsibility`: two short lists, what AWS handles and what the customer handles.
9. Write `en` first, then `es` (Latin American Spanish). Keep official service names in English in both.
10. Keep `status: "to-verify"` until a second pass re-checks every fact against the sources. Then set `verified YYYY-MM-DD`.
11. Work in batches of about 20 cards, ordered by exam relevance. Stop and show the batch before starting the next one.

## Example (shows the format; its facts still need verification)

```json
{
  "serviceId": "macie",
  "status": "to-verify",
  "sources": [
    { "url": "https://docs.aws.amazon.com/macie/latest/user/what-is-macie.html", "title": "What is Amazon Macie?", "accessedOn": "YYYY-MM-DD" },
    { "url": "https://aws.amazon.com/macie/pricing/", "title": "Amazon Macie pricing", "accessedOn": "YYYY-MM-DD" }
  ],
  "en": {
    "summary": "Finds and reports sensitive data, such as personal or financial information, stored in Amazon S3. It uses machine learning and pattern matching.",
    "examCues": [
      "Automatically discover personal data in S3 buckets → Macie",
      "Check S3 contents for data-privacy compliance without manual review → Macie"
    ],
    "notToConfuseWith": [
      { "serviceId": "guardduty", "difference": "GuardDuty detects threats and suspicious activity; it doesn't classify the data inside your buckets." },
      { "serviceId": "inspector", "difference": "Inspector scans workloads for software vulnerabilities and network exposure, not data in S3." }
    ],
    "pricingModel": "You pay for the S3 buckets it monitors and for the amount of data it inspects.",
    "sharedResponsibility": {
      "aws": ["Runs and scales the service and its detection models"],
      "customer": ["Chooses which buckets to analyze", "Reviews findings and fixes exposed data"]
    }
  },
  "es": {
    "summary": "Encuentra y reporta datos sensibles, como datos personales o financieros, guardados en Amazon S3. Usa machine learning y coincidencia de patrones.",
    "examCues": [
      "Descubrir datos personales en buckets de S3 de forma automática → Macie",
      "Revisar el contenido de S3 por cumplimiento de privacidad sin revisión manual → Macie"
    ],
    "notToConfuseWith": [
      { "serviceId": "guardduty", "difference": "GuardDuty detecta amenazas y actividad sospechosa; no clasifica los datos dentro de tus buckets." },
      { "serviceId": "inspector", "difference": "Inspector escanea cargas de trabajo en busca de vulnerabilidades de software y exposición de red, no datos en S3." }
    ],
    "pricingModel": "Pagas por los buckets de S3 que monitorea y por la cantidad de datos que inspecciona.",
    "sharedResponsibility": {
      "aws": ["Opera y escala el servicio y sus modelos de detección"],
      "customer": ["Elige qué buckets analizar", "Revisa los hallazgos y corrige los datos expuestos"]
    }
  }
}
```
