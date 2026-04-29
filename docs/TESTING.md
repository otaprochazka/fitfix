# Testing — jak to teď v FitFix funguje

Tento dokument je **operační manuál**: kdy testy spouštět, kam co psát,
co je gating a co ne. Strategický plán („proč zrovna tahle vrstva“)
zůstává v [`TESTING_PLAN.md`](TESTING_PLAN.md). Pokud něco píšeš poprvé,
přečti **TESTING.md** (tady) a kouknul do plánu jen na motivaci.

## TL;DR

| chci… | spusť | trvá |
| --- | --- | --- |
| rychle ověřit, že nic není rozbité | `npm test` | <1 s |
| watch mode při psaní libů | `npm run test:watch` | — |
| coverage report (HTML v `coverage/`) | `npm run test:coverage` | ~2 s |
| odpálit e2e v reálném Chromiu | `npm run test:e2e` | ~12 s (build + run) |
| e2e v Playwright UI módu | `npm run test:e2e:ui` | — |
| zkontrolovat bundle size budget | `npm run check:bundle-size` | <1 s |

CI běží všechno výše + lint + tsc na test souborech. Viz
`.github/workflows/ci.yml`.

## Architektura testů

```
tests/
├── api/                          ← vitest, env=node, MCP-server-ready surface
│   ├── dual-target.test.ts       ★ statický strážce — fail při browser-only kódu v src/lib/
│   ├── fit-parser.test.ts        walker + parseActivity
│   ├── fit-roundtrip.test.ts     (rezerva — zatím v rewrite)
│   ├── fit-rewrite.test.ts       dropRecords / trimToRange / splitAt
│   ├── merge.test.ts             ★ LRU growth-ratio guard ≤ 1.05×
│   ├── cleanJitter.test.ts       cluster scan → clean → re-scan
│   ├── fitToGpx.test.ts          GPX 1.1 envelope, trkpt count, lat/lon ranges
│   ├── fitStats.test.ts          summary perf budget < 50 ms
│   ├── detectors/
│   │   ├── elevation.test.ts     ≤ 1 Suggestion per detector run
│   │   ├── trim.test.ts          ≤ 2 (start + end)
│   │   ├── spikes.test.ts        ≤ 3 (HR + power + speed)
│   │   └── loops.test.ts         N candidates → ≤ 1 aggregated Suggestion
│   ├── edits/
│   │   ├── timeshift.test.ts     determinism + invertibility
│   │   ├── spikes.test.ts        determinism napříč 5 fix-flag kombinacemi
│   │   └── privacy.test.ts       zone-over-start nullifies + recompute
│   └── fixtures/
│       ├── indoor.test.ts        indoor-zwift.fit → indoor=true, no GPS
│       └── multi-lap.test.ts     multi-lap-intervals.fit → 5+ laps
├── dom/                          ← vitest, env=jsdom, jen kód co potřebuje DOMParser/window
│   └── tcx-import.test.ts        parseTcxActivity (DOMParser) — přesune se do api/ až bude xmldom
├── e2e/                          ← Playwright, chromium
│   ├── editor-load.spec.ts       drop FIT → editor + summary cross-check vs API
│   ├── editor-error.spec.ts      non-FIT silent reject + corrupt FIT → editor-error visible
│   └── download.spec.ts          export FIT/GPX/TCX → download non-zero
├── fixtures/                     ← test inputs (NEpatří do public/samples/, neshippuje se v PWA bundle)
│   ├── indoor-zwift.fit
│   ├── multi-lap-intervals.fit
│   ├── garmin-tcx-export.tcx
│   └── README.md                 ← provenance + license per file
├── setup/
│   └── api-setup.ts              vi.mock('src/i18n', stub) pro node běh detektorů
└── stubs/
    └── i18n.ts                   stub vrací klíč místo přeložené stringu
```

## Tři vrstvy, tři role

### 1. `tests/api/**` — pure-function tests (jsou nejcennější)

**Toto je hlavní investice.** Pouze čisté funkce z `src/lib/**`. Žádný
React, žádný DOM, žádný `localStorage`. Cíl: stejný kód poběží
**unmodified v MCP serveru** v `packages/core/`. Strážce
`dual-target.test.ts` to vynucuje — fail když cokoliv pod `src/lib/`
sáhne na `window.X / document.X / localStorage / DOMParser / FileReader /
URL.createObjectURL / Blob / sessionStorage / navigator.X` nebo
importuje React/react-i18next.

**Když to selže:**
- ideálně přesuň browser-only volání ven (do `persist.ts` / `download.ts`
  / Panel.tsx, které jsou prokazatelně PWA-only),
- nebo přidej soubor do `EXCLUDE_FILES` v `dual-target.test.ts`
  s komentářem **proč** je browser-only a kdy se to napraví (link na
  MCP_SERVER_BACKLOG.md Phase 0 položku).

