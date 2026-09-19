import { api, call, degraded } from "../shared/browser";

const READER_PAGE = "reader.html";

function openReader(query: string): void {
  if (degraded || !api?.tabs?.create) return;
  try {
    const base = api.runtime?.getURL ? api.runtime.getURL(READER_PAGE) : READER_PAGE;
    api.tabs.create({ url: base + query });
  } catch {
    /* ignore */
  }
}

async function activeTabUrl(): Promise<string | undefined> {
  if (degraded || !api?.tabs?.query) return undefined;
  try {
    const tabs = await call<Array<{ url?: string }>>(api.tabs.query, api.tabs, {
      active: true,
      currentWindow: true,
    });
    return tabs?.[0]?.url;
  } catch {
    return undefined;
  }
}

function looksLikePdf(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return /\.pdf$/i.test(parsed.pathname) || /application\/pdf/i.test(url);
  } catch {
    return /\.pdf(\?|$)/i.test(url);
  }
}

async function openCurrent(): Promise<void> {
  const url = await activeTabUrl();
  if (url && looksLikePdf(url)) openReader(`?src=${encodeURIComponent(url)}`);
  else openReader("?pick=1");
}

function registerCommands(): void {
  const commands = api?.commands;
  if (!commands?.onCommand?.addListener) return;
  commands.onCommand.addListener((command: string) => {
    if (command === "open-reader") void openCurrent();
  });
}

function registerMessages(): void {
  const runtime = api?.runtime;
  if (!runtime?.onMessage?.addListener) return;
  runtime.onMessage.addListener((message: { type?: string }, _sender: unknown, respond: (r?: unknown) => void) => {
    if (message?.type === "open-current") {
      void openCurrent().then(() => respond({ ok: true }));
      return true;
    }
    return false;
  });
}

registerCommands();
registerMessages();
