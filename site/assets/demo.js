/* bionic-docs — progressive enhancement for the site.
   No dependencies, no network. The fixation demo runs the same compiled
   algorithm the extension ships (assets/core.js exposes BionicCore). If that
   bundle is missing, everything here fails soft: the plain text stays and the
   demo controls are hidden. */
(function () {
  "use strict";

  var root = document.documentElement;

  function $(id) {
    return document.getElementById(id);
  }

  function each(list, fn) {
    Array.prototype.forEach.call(list, fn);
  }

  function show(label, isDark) {
    if (label) label.textContent = isDark ? "Dark" : "Light";
  }

  /* ----- Theme toggle --------------------------------------------------
     An explicit data-theme is stored when the visitor picks one; otherwise
     the stylesheet follows prefers-color-scheme. */
  var THEME_KEY = "bionic-docs-theme";
  var themeToggle = $("theme-toggle");
  var themeText = $("theme-toggle-text");

  function applyTheme(theme) {
    if (theme === "dark" || theme === "light") {
      root.setAttribute("data-theme", theme);
    } else {
      root.removeAttribute("data-theme");
    }
    if (!themeToggle) return;
    var dark = theme === "dark" || (theme == null && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    themeToggle.setAttribute("aria-pressed", dark ? "true" : "false");
    themeToggle.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    show(themeText, dark);
  }

  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      var next = themeToggle.getAttribute("aria-pressed") === "true" ? "light" : "dark";
      try {
        window.localStorage.setItem(THEME_KEY, next);
      } catch (err) {
        void 0;
      }
      applyTheme(next);
    });
  }
  applyTheme(root.getAttribute("data-theme"));

  /* ----- Navigation toggle --------------------------------------------- */
  var navToggle = $("nav-toggle");
  var nav = $("site-nav");
  if (navToggle && nav) {
    navToggle.addEventListener("click", function () {
      var open = nav.getAttribute("data-open") === "true";
      nav.setAttribute("data-open", open ? "false" : "true");
      navToggle.setAttribute("aria-expanded", open ? "false" : "true");
    });
    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      nav.setAttribute("data-open", "false");
      navToggle.setAttribute("aria-expanded", "false");
    });
  }

  /* ----- Fixation demo -------------------------------------------------- */
  var core = window.BionicCore;
  if (!core || typeof core.paint !== "function") {
    each([$("tab-pdf"), $("tab-epub"), $("reader-modes"), $("reader-prev"), $("reader-next"), $("reader-toggle")], function (el) {
      if (el) el.hidden = true;
    });
    return;
  }

  function options(mode) {
    return Object.assign({}, core.DEFAULT_SETTINGS, {
      mode: mode,
      intensity: core.DEFAULT_SETTINGS.intensity
    });
  }

  try {
    /* The hero heading is the real sentence, painted by the real algorithm.
       "dim" wraps the remainder in span.bp-tail, so both halves are visible
       at poster size; the reader demo below starts on the default (half). */
    var hero = document.querySelector("h1.bionic--xl");
    if (hero) core.paint(hero, hero.textContent, options("dim", core.DEFAULT_SETTINGS.intensity));

    /* One sentence per mode, in the mode tiles. */
    each(document.querySelectorAll("[data-bionic-sample]"), function (el) {
      core.paint(el, el.textContent, options(el.getAttribute("data-bionic-sample")));
    });
  } catch (err) {
    void 0;
  }

  /* Real text extracted from the repository fixtures. The repository PDF
     fixture is a single page, so page two is clearly-labelled representative
     prose; page one and both EPUB chapters are verbatim. */
  var DOCS = {
    pdf: {
      file: "fixtures/sample.pdf",
      unit: "Page",
      pages: [
        {
          title: "sample.pdf",
          lines: [
            "Bionic reading works in PDF documents",
            "The leading letters of every word are emphasized",
            "and the rest of the word is left alone."
          ]
        },
        {
          title: "sample.pdf",
          note: "Representative text — the repository PDF fixture is a single page.",
          lines: [
            "A longer document would continue here, one reflowed line after another.",
            "Text is read in extraction order, so multi-column pages do not keep their columns.",
            "Each line is placed into a new text node before the leading letters are bolded."
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

  var state = { doc: "pdf", index: 0, mode: core.DEFAULT_SETTINGS.mode, on: true };
  var pageHost = $("reader-page");
  var modes = $("reader-modes");

  function render() {
    if (!pageHost) return;
    var doc = DOCS[state.doc];
    var page = doc.pages[state.index];
    pageHost.textContent = "";

    var title = document.createElement("h2");
    title.className = "reader__title";
    title.textContent = page.title;
    pageHost.appendChild(title);

    if (page.note) {
      var note = document.createElement("p");
      note.className = "muted";
      note.textContent = page.note;
      pageHost.appendChild(note);
    }

    each(page.lines || page.paras || [], function (text) {
      var p = document.createElement("p");
      p.className = "bionic";
      if (state.on) p.innerHTML = core.bionicHtml(text, options(state.mode));
      else p.textContent = text;
      pageHost.appendChild(p);
    });

    var total = doc.pages.length;
    var pos = $("reader-position");
    if (pos) pos.textContent = doc.unit + " " + (state.index + 1) + " of " + total;
    if ($("reader-prev")) $("reader-prev").disabled = state.index === 0;
    if ($("reader-next")) $("reader-next").disabled = state.index === total - 1;
  }

  function setMode(id) {
    state.mode = id;
    each(modes.querySelectorAll(".mchip"), function (button) {
      button.setAttribute("aria-pressed", button.getAttribute("data-mode") === id ? "true" : "false");
    });
    render();
  }

  function setDoc(id) {
    state.doc = id;
    state.index = 0;
    each([$("tab-pdf"), $("tab-epub")], function (tab) {
      var on = tab.id === "tab-" + id;
      tab.setAttribute("aria-selected", on ? "true" : "false");
      if (on) tab.classList.add("reader__tab--on");
      else tab.classList.remove("reader__tab--on");
    });
    if ($("reader-file")) $("reader-file").textContent = DOCS[id].file;
    if (pageHost) pageHost.setAttribute("aria-labelledby", "tab-" + id);
    if ($("reader-prev")) $("reader-prev").setAttribute("aria-label", "Previous " + DOCS[id].unit.toLowerCase());
    if ($("reader-next")) $("reader-next").setAttribute("aria-label", "Next " + DOCS[id].unit.toLowerCase());
    render();
  }

  function step(delta) {
    var total = DOCS[state.doc].pages.length;
    var next = state.index + delta;
    if (next < 0 || next >= total) return;
    state.index = next;
    render();
  }

  if (modes) {
    each(core.MODES, function (info) {
      var item = document.createElement("li");
      var button = document.createElement("button");
      button.type = "button";
      button.className = "mchip";
      button.textContent = info.label;
      button.title = info.description;
      button.setAttribute("data-mode", info.id);
      button.setAttribute("aria-pressed", info.id === state.mode ? "true" : "false");
      button.addEventListener("click", function () {
        setMode(info.id);
      });
      item.appendChild(button);
      modes.appendChild(item);
    });
  }

  if ($("tab-pdf")) $("tab-pdf").addEventListener("click", function () { setDoc("pdf"); });
  if ($("tab-epub")) $("tab-epub").addEventListener("click", function () { setDoc("epub"); });
  if ($("reader-prev")) $("reader-prev").addEventListener("click", function () { step(-1); });
  if ($("reader-next")) $("reader-next").addEventListener("click", function () { step(1); });
  if ($("reader-toggle")) {
    $("reader-toggle").addEventListener("click", function () {
      state.on = !state.on;
      $("reader-toggle").setAttribute("aria-pressed", state.on ? "true" : "false");
      $("reader-toggle").textContent = state.on ? "Fixation on" : "Fixation off";
      render();
    });
  }

  try {
    setDoc("pdf");
  } catch (err) {
    void 0;
  }
})();
