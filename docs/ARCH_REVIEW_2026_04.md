# FitFix — architektonické review (2026-04-29)

Pohled seniorního vývojáře/architekta na **stav před public-GitHub releasem**. Cíl:
standardní patterny, snadná rozšiřitelnost a odolnost vůči uživatelským chybám.

Severity: 🔴 blocker pro public release · 🟠 měl bys to dořešit · 🟡 polish.

---

## 1. Co je už dobře (nech tak)

- **Plugin registry + auto-discovery** (`src/lib/plugins/{registry,index,types}.ts`,
  Vite `import.meta.glob('../edits/*/register.ts')`) — přidat fázi = nový adresář,
  žádný centrální index. Detector / Suggestion / ManualAction kontrakty jsou
  čisté, dokumentované a single-responsibility.
- **Discriminated unions** pro `View` (App.tsx) a `Edit.kind` — typ-bezpečné a
  přehledné.
- **Snapshot history** v `ActivityStore` místo replay logu — pro daný rozsah
  (≤30k bodů, ≤2 MB) správné rozhodnutí.
- **Test pyramida**: API testy parseru/detektorů/editů + DOM (jsdom) +
  Playwright e2e + bench skript. Poměr 23 unit / 3 e2e je zdravý.
- **AGENTS.md** zachycuje známé pasti (encoder LRU, StrictMode hotfix) —
  vynikající onboarding artefakt.
- **Privacy story** je konzistentně dodržená — žádný `fetch` mimo i18n
  resources, vše client-side.

---

## 2. Blockery pro public release 🔴

### 2.1 TypeScript není ve `strict` módu
`tsconfig.app.json` má jen `noUnusedLocals/Parameters` a `noFallthroughCasesInSwitch`.
Chybí `"strict": true`, `"noUncheckedIndexedAccess": true`,
`"exactOptionalPropertyTypes": true`. Pro 13k LOC binárního parseru je to ruleta —
`points[i].lat` může být `number | undefined` a kompilátor mlčí.

**Fix**: zapni `strict` + `noUncheckedIndexedAccess`, projdi cca 100 chybových
hlášek. Bez toho bude každý PR roulette „kompiluje se ≠ funguje“.

### 2.2 Žádný `<ErrorBoundary>`
Grep `ErrorBoundary|componentDidCatch|getDerivedStateFromError` → 0 výskytů.
Jeden render-time exception v `EditorView` (např. malformed FIT, který projde
parserem ale spadne v advisoru) zabije celou aplikaci a uživatel ztratí
rozeditovaný soubor. Pro public release fatální UX bug.

**Fix**: minimálně jeden boundary kolem `EditorView` (a kolem `<HomeView>`),
co umožní stáhnout poslední validní bytes a nabídne reload. Při ErrorBoundary
dispatch mrkni do `ActivityStore.history[cursor].activity.bytes` — ten je vždy
validní (předchozí stav).

### 2.3 Persistence přes `localStorage` + base64
`src/lib/persist.ts` ukládá multi-MB FIT bytes přes `btoa(String.fromCharCode(...))`
do `localStorage`:
- **+33 %** bloat z base64,
- **synchronně** blokuje main thread (`btoa` na 5MB ~50–150 ms na slabém HW),
- **5–10 MB hard cap** prohlížeče → kód v `persist.ts:80-84` ručně LRU-evictuje,
  uživatel ztrácí historii bez varování,
- na `String.fromCharCode(...parts)` u velkých polí navíc spreadne argumenty
  → `RangeError: Maximum call stack size exceeded` (proto tam je
  `parts.join('')`, ale stejně je to fragilní).

**Fix**: přepiš na **IndexedDB** (binary blob přímo, async, ~50–500 MB defaultní
quota podle browseru). Nepotřebuješ knihovnu — nativní IDBObjectStore stačí
~80 řádků. Veřejný site bez tohoto bude padat na lidech, co edituji 8h Ironman
soubor (~6–10 MB).

### 2.4 `<StrictMode>` vypnutý kvůli OOM v dev
`src/main.tsx` má hotfix komentář — multi-MB Uint8Array a 16k `Date` objektů
žije v `useState`. StrictMode dvakrát-invokuje a Firefox padá. Tohle je
**symptom architektonické chyby**, ne hotfix.

