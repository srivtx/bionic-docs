/* Types for the asset stamp, which is a .mjs script so it can be run directly
   by Node and imported by the site checks without a build step. */
export declare const REF_RE: RegExp;
export declare function assetVersion(assetsDir: string): string;
export declare function siteDir(): string;
export declare function stalePages(site: string, version: string): string[];
export declare function stampPages(site: string, version: string): number;
