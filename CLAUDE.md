# TARGET — Pikado Turnir Aplikacija

## Šta je projekat
Web aplikacija za vođenje pikado turnira sa **double elimination** sistemom, napravljena za klub "Target Sombor". Postoje tri odvojene celine:

1. **brackets_app/** — glavna aplikacija (produkcija)
2. **brackets_landing/** — landing page za marketing
3. **Brackets_stuff/** — stari eksperimentalni fajlovi (ne dira se)

## Hosting i infrastruktura
- **Vercel** — hosting, URL: `https://brackets-flame.vercel.app`
- **Supabase** — PostgreSQL baza + Realtime
  - URL: `https://mvsozhihhrlwdsvfynxw.supabase.co`
  - Anon key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12c296aGloaHJsd2RzdmZ5bnh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMzA5MzAsImV4cCI6MjA5MDcwNjkzMH0.F2Y9EiCQHZiIdc-cDTICZI-efFnwlmmEFVc_H5NqT04`

## Tehnologije
- Vanilla HTML/CSS/JS — **nema frameworka**; UI je inline u svakom HTML-u, bracket logika u zajedničkom `engine.js`
- Supabase JS SDK (CDN)
- Fontovi: Stardos Stencil (naslovi), DM Sans (tekst), DM Mono (monospace/skorovi)
- CSS custom properties (`--bg`, `--surface`, `--card`, `--border`, `--accent`, `--accent2`, `--text`, `--muted`, `--gold`)
- Light/dark tema — `data-theme="light"` na `<html>`, sinkovana preko Supabase `scene_state.theme`

## Fajlovi u brackets_app/

### engine.js — bracket engine (deljen)
- Učitavaju ga **oba** HTML fajla (`<script src="engine.js">`) — logika postoji samo na jednom mestu
- Čist JS bez DOM-a: routing, genBracket, replayAll, BYE, raspored, nazivi kola, scene helperi
- Test koji replay-uje pravi turnir sa papirnog listića (15.3.2025) i random turnire svih veličina
  stoji van repoa (scratchpad) — ako se menja routing, ponovo proveriti da papir i engine daju iste parove

### index.html — TV prikaz
- Pasivan ekran, **nema onclick**, samo prikazuje bracket
- Sluša Supabase Realtime na `scene_state` i `tournaments`
- Svaka scena ima `.fit` wrapper koji se skalira CSS `zoom`-om da stane **i po visini i po širini**
  (smanjuje se koliko treba, uvećava do `MAX_ZOOM`=1.35, finale do `data-maxzoom="2"`); refit na resize i kad se učitaju fontovi
- **Auto-rotacija radi na TV-u** (`autoRotateTick`): TV je uvek upaljen, telefon se zaključava.
  Menja scenu preko `scene_state` update-a sa `.eq('scene', trenutna)` (compare-and-swap, više TV-ova ne preskaču duplo)
- Prikazuje 5 scena: `sceneWinners1`, `sceneWinners2`, `sceneLosers`, `sceneSchedule`, `sceneFinale`

### scene-controller.html — Admin kontroler
- Otvara se na telefonu/tabletu
- Kontrole: izbor turnira, unos rezultata, scene switcher, auto-rotacija (toggle + brojač koji je samo indikator), raspored, CSV export, reset
- Prati promene `scene_state` sa drugih uređaja (turnir, scena, tema)
- Raspored: IGRA SE / SLEDEĆI, dugme ODLOŽI (meč ide na početak SLEDEĆI) i VRATI (poništi odlaganje)

## Supabase tabele

### `tournaments`
| Kolona | Tip | Opis |
|--------|-----|------|
| id | text | crypto.randomUUID() |
| name | text | naziv turnira |
| date | text | datum |
| players | jsonb | array stringova (originalna lista) |
| seed | jsonb | array stringova sa `"__BYE__"` za bye |
| wB | jsonb | winners bracket runde |
| lB | jsonb | losers bracket runde |
| gf | jsonb | grand final meč |
| gfr | jsonb | grand final reset meč |
| num_boards | integer | broj paralelnih stolova (default 2) |
| postponed | jsonb | array ID-eva odloženih mečeva |

### `scene_state` (uvek jedan red, id=1)
| Kolona | Tip | Opis |
|--------|-----|------|
| id | integer | uvek 1 |
| tournament_id | text | aktivan turnir |
| scene | text | ime scene |
| auto_rotate | boolean | auto-rotacija |
| theme | text | 'light' ili null (dark) |
| updated_at | timestamp | |

## Scene sistem
Moguće vrednosti za `scene`:
- `'winners-1'` → ŽREB 1 (gornja polovina za 32 igrača, ili ceo winners bracket)
- `'winners-2'` → ŽREB 2 (donja polovina, samo za turnire od 32 igrača)
- `'losers'` → REPASAŽ
- `'schedule'` → RASPORED (koji mečevi se igraju/sledeći)
- `'finale'` → FINALE + Grand Final + Champion

Stare vrednosti se normalizuju (`winners` → `winners-1`, `winners-early` → `winners-1`, itd.)

## Bracket logika (ključno za razumevanje)

### BYE konstanta
```js
const BYE = "__BYE__";
```
`makeSeed(players)` raspoređuje BYE-eve u **različite parove** 1. kola (BYE nikad ne igra protiv BYE-a),
na random stranu para. U repasažu BYE vs BYE ipak može da nastane (dva susedna W meča sa BYE) —
tada BYE "pobeđuje" i ide dalje dok ne sretne pravog igrača. BYE meč čeka dok protivnik nije poznat.

### Routing (generisan, ne hard-kodiran)
`buildRoutingTable(size)` radi za bilo koji stepen dvojke 4–32 i daje **iste parove kao papirni Target listić**:
- W kolo 0 → poraženi idu u L kolo 0 u parovima (M0+M1 → L_R1_M0 …)
- L kola: parna = *reduce* (L pobednici međusobno), neparna = *feed* (u njih padaju W poraženi).
  Pobednici L kola **uvek idu pravo** (`L_R1_M4 → L_R2_M4`, reduce: 2i,2i+1 → i) — na TV-u bez linija se vidi ko koga čeka
- Poraženi iz W kola r≥1 padaju u feed kolo `2r-1`, slot 2, **obrnutim redosledom kad je r neparno** (`m = cnt-1-i`)
  i pravo kad je r parno. Tako David (poraženi iz W2 M0) igra Branka, ne Stefana koga je već pobedio —
  isto što papir postiže ukrštenim linijama
- Broj L kola = `2*log2(size) - 2`; poslednje L kolo (finale repasaža) → GF slot 2
- Svaki meč ima `nextWin`/`nextLose: {b, r, m, s}` — `b` bracket (`'W'|'L'|'GF'|'GFR'`), `r` kolo (0-based), `m` meč, `s` slot (1=p1, 2=p2)

### Numeracija mečeva (`m.num`)
Kao na listiću — redosled igranja: W1 (1-8), L1 (9-12), W2 (13-16), L2 (17-20), L3 (21-22), W3 (23-24), L4 (25-26),
L5 (27), W finale (28), L finale (29), GF (30), GFR (31) za 16 igrača. `playOrder(t)` daje taj redosled;
`genBracket` dodeljuje brojeve. Raspored (`getReadyMatches`) sortira po `num` — repasaž se igra čim može,
ne tek posle celog glavnog žreba. TV kartice i kontroler prikazuju broj meča.

### Ključne funkcije (engine.js)
```
replayAll(t)          — rebuild iz nule + replay svih rezultata; rezultat važi samo ako su i dalje ISTI igrači
                        u meču (promena ranijeg rezultata poništava zavisne mečeve umesto da ih tiho prepiše)
resolveByes(t)        — auto-rešava BYE mečeve (poziva se posle svakog propagate-a)
applyResult(m,s1,s2)  — upisuje rezultat i winner/loser u meč
isPlayable(m)         — oba igrača poznata i nijedan nije BYE
propagate(t, m)       — šalje pobednika/gubitnika u sledeći meč
genBracket(t)         — generiše praznu strukturu bracketa
buildRoutingTable(size), nextPow2(n), getChamp(t), allMatches(t), findM(t, id)
makeSeed(players)     — shuffle + raspored BYE-eva
wRoundName(t, ri) / lRoundName(t, ri) — nazivi kola po veličini (ČETVRTFINALE, POLUFINALE, FINALE…)
getReadyMatches(t) / getScheduleQueue(t) — raspored
scenesFor(size) / autoScenesFor(size) / normalizeScene(s), AUTO_INTERVAL
```

### Bracket layout CSS formule
`roundCol(title, matches, depth)` u index.html — `depth` je koliko puta se broj mečeva prepolovio:
```
spacing = unit  // depth 0
spacing = spacing * 2 + unit  // za svaki sledeći depth
topPad = spacing / 2  // za prvi meč u koloni
```
`matchH = 62px`, `gap = 33px`, `unit = matchH + gap = 95px`, gap između kolona = `100px`

**Winners:** depth = indeks kola. **Losers:** depth = `floor(ri/2)` — raste samo na *reduce* kolima, feed kola kopiraju prethodni spacing.
Finale W i finale repasaža se ne crtaju u bracket scenama nego u sceni FINALE.

### Za turnire od 32 igrača
Winners bracket se deli na 2 polovine (ŽREB 1 i ŽREB 2), svaka ima posebnu scenu.

## Dizajn sistem (boje)
```css
--bg:      #09090E  (tamno plavo-crna pozadina)
--surface: #12131F
--card:    #1A1C2E
--border:  #3C3560
--accent:  #2B60E8  (plava — winners/aktivan)
--accent2: #C4873A  (narandžasta — losers)
--text:    #F0EDE6
--muted:   #6B7280
--gold:    #C4873A  (finale/šampion)
```
Light tema: sve inverzno (`--bg: #F0EDE6`, `--text: #09090E`).

## Schedule/Raspored sistem
- `num_boards` — broj parallelnih stolova (default 2)
- `postponed[]` — array match ID-eva koji su odloženi
- Logika u `getScheduleQueue(t)`: prvih N spremnih mečeva = IGRA SE, sledećih N = SLEDEĆI
- Odloženi mečevi stoje na početku SLEDEĆI liste i **nikad sami ne ulaze u IGRA SE** — vraćaju se dugmetom VRATI
  (ili automatski kad se unese rezultat)

## Landing page (brackets_landing/)
Odvojen statički sajt. Fajlovi: `index.html`, `index.css`, `main.js`, `logo.svg`, `favicon.png`, `demo.png`. Prikazuje marketing stranicu za TARGET SaaS proizvod (u razvoju).

## Git workflow
- Jedna grana: `main`
- Direktan push na main
- Vercel auto-deploya na svaki push

## TODO / buduće funkcije
- Brisanje turnira iz baze
- Editovanje naziva/datuma turnira
- Statistike igrača kroz više turnira
- Mobilni prikaz bracket-a na controller-u
- Autentifikacija (landing page ima signup formu ali backend nije implementiran)

## Napomene
- Bracket engine je u `engine.js` i deli se — **ne duplirati** logiku u HTML fajlove (ranije dupliranje je dovelo do razilaženja tabela)
- `replayAll()` se poziva **svaki put** pre renderovanja — garantuje konzistentnost
- Turniri sačuvani sa starim (pre-engine.js) mapiranjem repasaža: rezultati W mečeva ostaju, a L rezultati čiji su se parovi
  promenili se poništavaju pri replay-u (moraju se ponovo uneti)
- TV prikaz nema nikakve onclick — čisto pasivan display
- Realtime sync radi via Supabase Postgres Changes na kanalima `tournaments_tv`, `scene_tv` (index.html) i `tournaments_ctrl`, `scene_ctrl` (scene-controller.html)