**Fix**: vytáhni `bytes` + `points` mimo React state — `useRef`, externí store
(Zustand/Jotai/Valtio), nebo prostý module-scoped `Map<id, Activity>`. Komponenta
drží jen `currentActivityId: string`. Tím:
- StrictMode jde znovu zapnout,
- React Profiler přestane zápasit s `Object.is` na 30k Dateoch,
- otevíráš dveře k Suspense a web workerům.

---

## 3. Měl bys to dořešit 🟠

### 3.1 `EditorView.tsx` = 1139 řádků (god component)
Drží: cursor state, mapový state, advisor sort, manual tool router, export,
download, history. Při dalším pluginu přibude ještě.

**Fix**: rozseč na `<EditorShell>` (layout) + `<AdvisorPanel>` + `<ToolSubpage>` +
`<ExportPanel>` + `<MapPreview>` jako dnes, ale s vlastním stavem a
přes `useActivityStore()` data. Cílový strop ~300 LOC na komponentu.

### 3.2 i18n se vyhodnotí v okamžiku detekce, ne renderu
Detektory volají `i18n.t('editor.spikes.title_hr')` uvnitř `run()` a string
zamknou do `Suggestion.title`. Když uživatel přepne EN→CS poté, co detekce
proběhla, karty zůstanou v EN dokud se aktivita nezmění.

**Fix**: změň kontrakt na `titleKey: string` + `titleParams?: Record<string,unknown>`,
rendering dělá `<SuggestionCard>` přes `useTranslation()`. Zároveň získáš
type-safe params (přes `keyof Resources`).

### 3.3 `Edit.apply` je closure → ne-serializovatelné
`Edit` má `apply: (prev: Uint8Array) => Uint8Array | Promise<Uint8Array>`,
která closure-uje parametry (`currentZones`, `offsetS`, …). Důsledky:
- nelze ukládat history jako log editů (jen jako snapshoty),
- nelze sdílet „recept oprav“ mezi sessions / zařízeními,
- nelze replay testem zpětně reprodukovat,
- nelze poslat edit do web workeru (postMessage closure neumí).

**Fix**: udělej `Edit` čistě data (`{ kind, params }`) + samostatný
`executors: Record<Edit['kind'], (prev, params) => Uint8Array>` registr.
Closure-styl si nech jen pro plně manuální tools. Otevírá to dveře pro:
serializovatelnou history, sdílené permalink-recepty, e2e replay testy,
worker offload, a „undo do snapshotu N“ bez reparse celé historie.

### 3.4 Detektory běží na main threadu po každém commitu
`EditorView.tsx:849-862`: `useEffect` na `[activity]` → spustí všech ~10
detektorů přes 30k bodů. Žádný memo-cache podle `bytes` hashe. Po každém
undo/redo zbytečné výpočty.

**Fix krátkodobě**: přesuň výpočet do `useMemo` keyed na
`activity.bytes` reference (ekvivalentní hash, protože jsi imutabilní).
**Fix střednědobě**: web worker pool, debounce 100 ms, cancelable
(viz `lib/usePreview.ts` — máš tam dobrý vzor s `cancelled` flagem,
zopakuj ho pro detektory).

### 3.5 Plugin registry tichá kolize ID
`registerDetector` je `Map.set` — re-registrace stejného `id` přepíše
předchozí entry „pro HMR convenience“. Pohodlné v devu, ale:
- v produkci to maskuje merge-konflikt mezi dvěma fázemi,
- není warning,
- pořadí spuštění detektorů je `Map` insertion order = pořadí Vite globu =
  pořadí filesystémových inodes na CI vs. dev. Reprodukovatelnost trpí.

**Fix**: v `import.meta.env.DEV` warni při kolizi. Přidej
`definePlugin({ ... })` factory, která vrací typovaný objekt a sama volá
register — tím získáš jedno místo pro validaci a budoucí features
(applicability, deps, priority).

### 3.6 History = full snapshot per edit
5 MB FIT × 20 editů = 100 MB v heapu. Plus Date pole reparsované per snapshot.
Aktuálně to projde u běžných souborů, ale Ironman + 30 editů = pad.

