# Bionic Docs — website design

The landing site in `site/` for a Manifest V3 extension that reads PDF and EPUB
with bionic fixation, entirely on-device. It is plain HTML, CSS and JavaScript:
no build step, no framework, no external requests. `tokens.json` and
`tailwind.theme.json` are generated exports of the same tokens.

## Personality

**A calm reading tool, shown working.** The site leads with the product rather
than describing it. The hero is a reader window holding a PDF page with a
chart, and its first section is a working reader. Everything after that
explains what the reader just showed. It should feel precise, quiet and
trustworthy, like a well-made document viewer.

Bionic Docs has its own identity, separate from its sibling Bionic Page. Its
accent is **teal** and its mark is a page on a teal tile. Interface type is
Geist; document text (the reader, the divider, the mode samples, the hero
sheet) is set in a serif, because that is the kind of text the extension is
for.

## Files

| File | Holds |
|---|---|
| `site/index.html` | the one page |
| `site/assets/theme.css` | tokens (light and `[data-theme="dark"]`), base elements, layout, the effect's `b.bp-head` |
| `site/assets/lens.css` | components: masthead, buttons, reader, divider, tiles, modes, steps, privacy band, install, FAQ, CTA, footer |
| `site/assets/identity.css` | the bundled Geist faces, the brand mark, the hero window and the tile illustrations |
| `site/assets/app.js` | theme, navigation, live samples, the reader, the divider, copy |
| `site/assets/core.js` | the extension's fixation algorithm, compiled from `src/core/` by `scripts/build-demo.mjs` |

`scripts/check-site.mjs` fails if the page uses a class none of the three
stylesheets defines, has an inline style, links an external resource, or lacks
its social tags. `scripts/stamp-assets.mjs` keeps the `?v=` cache-busters equal
to a hash of the assets. `scripts/e2e-site.mjs` loads the page in Chrome and
drives the theme toggle, samples, headline, reader, intensity and divider.

## Colour

One accent on a cool paper ground. Light values first, dark second.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f5f7f6` | `#090d0c` | page |
| `--bg-2` | `#edf1ef` | `#0d1312` | tinted sections, the reader's stage and sidebar, footer |
| `--card` | `#ffffff` | `#111817` | cards, tiles, windows |
| `--sheet` | `#ffffff` | `#151d1c` | document pages |
| `--ink` | `#0c1514` | `#edf5f3` | headings, emphasized word openings |
| `--body` | `#384543` | `#b6c4c0` | prose |
| `--mute` | `#66736f` | `#84938f` | secondary text |
| `--line` / `--line-2` | `#dde4e1` / `#c9d3cf` | `#1d2826` / `#2a3735` | hairlines, control borders |
| `--accent` | `#0e6e63` | `#35cfba` | primary buttons, links, focus, the divider |
| `--accent-ink` | `#0a5449` | `#6fe3d2` | hover |
| `--accent-soft` | 9% teal | 11% teal | washes: current nav link, badges, icon tiles |
| `--on-accent` | `#ffffff` | `#04140f` | text on the accent |
| `--band` | `#0b2723` | `#0d1d1b` | the privacy band, dark in both schemes |

The brand mark's tile is always `#0e6e63`, as in the extension's icon. The hero
chart uses a blue and a red so it reads as a document's own figure rather than
part of the site.

## Type

- **Geist** (variable, self-hosted woff2): interface and headings. Headings sit
  at 640 with tight tracking; the hero and closing headlines are set at 400,
  and their word openings at 720 come from the real algorithm.
- **Geist Mono**: eyebrows, file names, positions, the terminal, the module map.
- **Serif** (`Iowan Old Style`, `Charter`, Georgia): every piece of document
  text.

The headline inks in on load: each word's opening animates from the faint
colour at 400 to ink at 720, left to right. Under `prefers-reduced-motion`
it is simply drawn at its final weight.

## Shape and depth

- Radii: 8, 12, 18 and 24px (`--r-s` to `--r-xl`); pills are 999px.
- Every surface has a 1px hairline. Shadows come in three steps: cards rest
  on `--shadow-1`, raise to `--shadow-2` on hover, and windows (hero, reader,
  divider, terminal) use `--shadow-3`.
- Document stages sit on a dotted grid, so a page reads as a sheet on a desk.

## Page

1. **Masthead.** Sticky, translucent, with a hairline once scrolled. Brand,
   section links (the one in view is marked), GitHub, and a theme toggle whose
   label says what it will do.
2. **Hero.** Copy on the left: a "New" pill, the emphasized headline, a lede,
   two buttons and three guarantees. On the right, a reader window shows a PDF
   page with a chart, a zoom bar, and two floating cards. A four-figure fact
   strip closes it.
3. **Reader.** A working reader with a contents sidebar; document tabs (two
   fixtures and "Your text"); a fixation switch; the five modes; intensity; and
   page navigation, including arrow keys.
4. **Before and after.** One paragraph with a draggable, keyboard-operable
   divider. The emphasis on this layer is drawn with a text stroke rather than
   real bold, so both layers keep identical line breaks.
5. **Features.** A bento grid of six tiles, each with a small illustration
   built from markup: canvas and text layer, the zoom menu, EPUB contents, mode
   chips, the resume prompt, and keys.
6. **Modes.** Five cards, each with a live sample from the real algorithm.
7. **How it works.** Three numbered steps and a module map.
8. **Privacy.** A dark band: "There is no server." beside a network log with
   one request.
9. **Limits, Install, FAQ, closing call, footer.** The footer links the
   project, its docs, and the sibling, Bionic Page.

## Accessibility

- Body and secondary text (`--body`, `--mute`) meet 4.5:1 in both schemes; the
  band's text is checked against the band, not the page. `--faint` is kept to
  decoration: page numbers, file names and the headline's first frame.
- The reader's tabs, mode buttons and divider carry roles and state
  (`aria-selected`, `aria-pressed`, `role="slider"` with value text).
- The skip link, visible focus rings, and `prefers-reduced-motion` are
  respected. The layout works from 320px, with no horizontal scroll.
