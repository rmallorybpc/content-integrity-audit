# content-integrity-audit

Dual-layer content audit tool that audits any URL or uploaded document and returns a structured, severity-ranked report.

## Purpose

The project evaluates content on two layers:

- **Structural integrity:** broken links, missing assets, schema coverage, accessibility, and data freshness
- **Factual integrity:** claims classified as **VERIFIED**, **SOFT**, **WRONG**, or **UNVERIFIABLE**, each with severity verdicts

## Phases

- **Phase 1:** URL audit
- **Phase 2:** document upload support
