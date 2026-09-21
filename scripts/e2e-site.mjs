#!/usr/bin/env node
/*
 * Load every page of the site in a real browser and check it actually works.
 *
 * This exists because bionic-docs shipped with a single missing function
 * definition in demo.js: the whole IIFE threw a ReferenceError at load, so
 * none of the page wiring ran — no hero emphasis, no samples, no demo, no
 * reader, no divider. Every other gate passed anyway. Tests covered the core
 * algorithm and the e2e suite drove the built extension, but nothing ever
 * loaded the site's own JavaScript, and a syntax-level failure is invisible to
 * a static check.
 *
 * So: navigation must produce no uncaught error on any page, and the pages
 * that carry interactive furniture must actually respond to interaction.
 *
 * Run:  node scripts/e2e-site.mjs [baseUrl]
 *       Default base is the local server at http://127.0.0.1:8778/<repo>/site
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

/* Chrome lives in different places per platform. If none is present the check
   is skipped rather than failing the build on an environment difference. */
const CHROME = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean).find((candidate) => existsSync(candidate));

if (!CHROME) {
  console.log("e2e-site: no Chrome found (set CHROME_PATH); skipping");
  process.exit(0);
}
const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const repo = root.split("/").pop();

const pages = readdirSync(join(root, "site"))
  .filter((name) => name.endsWith(".html"))
  .sort();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".pdf": "application/pdf",
  ".epub": "application/epub+zip",
};

/* A server of our own, so this runs the same way locally and in CI and does
   not depend on the site being reachable at any particular path. */
function serve(dir) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const path = decodeURIComponent((req.url || "/").split("?")[0]);
      const file = join(dir, path === "/" ? "index.html" : path);
      try {
        const body = readFileSync(file);
        res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end("not found");
      }
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

let base = process.argv[2] || "";
let server = null;
if (!base) {
  const started = await serve(join(root, "site"));
  server = started.server;
  base = `http://127.0.0.1:${started.port}/`;
}

