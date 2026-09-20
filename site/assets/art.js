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
    if (!ctx) return function () {};
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0;
    var h = 0;
    var palette = tokens();
    var t = 0;
    var last = 0;
    var visible = true;
    var observer = null;

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

    /* Returns its own teardown. Client-side navigation swaps the page under
       the canvas, so the loop has to be stoppable or it keeps drawing into a
       detached element forever. */
    function stop() {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      if (observer) observer.disconnect();
    }

    resize();

    if (reduce) {
      window.addEventListener("resize", resize, { passive: true });
      return stop;
    }

    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        function (entries) {
          visible = entries[0] ? entries[0].isIntersecting : true;
        },
        { rootMargin: "120px" },
      );
      observer.observe(canvas);
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

    return stop;
  }


  /* ---- boot ------------------------------------------------------------- */

  function headline() {
    var title = document.querySelector(".hero__title");
    if (!title) return;
    var fix = title.querySelector(".hero__title-fix");
    var plain = title.querySelector(".hero__title-plain");
    if (!fix || !plain) return;

    function measure() {
      title.style.setProperty("--hl-travel", title.clientHeight + "px");
    }
    if (window.__bionicHeadlineResize) {
      window.removeEventListener("resize", window.__bionicHeadlineResize);
    }
    window.__bionicHeadlineResize = measure;
    measure();
    window.addEventListener("resize", measure, { passive: true });

    if (reduce) {
      title.classList.add("is-read");
      plain.remove();
      return;
    }

    title.classList.add("is-reading");
    fix.addEventListener("animationend", function () {
      title.classList.remove("is-reading");
      title.classList.add("is-read");
      /* The fixation layer is the real text now, so the "before" copy is
         removed instead of left in the document saying the same sentence. */
      plain.remove();
    });
  }

  function boot() {
    /* Anything still running from the previous page is stopped first: with
       client-side navigation the old canvas is detached, and its loop would
       otherwise keep drawing into it forever. */
    var stops = window.__bionicArt || [];
    for (var i = 0; i < stops.length; i++) stops[i]();
    window.__bionicArt = [];

    headline();
  }

  /* Registered so the router can re-initialise the page after a swap. */
  window.BionicSite = window.BionicSite || { init: [] };
  window.BionicSite.init.push(boot);

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
