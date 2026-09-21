/* bionic-docs — site behaviour.
 *
 * One page, one script. It runs the reader over the repository's own fixture
 * text, paints the fixation samples with the extension's compiled algorithm,
 * and wires the chrome around them: theme, navigation, the emphasis switch,
 * the hero card, the rails, the FAQ, and the scroll behaviour.
 *
 * No network. If assets/core.js did not load, plain text stays and the reader
 * controls are hidden instead of throwing.
 */
(function () {
  "use strict";

  var root = document.documentElement;
  var core = window.BionicCore;
  var reduceMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function each(list, fn) { Array.prototype.forEach.call(list, fn); }
  function $(id) { return document.getElementById(id); }
  function q(selector, scope) { return (scope || document).querySelector(selector); }
  function qa(selector, scope) { return (scope || document).querySelectorAll(selector); }
  function options(mode) {
    return Object.assign({}, core.DEFAULT_SETTINGS, {
      mode: mode,
      intensity: core.DEFAULT_SETTINGS.intensity,
    });
  }

  /* ---- Theme: light, dark, or whatever the system says ---------------- */
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

  /* ---- Emphasis switch --------------------------------------------------
     Off means no treatment at all: every run goes back to the weight it would
     have had anyway. The attribute only exists when it is off. */
  var KEY_FIX = "bionic-docs-fixation";
  var fixSwitch = $("fixation");

  function applyFixation(state) {
    var on = state !== "off";
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
  applyFixation(root.getAttribute("data-fixation") === "off" ? "off" : "on");

  /* ---- Navigation ------------------------------------------------------- */
  var navToggle = $("nav-toggle");
  var nav = $("site-nav");
  function closeNav() {
    if (nav) nav.setAttribute("data-open", "false");
    if (navToggle) navToggle.setAttribute("aria-expanded", "false");
  }
  if (navToggle && nav) {
    navToggle.addEventListener("click", function () {
      var open = nav.getAttribute("data-open") === "true";
      nav.setAttribute("data-open", open ? "false" : "true");
      navToggle.setAttribute("aria-expanded", open ? "false" : "true");
    });
    nav.addEventListener("click", function (event) {
      var target = event.target;
      if (target && target.closest && target.closest("a")) closeNav();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeNav();
    });
  }

  /* Fail soft: no core, no reader. Hide the controls, keep plain text. */
  if (!core || typeof core.paint !== "function") {
    each(
      [
        $("tab-pdf"),
        $("tab-epub"),
        $("reader-modes"),
        $("reader-prev"),
        $("reader-next"),
        $("reader-toggle"),
        q(".readcard__ctrl"),
      ],
      function (el) {
        if (el) el.hidden = true;
      },
    );
    return;
  }

  function paintSample(el, mode) {
    core.paint(el, el.textContent, options(mode));
  }
  each(qa("[data-bionic-sample]"), function (el) {
    paintSample(el, el.getAttribute("data-bionic-sample"));
  });

  /* ---- The headline -----------------------------------------------------
     The highlight sweeps down the block and the anchor weight arrives with it,
     so the emphasis reads like something being read rather than typed. */
  var heroTitle = q(".hero__title");
  var heroFix = $("hero-title-fix");
  if (heroTitle && heroFix) {
    paintSample(heroFix, "half");
    var heroHeads = qa("b.bp-head", heroFix);
    each(heroHeads, function (head, i) {
      head.style.setProperty("--i", String(i));
    });
    if (reduceMotion || heroHeads.length === 0) {
      heroTitle.classList.add("is-reading");
    } else {
      var read = Math.min(2.1, 0.7 + heroHeads.length * 0.07);
      heroTitle.style.setProperty("--read", read.toFixed(2) + "s");
      heroTitle.classList.add("is-reading");
    }
  }

  /* ---- Hero word chips -------------------------------------------------- */
  var heroWords = $("hero-words");
  if (heroWords) {
    ["documents", "chapters", "reflowed", "extracted", "sanitized"].forEach(function (word) {
      var chip = document.createElement("span");
      chip.className = "wchip";
      chip.textContent = word;
      core.paint(chip, word, options("dim"));
      heroWords.appendChild(chip);
    });
  }

  /* ---- Rails: duplicate each track so the loop has no seam -------------- */
  each(qa(".rail__track"), function (track) {
    each(Array.prototype.slice.call(track.children), function (child) {
      var copy = child.cloneNode(true);
      copy.setAttribute("aria-hidden", "true");
      each(qa("[id]", copy), function (node) {
        node.removeAttribute("id");
      });
      track.appendChild(copy);
    });
  });

  /* ---- The reader -------------------------------------------------------
     Real text taken from the repository fixtures. The repository PDF fixture
     is a single page, so page two is clearly-labelled representative prose;
     page one and both EPUB chapters are the extracted fixture text verbatim. */
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
            "and the rest of the word is left alone.",
          ],
        },
        {
          title: "sample.pdf",
          note: "Representative text — the repository PDF fixture is a single page.",
          lines: [
            "A longer document would continue here, one reflowed line after another.",
            "Text is read in extraction order, so multi-column pages do not keep their columns.",
            "Each line is placed into a new text node before the leading letters are bolded.",
          ],
        },
      ],
    },
    epub: {
      file: "fixtures/sample.epub",
      unit: "Chapter",
      pages: [
        {
          title: "Chapter One",
          paras: [
            "Bionic reading works in EPUB documents too.",
            "The leading letters of each word carry the emphasis.",
          ],
        },
        {
          title: "Chapter Two",
          paras: [
            "Chapters are reflowed and emphasized locally.",
            "The leading letters of each word carry the emphasis.",
          ],
        },
      ],
    },
  };

  var state = { doc: "pdf", index: 0, mode: core.DEFAULT_SETTINGS.mode, on: true, turning: false };
  var pageHost = $("reader-page");
  var modes = $("reader-modes");
  var cardPos = $("readcard-pos");

  function line(text, mode) {
    var p = document.createElement("p");
    p.className = "bionic";
    if (state.on) p.innerHTML = core.bionicHtml(text, options(mode));
    else p.textContent = text;
    return p;
  }

  function render() {
    if (!pageHost) return;
    var doc = DOCS[state.doc];
    var page = doc.pages[state.index];
    pageHost.textContent = "";

    /* Turn the page rather than swapping it. Purely presentational, so it is
       skipped when the reader prefers reduced motion. */
    if (state.turning && !reduceMotion) {
      pageHost.classList.remove("reader__page--turning");
      void pageHost.offsetWidth;
      pageHost.classList.add("reader__page--turning");
      window.setTimeout(function () {
        pageHost.classList.remove("reader__page--turning");
      }, 460);
    }
    state.turning = false;

    if (state.doc === "pdf") {
      /* One section per page, one paragraph per line, as the extension does. */
      var section = document.createElement("section");
      section.className = "pdf-page";
      var heading = document.createElement("h2");
      heading.className = "reader__title";
      heading.textContent = page.title;
      section.appendChild(heading);
      if (page.note) {
        var note = document.createElement("p");
        note.className = "muted";
        note.textContent = page.note;
        section.appendChild(note);
      }
      each(page.lines, function (text) {
        var p = line(text, state.mode);
        p.className = "pdf-line bionic";
        section.appendChild(p);
      });
      pageHost.appendChild(section);
    } else {
      var chapter = document.createElement("div");
      chapter.className = "epub-chapter";
      var title = document.createElement("h3");
      title.className = "epub-title";
      title.textContent = page.title;
      chapter.appendChild(title);
      if (page.note) {
        var epubNote = document.createElement("p");
        epubNote.className = "muted";
        epubNote.textContent = page.note;
        chapter.appendChild(epubNote);
      }
      each(page.paras, function (text) {
        chapter.appendChild(line(text, state.mode));
      });
      pageHost.appendChild(chapter);
    }

    var total = doc.pages.length;
    var pos = $("reader-position");
    if (pos) pos.textContent = doc.unit + " " + (state.index + 1) + " of " + total;
    if (cardPos) cardPos.textContent = state.index + 1 + " of " + total;
    if ($("reader-prev")) $("reader-prev").disabled = state.index === 0;
    if ($("reader-next")) $("reader-next").disabled = state.index === total - 1;
  }

  function setMode(id) {
    state.mode = id;
    each(qa(".mchip", modes), function (button) {
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
  render();

  /* ---- Mode tiles: hover sweeps the intensity --------------------------- */
  each(qa(".tile"), function (tile) {
    var sample = q(".tile__sample", tile);
    if (!sample) return;
    var mode = sample.getAttribute("data-bionic-sample") || "half";
    var raf = 0;
    var started = 0;
    function sweep(now) {
      if (!started) started = now;
      var phase = ((now - started) % 2200) / 2200;
      var wave = Math.sin(phase * Math.PI * 2);
      var intensity = Math.max(0.2, Math.min(0.9, 0.5 + wave * 0.22));
      core.paint(
        sample,
        sample.textContent,
        Object.assign({}, core.DEFAULT_SETTINGS, { mode: mode, intensity: intensity }),
      );
      raf = window.requestAnimationFrame(sweep);
    }
    function stop() {
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
      started = 0;
      paintSample(sample, mode);
    }
    if (!reduceMotion) {
      tile.addEventListener("pointerenter", function () {
        if (!raf) raf = window.requestAnimationFrame(sweep);
      });
      tile.addEventListener("pointerleave", stop);
      tile.addEventListener("focusin", function () {
        if (!raf) raf = window.requestAnimationFrame(sweep);
      });
      tile.addEventListener("focusout", stop);
    }
  });

  /* ---- Compare divider -------------------------------------------------- */
  var compare = $("compare");
  if (compare) {
    var dragging = false;
    var touched = false;
    var split = 0.5;
    var pct = $("compare-pct");
    function paintSplit() {
      var value = Math.round(split * 100);
      compare.style.setProperty("--p", value + "%");
      compare.setAttribute("aria-valuenow", String(value));
      compare.setAttribute("aria-valuetext", value + "% bionic, " + (100 - value) + "% as written");
      if (pct) pct.textContent = value + "%";
    }
    function fromClientX(clientX) {
      var rect = compare.getBoundingClientRect();
      if (rect.width <= 0) return;
      split = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      paintSplit();
    }
    compare.addEventListener("pointerdown", function (event) {
      dragging = true;
      touched = true;
      compare.classList.add("is-dragging");
      if (compare.setPointerCapture) {
        try {
          compare.setPointerCapture(event.pointerId);
        } catch (err) {
          void 0;
        }
      }
      fromClientX(event.clientX);
    });
    compare.addEventListener("pointermove", function (event) {
      if (dragging) fromClientX(event.clientX);
    });
    function endDrag() {
      dragging = false;
      compare.classList.remove("is-dragging");
    }
    compare.addEventListener("pointerup", endDrag);
    compare.addEventListener("pointercancel", endDrag);
    compare.addEventListener("keydown", function (event) {
      var stepBy = event.shiftKey ? 0.1 : 0.02;
      if (event.key === "ArrowLeft") split -= stepBy;
      else if (event.key === "ArrowRight") split += stepBy;
      else if (event.key === "Home") split = 0;
      else if (event.key === "End") split = 1;
      else return;
      event.preventDefault();
      touched = true;
      split = Math.min(1, Math.max(0, split));
      paintSplit();
    });
    paintSplit();

    if (!reduceMotion && "IntersectionObserver" in window) {
      var seen = new IntersectionObserver(function (entries) {
        each(entries, function (entry) {
          if (!entry.isIntersecting) return;
          seen.disconnect();
          if (touched) return;
          var started = 0;
          function sweepCompare(now) {
            if (touched) return;
            if (!started) started = now;
            var t = Math.min(1, (now - started) / 1700);
            split = 0.5 + Math.sin(t * Math.PI) * 0.2;
            paintSplit();
            if (t < 1) window.requestAnimationFrame(sweepCompare);
          }
          window.requestAnimationFrame(sweepCompare);
        });
      }, { threshold: 0.4 });
      seen.observe(compare);
    }
  }

  /* ---- FAQ -------------------------------------------------------------- */
  each(qa(".faq__item"), function (item) {
    var button = q(".faq__q", item);
    var panel = q(".faq__a", item);
    if (!button || !panel) return;
    button.addEventListener("click", function () {
      var open = item.classList.toggle("open");
      button.setAttribute("aria-expanded", open ? "true" : "false");
      panel.style.maxHeight = open ? panel.scrollHeight + "px" : "";
    });
  });

  /* ---- Copy the install commands ---------------------------------------- */
  var copy = $("term-copy-cmds");
  var termBody = $("term-body-cmds");
  if (copy && termBody && navigator.clipboard) {
    copy.addEventListener("click", function () {
      var lines = [];
      each(qa(".term__line", termBody), function (element) {
        lines.push(element.textContent.replace(/\s+/g, " ").trim());
      });
      navigator.clipboard.writeText(lines.join("\n")).then(
        function () {
          copy.textContent = "Copied";
          window.setTimeout(function () {
            copy.textContent = "Copy all";
          }, 1600);
        },
        function () {
          void 0;
        },
      );
    });
  }

  /* ---- Scroll behaviour: progress, nav, reveals, spy, back to top ------- */
  var progress = $("progress");
  var header = $("nav");
  var totop = $("totop");

  function onScroll() {
    var y = window.pageYOffset || root.scrollTop || 0;
    var max = root.scrollHeight - window.innerHeight;
    if (progress) progress.style.width = (max > 0 ? (y / max) * 100 : 0) + "%";
    if (header) header.classList.toggle("scrolled", y > 8);
    if (totop) totop.classList.toggle("show", y > 640);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  if (totop) {
    totop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    });
  }

  /* Reveals are added here rather than in the markup, so a visitor without
     JavaScript sees the whole page instead of a blank one. */
  if (!reduceMotion && "IntersectionObserver" in window) {
    var reveals = qa(
      ".section__head, .reader, .compare, .tile, .step, .panel, .card, .metric, .term, .faq__item, .prose",
    );
    var revealObserver = new IntersectionObserver(
      function (entries) {
        each(entries, function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("rv", "in");
          revealObserver.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    each(reveals, function (el) {
      el.classList.add("rv");
      revealObserver.observe(el);
    });
  }

  /* Which section you are reading. */
  if ("IntersectionObserver" in window && nav) {
    var links = qa("a[href^='#']", nav);
    var spy = new IntersectionObserver(
      function (entries) {
        each(entries, function (entry) {
          if (!entry.isIntersecting) return;
          var id = entry.target.getAttribute("id");
          each(links, function (link) {
            if (link.getAttribute("href") === "#" + id) link.setAttribute("aria-current", "true");
            else link.removeAttribute("aria-current");
          });
        });
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    each(qa("section[id]"), function (section) {
      spy.observe(section);
    });
  }
})();