let ws;
async function connect() {
  const port = 9100 + Math.floor(Math.random() * 800);
  const chrome = spawn(
    CHROME,
    [
      `--remote-debugging-port=${port}`,
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      `--user-data-dir=/tmp/opencode/site-e2e-${port}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  for (let i = 0; i < 100; i++) {
    try {
      ws = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl;
      return chrome;
    } catch {
      await sleep(200);
    }
  }
  throw new Error("chrome did not start");
}

const chrome = await connect();
const sock = new WebSocket(ws);
await new Promise((res, rej) => {
  sock.onopen = res;
  sock.onerror = rej;
});

let id = 0;
const pending = new Map();
let errors = [];
sock.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
  if (m.method === "Runtime.exceptionThrown") {
    const d = m.params.exceptionDetails;
    const where = d.url ? ` (${d.url.split("/").pop()}:${d.lineNumber + 1})` : "";
    errors.push(`${d.exception?.description?.split("\n")[0] || d.text}${where}`);
  }
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
    errors.push(`console.error: ${m.params.args.map((a) => a.value ?? a.description).join(" ")}`.slice(0, 200));
  }
};
const send = (method, params = {}, sessionId) =>
  new Promise((res) => {
    const mid = ++id;
    pending.set(mid, res);
    sock.send(JSON.stringify({ id: mid, method, params, sessionId }));
  });

const { result: target } = await send("Target.createTarget", { url: "about:blank" });
const { result: attached } = await send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
const sid = attached.sessionId;
await send("Page.enable", {}, sid);
await send("Runtime.enable", {}, sid);
await send(
  "Emulation.setDeviceMetricsOverride",
  { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false },
  sid,
);
const ev = (expr) =>
  send("Runtime.evaluate", { expression: expr, returnByValue: true }, sid).then(
    (r) => (r.result?.exceptionDetails ? undefined : r.result?.result?.value),
  );

let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
};

/* Poll an expression until it is true. The headline writes itself in and the
   switch needs its own script to have arrived, so on a cold cache both are
   moving targets: sampling them once races the thing being measured. */
async function waitFor(expr, timeout = 7000) {
  const until = Date.now() + timeout;
  for (;;) {
    if (await ev(expr)) return true;
    if (Date.now() > until) return false;
    await sleep(120);
  }
}

/* Clicking does nothing until the wiring has run. Drive the switch to the state
   we want and stop as soon as it is there, rather than clicking once and hoping. */
async function setFixation(on) {
  const want = on ? null : "off";
  for (let i = 0; i < 15; i++) {
    if ((await ev(`document.documentElement.getAttribute("data-fixation")`)) === want) return true;
    await ev(`document.querySelector(".nav__fix")?.click()`);
    await sleep(180);
  }
  return (await ev(`document.documentElement.getAttribute("data-fixation")`)) === want;
}

for (const page of pages) {
  errors = [];
  await send("Page.navigate", { url: `${base}${page}` }, sid);
  await sleep(2200);
  console.log(`\n${page}`);
  check("no uncaught javascript error", errors.length === 0, errors.slice(0, 3).join(" | "));

  /* The theme picker is on every page and is pure wiring. */
  const picker = await ev(`document.querySelectorAll(".theme-pick__btn").length`);
  if (picker) {
    check("theme picker has three states", picker === 3, `found ${picker}`);
    const before = await ev(`document.documentElement.getAttribute("data-theme")`);
    await ev(`(function(){var b=[...document.querySelectorAll('.theme-pick__btn')].find(x=>x.dataset.themeChoice==='dark');if(b)b.click()})()`);
    await sleep(150);
    const after = await ev(`document.documentElement.getAttribute("data-theme")`);
    check("choosing dark applies it", after === "dark" && after !== before, `data-theme=${after}`);
    await ev(`window.localStorage.removeItem(${JSON.stringify(repo + "-theme")})`);
    await sleep(80);
  }

  /* The emphasis switch: it must actually switch, and it must remember. */
  const hasSwitch = await ev(`document.querySelector(".nav__fix") ? 1 : 0`);
  if (hasSwitch) {
    const state = await ev(`(function(){
      var s=document.querySelector('.nav__fix');
      return s.getAttribute('role')+'/'+s.getAttribute('aria-checked')+'/'+s.getAttribute('aria-label');
    })()`);
    check("emphasis switch is a switch, on by default", String(state).startsWith("switch/true"), state);

    const weight = `(function(){var b=document.querySelector('b.bp-head');return b?Math.round(getComputedStyle(b).fontWeight):-1})()`;
    const on = await ev(weight);
    await setFixation(false);
    const attr = await ev(`document.documentElement.getAttribute("data-fixation")`);
    const off = await ev(weight);
    /* Off is not "400". It is "no treatment": every head is back at the weight
       it would have had anyway, which is whatever it inherits — 600 in a
       heading, 400 in a paragraph. Asserting a number would have missed a head
       sitting in a heading and keeping the heading's own weight. */
    const unrestored = await ev(`(function(){
      var bad=[];
      document.querySelectorAll("b.bp-head").forEach(function(b){
        var own=Math.round(getComputedStyle(b).fontWeight);
        var base=Math.round(getComputedStyle(b.parentElement).fontWeight);
        if(own!==base) bad.push(b.textContent.slice(0,10)+" "+own+"!="+base);
      });
      return bad.slice(0,4).join(" | ");
    })()`);
    check("switching it off removes the emphasis", attr === "off" && unrestored === "", `data-fixation=${attr}, head ${on} -> ${off}; ${unrestored || "every head is back at its inherited weight"}`);

    /* A one-letter word is never split into a head and a tail, so it stays a
       bare text node and keeps whatever weight it inherits — 600, in a heading.
       Resetting only the wrapped runs left exactly that word emphasised. Off
       has to mean the headline reads at one weight. */
    const uniform = await ev(`(function(){
      var t=document.querySelector(".hero__title-fix")||document.querySelector(".hero__title");
      if(!t) return "";
      var w=new Set(), walk=document.createTreeWalker(t,NodeFilter.SHOW_TEXT), n;
      while(n=walk.nextNode()){
        if(!n.nodeValue.trim()) continue;
        w.add(getComputedStyle(n.parentElement).fontWeight);
      }
      return [...w].join(",");
    })()`);
    if (uniform) {
      check("nothing is left emphasised in the headline", String(uniform).split(",").length === 1, `weights left in the headline: ${uniform}`);
    }

    /* It is stored, so a reload has to keep it — and a client-side navigation
       must not lose it either. */
    await send("Page.navigate", { url: `${base}${page}` }, sid);
    await sleep(1900);
    const persisted = await ev(`document.documentElement.getAttribute("data-fixation")`);
    check("the choice survives a reload", persisted === "off", `data-fixation=${persisted}`);
    await setFixation(true);
    const back = await ev(`document.documentElement.getAttribute("data-fixation")`);
    check("switching it back on restores it", back === null, `data-fixation=${back}`);
    errors = [];
  }

  /* Fixation samples must be real markup, not plain text. */
  const samples = await ev(
    `[...document.querySelectorAll("[data-bionic-sample]")].map(e=>e.querySelectorAll("b.bp-head").length).join(",")`,
  );
  if (samples !== undefined && samples !== "") {
    const counts = samples.split(",").map(Number);
    check("every sample is emphasised", counts.every((n) => n > 0), `heads per sample: ${samples}`);
  }

  /* The headline writes itself in, so its weight is a moving value until the
     write has finished. Wait for it to settle rather than sampling the wave. */
  await waitFor(`(function(){
    var b=document.querySelector(".hero__title b.bp-head");
    if(!b || Math.round(getComputedStyle(b).fontWeight)<600) return false;
    /* The write is an animation, so wait for it to finish rather than
       sampling a frame of it. */
    var running = b.getAnimations ? b.getAnimations().filter(function(a){return a.playState==="running"}) : [];
    return running.length === 0;
  })()`);

  /* The hero headline must genuinely emphasise, and at the real weight. */
  const hero = await ev(`(function(){
    var h=document.querySelector('.hero__title');
    if(!h) return null;
    var b=h.querySelector('b.bp-head');
    if(!b) return 'no heads';
    var cs=getComputedStyle(b);
    return JSON.stringify({n:h.querySelectorAll('b.bp-head').length, w:cs.fontWeight, stroke:cs.webkitTextStrokeWidth, cls:h.className});
  })()`);
  if (hero && hero !== "no heads") {
    const h = JSON.parse(hero);
    check("hero emphasises at the real weight", Number(h.w) >= 600 && h.stroke === "0px", `weight ${h.w}, stroke ${h.stroke}, ${h.n} heads`);
    check("hero has no duplicate copy", h.cls.includes("is-read") || h.cls.includes("is-written") || h.cls.includes("is-read"), h.cls);
  } else if (hero === "no heads") {
    check("hero emphasises at the real weight", false, "no fixation heads in the hero");
  }

  /* The live demo, where present. */
  const hasDemo = await ev(`document.getElementById("demo-out") ? 1 : 0`);
  if (hasDemo) {
    const heads = await ev(`document.querySelectorAll("#demo-out b.bp-head").length`);
    check("demo renders emphasised text", heads > 0, `${heads} heads`);
    /* Intensity must move the output in the default mode, too. */
    await ev(`(function(){var b=[...document.querySelectorAll('#demo-modes button')].find(x=>x.dataset.mode==='half');if(b)b.click()})()`);
    await sleep(150);
    const charCount = `(function(){var h=[...document.querySelectorAll('#demo-out b.bp-head')];return h.reduce((a,b)=>a+b.textContent.length,0)})()`;
    await ev(`(function(){var s=document.getElementById('intensity');s.value=20;s.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    await sleep(150);
    const low = await ev(charCount);
    await ev(`(function(){var s=document.getElementById('intensity');s.value=90;s.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    await sleep(150);
    const high = await ev(charCount);
    check("intensity changes the default mode", Number(high) > Number(low), `0.2 -> ${low} chars, 0.9 -> ${high} chars`);
    await ev(`(function(){var s=document.getElementById('intensity');s.value=50;s.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  }

  /* The compare divider, where present. */
  const hasCompare = await ev(`document.querySelector(".compare") ? 1 : 0`);
  if (hasCompare) {
    await ev(`document.querySelector(".compare").scrollIntoView({block:"center"})`);
    /* Scrolling is smooth, so the element is still travelling when we first
       look: wait until it has arrived instead of measuring it mid-flight. */
    await waitFor(`(function(){
      var r=document.querySelector(".compare").getBoundingClientRect();
      return r.top>12 && r.bottom<window.innerHeight-12;
    })()`);
    await sleep(120);
    const rect = JSON.parse(
      await ev(`(function(){var r=document.querySelector('.compare').getBoundingClientRect();return JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height})})()`),
    );
    const y = rect.y + rect.h / 2;
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.x + rect.w / 2, y, button: "left", buttons: 1, clickCount: 1 }, sid);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: rect.x + rect.w * 0.72, y, button: "left", buttons: 1 }, sid);
    await sleep(150);
    const p = await ev(`getComputedStyle(document.querySelector('.compare')).getPropertyValue('--p')`);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.x + rect.w * 0.72, y, button: "left", buttons: 0 }, sid);
    check("divider follows a drag", String(p).trim().startsWith("7"), `--p=${String(p).trim()} after dragging to 72%`);
  }

  /* The reader, where present. */
  const hasReader = await ev(`document.querySelector(".reader, [data-reader]") ? 1 : 0`);
  if (hasReader) {
    const state = await ev(`(function(){
      var r=document.querySelector('.reader, [data-reader]');
      return JSON.stringify({text:(r.textContent||'').replace(/\\s+/g,' ').trim().slice(0,40), heads:r.querySelectorAll('b.bp-head').length});
    })()`);
    const s = JSON.parse(state || "{}");
    check("reader shows a document", (s.text || "").length > 10, s.text);
  }
}

console.log(`\n${failures === 0 ? "e2e-site: all checks passed" : `e2e-site: ${failures} failure(s)`} across ${pages.length} pages`);
sock.close();
chrome.kill();
if (server) server.close();
process.exit(failures === 0 ? 0 : 1);
