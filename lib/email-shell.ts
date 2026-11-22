// The designed email shell — the dress the sampled
// emails wear (Master view 11; BUG-134), factored out
// of lib/download.ts at the GAP-1 build (22 Nov 2026)
// so every designed email the site sends stands in the
// same skeleton: the download emails and the Contact
// acknowledgement today.
//
// Email clients strip <style> blocks and ignore modern
// layout, so the shell is a table skeleton with every
// style inline — no flex, no grid, no external assets.
// The serif stack names Newsreader first and degrades
// to Georgia where the client has none; the sans stack
// likewise falls back to Arial. The palette is the
// samples' own: forest-deep #1E402C, forest #2F5D3E,
// brass #C29A3B, brass-pale #E4CF9A, cream #FDF8E8,
// cream-soft #FBF3D9, ink #22301F, ink-soft #4A5548,
// line #E3DCC4.

export const EMAIL_SERIF = `'Newsreader', Georgia, 'Times New Roman', serif`;
export const EMAIL_SANS = `'Public Sans', Arial, Helvetica, sans-serif`;

// A composed line with its email address standing as a
// mailto link — the link form carries exactly the
// line's own words, the address swapped for its linked
// twin (the address is the line's own constant, so the
// swap can only land where the line already names it).
export function mailtoLineHtml(line: string, email: string, linkStyle: string): string {
  return line.replace(email, `<a href="mailto:${email}" style="${linkStyle}">${email}</a>`);
}

// The hairline footer both view-11-dress emails close
// with: any standing lines (already-composed HTML)
// over the name-and-domain line, inside the ruled div.
export function emailFooterHtml(input: {
  linesHtml: string;
  footerLine: string;
  wrapStyle: string;
}): string {
  const lines = input.linesHtml ? `${input.linesHtml}<br>` : "";
  return `<div style="${input.wrapStyle}">${lines}${input.footerLine}</div>`;
}

// The sign-off row: the sign-off line over the team
// line in bold, in the content column's measure.
export function emailSignOffRowHtml(signOff: string, teamLine: string): string {
  return `<tr><td style="padding:6px 30px 4px;font-size:15.5px;line-height:1.6;">${signOff}<br><strong>${teamLine}</strong></td></tr>`;
}

// View 11's document: a cream sheet on a white ground,
// the forest-deep brand band, the content cell, then
// the sign-off row and the footer row. The caller
// composes the content cell's rows and the two closing
// rows' HTML; the skeleton and its joins are fixed
// here so the dress cannot fork between emails.
export function designedEmailHtml(input: {
  contentHtml: string[];
  signOffHtml: string;
  footerHtml: string;
}): string {
  return [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0;padding:0;background-color:#FFFFFF;">`,
    `<tr><td align="center" style="padding:10px 16px 18px;">`,
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#FDF8E8;border:1px solid #E3DCC4;border-radius:12px;font-family:${EMAIL_SANS};color:#22301F;">`,
    `<tr><td style="background-color:#1E402C;color:#FDF8E8;padding:20px 30px;font-family:${EMAIL_SERIF};font-size:21px;font-weight:700;">Check My <span style="color:#E4CF9A;">Next Home</span></td></tr>`,
    `<tr><td style="padding:28px 30px 8px;">`,
    ...input.contentHtml,
    `</td></tr>`,
    input.signOffHtml,
    `<tr><td style="padding:0 30px;">${input.footerHtml}</td></tr>`,
    `</table>`,
    `</td></tr>`,
    `</table>`,
  ].join("\n");
}
