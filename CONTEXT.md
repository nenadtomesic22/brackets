# Pikado Turnir – Projekat Kontekst

## Šta je ovo
Web aplikacija za vođenje pikado turnira sa dupla eliminacija (double elimination) sistemom.
Deployovana na Vercel, baza podataka je Supabase.

## Fajlovi
- `index.html` — TV prikaz (pasivan, bez kontrola, prikazuje bracket)
- `scene-controller.html` — Admin kontroler (telefon/tablet), sve kontrole

## Tehnologije
- Vanilla HTML/CSS/JS (bez frameworka)
- Supabase (PostgreSQL baza + Realtime)
- Vercel (hosting)
- Fontovi: Bebas Neue + DM Mono

## Supabase tabele
### `tournaments`
- `id` text (primary key, crypto.randomUUID())
- `name` text
- `date` text
- `players` jsonb (array of strings)
- `seed` jsonb (array of strings, includes "__BYE__" for byes)
- `wB` jsonb (winners bracket rounds)
- `lB` jsonb (losers bracket rounds)
- `gf` jsonb (grand final match)
- `gfr` jsonb (grand final reset match)

### `scene_state`
- `id` integer (uvek 1, jedan red)
- `tournament_id` text (references tournaments.id)
- `scene` text ('winners' | 'losers' | 'finale')
- `auto_rotate` boolean
- `updated_at` timestamp

## Bracket logika
- Dupla eliminacija sa hard-mapiranim routing tabelama za veličine 4, 8, 16, 32
- BYE konstanta: `"__BYE__"` (string)
- BYE se ubacuje na random poziciju u seed nizu (ne uvek na kraj)
- `replayAll()` — rebuilds bracket from scratch i replaya sve rezultate (garantuje konzistentnost)
- `resolveByesReplay()` — auto-resolves BYE mečeve nakon replay-a
- Routing: svaki meč ima `nextWin` i `nextLose` reference `{b, r, m, s}`
  - b = bracket ('W','L','GF','GFR')
  - r = round index (0-based)
  - m = match index (0-based)
  - s = slot (1=p1, 2=p2)

## Scene sistem
- `index.html` sluša Supabase Realtime na tabeli `scene_state`
- `scene-controller.html` šalje promene u `scene_state`
- 3 scene: winners (Glavni žreb), losers (Repasaž), finale (Finale)
- Auto-rotacija na 60 sekundi (konfigurisano u scene-controller)
- TV prikaz se menja bez refresha

## Bracket layout (CSS)
- Winners bracket: spacing se duplira po formuli `spacing = spacing * 2 + unit` za svaku rundu
- Losers bracket: spacing raste samo na reduce rundama (parni indeksi), feed runde kopiraju prethodni spacing
- `matchH = 62px`, `gap = 33px`, `unit = matchH + gap = 95px`
- Gap između kolona: 100px (`gap: 100px` na `.rounds`)

## Trenutni status
- Aplikacija radi
- TV prikaz (index.html) je pasivan — nema onclick, nema kontrola
- Scene-controller ima: kreiranje turnira, unos rezultata, scene switcher, auto-rotacija, export CSV, reset
- Realtime sync radi između kontrolera i TV prikaza

## TODO / Moguća poboljšanja
- Brisanje turnira
- Editovanje naziva/datuma turnira
- Statistike igrača kroz više turnira
- Mobilni prikaz bracket-a na controlleru
