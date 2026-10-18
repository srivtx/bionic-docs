/* ============================================================================
   Bionic Docs — site runtime
   Wires the page to the extension's own compiled algorithm (assets/core.js,
   window.BionicCore). No framework, no dependencies, no network.
   ========================================================================== */
(function () {
  "use strict";

  var Core = window.BionicCore;
  var doc = document;
  var root = doc.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function $(sel, base) { return (base || doc).querySelector(sel); }
  function $$(sel, base) { return Array.prototype.slice.call((base || doc).querySelectorAll(sel)); }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  /* ------------------------------------------------------------ theme --- */
  var THEME_KEY = "bionic-docs-theme";
  var themeToggle = $("#theme-toggle");
  var themeLabel = $("#theme-toggle-text");

  function applyTheme(theme, persist) {
    root.setAttribute("data-theme", theme);
    if (themeToggle) themeToggle.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
    /* The label says what a click will do. */
    if (themeLabel) themeLabel.textContent = theme === "dark" ? "Light" : "Dark";
    if (persist) {
      try { window.localStorage.setItem(THEME_KEY, theme); } catch (e) { /* private mode */ }
    }
  }

  if (themeToggle) {
    applyTheme(root.getAttribute("data-theme") === "dark" ? "dark" : "light", false);
    themeToggle.addEventListener("click", function () {
      applyTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark", true);
    });
  }

  /* -------------------------------------------------------- masthead --- */
  var masthead = $("#masthead");
  var navToggle = $("#nav-toggle");
  var mobileNav = $("#mobile-nav");

  function onScroll() {
    if (masthead) masthead.classList.toggle("is-scrolled", window.scrollY > 8);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  if (navToggle && mobileNav) {
    var setNav = function (open) {
      mobileNav.classList.toggle("is-open", open);
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
      navToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    };
    navToggle.addEventListener("click", function () {
      setNav(!mobileNav.classList.contains("is-open"));
    });
    $$("a", mobileNav).forEach(function (a) {
      a.addEventListener("click", function () { setNav(false); });
    });
    doc.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setNav(false);
    });
  }

  /* The section in view is marked in the top navigation. */
  var navLinks = $$(".nav__link");
  if ("IntersectionObserver" in window && navLinks.length) {
    var byId = {};
    navLinks.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        navLinks.forEach(function (a) { a.classList.remove("is-current"); });
        var link = byId[entry.target.id];
        if (link) link.classList.add("is-current");
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    /* The hero has no link, so reaching it clears the mark. */
    Object.keys(byId).concat(["top"]).forEach(function (id) {
      var section = doc.getElementById(id);
      if (section) spy.observe(section);
    });
  }

  if (!Core) return;

  /* ---------------------------------------------------------- samples --- */
  function opts(mode, intensity) {
    return {
      mode: mode || "half",
      intensity: typeof intensity === "number" ? intensity : 0.5,
      minWordLength: 3,
      skipCommonWords: false,
      customVowels: "",
      rule: "0 1 1 2 0.4"
    };
  }

  /* Every element marked [data-bionic-sample] is painted once at load. */
  $$("[data-bionic-sample]").forEach(function (el) {
    Core.paint(el, el.textContent, opts(el.getAttribute("data-bionic-sample")));
  });

  /* The headline inks in word by word (identity.css, .is-written). */
  var heroTitle = $(".hero__title");
  if (heroTitle) {
    if (!reduceMotion) {
      $$("b.bp-head", heroTitle).forEach(function (b, i) {
        b.style.animationDelay = (140 + i * 110) + "ms";
      });
    }
    heroTitle.classList.add("is-written");
  }

  /* ----------------------------------------------------------- reader --- */
  /* Page 1 of the PDF and both EPUB chapters are the fixture text verbatim;
     the second PDF page is representative prose, and says so in its title. */
  var DOCS = {
    pdf: {
      file: "fixtures/sample.pdf",
      unit: "Page",
      pages: [
        {
          title: "sample.pdf",
          paras: [
            "Bionic reading works in PDF documents.",
            "The leading letters of every word are emphasized and the rest of the word is left alone."
          ]
        },
        {
          title: "A representative second page",
          paras: [
            "The fixture PDF holds a diagram on its second page. In the real reader each page is drawn as it was printed, and its text is laid over it in the same place, at the same width.",
            "Switching the mode or turning fixation off repaints the text in place. The original bytes are never modified, and nothing leaves the machine."
          ]
        }
      ]
    },
    epub: {
      file: "fixtures/sample.epub",
      unit: "Chapter",
      pages: [
        {
          title: "Chapter One",
          paras: [
            "Bionic reading works in EPUB documents too.",
            "The leading letters of each word carry the emphasis."
          ]
        },
        {
          title: "Chapter Two",
          paras: [
            "Chapters are reflowed and emphasized locally.",
            "The leading letters of each word carry the emphasis."
          ]
        }
      ]
    }
  };

  var readerEl = $("#reader-el");
  if (readerEl) {
    var out = $("#demo-out");
    var titleEl = $("#reader-doctitle");
    var metaEl = $("#reader-meta");
    var ownEl = $("#reader-own");
    var input = $("#demo-input");
    var toc = $("#reader-toc");
    var position = $("#reader-position");
    var prev = $("#reader-prev");
    var next = $("#reader-next");
    var fixation = $("#reader-toggle");
    var slider = $("#intensity");
    var sliderValue = $("#intensity-value");
    var modesEl = $("#demo-modes");
    var stage = $("#reader-stage");
    var docTabs = $$("#reader-docs .seg__btn");

    var state = { doc: "pdf", page: 0, mode: "half", on: true };

    Core.MODES.forEach(function (m) {
      var b = doc.createElement("button");
      b.type = "button";
      b.className = "seg__btn";
      b.dataset.mode = m.id;
      b.textContent = m.label;
      b.title = m.description;
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", function () {
        state.mode = m.id;
        render();
      });
      modesEl.appendChild(b);
    });

    var paragraphs = function () {
      if (state.doc === "own") {
        return String(input.value || "").split(/\n{2,}/).map(function (s) { return s.trim(); }).filter(Boolean);
      }
      return DOCS[state.doc].pages[state.page].paras;
    };

    var paintText = function () {
      var intensity = Number(slider.value) / 100;
      out.textContent = "";
      paragraphs().forEach(function (text) {
        var p = doc.createElement("p");
        if (state.on) Core.paint(p, text, opts(state.mode, intensity));
        else p.textContent = text;
        out.appendChild(p);
      });
      sliderValue.textContent = slider.value + "%";
    };

    var renderToc = function () {
      toc.textContent = "";
      var d = DOCS[state.doc];
      if (!d) {
        var li = doc.createElement("li");
        var b = doc.createElement("button");
        b.type = "button";
        b.className = "reader__toc-btn is-on";
        b.textContent = "Your text";
        li.appendChild(b);
        toc.appendChild(li);
        return;
      }
      d.pages.forEach(function (pg, i) {
        var li = doc.createElement("li");
        var b = doc.createElement("button");
        b.type = "button";
        b.className = "reader__toc-btn" + (i === state.page ? " is-on" : "");
        var no = doc.createElement("span");
        no.className = "reader__toc-no";
        no.textContent = String(i + 1).padStart(2, "0");
        b.appendChild(no);
        b.appendChild(doc.createTextNode(state.doc === "pdf" ? "Page " + (i + 1) : pg.title));
        if (i === state.page) b.setAttribute("aria-current", "page");
        b.addEventListener("click", function () {
          state.page = i;
          render();
        });
        li.appendChild(b);
        toc.appendChild(li);
      });
    };

    var render = function () {
      var d = DOCS[state.doc];
      var own = state.doc === "own";
      ownEl.hidden = !own;
      metaEl.textContent = own ? "Typed or pasted into this page" : d.file;
      titleEl.textContent = own ? "Your text" : d.pages[state.page].title;
      if (own) {
        position.textContent = "1 of 1";
        prev.disabled = true;
        next.disabled = true;
      } else {
        position.textContent = d.unit + " " + (state.page + 1) + " of " + d.pages.length;
        prev.disabled = state.page === 0;
        next.disabled = state.page === d.pages.length - 1;
        prev.setAttribute("aria-label", "Previous " + d.unit.toLowerCase());
        next.setAttribute("aria-label", "Next " + d.unit.toLowerCase());
      }
      docTabs.forEach(function (t) {
        var on = t.dataset.doc === state.doc;
        t.classList.toggle("is-on", on);
        t.setAttribute("aria-selected", on ? "true" : "false");
        if (on) stage.setAttribute("aria-labelledby", t.id);
      });
      $$(".seg__btn", modesEl).forEach(function (b) {
        var on = b.dataset.mode === state.mode;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      renderToc();
      paintText();
    };

    docTabs.forEach(function (t) {
      t.addEventListener("click", function () {
        state.doc = t.dataset.doc;
        state.page = 0;
        render();
      });
    });
    prev.addEventListener("click", function () {
      if (state.page > 0) { state.page -= 1; render(); }
    });
    next.addEventListener("click", function () {
      var d = DOCS[state.doc];
      if (d && state.page < d.pages.length - 1) { state.page += 1; render(); }
    });
    fixation.addEventListener("change", function () {
      state.on = fixation.checked;
      paintText();
    });
    slider.addEventListener("input", paintText);
    input.addEventListener("input", paintText);

    /* Arrow keys turn pages while the reader has focus or is hovered. */
    var hovered = false;
    readerEl.addEventListener("mouseenter", function () { hovered = true; });
    readerEl.addEventListener("mouseleave", function () { hovered = false; });
    doc.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      var target = e.target;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.getAttribute("role") === "slider")) return;
      if (!hovered && !readerEl.contains(target)) return;
      e.preventDefault();
      (e.key === "ArrowLeft" ? prev : next).click();
    });

    render();
  }

  /* ---------------------------------------------------------- compare --- */
  var compare = $("#compare");
  if (compare) {
    var top = $("#compare-top");
    var rule = $("#compare-rule");
    var pct = $("#compare-pct");
    var value = 50;

    var setValue = function (v) {
      value = clamp(Math.round(v), 0, 100);
      top.style.clipPath = "inset(0 " + (100 - value) + "% 0 0)";
      rule.style.left = value + "%";
      pct.textContent = value + "%";
      compare.setAttribute("aria-valuenow", String(value));
      compare.setAttribute("aria-valuetext", value + "% bionic");
    };
    var fromEvent = function (e) {
      var r = compare.getBoundingClientRect();
      setValue(((e.clientX - r.left) / r.width) * 100);
    };
    var dragging = false;
    compare.addEventListener("pointerdown", function (e) {
      dragging = true;
      try { compare.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
      fromEvent(e);
    });
    compare.addEventListener("pointermove", function (e) { if (dragging) fromEvent(e); });
    var stop = function () { dragging = false; };
    compare.addEventListener("pointerup", stop);
    compare.addEventListener("pointercancel", stop);
    /* Mouse events too, for environments that synthesize no pointer events. */
    compare.addEventListener("mousedown", function (e) { dragging = true; fromEvent(e); });
    window.addEventListener("mousemove", function (e) { if (dragging) fromEvent(e); });
    window.addEventListener("mouseup", stop);
    compare.addEventListener("keydown", function (e) {
      var step = e.shiftKey ? 10 : 2;
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") setValue(value - step);
      else if (e.key === "ArrowRight" || e.key === "ArrowUp") setValue(value + step);
      else if (e.key === "Home") setValue(0);
      else if (e.key === "End") setValue(100);
      else return;
      e.preventDefault();
    });
    setValue(50);
  }

  /* -------------------------------------------------------- terminal --- */
  var copy = $("#term-copy");
  var body = $("#term-body");
  if (copy && body) {
    copy.addEventListener("click", function () {
      var commands = body.textContent.split("\n")
        .filter(function (line) { return line.indexOf("$ ") === 0; })
        .map(function (line) { return line.slice(2); })
        .join("\n");
      var done = function () {
        copy.textContent = "Copied";
        copy.classList.add("is-done");
        window.setTimeout(function () {
          copy.textContent = "Copy";
          copy.classList.remove("is-done");
        }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(commands).then(done, function () {});
      }
    });
  }
})();
