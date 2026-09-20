/*
 * bionic — page transitions.
 *
 * A static site normally cuts hard when you move between pages: one document
 * disappears and the next appears with nothing connecting them. The arriving
 * half of the fix is CSS (html.nav body, a class the inline bootstrap adds
 * before first paint). This file does the leaving half — it fades the page
 * you are on, then navigates.
 *
 * It only intercepts a plain left-click on a same-origin page link. Modified
 * clicks, middle clicks, new tabs, downloads, external links and in-page
 * anchors are all left to the browser. Under prefers-reduced-motion it does
 * nothing at all, so the site behaves exactly as it did before.
 */
(function () {
  "use strict";

  var root = document.documentElement;

  var reduce = false;
  try {
    reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (err) {
    /* ignore */
  }
  if (reduce) return;

  var LEAVING = "is-leaving";
  var EXIT_MS = 170;
  var FAILSAFE_MS = 700;

  function destination(anchor, event) {
    if (!anchor || !anchor.getAttribute) return null;
    if (event.button !== 0) return null;
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
    /* Same document, different fragment: the browser should scroll, not fade. */
    if (url.pathname === window.location.pathname && url.search === window.location.search) {
      return null;
    }
    return url;
  }

  document.addEventListener("click", function (event) {
    if (event.defaultPrevented) return;
    var target = event.target;
    var anchor = target && target.closest ? target.closest("a[href]") : null;
    var url = destination(anchor, event);
    if (!url) return;

    event.preventDefault();

    var navigated = false;
    function go() {
      if (navigated) return;
      navigated = true;
      window.location.href = url.href;
    }

    root.classList.add(LEAVING);
    /* Fade first, then go; the second call is a failsafe so a link can never
       be swallowed if something goes wrong with the timeout. */
    window.setTimeout(go, EXIT_MS);
    window.setTimeout(go, FAILSAFE_MS);
  });

  /* Restoring from the bfcache must never show a faded page. */
  window.addEventListener("pageshow", function (event) {
    if (event.persisted) root.classList.remove(LEAVING);
  });
})();
