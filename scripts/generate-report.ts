import fs from "fs";
import { db } from "@/db";
import { exhibitions, museums } from "@/db/schema";
import { eq, gte, isNull, or, and } from "drizzle-orm";
import { sql } from "drizzle-orm";

const SITE_URL = "https://goseeartsf.com";
const REPORT_PATH = "/tmp/scraper-report.html";
const LOGS_PATH = "/tmp/scraper-output.txt";
const RUN_START_PATH = "/tmp/scraper-run-start.txt";

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function main() {
  const runStartRaw = fs.existsSync(RUN_START_PATH)
    ? fs.readFileSync(RUN_START_PATH, "utf8").trim()
    : null;
  const cutoff = runStartRaw
    ? new Date(runStartRaw)
    : (() => { const d = new Date(); d.setMinutes(d.getMinutes() - 30); return d; })();

  // New exhibitions inserted during this run
  const newExhibitions = await db
    .select({
      id: exhibitions.id,
      slug: exhibitions.slug,
      title: exhibitions.title,
      description: exhibitions.description,
      image: exhibitions.image,
      imageCredit: exhibitions.imageCredit,
      artist: exhibitions.artist,
      startDate: exhibitions.startDate,
      endDate: exhibitions.endDate,
      link: exhibitions.link,
      createdAt: exhibitions.createdAt,
      museumName: museums.name,
    })
    .from(exhibitions)
    .innerJoin(museums, eq(exhibitions.museumId, museums.id))
    .where(gte(exhibitions.createdAt, cutoff));

  // All active exhibitions missing image, imageCredit, or description
  const missingContent = await db
    .select({
      id: exhibitions.id,
      slug: exhibitions.slug,
      title: exhibitions.title,
      image: exhibitions.image,
      imageCredit: exhibitions.imageCredit,
      description: exhibitions.description,
      link: exhibitions.link,
      museumName: museums.name,
    })
    .from(exhibitions)
    .innerJoin(museums, eq(exhibitions.museumId, museums.id))
    .where(
      and(
        eq(exhibitions.hidden, false),
        or(
          isNull(exhibitions.image),
          isNull(exhibitions.imageCredit),
          isNull(exhibitions.description)
        )
      )
    );

  const rawLogs = fs.existsSync(LOGS_PATH)
    ? fs.readFileSync(LOGS_PATH, "utf8")
    : "No output captured.";

  // Extract error/warning lines from the FULL log (before any truncation)
  const errorLines = rawLogs
    .split("\n")
    .filter((l) => /\b(error|warning|failed)\b/i.test(l) && !/^\s*[→✓]/.test(l))
    .slice(0, 50);

  const hasNew = newExhibitions.length > 0;
  const hasMissing = missingContent.length > 0;
  const hasErrors = errorLines.length > 0;

  const statusEmoji = hasErrors || hasMissing ? "⚠️" : hasNew ? "🆕" : "✅";
  const missingDescriptions = missingContent.filter((ex) => !ex.description).length;
  const missingImages = missingContent.filter((ex) => !ex.image).length;
  const missingCredits = missingContent.filter((ex) => !ex.imageCredit).length;

  const subjectParts = [`${newExhibitions.length} new`];
  if (missingImages) subjectParts.push(`🚨 ${missingImages} no image`);
  if (missingDescriptions) subjectParts.push(`❓ ${missingDescriptions} no description`);
  if (missingCredits) subjectParts.push(`⚠️ ${missingCredits} no credit`);
  const subjectLine = `${statusEmoji} Scraper report — ${subjectParts.join(", ")}`;

  function formatDate(d: string | null): string {
    if (!d) return "?";
    return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  const metaSection = `
<p style="font-size:13px;color:#777;margin:0 0 24px;padding:10px 14px;background:#f9f9f9;border-radius:4px;border-left:3px solid #ccc;">
  Run started: <strong>${runStartRaw ?? "unknown (timestamp file missing)"}</strong><br>
  Showing exhibitions created after: <strong>${cutoff.toISOString()}</strong>
</p>`;

  const errorsSection = hasErrors
    ? `
<h2 style="color:#b91c1c;">🔴 Errors &amp; warnings in logs</h2>
<pre style="background:#fff5f5;border:1px solid #fca5a5;padding:12px;border-radius:4px;font-size:12px;white-space:pre-wrap;overflow-x:auto;">${esc(errorLines.join("\n"))}</pre>
`
    : "";

  const newSection = hasNew
    ? `
<h2>🆕 New Exhibitions (${newExhibitions.length})</h2>
${newExhibitions
  .map((ex) => {
    const imageFlag = !ex.image ? " 🚨 <strong>NO IMAGE</strong>" : "";
    const creditFlag = !ex.imageCredit ? " ⚠️ <strong>no credit</strong>" : "";
    const descFlag = !ex.description ? " ❓ <strong>no description</strong>" : "";
    const dates =
      ex.startDate || ex.endDate
        ? `${formatDate(ex.startDate)} – ${formatDate(ex.endDate)}`
        : "dates unknown";
    const siteUrl = `${SITE_URL}/exhibitions/${ex.slug}`;
    return `
<div style="border:1px solid #ddd;border-radius:6px;padding:16px;margin-bottom:16px;">
  <p style="margin:0 0 4px;font-size:18px;font-weight:bold;">
    <a href="${esc(siteUrl)}" style="color:#1a0dab;text-decoration:none;">${esc(ex.title)}</a>
  </p>
  <p style="margin:0 0 8px;color:#555;font-size:14px;">${esc(ex.museumName)} &nbsp;·&nbsp; ${dates}${ex.artist ? ` &nbsp;·&nbsp; ${esc(ex.artist)}` : ""}</p>
  ${ex.image ? `<img src="${esc(ex.image)}" alt="" style="max-width:400px;border-radius:4px;display:block;margin-bottom:8px;">` : ""}
  <p style="margin:4px 0;font-size:13px;color:#444;">${imageFlag}${creditFlag}${descFlag}${ex.imageCredit ? ` &nbsp; Credit: ${esc(ex.imageCredit)}` : ""}</p>
  ${ex.description
    ? `<p style="margin:8px 0 0;font-size:14px;color:#333;line-height:1.5;">${esc(ex.description)}</p>`
    : `<p style="color:#b45309;font-size:13px;font-style:italic;margin:8px 0 0;">❓ No description — check logs for Claude errors above.</p>`}
  <p style="margin:8px 0 0;"><a href="${esc(siteUrl)}" style="font-size:13px;color:#1a0dab;">View on site →</a></p>
</div>`;
  })
  .join("")}
`
    : `<h2>🆕 New Exhibitions</h2><p style="color:#666;">None this run.</p>`;

  const missingSection = hasMissing
    ? `
<h2>🚨 Missing Content (${missingContent.length} exhibitions)</h2>
<table style="width:100%;border-collapse:collapse;font-size:13px;">
  <thead>
    <tr style="background:#f5f5f5;">
      <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #ddd;">Exhibition</th>
      <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #ddd;">Museum</th>
      <th style="text-align:center;padding:6px 8px;border-bottom:1px solid #ddd;">Image</th>
      <th style="text-align:center;padding:6px 8px;border-bottom:1px solid #ddd;">Credit</th>
      <th style="text-align:center;padding:6px 8px;border-bottom:1px solid #ddd;">Description</th>
    </tr>
  </thead>
  <tbody>
    ${missingContent
      .map((ex) => {
        const siteUrl = `${SITE_URL}/exhibitions/${ex.slug}`;
        return `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;"><a href="${esc(siteUrl)}" style="color:#1a0dab;">${esc(ex.title)}</a></td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;color:#555;">${esc(ex.museumName)}</td>
      <td style="text-align:center;padding:6px 8px;border-bottom:1px solid #eee;">${ex.image ? "✅" : "🚨"}</td>
      <td style="text-align:center;padding:6px 8px;border-bottom:1px solid #eee;">${ex.imageCredit ? "✅" : "⚠️"}</td>
      <td style="text-align:center;padding:6px 8px;border-bottom:1px solid #eee;">${ex.description ? "✅" : "❓"}</td>
    </tr>`;
      })
      .join("")}
  </tbody>
</table>
`
    : `<h2>🚨 Missing Content</h2><p style="color:#666;">All exhibitions have images, credits, and descriptions. ✅</p>`;

  // Show last 80 lines of raw logs (no <details> — Gmail doesn't render it)
  const logLines = rawLogs.split("\n");
  const truncatedLogs = logLines.length > 80
    ? `[showing last 80 of ${logLines.length} lines]\n\n` + logLines.slice(-80).join("\n")
    : rawLogs;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Scraper Report</title></head>
<body style="font-family:system-ui,sans-serif;max-width:760px;margin:0 auto;padding:24px;color:#111;">
<h1 style="font-size:22px;margin-bottom:4px;">Go See Art SF — Scraper Report</h1>
<p style="color:#666;margin-top:0;">${new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} PT</p>

${metaSection}

${errorsSection}

${newSection}

${missingSection}

<hr style="margin:32px 0;border:none;border-top:1px solid #eee;">
<h3 style="font-size:14px;color:#555;margin-bottom:8px;">📋 Raw scraper logs</h3>
<pre style="background:#f8f8f8;padding:16px;border-radius:4px;font-size:11px;overflow-x:auto;white-space:pre-wrap;">${esc(truncatedLogs)}</pre>
</body>
</html>`;

  fs.writeFileSync(REPORT_PATH, html, "utf8");
  fs.writeFileSync("/tmp/scraper-subject.txt", subjectLine, "utf8");

  console.log(`Report written to ${REPORT_PATH}`);
  console.log(`Subject: ${subjectLine}`);
}

main().catch((e) => {
  console.error("Report generation failed:", e);
  process.exit(1);
});
