/*
 * bionic-docs — art and interaction.
 *
 * One canvas piece: a stack of document edges with a reading band moving
 * through it, so the footer reads as an archive being worked through rather
 * than as a paragraph. Plus the headline, which is revealed top to bottom by
 * a highlight that sweeps down the block.
 *
 * Offline, colour-read from the design tokens, and static under
 * prefers-reduced-motion.
 */
(function () {
  "use strict";

  var reduce = false;
  try {
    reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (err) {
    /* ignore */
  }

  /* ---- colour ---------------------------------------------------------- */

  function parseColor(value) {
    var v = String(value || "").trim();
    var hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
      var h = hex[1];
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
      ];
    }
    var rgb = v.match(/^rgba?\(([^)]+)\)$/i);
    if (rgb) {
      var parts = rgb[1].split(/[,\s/]+/).filter(Boolean);
      return [Number(parts[0]) || 0, Number(parts[1]) || 0, Number(parts[2]) || 0];
    }
    return null;
  }

  function rgba(value, alpha) {
    var c = parseColor(value);
    if (!c) return "rgba(0,0,0," + alpha + ")";
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + alpha + ")";
  }

  function tokens() {
    var cs = getComputedStyle(document.documentElement);
    function read(name, fallback) {
      var v = cs.getPropertyValue(name).trim();
      return v || fallback;
    }
    return {
      accent: read("--accent", "#0f766e"),
      ink: read("--ink", "#0a0a0a"),
      mute: read("--mute", "#71717a"),
      hair: read("--hairline", "#e6e6e8"),
    };
  }

  /* ---- deterministic noise --------------------------------------------- */

  function hash(n) {
    var x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
    x ^= x >>> 13;
    x = Math.imul(x, 0xc2b2ae35);
    x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  }

  /* ---- canvas harness --------------------------------------------------- */

  function mint(canvas, paint) {
    var ctx = canvas.getContext("2d");
    if (!ctx) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0;
    var h = 0;
    var palette = tokens();
    var t = 0;
    var last = 0;
    var visible = true;

    function resize() {
      var rect = canvas.getBoundingClientRect();
      w = Math.max(1, Math.round(rect.width));
      h = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      palette = tokens();
      if (reduce) paint(ctx, w, h, 8, palette);
    }

    function step(now) {
      if (visible && !document.hidden && now - last >= 32) {
        last = now;
        t += 1 / 30;
        paint(ctx, w, h, t, palette);
      }
      window.requestAnimationFrame(step);
    }

    resize();

    if (reduce) {
      window.addEventListener("resize", resize, { passive: true });
      return;
    }

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        function (entries) {
          visible = entries[0] ? entries[0].isIntersecting : true;
        },
        { rootMargin: "120px" },
      ).observe(canvas);
    }

    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener(
      "themechange",
      function () {
        palette = tokens();
      },
      { passive: true },
    );
    window.requestAnimationFrame(step);
  }

  /* ---- the stack --------------------------------------------------------
     Rows of document edges. A band descends through them; whatever it is over
     is drawn fixed (head bold, tail faint), everything else is a plain rule.
     The stack is forked from a hash, so it is identical on every reload. */

  function stack(ctx, w, h, t, p) {
    ctx.clearRect(0, 0, w, h);

    var pad = 16;
    var rows = Math.max(6, Math.floor((h - pad * 2) / 7.5));
    var bandH = (h - pad * 2) / rows;

    /* One descent takes about seven seconds, with a beat at each end. */
    var cycle = 7.2;
    var phase = (t % cycle) / cycle;
    var eased = phase < 0.5 ? 2 * phase * phase : 1 - Math.pow(-2 * phase + 2, 2) / 2;
    var bandY = pad + (h - pad * 2) * eased;
    var influence = bandH * 5;

    /* The reading band itself, soft at both edges. */
    var grad = ctx.createLinearGradient(0, bandY - influence, 0, bandY + influence);
    grad.addColorStop(0, rgba(p.accent, 0));
    grad.addColorStop(0.5, rgba(p.accent, 0.14));
    grad.addColorStop(1, rgba(p.accent, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(0, bandY - influence, w, influence * 2);

    for (var row = 0; row < rows; row++) {
      var top = pad + row * bandH;
      var y = top + bandH / 2;
      var indent = pad + hash(row * 3 + 1) * w * 0.16;
      var right = w - pad - hash(row * 7 + 5) * w * 0.1;
      var closeness = Math.max(0, 1 - Math.abs(y - bandY) / influence);
      var fixed = closeness > 0.34;

      /* The page edge: a tick down the left of the row, and a folded corner
         on every seventh page. */
      ctx.fillStyle = rgba(p.hair, 0.9);
      ctx.fillRect(indent - 5, top + 1, 1, bandH - 2);
      if (row % 7 === 3) {
        ctx.fillStyle = rgba(p.hair, 0.9);
        ctx.fillRect(right - 4, top + 1, 4, 1);
        ctx.fillRect(right - 1, top + 1, 1, 4);
      }

      /* Three short lines of "text" per page. */
      var lines = 2 + (hash(row * 11 + 2) > 0.55 ? 1 : 0);
      for (var k = 0; k < lines; k++) {
        var lx = indent + 3;
        var ly = top + 2 + (k + 1) * (bandH / (lines + 1));
        var span = (right - indent - 8) * (0.42 + hash(row * 17 + k * 5 + 7) * 0.52);
        var head = span * (0.3 + hash(row * 23 + k * 9 + 13) * 0.3);

        if (fixed) {
          var solid = 0.42 + 0.58 * closeness;
          ctx.fillStyle = rgba(p.ink, solid * 0.55);
          ctx.fillRect(lx + head, ly, Math.max(1, span - head), 2);
          ctx.fillStyle = rgba(p.ink, solid);
          ctx.fillRect(lx, ly, Math.max(1, head), 2);
        } else {
          ctx.fillStyle = rgba(p.mute, 0.2);
          ctx.fillRect(lx, ly, Math.max(1, span), 2);
        }
      }
    }

    /* Grain, so the surface is paper and not a chart. */
    for (var g = 0; g < rows * 3; g++) {
      var gx = hash(g * 13 + 3) * w;
      var gy = hash(g * 29 + 9) * h;
      ctx.fillStyle = rgba(p.ink, 0.035);
      ctx.fillRect(gx, gy, 1, 1);
    }
  }

  /* ---- boot ------------------------------------------------------------- */

  function headline() {
    var title = document.querySelector(".hero__title");
    if (!title) return;
    var fix = title.querySelector(".hero__title-fix");
    if (!fix) return;

    function measure() {
      title.style.setProperty("--hl-travel", title.clientHeight + "px");
    }
    measure();
    window.addEventListener("resize", measure, { passive: true });

    if (reduce) {
      title.classList.add("is-read");
      return;
    }

    title.classList.add("is-reading");
    fix.addEventListener("animationend", function () {
      title.classList.remove("is-reading");
      title.classList.add("is-read");
    });
  }

  function boot() {
    var footer = document.querySelector(".art--footer");
    if (footer) mint(footer, stack);
    headline();
  }

  var themeButton = document.getElementById("theme-toggle");
  if (themeButton) {
    themeButton.addEventListener("click", function () {
      window.setTimeout(function () {
        window.dispatchEvent(new Event("themechange"));
      }, 0);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
