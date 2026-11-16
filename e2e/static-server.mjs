// M7.1 — the smallest static server for the Playwright specs:
// it serves the static export (out/) exactly as the play site
// does, with directory index files and a 404 page. No
// dependencies — Node's http module only — so the harness adds
// nothing to the install beyond Playwright itself.

import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
const PORT = 4173;

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".woff2": "font/woff2",
};

async function resolveFile(pathname) {
  const relative = normalize(decodeURIComponent(pathname))
    .replace(/^[/\\]+/, "")
    .replace(/[/\\]+$/, "");
  const candidate = join(OUT_DIR, relative);
  // The export writes a page as <route>.html beside a <route>/
  // directory holding its data files, so a directory request
  // resolves to the sibling .html (the play site's own rule),
  // falling back to an index.html inside the directory.
  const attempts = [candidate, join(candidate, "index.html"), `${candidate}.html`];
  for (const attempt of attempts) {
    const info = await stat(attempt).catch(() => null);
    if (info?.isFile()) return attempt;
  }
  return null;
}

const server = createServer(async (request, response) => {
  const { pathname } = new URL(request.url ?? "/", "http://127.0.0.1");
  const file = await resolveFile(pathname);
  if (file === null) {
    const notFound = await readFile(join(OUT_DIR, "404.html")).catch(() => null);
    response.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    response.end(notFound ?? "Not found");
    return;
  }
  const body = await readFile(file);
  response.writeHead(200, {
    "content-type": CONTENT_TYPES[extname(file)] ?? "application/octet-stream",
  });
  response.end(body);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`e2e static server: http://127.0.0.1:${PORT} serving ${OUT_DIR}`);
});
