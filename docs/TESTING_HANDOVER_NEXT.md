# Testing handover — co dotáhnout

**Stav k 2026-04-29** po dokončené fázi 1–4 + obě P0 položky (TCX
Node-compat parser, synth.ts FIT generator).

## Aktuální baseline (co už funguje)

- 18 vitest souborů, **70 unit/integration testů**, ~800 ms.
- 4 Playwright e2e specy, 1.9 s + ~10 s build.
- Bundle size budget gate (230 KB gzipped, aktuálně 218.9 KB — bumpnuto
  z 200 KB po landing `@xmldom/xmldom`; viz P1.1 níže pro lazy-load TODO).
- GitHub Actions CI workflow (`.github/workflows/ci.yml`).
- **Dual-target guard** (`tests/api/dual-target.test.ts`) — `src/lib/`
  je celý Node-runnable. Žádné browser-only excluded files mimo
  `persist.ts`, `download.ts`, `usePreview.ts`, `plugins/index.ts`,
  `edits/privacy/zones.ts`. **TCX parser už není ve výjimkách.**
- 3 sourced public-domain fixtures (`indoor-zwift.fit`,
  `multi-lap-intervals.fit`, `garmin-tcx-export.tcx`) + 1 demo fixture
  v `public/samples/garmin-edge-500-cycling.fit`.
- **`tests/fixtures/synth.ts`** — declarativní FIT byte generator
  (`buildFit({ points })` + `synthOutdoorRide`), round-trip ověřený
  v `tests/api/synth.test.ts`. Odblokovává pozitivní detector testy
  bez nutnosti hledat reálné fixtury s konkrétními bug patterny.

Ověř před tím, než cokoli z níže uvedeného začneš:

```bash
npm test                      # 70/70 PASS, ~800 ms
npm run test:e2e              # 4/4 PASS, ~12 s
npm run check:bundle-size     # ≤ 230 KB gz
npx tsc --noEmit -p tsconfig.test.json   # exit 0
```

Pokud cokoli červené, **nepokračuj** — to je regression z mainu, ne
problém handover dokumentu.

---

## P1 — užitečné, ale nejsou na kritické cestě

### 1.1 Lazy-load `@xmldom/xmldom` mimo main bundle

**Stav:** xmldom je staticky importován z `parseTcxActivity.ts` →
přidává ~30 KB gzipped do hlavního bundle, který uživatel stáhne i
když nikdy TCX neuploadne. Bundle budget je teď 230 KB; před xmldom
byl 200 KB (a reálný stav 188 KB).

**Co udělat:**
- Nastavit `parseActivity` v `src/lib/activity.ts` jako `async` a u
  TCX větve dynamicky importnout `parseTcxActivity` přes `await import()`.
  Vite to code-splitne do separátní chunky.
- Update `ActivityStore.load` na `async` (jediná entry-point callsite
  je `src/components/EditorView.tsx:62`).
- V edit panelech (trim/spike/loops/…) přepnout post-edit re-parse
  na `parseFitActivity` přímo — ty bytes jsou vždy FIT, nikdy TCX.
- Po dokončení snížit `BUDGET_BYTES` v `scripts/check-bundle-size.ts`
  zpátky na 200 KB.

**Odhad:** 0.5 dne, hlavně proklikat call sites.

### 1.2 Doplnit detector positive cases (synth.ts už existuje)

Po landingu `synth.ts` se přidají do existujících
`tests/api/detectors/*.test.ts` pomocí nových helperů:

- `loops.test.ts`: helper `synthPhantomLoopBurst({ atTs, cellLat, cellLon, visits, durationS })`
  → injektuj N návštěv 30m buňky, expect 1 Suggestion s phantom distance
  > 200 m, applied edit drops correct records.
- `elevation.test.ts`: synthovat closed loop s nesedícím net delta,
  expect `elevation:net-delta` Suggestion s confidence='high' když
  delta > 100 m.
- `trim.test.ts`: helper `synthSuspiciousStart({ drivingMinutes, drivingSpeedMps, then })`
  → 5 min @ 15 m/s + 30 min cycling, expect `trim:start` Suggestion.
  Edge case: 5 min walking + 30 min cycling by NEMĚLO firnout.
- `spikes.test.ts`: doplnit end-to-end přes `applySpikeFix` na synth
  fixture s injektovaným HR výjimkou.
- `jitter.test.ts`: helper `synthStationaryJitter({ atTs, lat, lon, durationS, oscillationM })`
  → stacionární jitter cluster pro `findClusters`.

**Pravidlo:** každý detector má **alespoň jeden negativní case** (na
benign fixture nepál) **a alespoň jeden positivní case** (na seeded
synth fixture pál a vrať očekávané pole). Aktuálně máme jen negativní.

**Odhad:** 1 den.

### 1.3 axe-core a11y smoke v Playwright

Po `editor-load.spec.ts` přidat axe-core scan:

```ts
import AxeBuilder from '@axe-core/playwright'

test('editor passes axe-core a11y scan (no serious/critical)', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('dropzone-input').setInputFiles(FIXTURE)
  await expect(page.getByTestId('editor-root')).toBeVisible()
  const results = await new AxeBuilder({ page }).analyze()
  const blocking = results.violations.filter(v =>
    ['serious', 'critical'].includes(v.impact ?? ''),
  )
  expect(blocking).toEqual([])
})
```