**Fix**: drž v history jen `{ kind, params, byteHash }`, raw bytes jen pro
poslední ~3 stavy (LRU). Při undo dál než LRU = replay edit-logu z originálu.
Tím se vrací bonus z 3.3.

### 3.7 Žádný web worker
Parse + apply (merge dvou velkých FITů, spike fix) se dělá synchronně.
Test na slabém Androidu (Pixel 4a, throttle Slow 4G + 4× CPU) by ti to
ukázal jako 3–8s freeze.

**Fix**: `Comlink` (1 KB) nebo nativní `new Worker(new URL(..., import.meta.url))`,
přesuň `parseActivity` + executors. Bonusem padne 3.4 a vrátí se StrictMode.

---

## 4. Polish před public 🟡

- **`vercel.json` security headers**: přidej `Content-Security-Policy`
  (`default-src 'self'; img-src 'self' data: https://*.tile.openstreetmap.org`),
  `Referrer-Policy: no-referrer`, `Permissions-Policy: geolocation=()`,
  `X-Content-Type-Options: nosniff`. Pro privacy-first tool je to UX signál.
- **`SECURITY.md` chybí** — privacy-first projekt potřebuje responsible-disclosure
  kanál. Napiš jeden řádek: „report to <email>“.
- **`CONTRIBUTING.md` + `.github/PULL_REQUEST_TEMPLATE.md`** — definuj jak přidat
  fázi (odkaz na `AGENTS.md` §3 stačí), jak spustit testy, conventional commits.
- **`CODEOWNERS`** — i pro solo projekt, GitHub UX.
- **ESLint je `recommended` only** — zapni `tseslint.configs.strictTypeChecked`
  (vyžaduje `parserOptions.project`), `react-hooks/exhaustive-deps` jako error.
  Aktuálně 8 výskytů `console.*` v `src/` — přidej pravidlo `no-console: ['error',
  { allow: ['warn', 'error'] }]` aby `console.log` neprošel reviewem.
- **Bundle**: rozděl Leaflet do lazy chunku — uživatel co přijde čistit FIT
  bez náhledu mapy nepotřebuje 150 KB CSS+JS hned. `React.lazy` na `MapPreview`.
- **Žádné dismiss-state pro suggestions** — uživatel co odmítne kartu „spike fix“
  ji uvidí znovu po reloadu. Přidej `dismissedIds: Set<string>` do persist
  vrstvy keyed na `(sessionId, suggestionId)`.
- **`ActivityStore` není unit-testován** — undo/redo/branch-truncate logika
  je v `useCallback` uvnitř komponenty. Vytáhni do čistého `historyReducer`,
  pokryj testy. Aktuálně to máš jen pokryté přes e2e.
- **`as any` / `eslint-disable` audit**: doporučuji projít a buď opravit nebo
  okomentovat proč — public reviewer první kouká právě sem.

---

## 5. Doporučené pořadí

1. **Týden 1 (blockery)**: ErrorBoundary (1.5h), TS strict + fixy (1d),
   IndexedDB persist (0.5d).
2. **Týden 2 (architektura)**: Edit jako data + executors registr (0.5d),
   `historyReducer` extrakce + testy (0.5d), aktivita do externího store +
   re-enable StrictMode (1d), dekompozice EditorView (1d).
3. **Týden 3 (perf + polish)**: web worker pro parse/apply (1d),
   memoizace detektorů (2h), security headers + SECURITY.md +
   ESLint strict (3h), bundle split mapy (3h).

Každý krok je nezávislý, dá se otevřít jako samostatný PR. Po (1) je repo
„safe pro public“, po (2) je „pohodlně rozšiřitelné dalšími fázemi“,
po (3) je „rychlé i na slabých zařízeních“.

---

## 6. Co by mě v PR review zarazilo nejdřív

Pořadí dle „first impression“ pro lidi, co kliknou na repo:
1. `tsconfig` bez `strict` (5 sekund od otevření).
2. `EditorView.tsx` 1139 řádků (otevřou nejvíc featurnatý soubor).
3. `main.tsx` hotfix komentář o StrictMode (signál „něco hoří“).
4. `persist.ts` `btoa(String.fromCharCode(...))` na MB datech.
5. Žádný `ErrorBoundary` (grep během triage).

Když adresuješ těchto 5, repo působí na PR review jako „senior projekt“
i bez dalších změn.
