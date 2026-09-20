/*
 * bionic — client-side navigation.
 *
 * The site is static, so a link used to cost a full document load: the
 * stylesheet re-parsed, the scripts re-run, and the page painted from
 * scratch. This intercepts a plain click on a same-origin page link, fetches
 * the next page, and swaps its <main> into the document in place. One small
 * request, no reload, and the page modules re-initialise against the new
 * content through window.BionicSite, which demo.js and art.js register into.
 *
 * Where the browser has the View Transitions API the swap runs inside one, so
 * the two views cross-fade. Where it does not, the swap is instant. Either
 * way there is never a blank frame and never a wait on an animation.
 *
 * Anything it cannot do safely falls back to the browser navigating normally:
 * a modified or middle click, a new tab, a download, a cross-origin link, an
 * in-page anchor, a failed request, or a response that is not HTML.
 */
(function () {
  "use strict";

  if (!window.fetch || !window.history || !window.DOMParser || !window.URL) return;

  var doc = document;
  var cache = new Map();

  var reduce = false;
  try {
    reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (err) {
    /* ignore */
  }

  function q(selector, scope) {
    return (scope || doc).querySelector(selector);
  }

  /* ---- which clicks are ours to handle ---------------------------------- */

  function destination(anchor, event) {
    if (!anchor || !anchor.getAttribute) return null;
    if (event.defaultPrevented || event.button !== 0) return null;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
    if (anchor.target && anchor.target !== "_self") return null;
    if (anchor.hasAttribute("download")) return null;

    var href = anchor.getAttribute("href");
    if (!href || href.charAt(0) === "#") return null;
    if (/^(mailto:|tel:|javascript:)/i.test(href)) return null;

    var url;
    try {
      url = new URL(href, window.location.href);
    } catch (err) {
      return null;
    }
    if (url.origin !== window.location.origin) return null;
    /* Only pages of this site: a page, or a directory. */
    if (!/(\.html?|\/)$/.test(url.pathname)) return null;
    /* Same document, different fragment: the browser should scroll, not swap. */
    if (url.pathname === window.location.pathname && url.search === window.location.search) {
      return null;
    }
    return url;
  }

  /* ---- pulling the next page apart ------------------------------------- */

  function extract(text, url) {
    var parsed = new DOMParser().parseFromString(text, "text/html");
    var main = parsed.querySelector("main");
    if (!main) return null;
    function content(selector, attr) {
      var el = parsed.querySelector(selector);
      return el ? el.getAttribute(attr) || "" : "";
    }
    return {
      main: main,
      title: parsed.title || doc.title,
      description: content('meta[name="description"]', "content"),
      canonical: content('link[rel="canonical"]', "href") || url.href,
      ogUrl: content('meta[property="og:url"]', "content") || url.href,
    };
  }

  function setAttr(selector, attr, value) {
    var el = q(selector);
    if (el && value) el.setAttribute(attr, value);
  }

  /* The header and the docs sidebar sit outside <main>, so they have to be
     told which page is now current. */
  function markNav(pathname) {
    var links = doc.querySelectorAll(".nav__links a, .docs__nav a");
    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      var path = "";
      try {
        path = new URL(link.getAttribute("href"), window.location.href).pathname;
      } catch (err) {
        path = "";
      }
      if (path && path === pathname) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
  }

  function initModules() {
    var init = (window.BionicSite && window.BionicSite.init) || [];
    for (var i = 0; i < init.length; i++) {
      try {
        init[i]();
      } catch (err) {
        /* One page module failing must not stop the navigation. */
      }
    }
  }

  /* ---- the swap --------------------------------------------------------- */

  function apply(next, url, scrollY) {
    var current = q("main");
    if (!current) {
      window.location.href = url.href;
      return;
    }

    var incoming = doc.importNode(next.main, true);
    current.replaceWith(incoming);

    doc.title = next.title;
    setAttr('meta[name="description"]', "content", next.description);
    setAttr('link[rel="canonical"]', "href", next.canonical);
    setAttr('meta[property="og:url"]', "content", next.ogUrl);

    markNav(url.pathname);
    initModules();

    var fragment = url.hash ? doc.getElementById(url.hash.slice(1)) : null;
    if (fragment) fragment.scrollIntoView({ block: "start" });
    else window.scrollTo(0, scrollY == null ? 0 : scrollY);

    /* Focus follows the content, the way a route change should. */
    incoming.setAttribute("tabindex", "-1");
    try {
      incoming.focus({ preventScroll: true });
    } catch (err) {
      incoming.focus();
    }
  }

  function swap(next, url, push, scrollY) {
    function change() {
      if (push) {
        try {
          history.pushState({ y: 0 }, "", url.href);
        } catch (err) {
          window.location.href = url.href;
          return;
        }
      }
      apply(next, url, scrollY);
    }

    if (reduce || typeof doc.startViewTransition !== "function") {
      change();
      return;
    }
    try {
      doc.startViewTransition(change);
    } catch (err) {
      change();
    }
  }

  function load(url, push, scrollY) {
    var cached = cache.get(url.href);
    if (cached) {
      swap(cached, url, push, scrollY);
      return;
    }

    fetch(url.href, { credentials: "same-origin" })
      .then(function (response) {
        var type = response.headers.get("content-type") || "";
        if (!response.ok || type.indexOf("text/html") === -1) throw new Error("not a page");
        return response.text();
      })
      .then(function (text) {
        var next = extract(text, url);
        if (!next) throw new Error("no main");
        cache.set(url.href, next);
        swap(next, url, push, scrollY);
      })
      .catch(function () {
        /* A failed request is not the moment to get clever. */
        window.location.href = url.href;
      });
  }

  /* ---- events ----------------------------------------------------------- */

  doc.addEventListener("click", function (event) {
    var target = event.target;
    var anchor = target && target.closest ? target.closest("a[href]") : null;
    var url = destination(anchor, event);
    if (!url) return;

    event.preventDefault();
    try {
      history.replaceState({ y: Math.round(window.scrollY) }, "", window.location.href);
    } catch (err) {
      /* ignore */
    }
    load(url, true, null);
  });

  window.addEventListener("popstate", function (event) {
    var url;
    try {
      url = new URL(window.location.href);
    } catch (err) {
      return;
    }
    var y = event.state && typeof event.state.y === "number" ? event.state.y : 0;
    load(url, false, y);
  });

  if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";

  /* The page arrived normally, so mark where we are. */
  markNav(window.location.pathname);
})();
