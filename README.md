# Content Integrity Audit

A tool that audits a web page on two layers: structural integrity and factual integrity. Paste a URL and the tool returns a single structured report with findings ordered by severity.

**Current version: v0.3.1 (beta)**

---

## What it does

The audit runs two layers on the page you give it.

The structural layer looks at how the content holds together: links, asset availability, internal consistency, completeness, and whether claims point users toward their supporting evidence.

The factual layer treats every specific claim as suspect by default. It verifies claims against current sources and classifies each one as verified, soft, wrong, or unverifiable, with a confidence rating and a severity. It is built to catch unsupported claims, dated figures, and statements that no source backs up.

The report combines both layers: a summary, a findings table ordered worst first, patterns across the findings, what was not audited, and recommended next steps.

---

## How to use it

**Audit a URL.** Paste a single public URL. The tool audits only that exact page. It does not crawl or scan other pages on the site. If a claim's supporting evidence lives on a different page, the claim is marked unverifiable from this page rather than wrong. Whole-site auditing is a planned later feature.

**Document audit (preview).** The interface shows a document-audit option, but it is not enabled in this version. This beta audits URLs. Document auditing is part of the tool's design and is built for a production context rather than this portfolio beta.

---

## How verification is scoped

To keep each audit fast and focused, the factual layer runs a capped number of live source checks per audit and spends them on the highest-risk claims first. When the budget is reached, remaining claims are marked unverifiable for budget reasons, which the report states plainly. A claim left unchecked for budget reasons is reported differently from a claim that failed verification.

---

## Origin

This tool grew out of an automated audit page built for an earlier research project, which scanned a site and its datasets for quality issues so readers could trust the research. That audit page was built to check page links, asset availability, dataset schemas, and data quality signals. Building it led to a larger idea: the same principle, automated checks that earn a reader's trust, could apply to any page and could interrogate the truth of the claims themselves, not only the structure around them. This tool is that larger idea built out.

---

## Versions

- **v0.3.1** — Document audit presented as a preview, not enabled in this version. URL audit is the active feature.
- **v0.3.0** — PDF document upload (later set to preview-only in this build).
- **v0.2.0** — Beta framing, capped source verification per audit, single-URL scope made explicit, clear control.
- **v0.1.0** — Initial URL audit with the two-layer report.

Planned for a production release: document and higher-volume auditing, and access control ahead of a v1.0.0 release.

---

## Status

This is a beta. It audits URLs. Limits and behavior are still being refined.