Stejné pro `home.spec.ts` a `manual-tool.spec.ts`. Cíl: 0 serious /
critical na major views. Risk areas: advisor cards (color-only
confidence indikátory), manual-tool subpages.

**Odhad:** 0.5 dne. Možná najdeš pár drobných issues k opravit.

### 1.4 Visual regression snapshots

Jednu Playwright snapshot na major view:
- home (před file dropem)
- editor (s loaded activity, no detections fired)
- manual-tool subpage (např. trim)
- error state

```ts
await expect(page).toHaveScreenshot('home-empty.png', {
  maxDiffPixelRatio: 0.001,
})
```

**Riziko:** font rendering / favicon cache mezi platformami způsobí
flake. Spouštět **jen na linux runneru v CI**, nebo s
`--update-snapshots` lokálně před PR a potvrdit ručně.

**Odhad:** 0.5 dne + následný maintenance při design change.

### 1.5 Performance budget

`tests/api/perf.test.ts`:
- parse Edge 500 fixture < 50 ms
- `getFitStats` < 25 ms
- `mergeFit` 2× 1 MB < 250 ms

**Nezapínej v PR CI** (shared GitHub runners flake na absolute time).
Pusť přes scheduled agent (1× týdně), výsledky postni do issue komentu
nebo `docs/PERF_BASELINE.md`.

**Odhad:** 0.3 dne na suite + setup `/schedule` agent.

---

## P2 — opravdu post-MVP

### 2.1 GPX import path + round-trip

Až přidáš GPX import (zatím only `fitToGpx` exporter), přidej:
- `tests/api/gpx-import.test.ts`
- `tests/api/gpx-roundtrip.test.ts` — fitToGpx output se re-importuje
  identicky (modulo lossy fields)

### 2.2 Multi-vendor FIT fuzz

Pull každý veřejně licencovaný FIT z GoldenCheetah `examples/`,
`fit-rs` test fixtures, `fit-tool` test fixtures. Single
`it.each(allFixtures)('parses without throwing', ...)`. Catches walker
breakage on unfamiliar manufacturer ids.

### 2.3 Move from `tsc -p tsconfig.test.json` to full `tsc -b` v CI

Až dorefaktoruje rozpracovaný unified-editor (CleanView/MergeView/GpxView
s unused `onBack` parametry, ActivityStore unused exports). Změna v
`.github/workflows/ci.yml` je triviální (`npx tsc -b` místo `npx tsc
--noEmit -p tsconfig.test.json`).

### 2.4 Promote ESLint z warning na error v CI

Ve workflow změnit `npm run lint || true` na `npm run lint`. Předtím
opravit pre-existing errory:
- `track/Panel.tsx:193` (prefer-const)
- `merge.ts:326` (no-explicit-any)
- `merge.ts:431` (unused `_dataSection`)
- `persist.ts:111` (prefer-const)
- `usePreview.ts:36` (refs during render)
- `ActivityStore.tsx:150` (only-export-components)

---

## Spuštění end-to-end (sanity check)

Pokud se vrátíš k testům po pauze, tohle by mělo proběhnout zelené z
mainu bez jakékoli práce:

```bash
cd /home/ota/repos/fitfix
npm install
npm test                                   # 70/70 PASS
npm run test:e2e                           # 4/4 PASS
npm run check:bundle-size                  # ≤ 230 KB gz
npx tsc --noEmit -p tsconfig.test.json     # exit 0
```

Pokud **cokoli** červené, najdeš příčinu commitem (`git log --oneline
-20`) — nech testy řídit. Když bug fix, **napiš regression test první**.

## Konvence pro PRs

- Nový detector / edit pod `src/lib/edits/<name>/` → PR **musí**
  obsahovat `tests/api/detectors/<name>.test.ts` **a**
  `tests/api/edits/<name>.test.ts`. Pokud ne, požaduj v review.
- Pozitivní detector test = synth fixture postavená přes
  `tests/fixtures/synth.ts` (nebo nový helper tam doplnit).
- Změna v `src/lib/{fit,merge,rewrite}.ts` → ověř lokálně
  `./node_modules/.bin/tsx scripts/test-merge.ts` na páru reálných FIT,
  growth ratio ≤ 1.05× (AGENTS.md §5).
- Změna v UI komponentách s `data-testid` → zachovej testid atributy
  (`editor-root`, `editor-error`, `dropzone`, `dropzone-input`,
  `export-fit/-gpx/-tcx`).

## Když narazíš

- **Detector kontrakt** (Suggestion shape, ≤1 per issue, manualActionId
  backlink): paměťové soubory `feedback_jitter_summary_pattern.md`,
  `feedback_findings_open_tool.md`, `feedback_editor_subpage_nav.md`.
- **Plugin auto-discovery** (proč `src/lib/plugins/index.ts` je
  excluded z dual-target): používá `import.meta.glob` (Vite-only).
  V testech nikdy neimportuj `plugins/index.ts`, ale jednotlivé
  `edits/<name>/detector.ts` přímo.
- **i18n v node** je stub — title strings jsou klíče, ne přeložený text.
  Detail v `TESTING.md` sekce „i18n stub a node běh detektorů“.
- **Synth.ts edge cases** — generátor pokrývá file_id + record + session
  + activity messages. Pro lap-aggregate testy (`detector
  parking-lot-laps`, atd.) bude potřeba doplnit `lapDef` a `emitLap`.
  Šablona je v synth.ts připravena (sessionDef pattern).