### 2. `tests/dom/**` — vitest s jsdom

Pro pár modulů co potřebují DOM (zatím jen `parseTcxActivity` který
používá `DOMParser`). **Přemýšlej dvakrát**, než sem něco dáš — pravidlo
je: pokud to potřebuje DOM, nepatří to do core. `tests/dom/` je
přechodná škatulka než se to refaktoruje. Až `parseTcxActivity` přejde
na `@xmldom/xmldom`, jeho test se přesune do `tests/api/`.

### 3. `tests/e2e/**` — Playwright proti `vite preview`

Smoke + integrační. Záměrně malé množství speců, vysoké pokrytí kritické
cesty. **Necross-checkuj** věci, co testy v `api/` už dokazují (např.
neasertuj bytes-equality v e2e). E2e je tu na to ověřit, že drag-drop,
routing a download eventy ve skutečném prohlížeči fungují.

## Kdy psát jaký test

### Přidávám nový detector / edit pod `src/lib/edits/<name>/`

Tohle je **gated rule**: nemerguje se PR bez obojího v jednom kuse.

- `tests/api/detectors/<name>.test.ts` — shape Suggestion[], invarianty
  z paměti `feedback_jitter_summary_pattern.md` (max 1 Suggestion na
  issue type, agregace N occurrences), `feedback_findings_open_tool.md`
  (ManualAction backlink přes `manualActionId`).
- `tests/api/edits/<name>.test.ts` — determinism (run twice → identical
  bytes), idempotence kde dává smysl, summary deltas (např. force-net-zero
  → ascent − descent ≈ 0).
- Pokud detector potřebuje pozitivní case, který Edge 500 fixture neumí,
  buď přidej veřejně-licencovaný fixture do `tests/fixtures/`, nebo
  vygeneruj přes `tests/fixtures/synth.ts` (až bude). **Nikdy** žádný
  privátní activity file.
- E2e spec **jen pokud** se UI flow detectoru meaningfully liší od těch
  co už jsou pokryty v `editor-load`/`download` (typicky není potřeba).

### Měním parser / encoder / merger v `src/lib/{fit,merge,rewrite,activity}.ts`

- Vždy spusť `npm test` před push — `merge.test.ts` chytá LRU regression
  okamžitě (growth ratio ≤ 1.05×).
- Pokud měníš encoder, **ověř na 357 KB Edge 500 fixture**:
  `./node_modules/.bin/tsx scripts/test-merge.ts a.fit b.fit /tmp/out.fit`
  by mělo hlásit growth ratio ≤ 1.05× (per AGENTS.md §5).
- Pokud tvá změna ovlivní point shape v `NormalizedActivity`, zkontroluj,
  že `parseActivity` cross-check v `fit-parser.test.ts` (records ==
  points.length) drží.

### Měním UI komponenty pod `src/components/`

- E2e v `tests/e2e/` by mělo zachytit broken drag-drop, missing summary
  card, broken export buttons. Pokud refaktoruješ EditorView, **zachovej
  `data-testid` atributy** (`editor-root`, `editor-error`, `export-fit`,
  `export-gpx`, `export-tcx`, `dropzone`, `dropzone-input`). Bez nich
  e2e zhrouchne.
- Když přidáváš novou kritickou interakci (napr. nové export tlačítko),
  přidej k němu `data-testid` a do `tests/e2e/download.spec.ts` (nebo
  novou specu) krátký smoke.

### Bug fix

- **Vždy** přidej regression test, co reprodukuje bug, **před** opravou.
  Test selže → oprava → test projde. Tohle je jediný způsob, jak vědět,
  že fix opravdu opravuje.
- Pokud bug pochází ze špatné interakce parser ↔ encoder, regresn test
  patří do `tests/api/{merge,fit-rewrite,fit-parser}.test.ts` se
  zachycením přesných bytů, kde to selhalo.

## Quality gates

| gate | running | blocking? |
| --- | --- | --- |
| ESLint | `npm run lint` | ne (warning-only, pre-existing errors v rozpracovaném refactoru) |
| `tsc -p tsconfig.test.json` | `npx tsc --noEmit -p tsconfig.test.json` | **ano** v CI |
| Vitest (api + dom) | `npm test` | **ano** v CI |
| Vite build | `npx vite build` | **ano** v CI |
| Bundle size budget (200 KB gz) | `npm run check:bundle-size` | **ano** v CI |
| Playwright e2e | `npm run test:e2e` | **ano** v CI |

`tsc -b` (full project tsc) nevoláme v CI — pre-existing errors na
rozpracovaném unified-editor refactoru by ho shazovaly. Když dorefaktoruje
CleanView/MergeView/GpxView, povýšíme v CI z `tsc -p tsconfig.test.json`
na `tsc -b`.

## Co dělat, když test selže

