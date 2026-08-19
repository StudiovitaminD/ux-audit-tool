import {
  asString,
  buildReportViewModel,
  calculateBusinessImpactMetrics,
  stringifyValue,
} from "@/lib/report-model";
import { loadStoredReport } from "@/lib/report-record";

export const runtime = "nodejs";
export const maxDuration = 300;

type ZipLike = {
  folder: (name: string) => ZipLike;
  file: (name: string, content: string | Buffer) => ZipLike;
  generateAsync: (opts: { type: "nodebuffer" }) => Promise<Buffer>;
};

function fileNameFrom(value: string) {
  return (
    value
      .replace(/[^\w\- ]+/g, "")
      .trim()
      .slice(0, 64) || "ux-audit-report"
  );
}

function xmlEscape(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeList(value: unknown, limit = 12) {
  if (Array.isArray(value)) return value.map(stringifyValue).filter(Boolean).slice(0, limit);
  return String(value ?? "")
    .split(/\n|\r|\u2022|\u2023|\u25E6|\u2027|(?<=[.!?])\s+/)
    .map((item) => item.trim().replace(/\.$/, ""))
    .filter(Boolean)
    .slice(0, limit);
}

function paragraph(text: string, style?: string) {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${styleXml}<w:r><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
}

function bulletParagraph(text: string) {
  return `<w:p><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:r><w:t xml:space="preserve">• ${xmlEscape(text)}</w:t></w:r></w:p>`;
}

function spacer() {
  return `<w:p/>`;
}

function tableCell(text: string, width: number, bold = false) {
  return `
    <w:tc>
      <w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>
      <w:p>
        <w:r>${bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>
      </w:p>
    </w:tc>
  `;
}

function table(rows: string[][], widths: number[]) {
  const header = `
    <w:tblPr>
      <w:tblW w:w="0" w:type="auto"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="D9D9D9"/>
        <w:left w:val="single" w:sz="4" w:space="0" w:color="D9D9D9"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="D9D9D9"/>
        <w:right w:val="single" w:sz="4" w:space="0" w:color="D9D9D9"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="D9D9D9"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="D9D9D9"/>
      </w:tblBorders>
    </w:tblPr>
  `;

  const body = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((cell, index) => tableCell(cell, widths[index] || 2000, rowIndex === 0))
        .join("");
      return `<w:tr>${cells}</w:tr>`;
    })
    .join("");

  return `<w:tbl>${header}${body}</w:tbl>`;
}

