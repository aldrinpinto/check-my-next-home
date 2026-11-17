// The warm-up gate (plan step M7.3 harness): Playwright
// waits for every webServer URL before running a spec, so
// this script only starts listening once it has exercised
// the journey's heavy first builds against the app on
// :4173 — the cold D29 cache fills, the first connections
// open, and the specs then measure the warm system the
// play server presents. Warm-up requests retry freely
// (this is harness, not product) and a warm-up failure
// only warns; the suite is the verdict.

import { createServer } from "node:http";

const base = "http://127.0.0.1:4173";

async function hit(path, attempts = 3) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(base + path);
      if (res.ok) return true;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  console.log(`warm-gate: ${path} did not answer cleanly — continuing; the suite is the verdict.`);
  return false;
}

for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch(base + "/");
    if (res.ok) break;
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}

const postcodes = ["CM3 2JT", "E16 1GN", "KT17 1FH", "CF11 8AA", "EH1 1AD", "CM1 6ER"];
// The heavy parallel builds first (the not-covered page's
// five-bundle read; the checking screen's three parts),
// then the plain page renders.
for (const pc of postcodes.slice(0, 4)) {
  const q = encodeURIComponent(pc);
  for (const part of ["nearby", "flood", "area"]) await hit(`/api/check/${part}?postcode=${q}`);
}
await hit(`/search/home?postcode=${encodeURIComponent("EH1 1AD")}`);
for (const pc of postcodes) {
  const q = encodeURIComponent(pc);
  await hit(`/search?postcode=${q}`);
  await hit(`/search/home?postcode=${q}`);
}
console.log("warm-gate: warm-up done — opening the gate.");

createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("warm");
}).listen(4174, "127.0.0.1");
