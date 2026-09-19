export const NAME: string;
export const DESCRIPTION: string;
export const ICONS: Record<number, string>;
export function baseManifest(version: string): Record<string, any>;
export function manifestFor(target: "chrome" | "firefox", version: string): Record<string, any>;
