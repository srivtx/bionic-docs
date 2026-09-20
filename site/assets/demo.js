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

  function q(selector, scope) {
    return (scope || document).querySelector(selector);
  }

  function qa(selector, scope) {
    return (scope || document).querySelectorAll(selector);
  }

  /* ----- Theme: light, dark, or whatever the system says --------------- */
  var THEME_KEY = "bionic-docs-theme";
  var themePicker = q(".theme-pick");
  var themeButtons = qa(".theme-pick__btn");

  function storedTheme() {
    var explicit = root.getAttribute("data-theme");
    if (explicit === "dark" || explicit === "light") return explicit;
    try {
      var saved = window.localStorage.getItem(THEME_KEY);
      if (saved === "dark" || saved === "light" || saved === "system") return saved;
    } catch (err) {
      void 0;
    }
    return "system";
  }

  function applyTheme(choice) {
    /* "system" means no attribute, so the media query takes over. */
    if (choice === "dark" || choice === "light") root.setAttribute("data-theme", choice);
    else root.removeAttribute("data-theme");
    each(themeButtons, function (button) {
      button.setAttribute(
        "aria-checked",
        String(button.getAttribute("data-theme-choice") === choice),
      );
    });
    /* art.js re-reads its colour tokens off this event. */
    window.dispatchEvent(new Event("themechange"));
  }

  function chooseTheme(choice) {
    if (!choice) return;
    try {
      window.localStorage.setItem(THEME_KEY, choice);
    } catch (err) {
      void 0;
    }
    applyTheme(choice);
  }

  each(themeButtons, function (button) {
    button.addEventListener("click", function () {
      chooseTheme(button.getAttribute("data-theme-choice"));
    });
  });

  if (themePicker) {
    /* A radiogroup should answer the arrow keys. */
    themePicker.addEventListener("keydown", function (event) {
      var step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
      if (!step) return;
      event.preventDefault();
      var list = Array.prototype.slice.call(themeButtons);
      var at = list.indexOf(document.activeElement);
      var next = list[((at === -1 ? 0 : at) + step + list.length) % list.length];
      if (!next) return;
      next.focus();
      chooseTheme(next.getAttribute("data-theme-choice"));
    });
  }

  applyTheme(storedTheme());

  /* ----- Emphasis switch -------------------------------------------------
     Lives in the nav, so it is bound here with the rest of the header: that
     markup is the same on every page and is never replaced by a client-side
     navigation, so it must not be bound twice. */
  var KEY_FIX = "bionic-page-fixation";
  var fixSwitch = q("#fixation");

  function readFixation() {
    try {
      return window.localStorage.getItem(KEY_FIX) === "off" ? "off" : "on";
    } catch (err) {
      return "on";
    }
  }

  function applyFixation(state) {
    var on = state !== "off";
    /* The attribute only ever exists when the emphasis is off, so the plain
       page is the default and a missing attribute is not a special case. */
    if (on) root.removeAttribute("data-fixation");
    else root.setAttribute("data-fixation", "off");
    if (!fixSwitch) return;
    fixSwitch.setAttribute("aria-checked", on ? "true" : "false");
    fixSwitch.setAttribute(
      "aria-label",
      on ? "Bionic emphasis is on. Turn it off." : "Bionic emphasis is off. Turn it on.",
    );
  }

  if (fixSwitch) {
    fixSwitch.addEventListener("click", function () {
      var next = fixSwitch.getAttribute("aria-checked") === "true" ? "off" : "on";
      try {
        if (next === "off") window.localStorage.setItem(KEY_FIX, "off");
        else window.localStorage.removeItem(KEY_FIX);
      } catch (err) {
        void 0;
      }
      applyFixation(next);
    });
  }

  applyFixation(readFixation());



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

  function options(mode) {
    return Object.assign({}, core.DEFAULT_SETTINGS, {
      mode: mode,
      intensity: core.DEFAULT_SETTINGS.intensity
    });
  }

  /* ---- Page wiring ------------------------------------------------------
     Everything below is page content, and client-side navigation replaces
     page content. It lives in a function so it can be run again against the
     new document. The header wiring above is deliberately outside it: that
     markup never changes, so it must never be bound a second time. */
  function wirePage() {
    if (!core || typeof core.paint !== "function") {
      each([$("tab-pdf"), $("tab-epub"), $("reader-modes"), $("reader-prev"), $("reader-next"), $("reader-toggle")], function (el) {
        if (el) el.hidden = true;
      });
      return;
    }

    try {
      /* The hero heading is the real sentence, painted by the real algorithm.
         "dim" wraps the remainder in span.bp-tail, so both halves are visible
         at poster size; the reader demo below starts on the default (half). */
      var hero = document.querySelector("#hero-title-fix");
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

    var state = { doc: "pdf", index: 0, mode: core.DEFAULT_SETTINGS.mode, on: true, turning: false };
    var pageHost = $("reader-page");
    var modes = $("reader-modes");

    function render() {
      if (!pageHost) return;
      var doc = DOCS[state.doc];
      var page = doc.pages[state.index];
      pageHost.textContent = "";

      /* Turn the page rather than swapping it. Purely presentational, so it is
         skipped when the reader prefers reduced motion. */
      if (state.turning) {
        pageHost.classList.remove("reader__page--turning");
        void pageHost.offsetWidth;
        pageHost.classList.add("reader__page--turning");
        window.setTimeout(function () {
          pageHost.classList.remove("reader__page--turning");
        }, 460);
      }
      state.turning = false;

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
      state.turning = true;
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
      state.turning = true;
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
  }

  wirePage();
  window.BionicSite = window.BionicSite || { init: [] };
  window.BionicSite.init.push(wirePage);
})();
