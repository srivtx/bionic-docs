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

  /* ---- Theme: dark, light ------------------------------------------------
     The attribute is always present, light by default, so the toggle is the
     only thing that decides. The stored value is applied before first paint by
     the inline script in the head. */
  var THEME_KEY = "bionic-docs-theme";
  var themeToggle = $("theme-toggle");
  var themeToggleText = $("theme-toggle-text");

  function currentTheme() {
    var attribute = root.getAttribute("data-theme");
    if (attribute) return attribute;
    return typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  function syncThemeButton() {
    if (!themeToggle) return;
    var dark = currentTheme() === "dark";
    themeToggle.setAttribute("aria-pressed", String(dark));
    if (themeToggleText) themeToggleText.textContent = dark ? "Light" : "Dark";
  }
  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try {
        window.localStorage.setItem(THEME_KEY, next);
      } catch (err) {
        void 0;
      }
      syncThemeButton();
    });
  }
  syncThemeButton();

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
  var heroTitle = $("hero-title");
  if (heroTitle) {
    /* The highlight and the beam both work on the painted run, so it is
       painted first and the highlight put back after it. */
    var highlight = document.createElement("span");
    highlight.className = "hero__highlight";
    highlight.setAttribute("aria-hidden", "true");
    core.paint(heroTitle, heroTitle.textContent, options("half"));
    heroTitle.insertBefore(highlight, heroTitle.firstChild);
    heroTitle.style.setProperty("--read", "1.9s");
    heroTitle.classList.add("is-reading");
  }

  /* ---- Hero word chips -------------------------------------------------- */
  var heroWords = $("hero-words");
  if (heroWords) {
    ["documents", "chapters", "reflowed", "extracted", "sanitized"].forEach(function (word, i) {
      var chip = document.createElement("span");
      chip.className = "wchip";
      chip.textContent = word;
      chip.style.animationDelay = 4.6 + i * 0.08 + "s";
      core.paint(chip, word, options("dim"));
      heroWords.appendChild(chip);
    });
  }

  /* ---- the entrance -----------------------------------------------------
     Copied from the design. A dot travels the headline word by word, leaving a
     trail and a ring, and each word brightens as the beam reaches it; then the
     beam sweeps into the reading card and the rest of the card cascades. A
     preloader is held until the page has actually loaded, and never longer
     than 2.6s. */
  var animCore = window.BionicCore;
  var heroEl = q(".hero");
  var titleEl = q(".hero__title");
  var readcard = $("readcard");
  var beamBody = $("readcard-body");
  var fadeEls = qa("[data-hero-fade]");
  var animDone = false;
  var beamDot = null;
  var extras = [];
  var pairs = [];
  var cardWords = [];
  var cardExtras = [];

  function beamRect(el) {
    var r = el.getBoundingClientRect();
    var h = heroEl.getBoundingClientRect();
    return { x: r.left - h.left, y: r.top - h.top, w: r.width, h: r.height };
  }
  function beamTrail(x0, y0, x1, y1) {
    if (reduceMotion) return;
    var dx = x1 - x0;
    var dy = y1 - y0;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 16) return;
    var t = document.createElement("span");
    t.className = "fx-trail";
    t.style.left = x0 + "px";
    t.style.top = y0 - 1 + "px";
    t.style.width = len + "px";
    t.style.transform = "rotate(" + Math.atan2(dy, dx) + "rad)";
    t.style.transformOrigin = "0 50%";
    heroEl.appendChild(t);
    t.addEventListener("animationend", function () {
      t.remove();
    });
  }
  function beamRing(x, y) {
    if (reduceMotion) return;
    var r = document.createElement("span");
    r.className = "fx-ring";
    r.style.left = x - 5 + "px";
    r.style.top = y - 5 + "px";
    heroEl.appendChild(r);
    r.addEventListener("animationend", function () {
      r.remove();
    });
  }
  function wait(ms) {
    return new Promise(function (res) {
      setTimeout(res, ms);
    });
  }
  function beamMove(x, y, dur) {
    return new Promise(function (res) {
      if (reduceMotion) {
        res();
        return;
      }
      beamDot.style.transition =
        "left " + dur + "ms cubic-bezier(.5,0,.15,1), top " + dur + "ms cubic-bezier(.5,0,.15,1), opacity .4s ease";
      void beamDot.offsetWidth;
      beamDot.style.left = x - 5 + "px";
      beamDot.style.top = y - 5 + "px";
      setTimeout(res, dur);
    });
  }
  function beamIgnite(el) {
    el.classList.add("on");
    if (el.classList.contains("bp-head")) el.classList.add("lit");
  }

  /* Wrap the bare text nodes of the headline in spans, so a run that the
     algorithm left as plain text can be dimmed and lit with the rest. */
  function beamTargets() {
    if (reduceMotion || !heroEl || !heroTitle) return;
    var cur = null;
    each(Array.prototype.slice.call(heroTitle.childNodes), function (node) {
      if (node.nodeType === 1 && node.classList.contains("bp-head")) {
        cur = [node];
        pairs.push(cur);
      } else if (cur && node.nodeType === 3 && node.textContent.trim()) {
        cur.push(node);
      } else if (cur && node.nodeType === 1 && node.classList.contains("bp-tail")) {
        cur.push(node);
      } else if (node.nodeType === 3 && node.textContent.trim()) {
        extras.push(node);
      }
    });
    /* A text node cannot carry a class or a transition, so it becomes a span
       in place. */
    function wrap(node) {
      var span = document.createElement("span");
      span.textContent = node.textContent;
      node.parentNode.replaceChild(span, node);
      return span;
    }
    extras = extras.map(wrap);
    pairs = pairs.map(function (nodes) {
      return nodes.map(function (node) {
        return node.nodeType === 3 ? wrap(node) : node;
      });
    });
    each(Array.prototype.slice.call(heroTitle.childNodes), function (node) {
      if (node.nodeType !== 1) return;
      if (node.classList.contains("hero__caret")) return;
      if (node.classList.contains("hero__highlight")) return;
      node.classList.add("pre-word");
    });
    if (beamBody) {
      cardWords = Array.prototype.slice.call(beamBody.querySelectorAll(".bp-head"));
      each(cardWords, function (word) {
        word.classList.add("pre-word");
      });
      each(qa("p", beamBody), function (para) {
        each(Array.prototype.slice.call(para.childNodes), function (node) {
          if (node.nodeType === 3 && node.textContent.trim()) {
            cardExtras.push(wrap(node));
          }
        });
      });
    }
    each(fadeEls, function (el) {
      el.classList.add("pre");
    });
  }

  async function opening() {
    if (reduceMotion || !heroEl) {
      fadeEls.concat([readcard]).forEach(function (el) {
        if (el) el.classList.add("pre", "on");
      });
      animDone = true;
      return;
    }
    beamDot = document.createElement("span");
    beamDot.className = "fx-dot";
    heroEl.appendChild(beamDot);

    await wait(120);
    if (fadeEls[0]) fadeEls[0].classList.add("on"); /* metabar */
    await wait(340);

    /* the beam reads the title, word by word */
    beamDot.style.opacity = "1";
    var prev = null;
    for (var i = 0; i < pairs.length; i++) {
      var rc = beamRect(pairs[i][0]);
      var x = rc.x + rc.w * 0.45;
      var y = rc.y + rc.h * 0.62;
      if (prev) {
        beamTrail(prev.x, prev.y, x, y);
        var d = Math.sqrt((x - prev.x) * (x - prev.x) + (y - prev.y) * (y - prev.y));
        await beamMove(x, y, Math.min(60 + d * 0.55, 320));
      } else {
        await beamMove(x, y, 260);
      }
      beamRing(x, y);
      pairs[i].forEach(beamIgnite);
      prev = { x: x, y: y };
      if (i === 1 && fadeEls[1]) fadeEls[1].classList.add("on"); /* lede */
      if (i === 3 && fadeEls[2]) fadeEls[2].classList.add("on"); /* buttons */
      if (i === 5 && fadeEls[3]) fadeEls[3].classList.add("on"); /* chips */
      await wait(170);
    }
    extras.forEach(beamIgnite);
    await wait(200);

    /* sweep into the reading card */
    if (fadeEls[4]) fadeEls[4].classList.add("on");
    await wait(260);
    if (cardWords.length && prev) {
      var rc0 = beamRect(cardWords[0]);
      var fx = rc0.x + rc0.w * 0.45;
      var fy = rc0.y + rc0.h * 0.6;
      beamTrail(prev.x, prev.y, fx, fy);
      await beamMove(fx, fy, 520);
      var stopAt = Math.min(cardWords.length, 18);
      var prev2 = { x: fx, y: fy };
      for (var j = 0; j < stopAt; j++) {
        var w = cardWords[j];
        var r3 = beamRect(w);
        var wx = r3.x + r3.w * 0.45;
        var wy = r3.y + r3.h * 0.6;
        if (j > 0) {
          beamTrail(prev2.x, prev2.y, wx, wy);
          var dd = Math.sqrt((wx - prev2.x) * (wx - prev2.x) + (wy - prev2.y) * (wy - prev2.y));
          await beamMove(wx, wy, Math.min(40 + dd * 0.6, 150));
        }
        if (j % 3 === 0) beamRing(wx, wy);
        beamIgnite(w);
        prev2 = { x: wx, y: wy };
        await wait(78);
      }
      beamDot.style.opacity = "0";

      /* cascade the rest of the card from left to right */
      var br = beamRect(beamBody);
      cardWords.forEach(function (w2, k) {
        if (k < stopAt) return;
        var r4 = beamRect(w2);
        var frac = Math.max(0, Math.min(1, (r4.x - br.x) / br.width));
        w2.style.transitionDelay = frac * 460 + "ms";
        beamIgnite(w2);
      });
      cardExtras.forEach(function (el, k) {
        el.style.transitionDelay = 150 + (k % 6) * 60 + "ms";
        beamIgnite(el);
      });
    }

    /* one pulse on the intensity slider, like a heartbeat */
    var rng = $("hero-intensity");
    if (rng) {
      await wait(500);
      rng.classList.add("pulse");
      setTimeout(function () {
        rng.classList.remove("pulse");
      }, 1100);
    }
    animDone = true;
  }

  beamTargets();

  /* ---- preloader -------------------------------------------------------- */
  var loader = $("loader");
  function dismissLoader() {
    if (!loader) {
      opening();
      return;
    }
    loader.classList.add("done");
    setTimeout(function () {
      if (loader && loader.parentNode) loader.parentNode.removeChild(loader);
      loader = null;
    }, 650);
    setTimeout(opening, 240);
  }
  if (reduceMotion) {
    if (loader && loader.parentNode) loader.parentNode.removeChild(loader);
    loader = null;
    opening();
  } else {
    var minShown = wait(1250);
    var loaded = new Promise(function (res) {
      if (document.readyState === "complete") res();
      else window.addEventListener("load", res);
      setTimeout(res, 2600); /* never trap the user */
    });
    Promise.all([minShown, loaded]).then(dismissLoader);
  }

  /* ---- magnetic buttons, a card that tilts, a rail that skews ------------ */
  var coarsePointer =
    typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;

  if (!reduceMotion && !coarsePointer) {
    each(qa("[data-magnet], .nav__gh, .totop"), function (el) {
      var magnetRaf = null;
      el.addEventListener("mousemove", function (event) {
        var r = el.getBoundingClientRect();
        var dx = (event.clientX - (r.left + r.width / 2)) / r.width;
        var dy = (event.clientY - (r.top + r.height / 2)) / r.height;
        if (magnetRaf) window.cancelAnimationFrame(magnetRaf);
        magnetRaf = window.requestAnimationFrame(function () {
          el.style.transform = "translate(" + dx * 5 + "px," + dy * 4 + "px)";
        });
      });
      el.addEventListener("mouseleave", function () {
        if (magnetRaf) window.cancelAnimationFrame(magnetRaf);
        el.style.transform = "";
      });
    });

    if (readcard) {
      var tiltRaf = null;
      readcard.addEventListener("mousemove", function (event) {
        var r = readcard.getBoundingClientRect();
        var dx = (event.clientX - (r.left + r.width / 2)) / r.width;
        var dy = (event.clientY - (r.top + r.height / 2)) / r.height;
        if (tiltRaf) window.cancelAnimationFrame(tiltRaf);
        tiltRaf = window.requestAnimationFrame(function () {
          readcard.style.transition = "transform 90ms ease-out";
          readcard.style.transform =
            "rotateY(" + dx * 4 + "deg) rotateX(" + -dy * 3.4 + "deg) translateY(-2px)";
        });
      });
      readcard.addEventListener("mouseleave", function () {
        if (tiltRaf) window.cancelAnimationFrame(tiltRaf);
        readcard.style.transition = "transform 500ms cubic-bezier(.22,.9,.24,1)";
        readcard.style.transform = "";
      });
    }

    /* the rails lean into the scroll, then settle */
    var tilt = $("railband-tilt");
    if (tilt) {
      var lastY = window.scrollY || 0;
      var skew = 0;
      var target = 0;
      var skewRaf = null;
      function skewLoop() {
        skew += (target - skew) * 0.12;
        target *= 0.8;
        tilt.style.transform = Math.abs(skew) > 0.04 ? "skewX(" + skew.toFixed(2) + "deg)" : "";
        if (Math.abs(skew) > 0.04 || Math.abs(target) > 0.04) {
          skewRaf = window.requestAnimationFrame(skewLoop);
        } else {
          skewRaf = null;
          tilt.style.transform = "";
        }
      }
      window.addEventListener(
        "scroll",
        function () {
          var y = window.scrollY || 0;
          target = Math.max(-3.2, Math.min(3.2, (y - lastY) * 0.09));
          lastY = y;
          if (!skewRaf) skewRaf = window.requestAnimationFrame(skewLoop);
        },
        { passive: true },
      );
    }
  }

  /* ---- the numbers count up when they arrive ---------------------------- */
  var numbers = qa(".metric__n");
  function countUp(el) {
    var target = parseInt(el.getAttribute("data-count"), 10);
    var suffix = el.getAttribute("data-suffix") || "";
    if (isNaN(target)) return;
    if (reduceMotion) {
      el.textContent = target + suffix;
      return;
    }
    var started = null;
    var duration = 1100;
    function countStep(t) {
      if (!started) started = t;
      var k = Math.min(1, (t - started) / duration);
      k = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(target * k) + suffix;
      if (k < 1) window.requestAnimationFrame(countStep);
    }
    window.requestAnimationFrame(countStep);
  }
  if ("IntersectionObserver" in window && !reduceMotion) {
    var countObserver = new IntersectionObserver(
      function (entries) {
        each(entries, function (entry) {
          if (!entry.isIntersecting) return;
          countUp(entry.target);
          countObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.5 },
    );
    each(numbers, function (n) {
      countObserver.observe(n);
    });
  } else {
    each(numbers, countUp);
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

  /* ---- Compare divider --------------------------------------------------
     The design writes the clip, the divider, the handle and the readout
     directly, so a drag is four style writes and nothing re-lays-out. Pointer
     drag, arrow keys for keyboards, and one sweep to show what it is for. */
  var compare = $("compare");
  if (compare) {
    var compareTop = $("compare-top");
    var compareKnob = $("compare-knob");
    var compareGrip = q(".compare__grip", compare);
    var comparePct = $("compare-pct");
    var split = 50;
    var dragging = false;
    var touched = false;
    function setSplit(value) {
      split = Math.max(0, Math.min(100, value));
      if (compareTop) compareTop.style.clipPath = "inset(0 " + (100 - split) + "% 0 0)";
      if (compareKnob) compareKnob.style.left = split + "%";
      if (compareGrip) compareGrip.style.left = split + "%";
      var rounded = Math.round(split);
      if (comparePct) comparePct.textContent = rounded + "%";
      compare.setAttribute("aria-valuenow", String(rounded));
      compare.setAttribute(
        "aria-valuetext",
        rounded + "% bionic, " + (100 - rounded) + "% as written"
      );
    }
    setSplit(split);
    function splitFromClientX(clientX) {
      var rect = compare.getBoundingClientRect();
      if (rect.width <= 0) return;
      setSplit(((clientX - rect.left) / rect.width) * 100);
    }
    compare.addEventListener("pointerdown", function (event) {
      dragging = true;
      touched = true;
      if (compare.setPointerCapture) {
        try {
          compare.setPointerCapture(event.pointerId);
        } catch (err) {
          void 0;
        }
      }
      splitFromClientX(event.clientX);
    });
    compare.addEventListener("pointermove", function (event) {
      if (dragging) splitFromClientX(event.clientX);
    });
    compare.addEventListener("pointerup", function () {
      dragging = false;
    });
    compare.addEventListener("pointercancel", function () {
      dragging = false;
    });
    compare.addEventListener("keydown", function (event) {
      touched = true;
      if (event.key === "ArrowLeft") setSplit(split - 4);
      else if (event.key === "ArrowRight") setSplit(split + 4);
      else if (event.key === "Home") setSplit(0);
      else if (event.key === "End") setSplit(100);
      else return;
      event.preventDefault();
    });

    if (!reduceMotion && "IntersectionObserver" in window) {
      var swept = false;
      var sweep = new IntersectionObserver(
        function (entries) {
          each(entries, function (entry) {
            if (!entry.isIntersecting || swept) return;
            swept = true;
            sweep.unobserve(compare);
            /* Out, in, and back — the same three moves as the design. */
            var moves = [[82, 700], [28, 800], [50, 600]];
            var index = 0;
            function next() {
              if (touched || index >= moves.length) return;
              var from = split;
              var to = moves[index][0];
              var duration = moves[index][1];
              index += 1;
              var started = null;
              function tween(now) {
                if (touched) return;
                if (!started) started = now;
                var k = Math.min(1, (now - started) / duration);
                var eased = 1 - Math.pow(1 - k, 3);
                setSplit(from + (to - from) * eased);
                if (k < 1) window.requestAnimationFrame(tween);
                else window.setTimeout(next, 120);
              }
              window.requestAnimationFrame(tween);
            }
            window.setTimeout(next, 450);
          });
        },
        { threshold: 0.6 }
      );
      sweep.observe(compare);
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
    var rvEls = qa(
      ".section__head, .reader, .compare, .tiles .tile, .steps .step, .controls .panel, .grid--2 .card, .metrics .metric, .prose, .term, .faq__item, .railband__caption",
    );
    var groups = {};
    each(rvEls, function (el) {
      var parent = el.parentNode;
      if (!groups[parent]) groups[parent] = 0;
      var i = groups[parent];
      groups[parent] = i + 1;
      el.classList.add("rv");
      el.style.setProperty("--rd", Math.min(i * 0.08, 0.4) + "s");
    });
    var revealObserver = new IntersectionObserver(
      function (entries) {
        each(entries, function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("in");
          revealObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    each(rvEls, function (el) {
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
