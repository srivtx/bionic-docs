/**
 * A designed replacement for the browser's own select popup.
 *
 * The native <select> stays in the document as the source of truth: callers
 * keep reading and writing `select.value` and listening for "change". The
 * select is hidden and a button plus a listbox are drawn next to it, following
 * the WAI-ARIA select-only combobox pattern (arrow keys, Home/End, Enter,
 * Space, Escape, type-ahead).
 */

const OPEN_CLASS = "is-open";
const TYPEAHEAD_MS = 600;

let uid = 0;

export interface EnhancedSelect {
  /** Redraw the button and list from the select (options or value changed). */
  refresh(): void;
  close(): void;
}

/** Decorative glyphs are drawn in CSS (select.css), so no markup is parsed. */
function glyph(className: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = className;
  span.setAttribute("aria-hidden", "true");
  return span;
}

/** The visible name of the select, from its <label> or aria-label. */
function labelText(select: HTMLSelectElement): string {
  const aria = select.getAttribute("aria-label");
  if (aria) return aria;
  const label = select.labels?.[0];
  if (!label) return "";
  const named = label.querySelector(".field-label, .row-label");
  return (named ?? label).textContent?.trim() ?? "";
}

/**
 * Wrap a select in the designed control. Safe to call once per select; a
 * second call returns the existing control.
 */