function buildDocxXml(report: unknown, reportId: string) {
  const vm = buildReportViewModel(report);
  const scoreRows = vm.scorecard.length ? vm.scorecard : vm.bucketResults;
  const findings = vm.findingsDetailed.slice(0, 10);
  const quickWins = vm.quickWinsTable.slice(0, 10);
  const competitors = vm.competitorAnalysis.competitors.slice(0, 6);

  const parts: string[] = [];
  parts.push(paragraph(vm.productName || "UX Audit Report", "Title"));
  parts.push(paragraph(`Report ID: ${reportId}`));
  parts.push(paragraph(`Product URL: ${vm.productUrl || "—"}`));
  parts.push(paragraph(`Generated: ${vm.generatedAt}`));
  parts.push(paragraph(`Reason: ${vm.auditReason || "—"}`));
  parts.push(spacer());

  parts.push(paragraph("Overview", "Heading1"));
  parts.push(paragraph(`Product type: ${vm.productType || vm.auditType || "UX Audit Report"}`));
  parts.push(paragraph(`Overall score: ${vm.overallScore ?? "—"}/100`));
  parts.push(paragraph(`Experiences: ${vm.overallHealth || "—"}`));
  parts.push(paragraph("Business Impact Index", "Heading2"));
  calculateBusinessImpactMetrics(vm.pillarScores).forEach((metric) => {
    parts.push(
      bulletParagraph(
        `${metric.label}: ${metric.value === null ? "—/100" : `${metric.value}/100`}`,
      ),
    );
  });
  parts.push(spacer());

  parts.push(paragraph("Score Card", "Heading1"));
  parts.push(
    table(
      [
        ["Bucket", "Score", "Health", "Risk"],
        ...scoreRows.map((row) => [
          asString(row.section || row.bucket_name || row.bucket || row.name) || "—",
          asString(row.score) || "—",
          asString(row.health) || "—",
          asString(row.risk_level || row.risk) || "—",
        ]),
      ],
      [4200, 1400, 1800, 1800],
    ),
  );
  parts.push(spacer());

  parts.push(paragraph("Summary", "Heading1"));
  parts.push(paragraph("Delight", "Heading2"));
  parts.push(paragraph(vm.sectionNarrative.delight_narrative || "Narrative not available."));
  parts.push(paragraph("Impact", "Heading2"));
  parts.push(paragraph(vm.sectionNarrative.impact_narrative || "Narrative not available."));
  parts.push(paragraph("Accessibility", "Heading2"));
  parts.push(paragraph(vm.sectionNarrative.accessibility_narrative || "Narrative not available."));
  parts.push(spacer());

  parts.push(paragraph("Competitor Analysis", "Heading1"));
  if (competitors.length) {
    parts.push(
      table(
        [
          ["Competitor", "Primary CTA"],
          ...competitors.map((item) => [
            asString(item.name) || "—",
            asString((item.signals as Record<string, unknown> | undefined)?.primary_cta) || "—",
          ]),
        ],
        [5200, 3200],
      ),
    );
  } else {
    parts.push(paragraph("No competitors captured."));
  }
  parts.push(spacer());

  parts.push(paragraph("Critical Findings", "Heading1"));
  if (!findings.length) {
    parts.push(paragraph("No critical findings were captured."));
  } else {
    findings.forEach((finding, index) => {
      parts.push(
        paragraph(
          `${index + 1}. ${asString(finding.bucket) || "Finding"} — ${asString(finding.severity) || "—"}`,
          "Heading2",
        ),
      );
      parts.push(paragraph(`What we found: ${asString(finding.what_we_found) || "—"}`));
      parts.push(paragraph(`Why it matters: ${asString(finding.why_it_matters) || "—"}`));
      parts.push(paragraph(`Recommendation: ${asString(finding.recommendation) || "—"}`));
      normalizeList(finding.acceptance_criteria, 6).forEach((item) =>
        parts.push(bulletParagraph(item)),
      );
      parts.push(spacer());
    });
  }

  parts.push(paragraph("Quick Wins & Roadmap", "Heading1"));
  if (quickWins.length) {
    parts.push(
      table(
        [
          ["Finding", "Recommendation", "ETA"],
          ...quickWins.map((item) => [
            asString(item.finding) || "—",
            asString(item.recommendation) || "—",
            asString(item.estimated_time) || "—",
          ]),
        ],
        [3000, 5000, 1100],
      ),
    );
  } else {
    parts.push(paragraph("No quick wins were captured."));
  }
  parts.push(spacer());
  parts.push(paragraph("Week 1–2", "Heading2"));
  normalizeList(vm.roadmap.week_1_2, 12).forEach((item) => parts.push(bulletParagraph(item)));
  parts.push(paragraph("Month 1", "Heading2"));
  normalizeList(vm.roadmap.month_1, 12).forEach((item) => parts.push(bulletParagraph(item)));
  parts.push(paragraph("Quarter 1", "Heading2"));
  normalizeList(vm.roadmap.quarter_1, 12).forEach((item) => parts.push(bulletParagraph(item)));
  parts.push(spacer());

  if (vm.closingNote) {
    parts.push(spacer());
    parts.push(paragraph("Closing Note", "Heading1"));
    parts.push(paragraph(vm.closingNote));
  }

  parts.push(spacer());
  parts.push(paragraph("Disclaimer", "Heading1"));
  parts.push(
    paragraph(
      "This report is based on an expert review using a structured UX Audit Framework. It provides an indicative assessment of the user experience with an estimated 70% accuracy level and is intended to guide design decisions.",
    ),
  );

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
    xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
    xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
    xmlns:v="urn:schemas-microsoft-com:vml"
    xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
    xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
    xmlns:w10="urn:schemas-microsoft-com:office:word"
    xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
    xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
    xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
    xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
    xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
    mc:Ignorable="w14 wp14">
    <w:body>
      ${parts.join("\n")}
      <w:sectPr>
        <w:pgSz w:w="12240" w:h="15840"/>
        <w:pgMar w:top="1440" w:right="1080" w:bottom="1440" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/>
      </w:sectPr>
    </w:body>
  </w:document>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
      <w:name w:val="Normal"/>
      <w:qFormat/>
      <w:rPr>
        <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
        <w:sz w:val="22"/>
      </w:rPr>
    </w:style>
    <w:style w:type="paragraph" w:styleId="Title">
      <w:name w:val="Title"/>
      <w:basedOn w:val="Normal"/>
      <w:qFormat/>
      <w:rPr>
        <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
        <w:b/>
        <w:sz w:val="36"/>
      </w:rPr>
    </w:style>
    <w:style w:type="paragraph" w:styleId="Heading1">
      <w:name w:val="heading 1"/>
      <w:basedOn w:val="Normal"/>
      <w:qFormat/>
      <w:rPr><w:b/><w:sz w:val="28"/></w:rPr>
    </w:style>
    <w:style w:type="paragraph" w:styleId="Heading2">
      <w:name w:val="heading 2"/>
      <w:basedOn w:val="Normal"/>
      <w:qFormat/>
      <w:rPr><w:b/><w:sz w:val="24"/></w:rPr>
    </w:style>
  </w:styles>`;
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const id = params.id;
    if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

    const loaded = await loadStoredReport(id);
    if (!loaded) return Response.json({ error: "Not found" }, { status: 404 });

    const report = loaded.report;
    const vm = buildReportViewModel(report);
    const filename = `${fileNameFrom(asString(vm.productName) || "ux-audit-report")}.docx`;
    const xml = buildDocxXml(report, id);

    const mod = (await import("jszip")) as unknown as { default?: new () => ZipLike };
    const ZipCtor = mod.default ?? (mod as unknown as new () => ZipLike);
    const zip = new ZipCtor();

    zip.file(
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
        <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
        <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
        <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
      </Types>`,
    );

    zip.folder("_rels").file(
      ".rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
        <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
        <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
      </Relationships>`,
    );

    zip.folder("word").file("document.xml", xml);
    zip.folder("word").file("styles.xml", stylesXml());
    zip.folder("word").folder("_rels").file(
      "document.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
      </Relationships>`,
    );

    zip.folder("docProps").file(
      "core.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
        xmlns:dc="http://purl.org/dc/elements/1.1/"
        xmlns:dcterms="http://purl.org/dc/terms/"
        xmlns:dcmitype="http://purl.org/dc/dcmitype/"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <dc:title>${xmlEscape(vm.productName || "UX Audit Report")}</dc:title>
        <dc:creator>UX Audit Tool</dc:creator>
      </cp:coreProperties>`,
    );
    zip.folder("docProps").file(
      "app.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
        xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
        <Application>UX Audit Tool</Application>
      </Properties>`,
    );

    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "DOCX generation failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