1. **Pokud spadne `dual-target.test.ts`** — neuvalujte exclusion
   reflexivně. Nejdřív si rozmyslete, jestli ten kus logiky **má** být
   v core (= MCP-server-ready) a jen omylem volá browser API. Typicky
   ano: refactor, vyhoď browser-only volání ven přes thin adapter.
   Pokud genuine browser-only (např. `localStorage` perzistence —
   PWA-only, MCP server dostává data jako tool args), **přidej
   exclusion s komentářem** kam směřuje refactor.
2. **Pokud spadne LRU guard v `merge.test.ts`** — někdo rozbil
   `FitEncoder`. Oprav, ne tweakuj prahem 1.05× (AGENTS.md §5 vysvětluje
   proč).
3. **Pokud spadne perf budget v `fitStats.test.ts`** — buď je CI runner
   pomalejší, nebo se opravdu zhoršilo. Pusť 5× lokálně. Pokud konzistentně
   pomalu, najdi cause, ne zvyš threshold.
4. **Pokud spadne e2e** — `playwright-report/` má screenshot + trace.
   `npx playwright show-report` otevře HTML report. CI artefakt
   `playwright-report` se uploaduje při failure (`.github/workflows/ci.yml`).

## Když píšu nový test

1. Začni s otázkou: **„dokáže to běžet v Node?“** Pokud ano → `tests/api/`.
   Pokud potřebuje DOM → `tests/dom/` s otevřeným ticketem na refactor.
   Pokud testuje uživatelský flow přes UI → `tests/e2e/`.
2. Použij existující fixture
   `public/samples/garmin-edge-500-cycling.fit` (357 KB, public-domain,
   už shippovaný v PWA bundle) pro generic asserty. Pro positive cases
   sáhni do `tests/fixtures/` nebo přidej nový.
3. **Asserty piš na invariantech, ne na konkrétních číslech.** „Po
   force-net-zero je `ascent − descent` ≈ 0“ je trvanlivý assert. „Po
   force-net-zero je distance == 5286.4 m“ se rozbije při příští změně
   round-mode.
4. **Determinism asserty** patří ke každému `apply` z `src/lib/edits/`.
   Vzor: `Buffer.from(a).equals(Buffer.from(b)) === true`. Pokud máš
   mid-applied randomness (UUID, timestamp), prosakuje to do bytes — buď
   ji ovládni přes opt arg, nebo `freshenFileId: false`.
5. **Ne testuj implementační detaily.** Pokud refactor `findClusters`
   změní výstupní pořadí clusterů, testy by neměly cracknout, dokud
   `cleanJitter` na to umí reagovat.

## i18n stub a node běh detektorů

Detektory volají `i18n.t(...)` přímo z `run()`. Reálný `src/i18n.ts`
importuje `i18next-browser-languagedetector` (browser-only). V `api`
projektu vitestu se `src/i18n` automaticky nahrazuje stubem
(`tests/setup/api-setup.ts` + `tests/stubs/i18n.ts`), který vrací klíč
místo přeloženého textu. Tj. assert na title typu
`expect(s.title).toBe('editor.elevation.net_delta_title')` projde — to
je featura, ne bug.

Pokud detektor přidávaš a chceš asserovat **vykreslený** text, dej
přednost `i18n.t(klíč, vars)` formě a v testu kontroluj `s.title`
začíná tím klíčem. Reálné překlady se testují v `tests/e2e/` při
vykreslení v prohlížeči.

## Fixtures: pravidla

- **Jen veřejně licencované** (MIT / BSD / CC0 / public-domain /
  Apache 2.0 / explicit author release). Nikdy privátní activity files.
- Velikost ideálně < 500 KB.
- Patří do `tests/fixtures/`, **ne** do `public/samples/` (to ship do
  PWA bundle pro homepage demo).
- Každý nový fixture **musí mít řádek v `tests/fixtures/README.md`**:
  source URL, license, key properties (kolik bodů, sport, has-GPS,
  multi-lap, atd.) a hint, který test ho konzumuje.
- Když není možné sourcovat veřejný fixture (jitter activity, parkrun,
  Polar TCX export…), preferuj **synthetic builder**
  `tests/fixtures/synth.ts` (zatím se píše) co emituje validní FIT bytes
  z deklarativního shape.

## Když mám pochybnosti

- AGENTS.md §5 (encoder LRU), §6 (dev commands), §11 (kam plug-in).
- TESTING_PLAN.md (proč jsou testovací vrstvy zrovna takhle).
- `docs/MCP_SERVER_BACKLOG.md` (proč je `dual-target.test.ts` load-bearing).

Pokud test pomáhá zachytit reálné regrese a je rychlý — patří do suite.
Pokud testuje něco, co se mění každý sprint, nejspíš testuje
implementační detaily místo behaviour. Refactoruj nebo smaž.