export function enhanceSelect(select: HTMLSelectElement): EnhancedSelect {
  const existing = (select as unknown as { __bpSelect?: EnhancedSelect }).__bpSelect;
  if (existing) return existing;

  const id = `bp-select-${(uid += 1)}`;
  const wrap = document.createElement("span");
  wrap.className = "bp-select";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "bp-select-button";
  button.id = `${id}-button`;
  button.setAttribute("role", "combobox");
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", `${id}-list`);
  const name = labelText(select);
  if (name) button.setAttribute("aria-label", name);
  const value = document.createElement("span");
  value.className = "bp-select-value";
  button.append(value, glyph("bp-select-chevron"));

  const list = document.createElement("ul");
  list.className = "bp-select-list";
  list.id = `${id}-list`;
  list.setAttribute("role", "listbox");
  list.tabIndex = -1;
  if (name) list.setAttribute("aria-label", name);
  list.hidden = true;

  select.parentNode?.insertBefore(wrap, select);
  wrap.append(select, button, list);
  select.classList.add("bp-select-native");
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");

  let active = -1;
  let typed = "";
  let typedAt = 0;

  const items = (): HTMLLIElement[] => Array.from(list.children) as HTMLLIElement[];

  const setActive = (index: number): void => {
    const all = items();
    if (all.length === 0) return;
    active = Math.max(0, Math.min(all.length - 1, index));
    all.forEach((li, i) => li.classList.toggle("is-active", i === active));
    const li = all[active];
    if (li) {
      button.setAttribute("aria-activedescendant", li.id);
      li.scrollIntoView({ block: "nearest" });
    }
  };

  // Programmatic selection (select.value, selectedIndex or option.selected)
  // fires no event, so those setters are watched and schedule one redraw.
  let pending = false;
  const schedule = (): void => {
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      render();
    });
  };

  const watched = new WeakSet<HTMLOptionElement>();
  const optionSelected = Object.getOwnPropertyDescriptor(HTMLOptionElement.prototype, "selected");
  const watchOption = (option: HTMLOptionElement): void => {
    if (watched.has(option) || !optionSelected?.get || !optionSelected.set) return;
    watched.add(option);
    Object.defineProperty(option, "selected", {
      configurable: true,
      get() {
        return optionSelected.get!.call(option);
      },
      set(next: unknown) {
        optionSelected.set!.call(option, next);
        schedule();
      },
    });
  };

  function render(): void {
    const options = Array.from(select.options);
    options.forEach(watchOption);
    const selected = select.selectedIndex;
    value.textContent = options[selected]?.textContent ?? "";
    list.textContent = "";
    options.forEach((option, i) => {
      const li = document.createElement("li");
      li.id = `${id}-opt-${i}`;
      li.className = "bp-select-option";
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", i === selected ? "true" : "false");
      li.dataset.index = String(i);
      if (option.disabled) li.setAttribute("aria-disabled", "true");
      const text = document.createElement("span");
      text.className = "bp-select-option-label";
      text.textContent = option.textContent ?? "";
      li.append(glyph("bp-select-check"), text);
      if (option.title) {
        const hint = document.createElement("span");
        hint.className = "bp-select-option-hint";
        hint.textContent = option.title;
        li.appendChild(hint);
      }
      list.appendChild(li);
    });
    if (!list.hidden && active >= 0) setActive(active);
  }

  const isOpen = (): boolean => !list.hidden;

  const place = (): void => {
    wrap.classList.remove("opens-up", "aligns-end");
    try {
      const rect = button.getBoundingClientRect();
      const height = list.offsetHeight;
      const width = list.offsetWidth;
      const below = window.innerHeight - rect.bottom;
      if (below < height + 12 && rect.top > below) wrap.classList.add("opens-up");
      if (rect.left + width > window.innerWidth - 8) wrap.classList.add("aligns-end");
    } catch {
      /* default placement */
    }
  };

  const open = (): void => {
    if (isOpen() || select.disabled) return;
    render();
    list.hidden = false;
    wrap.classList.add(OPEN_CLASS);
    button.setAttribute("aria-expanded", "true");
    place();
    setActive(select.selectedIndex >= 0 ? select.selectedIndex : 0);
    document.addEventListener("pointerdown", onOutside, true);
  };

  const close = (): void => {
    if (!isOpen()) return;
    list.hidden = true;
    wrap.classList.remove(OPEN_CLASS, "opens-up", "aligns-end");
    button.setAttribute("aria-expanded", "false");
    button.removeAttribute("aria-activedescendant");
    document.removeEventListener("pointerdown", onOutside, true);
  };

  const choose = (index: number): void => {
    const option = select.options[index];
    if (!option || option.disabled) return;
    const changed = select.selectedIndex !== index;
    select.selectedIndex = index;
    render();
    close();
    button.focus();
    if (changed) select.dispatchEvent(new Event("change", { bubbles: true }));
  };

  function onOutside(event: Event): void {
    if (!wrap.contains(event.target as Node)) close();
  }

  const typeahead = (key: string): void => {
    const now = Date.now();
    typed = now - typedAt > TYPEAHEAD_MS ? key : typed + key;
    typedAt = now;
    const options = Array.from(select.options);
    const start = isOpen() ? active + (typed.length === 1 ? 1 : 0) : select.selectedIndex + 1;
    for (let step = 0; step < options.length; step += 1) {
      const i = (start + step) % options.length;
      if ((options[i]?.textContent ?? "").toLowerCase().startsWith(typed.toLowerCase())) {
        if (isOpen()) setActive(i);
        else choose(i);
        return;
      }
    }
  };

  button.addEventListener("click", () => {
    if (isOpen()) close();
    else open();
  });

  button.addEventListener("keydown", (event) => {
    const count = select.options.length;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
        event.preventDefault();
        if (!isOpen()) open();
        else setActive(active + (event.key === "ArrowDown" ? 1 : -1));
        return;
      case "Home":
      case "End":
        if (!isOpen()) return;
        event.preventDefault();
        setActive(event.key === "Home" ? 0 : count - 1);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        if (isOpen()) choose(active);
        else open();
        return;
      case "Escape":
        if (!isOpen()) return;
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      case "Tab":
        if (isOpen()) choose(active);
        return;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          typeahead(event.key);
        }
    }
  });

  list.addEventListener("pointerdown", (event) => event.preventDefault());
  list.addEventListener("click", (event) => {
    const li = (event.target as Element | null)?.closest<HTMLLIElement>(".bp-select-option");
    if (li) choose(Number(li.dataset.index));
  });
  list.addEventListener("pointermove", (event) => {
    const li = (event.target as Element | null)?.closest<HTMLLIElement>(".bp-select-option");
    if (li) setActive(Number(li.dataset.index));
  });

  // A click on the <label> focuses the hidden select; send it to the button.
  select.addEventListener("focus", () => button.focus());

  // Keep the button in step when code assigns select.value or selectedIndex.
  const proto = HTMLSelectElement.prototype;
  for (const key of ["value", "selectedIndex"] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, key);
    if (!descriptor?.get || !descriptor.set) continue;
    Object.defineProperty(select, key, {
      configurable: true,
      get() {
        return descriptor.get!.call(select);
      },
      set(next: unknown) {
        descriptor.set!.call(select, next);
        schedule();
      },
    });
  }
  try {
    new MutationObserver(() => schedule()).observe(select, { childList: true, subtree: true, attributes: true });
  } catch {
    /* options are fixed after load anyway */
  }

  render();
  const control: EnhancedSelect = { refresh: render, close };
  (select as unknown as { __bpSelect?: EnhancedSelect }).__bpSelect = control;
  return control;
}

/** Enhance every select under `root`. */
export function enhanceSelects(root: ParentNode = document): void {
  for (const select of Array.from(root.querySelectorAll<HTMLSelectElement>("select"))) {
    try {
      enhanceSelect(select);
    } catch {
      /* the native select keeps working */
    }
  }
}
