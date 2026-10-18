#!/usr/bin/env bun
/**
 * Browser end-to-end test over the DevTools Protocol.
 *
 * Serves the built extension pages plus the generated fixtures over HTTP,
 * opens reader.html?src=/sample.pdf and ?src=/sample.epub in real Chrome, and
 * asserts that fixation wrappers appear and the text is the expected document.
 *
 *   bun run e2e
 *
 * Requires a local Chrome (set CHROME_PATH to override) and dist/chrome built.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist", "chrome");
const FIXTURES = join(ROOT, "fixtures");
const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9733;
const DEBUG_PORT = 9734;

if (!existsSync(join(DIST, "manifest.json"))) {
  console.error("dist/chrome missing; run `bun run build` first");
  process.exit(1);
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".pdf": "application/pdf",
  ".epub": "application/epub+zip",
};

function fileFor(pathname) {
  if (pathname.startsWith("/sample.")) return join(FIXTURES, pathname.slice(1));
  return join(DIST, pathname.slice(1) === "" ? "reader.html" : pathname.slice(1));
}

const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname === "/" ? "/reader.html" : url.pathname;
    const abs = fileFor(path);
    const file = Bun.file(abs);
    if (!(await file.exists())) return new Response("not found", { status: 404 });
    const ext = path.slice(path.lastIndexOf("."));
    return new Response(file, { headers: { "content-type": TYPES[ext] ?? "application/octet-stream" } });
  },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--autoplay-policy=no-user-gesture-required",
    `--remote-debugging-port=${DEBUG_PORT}`,
    "--user-data-dir=/tmp/bp-docs-e2e-profile",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let rpcId = 0;
function rpc(sock, method, params = {}) {
  const id = ++rpcId;
  return new Promise((resolve) => {
    const onMessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id === id) {
        sock.removeEventListener("message", onMessage);
        resolve(message);
      }
    };
    sock.addEventListener("message", onMessage);
    sock.send(JSON.stringify({ id, method, params }));
    setTimeout(() => resolve({ timeout: true }), 10000);
  });
}

async function pageSocket() {
  for (let i = 0; i < 40; i += 1) {
    await sleep(250);
    try {
      const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
  }
  return null;
}

async function waitFor(sock, expression, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await rpc(sock, "Runtime.evaluate", { expression, returnByValue: true });
    const value = res?.result?.result?.value;
    if (value) return value;
    await sleep(500);
  }
  return 0;
}

async function main() {
  const ws = await pageSocket();
  if (!ws) throw new Error("no Chrome page target");
  const sock = new WebSocket(ws);
  await new Promise((res, rej) => {
    sock.addEventListener("open", res, { once: true });
    sock.addEventListener("error", rej, { once: true });
  });
  await rpc(sock, "Page.enable");
  await rpc(sock, "Runtime.enable");

  const results = [];

  // ── PDF ──────────────────────────────────────────────────────────────────
  await rpc(sock, "Page.navigate", { url: `http://localhost:${PORT}/reader.html?src=/sample.pdf` });
  const pdfHeads = await waitFor(sock, "document.querySelectorAll('.bp-head').length", 20000);
  const pdfText = await rpc(sock, "Runtime.evaluate", {
    // The reader now renders the Contents panel and key hint before the document,
    // so the assertion has to read the document container rather than the body.
    expression: "(document.getElementById(\"doc\")?.innerText ?? \"\").slice(0, 200)",
    returnByValue: true,
  });
  const pdfInfo = await rpc(sock, "Runtime.evaluate", {
    expression: `JSON.stringify((() => {
      const sheet = document.querySelector('.pdf-sheet');
      const first = document.querySelector('.pdf-text-layer span');
      const head = document.querySelector('.pdf-text-layer .bp-head');
      return {
        heads: document.querySelectorAll('.bp-head').length,
        pages: document.querySelectorAll('.pdf-page').length,
        spans: document.querySelectorAll('.pdf-text-layer span').length,
        canvases: document.querySelectorAll('.pdf-canvas').length,
        firstLeft: first && sheet ? first.offsetLeft / sheet.clientWidth : -1,
        headColor: head ? getComputedStyle(head).color : '',
        position: document.getElementById('position')?.textContent ?? ''
      };
    })())`,
    returnByValue: true,
  });
  let pdf = {};
  try {
    pdf = JSON.parse(pdfInfo?.result?.result?.value ?? "{}");
  } catch {
    pdf = {};
  }
  results.push(["PDF: fixation wrappers rendered", pdfHeads > 0]);
  results.push(["PDF: both pages present", pdf.pages === 2]);
  results.push(["PDF: positioned text spans present", (pdf.spans ?? 0) >= 3]);
  results.push(["PDF: page canvas present", (pdf.canvases ?? 0) >= 1]);
  results.push(["PDF: text keeps its page position", Math.abs((pdf.firstLeft ?? -1) - 72 / 612) < 0.02]);
  results.push([
    "PDF: bold heads are visible",
    typeof pdf.headColor === "string" && pdf.headColor !== "" && pdf.headColor !== "rgba(0, 0, 0, 0)" && pdf.headColor !== "transparent",
  ]);
  results.push([
    "PDF: extracted text is the document",
    typeof pdfText?.result?.result?.value === "string" && pdfText.result.result.value.includes("Bionic reading works in PDF"),
  ]);
  results.push(["PDF: position shows the page count", String(pdf.position ?? "").includes("PDF")]);

  // Changing the mode re-applies fixation; the fitted text must not move or change width.
  const widths = () =>
    rpc(sock, "Runtime.evaluate", {
      expression: `JSON.stringify({
        right: document.querySelector('.pdf-text-layer span')?.getBoundingClientRect().right ?? -1,
        heads: document.querySelectorAll('.pdf-text-layer .bp-head').length,
        text: document.querySelector('.pdf-text-layer span')?.textContent ?? ''
      })`,
      returnByValue: true,
    }).then((r) => JSON.parse(r?.result?.result?.value ?? "{}"));
  const before = await widths();
  await rpc(sock, "Runtime.evaluate", {
    expression: `(() => {
      const select = document.getElementById('mode');
      const other = Array.from(select.options).find((o) => o.value !== select.value);
      select.value = other.value;
      select.dispatchEvent(new Event('change'));
    })()`,
  });
  await sleep(600);
  const after = await widths();
  results.push([
    "PDF: changing the mode keeps text in place",
    before.right > 0 && Math.abs(after.right - before.right) < 1 && after.text === before.text && after.heads > 0,
  ]);
  await rpc(sock, "Runtime.evaluate", {
    expression: `(() => {
      const select = document.getElementById('mode');
      select.value = ${JSON.stringify("half")};
      select.dispatchEvent(new Event('change'));
    })()`,
  });
  await sleep(400);

  const shot = await rpc(sock, "Page.captureScreenshot", { format: "png" });
  if (shot?.result?.data) {
    await Bun.write("/tmp/bp-docs-pdf.png", Buffer.from(shot.result.data, "base64"));
    console.log("screenshot -> /tmp/bp-docs-pdf.png");
  }

  // Click "next" to prove navigation does not throw, then check the diagram page.
  await rpc(sock, "Runtime.evaluate", { expression: "document.getElementById('next')?.click()" });
  await sleep(300);
  const page2Canvas = await waitFor(
    sock,
    "!!document.querySelectorAll('.pdf-page')[1]?.querySelector('.pdf-canvas') && !!document.querySelectorAll('.pdf-page')[1]?.querySelector('.pdf-text-layer')",
    15000,
  );
  results.push(["PDF: page two canvas and text layer built", Boolean(page2Canvas)]);
  const diagramInfo = await rpc(sock, "Runtime.evaluate", {
    expression: `JSON.stringify((() => {
      const page = document.querySelectorAll('.pdf-page')[1];
      const canvas = page?.querySelector('.pdf-canvas');
      if (!canvas) return {};
      const ctx = canvas.getContext('2d');
      const sx = canvas.width / 612;
      const sy = canvas.height / 792;
      // Pixel inside the blue box (PDF point 350,420), and a region where the red label glyphs would be.
      const box = ctx.getImageData(Math.round(350 * sx), Math.round((792 - 420) * sy), 1, 1).data;
      const label = ctx.getImageData(Math.round(90 * sx), Math.round((792 - 497) * sy), Math.round(120 * sx), Math.round(20 * sy)).data;
      let red = 0;
      for (let i = 0; i < label.length; i += 4) if (label[i] > 200 && label[i + 1] < 60 && label[i + 2] < 60) red += 1;
      const span = Array.from(page.querySelectorAll('.pdf-text-layer span')).find((s) => (s.textContent ?? '').includes('Diagram label'));
      return {
        blue: box[2] > box[0] + 80 && box[2] > 150,
        redOnCanvas: red,
        labelColor: span ? getComputedStyle(span).color : ''
      };
    })())`,
    returnByValue: true,
  });
  let diagram = {};
  try {
    diagram = JSON.parse(diagramInfo?.result?.result?.value ?? "{}");
  } catch {
    diagram = {};
  }
  results.push(["PDF: diagram is painted on the canvas", diagram.blue === true]);
  results.push(["PDF: label glyphs are not doubled on the canvas", diagram.redOnCanvas === 0]);
  results.push(["PDF: label keeps its color", diagram.labelColor === "rgb(255, 0, 0)"]);
  await rpc(sock, "Runtime.evaluate", {
    expression: "document.querySelectorAll('.pdf-page')[1]?.scrollIntoView({ behavior: 'instant', block: 'start' })",
  });
  await sleep(400);
  const shot2 = await rpc(sock, "Page.captureScreenshot", { format: "png" });
  if (shot2?.result?.data) {
    await Bun.write("/tmp/bp-docs-pdf-page2.png", Buffer.from(shot2.result.data, "base64"));
    console.log("screenshot -> /tmp/bp-docs-pdf-page2.png");
  }

  // ── EPUB ─────────────────────────────────────────────────────────────────
  await rpc(sock, "Page.navigate", { url: `http://localhost:${PORT}/reader.html?src=/sample.epub` });
  const epubHeads = await waitFor(sock, "document.querySelectorAll('.bp-head').length", 20000);
  const epubInfo = await rpc(sock, "Runtime.evaluate", {
    expression: `JSON.stringify({
      heads: document.querySelectorAll('.bp-head').length,
      chapters: document.querySelectorAll('.epub-chapter').length,
      title: document.querySelector('.epub-title')?.textContent ?? '',
      position: document.getElementById('position')?.textContent ?? '',
      text: (document.getElementById("doc")?.innerText ?? "").slice(0, 160)
    })`,
    returnByValue: true,
  });
  let epub = {};
  try {
    epub = JSON.parse(epubInfo?.result?.result?.value ?? "{}");
  } catch {
    epub = {};
  }
  results.push(["EPUB: fixation wrappers rendered", epubHeads > 0]);
  results.push(["EPUB: chapter rendered", (epub.chapters ?? 0) >= 1]);
  results.push(["EPUB: title parsed", String(epub.title ?? "").length > 0]);
  results.push([
    "EPUB: chapter text is the document",
    typeof epub.text === "string" && epub.text.includes("Chapter One"),
  ]);
  results.push(["EPUB: position shows chapter count", String(epub.position ?? "").includes("/")]);

  await rpc(sock, "Runtime.evaluate", { expression: "document.getElementById('next')?.click()" });
  await sleep(400);
  const advanced = await rpc(sock, "Runtime.evaluate", {
    expression: "document.querySelector('.epub-title')?.textContent ?? ''",
    returnByValue: true,
  });
  results.push(["EPUB: next moves to chapter two", String(advanced?.result?.result?.value ?? "").includes("Two")]);

  let failed = 0;
  for (const [name, ok] of results) {
    console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
    if (!ok) failed += 1;
  }
  console.log(`e2e: ${results.length - failed}/${results.length} checks passed`);

  sock.close();
  proc.kill();
  server.stop(true);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error("e2e error:", error?.message ?? error);
  proc.kill();
  server.stop(true);
  process.exitCode = 1;
});
