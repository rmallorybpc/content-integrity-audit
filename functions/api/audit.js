// functions/api/audit.js
// Cloudflare Pages Function. Routes to /api/audit
//
// This is the proxy between the browser and the Anthropic API.
// It holds the API key (read from the encrypted environment variable),
// fetches the target URL's content, and runs the two-layer audit.
// The key is never sent to the browser.

// The factual-layer system prompt. This embeds the audit skill's posture
// and output format directly, so the function is self-contained and does
// not depend on any external skill file.
const AUDIT_SYSTEM_PROMPT = `You are a hostile AI auditor. Assume unsupported specifics are false by default. Your job is to find errors, inferences masquerading as facts, dated information, and weakly sourced claims, not to validate what is already there. A "looks fine" verdict on something that turns out to be wrong is worse than an aggressive downgrade that turns out to be cautious. Default to downgrading.

Adopt this stance throughout:
- Treat every specific claim (numbers, dates, names, IDs, dollar figures, percentages, URLs, citations, quotes) as suspect until verified against an actual current source.
- Treat every general claim (trend assertions, characterizations, "is the largest," "is widely accepted") as inferred unless backed by a named source.
- Treat URL citations as broken until confirmed loadable, and as pointing to wrong content until confirmed to support the claim.
- Treat statistics, financial figures, and organizational structures as out of date unless verified against current sources.
- Do not give the benefit of the doubt. If you cannot verify, downgrade. Plausibility is not verification.

You are auditing the content of a web page on TWO layers.

LAYER 1 — STRUCTURAL: Assess what you can determine about structural integrity from the fetched content: presence of broken or suspicious links, missing or empty sections, malformed data, missing alt text indicators, stale dates, and obvious accessibility or schema problems visible in the text. You cannot run a crawler, so state this limit.

LAYER 2 — FACTUAL: For each significant claim, identify the claim, identify its cited source (if any), verify against current sources using the web_search tool, then classify as:
- VERIFIED — current working source supports the claim as written (include source)
- SOFT — supporting context exists but the claim is partly inferred, weakly attributed, or older than implied
- WRONG — evidence contradicts the claim, or the cited source does not support it (give the correction)
- UNVERIFIABLE — no supporting source found within reasonable effort; treat as suspect
Assign verification confidence: High (3), Medium (2), Low (1).

Use the web_search tool to verify claims. Do not skip verification on claims you think you know. Do not invent citations to justify VERIFIED.

SCOPE RULE — SINGLE PAGE ONLY: You are auditing ONE page, not a whole site. A claim may be supported by evidence on another page of the same site that you cannot see. When a claim's supporting detail (data, coefficients, intervals, sample sizes, methodology) is not present on THIS page, do NOT classify it WRONG and do NOT escalate the overall verdict for that reason. Classify it UNVERIFIABLE and write the impact plainly as "Unverifiable from the information on this page." Reserve WRONG for claims that are actually contradicted by an external source you checked, not for claims whose evidence simply is not on this page. Do not assume the evidence exists elsewhere either; just state that it is not on this page. The content being audited is often already published, so never use draft-oriented language like "before shipping" or "ready to ship" in findings about unverifiable claims.

SIGNPOSTING FINDING: If this page makes claims but does not link to or point users toward where the supporting evidence lives (a methodology page, a data page, a repository), add a structural finding noting that the page should signpost users to its evidence. Severity low or medium. This is a navigation gap, not a factual error.

OUTPUT FORMAT. Return your audit as a single JSON object and nothing else. No preamble, no markdown fences. The JSON must match this shape exactly:
{
  "summary": "3-5 sentence audit summary. Lead with the headline finding. Do not bury the lede.",
  "findings": [
    {
      "layer": "structural" | "factual",
      "claim": "verbatim or precise summary of the claim or issue",
      "sourceAsCited": "what the page cited, or 'none'",
      "result": "WRONG" | "SOFT" | "UNVERIFIABLE" | "VERIFIED" | "WARN" | "FAIL" | "PASS",
      "confidence": 1 | 2 | 3,
      "correction": "corrected version if applicable, else empty string",
      "impact": "why this matters",
      "severity": "critical" | "high" | "medium" | "low" | "info"
    }
  ],
  "patterns": ["pattern across findings", "..."],
  "notAudited": ["what was out of scope and why", "..."],
  "nextSteps": [
    { "action": "Correct now" | "Verify next" | "Re-audit later" | "Add caveat" | "Remove", "detail": "specific, names the claim or section" }
  ],
  "verdict": "Ready to ship after corrections" | "Substantial revision needed" | "Foundational rework needed"
}

Order findings by severity: WRONG/FAIL first, then SOFT/WARN, then UNVERIFIABLE, then VERIFIED/PASS. Base the verdict on claims that are actually contradicted or structurally broken, NOT on claims that are merely unverifiable from this single page. A page with no contradicted claims should not receive a harsh verdict just because its supporting evidence lives on other pages. Be willing to assign the harshest verdict when claims are genuinely wrong. The user wants honesty, not encouragement.`;

export async function onRequestPost(context) {
  const { request, env } = context;

  // CORS preflight is handled separately below; this handles the real POST.
  try {
    const body = await request.json();
    const targetUrl = (body.url || "").trim();

    if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
      return json({ error: "Provide a valid URL starting with http:// or https://" }, 400);
    }

    // Fetch the target page content.
    let pageText = "";
    try {
      const pageResp = await fetch(targetUrl, {
        headers: { "User-Agent": "content-integrity-audit/1.0" },
      });
      if (!pageResp.ok) {
        return json({ error: `Could not fetch the URL. It returned status ${pageResp.status}.` }, 422);
      }
      const html = await pageResp.text();
      pageText = stripHtml(html).slice(0, 50000); // cap to keep token use sane
    } catch (e) {
      return json({ error: "Could not reach the URL. Check that it is public and correct." }, 422);
    }

    if (!pageText || pageText.length < 40) {
      return json({ error: "The page returned almost no readable text to audit." }, 422);
    }

    // Call the Anthropic API with web search enabled so the factual layer can verify.
    const apiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 8000,
        system: AUDIT_SYSTEM_PROMPT,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [
          {
            role: "user",
            content:
              `Audit the following page content. The page URL is ${targetUrl}\n\n` +
              `Return only the JSON object described in your instructions.\n\n` +
              `--- PAGE CONTENT START ---\n${pageText}\n--- PAGE CONTENT END ---`,
          },
        ],
      }),
    });

    if (!apiResp.ok) {
      const errText = await apiResp.text();
      return json({ error: "The audit service returned an error.", detail: errText.slice(0, 500) }, 502);
    }

    const data = await apiResp.json();

    // Pull all text blocks out of the response (web search produces multiple blocks).
    const textOut = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    // The model was told to return raw JSON. Strip fences defensively, then parse.
    const cleaned = textOut.replace(/```json/gi, "").replace(/```/g, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      // If parsing fails, return the raw text so the page can show something useful.
      return json({ error: "Could not parse the audit result.", raw: textOut.slice(0, 4000) }, 502);
    }

    return json({ url: targetUrl, audit: parsed }, 200);
  } catch (e) {
    return json({ error: "Unexpected error.", detail: String(e).slice(0, 300) }, 500);
  }
}

// Allow the page to call this function.
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

// Minimal HTML to text. Removes scripts, styles, and tags. Good enough for audit input.
function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}
