// The digest's PDF renderer (plan step M7.14).
//
// A small, dependency-free PDF writer in the ops-script
// layer — the digest brings its own renderer because the
// report PDF machinery is M8.4's, and this step does not
// wait for it (M7.14 gap check, Section 2). When M8.4
// lands, the two share or this one is replaced; the
// digest's content and shape do not change either way.
//
// The document is DESIGNED, in the samples' design
// language: forest headings, a brass rule under the
// title, cream-warm body text on white, headline numbers
// first. A4, core Helvetica only (no font files, no
// network), text wrapped and paginated here.

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const FOREST = "0.184 0.365 0.243";
const BRASS = "0.761 0.604 0.231";
const INK = "0.13 0.13 0.13";
const MUTED = "0.38 0.38 0.38";

function escapeText(text) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

// Helvetica's average advance is close to half the font
// size for mixed prose; wrap conservatively so no line
// ever runs past the margin.
function wrap(text, fontSize) {
  const maxChars = Math.floor(CONTENT_WIDTH / (fontSize * 0.47));
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (line === "") {
      line = word;
    } else if ((line + " " + word).length <= maxChars) {
      line += " " + word;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== "") lines.push(line);
  return lines.length > 0 ? lines : [""];
}

// The document builder: title block, then sections of
// heading + lines. Lines beginning with "- " render as
// indented bullets; everything else is a paragraph line.
export function createDigestPdf({ title, subtitle, footer, sections }) {
  const pages = [];
  let ops = [];
  let y = PAGE_HEIGHT - MARGIN;

  const newPage = () => {
    pages.push(ops);
    ops = [];
    y = PAGE_HEIGHT - MARGIN;
  };
  const ensure = (height) => {
    if (y - height < MARGIN) newPage();
  };
  const textLine = (text, { font = "F1", size = 10.5, colour = INK, x = MARGIN, gap = 4 } = {}) => {
    ensure(size + gap);
    ops.push(
      `BT /${font} ${size} Tf ${colour} rg ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapeText(text)}) Tj ET`,
    );
    y -= size + gap;
  };
  const paragraph = (text, options = {}) => {
    for (const line of wrap(text, options.size ?? 10.5)) textLine(line, options);
  };

  // Title block.
  textLine(title, { font: "F2", size: 19, colour: FOREST, gap: 6 });
  ops.push(`${BRASS} rg ${MARGIN} ${y.toFixed(2)} ${CONTENT_WIDTH} 1.6 re f`);
  y -= 8;
  if (subtitle) paragraph(subtitle, { size: 10.5, colour: MUTED, gap: 10 });

  for (const section of sections) {
    y -= 8;
    ensure(30);
    textLine(section.heading, { font: "F2", size: 12.5, colour: FOREST, gap: 6 });
    for (const rawLine of section.lines) {
      if (rawLine === "") {
        y -= 6;
        continue;
      }
      if (rawLine.startsWith("- ")) {
        const wrapped = wrap(rawLine.slice(2), 10.5);
        wrapped.forEach((line, index) => {
          textLine(index === 0 ? `•  ${line}` : `    ${line}`, { x: MARGIN + 4 });
        });
      } else {
        paragraph(rawLine);
      }
    }
  }
  pages.push(ops);

  // Footer pass: one per page, added once pagination is
  // known.
  pages.forEach((pageOps, index) => {
    pageOps.push(
      `BT /F1 8 Tf ${MUTED} rg ${MARGIN} 26 Td (${escapeText(`${footer} · Page ${index + 1} of ${pages.length}`)}) Tj ET`,
    );
  });

  // Assemble the file: catalog, pages, two fonts, then a
  // page + content pair per page.
  const objects = [];
  const addObject = (body) => {
    objects.push(body);
    return objects.length; // 1-based object number
  };
  const fontRegular = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const fontBold = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageIds = [];
  const contentIds = [];
  for (const pageOps of pages) {
    const stream = pageOps.join("\n");
    contentIds.push(
      addObject(
        `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
      ),
    );
    pageIds.push(null); // filled below, order preserved
  }
  const pagesId = objects.length + pageIds.length + 1;
  pageIds.forEach((_, index) => {
    const id = addObject(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> ` +
        `/Contents ${contentIds[index]} 0 R >>`,
    );
    pageIds[index] = id;
  });
  const kids = pageIds.map((id) => `${id} 0 R`).join(" ");
  const pagesObjectNumber = addObject(
    `<< /Type /Pages /Kids [${kids}] /Count ${pageIds.length} >>`,
  );
  const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesObjectNumber} 0 R >>`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}
