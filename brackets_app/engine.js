// ─── TARGET bracket engine ─────────────────────────────────────
// Deljen između index.html (TV) i scene-controller.html (kontroler).
// Čist JS bez DOM-a — sve funkcije rade nad objektom turnira `t`
// (t.seed, t.wB, t.lB, t.gf, t.gfr, t.num_boards, t.postponed).

const BYE = "__BYE__";
const AUTO_INTERVAL = 30; // sekundi po sceni kod auto-rotacije

// ─── SCENE ────────────────────────────────────────────────────
function normalizeScene(s) {
  if (s === 'winners' || s === 'winners-early') return 'winners-1';
  if (s === 'winners-late') return 'winners-2';
  if (s === 'losers-early' || s === 'losers-late') return 'losers';
  return s || 'winners-1';
}
// Redosled scena za dati broj igrača (zaokružen na stepen dvojke)
function scenesFor(size) {
  return size === 32
    ? ['winners-1', 'winners-2', 'losers', 'schedule', 'finale']
    : ['winners-1', 'losers', 'schedule', 'finale'];
}
// Auto-rotacija preskače finale
function autoScenesFor(size) { return scenesFor(size).filter(s => s !== 'finale'); }

// ─── SEED ─────────────────────────────────────────────────────
// Raspoređuje BYE-eve tako da nikad dva BYE-a ne igraju jedan protiv drugog u 1. kolu.
function makeSeed(players) {
  const ps = [...players]; shuffle(ps);
  const size = nextPow2(ps.length), pairs = size / 2, byes = size - ps.length;
  const byePairs = shuffle([...Array(pairs).keys()]).slice(0, byes);
  const seed = []; let pi = 0;
  for (let p = 0; p < pairs; p++) {
    if (byePairs.includes(p)) {
      const pl = ps[pi++];
      if (Math.random() < 0.5) seed.push(pl, BYE); else seed.push(BYE, pl);
    } else seed.push(ps[pi++], ps[pi++]);
  }
  return seed;
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function nextPow2(n) { let x = 1; while (x < n) x *= 2; return x; }

// ─── ROUTING ──────────────────────────────────────────────────
// Parovi su isti kao na štampanom Target listiću (double elimination):
//   W kolo r (0-based) ima size>>(r+1) mečeva.
//   L kola: 2*k-2 komada (k = log2 size). Parna kola su "reduce" (L pobednici
//   igraju međusobno), neparna su "feed" (u njih padaju poraženi iz W kola).
//   Pobednici L kola uvek idu PRAVO (L_R1_M4 → L_R2_M4, reduce: 2i,2i+1 → i),
//   pa se na ekranu vidi ko koga čeka. Da bi se izbegao revanš odmah posle
//   poraza, poraženi iz W kola r padaju u feed kolo 2r-1 OBRNUTIM redosledom
//   kad je r neparno (r=1: David iz W2 igra Branka, ne Stefana) i pravo kad je
//   r parno — to daje identične parove kao ukršteni redosled na papiru.
function lCount(size, j) { return j % 2 === 0 ? size >> (j / 2 + 2) : size >> ((j + 1) / 2 + 1); }

function buildRoutingTable(size) {
  const k = Math.log2(size), lastL = 2 * k - 3, routes = {};
  for (let r = 0; r < k; r++) {
    const cnt = size >> (r + 1);
    for (let i = 0; i < cnt; i++) {
      routes[`W_R${r + 1}_M${i}`] = {
        win:  r === k - 1 ? { b: 'GF', s: 1 } : { b: 'W', r: r + 1, m: i >> 1, s: (i % 2) + 1 },
        lose: r === 0 ? { b: 'L', r: 0, m: i >> 1, s: (i % 2) + 1 }
                      : { b: 'L', r: 2 * r - 1, m: r % 2 === 1 ? cnt - 1 - i : i, s: 2 },
      };
    }
  }
  for (let j = 0; j <= lastL; j++) {
    const cnt = lCount(size, j);
    for (let i = 0; i < cnt; i++) {
      let win;
      if (j === lastL) win = { b: 'GF', s: 2 };
      else if (j % 2 === 0) win = { b: 'L', r: j + 1, m: i, s: 1 };            // reduce → feed, pravo
      else win = { b: 'L', r: j + 1, m: i >> 1, s: (i % 2) + 1 };              // feed → reduce
      routes[`L_R${j + 1}_M${i}`] = { win, lose: null };
    }
  }
  routes['GF']  = { win: { b: 'GFR', s: 1 }, lose: { b: 'GFR', s: 2 } };
  routes['GFR'] = { win: null, lose: null };
  return routes;
}

// Redosled igranja kola = redosled numeracije mečeva na listiću (1, 2, 3 …):
// W1, L1, W2, L2, L3, W3, L4, L5, … , W finale, L finale, GF. Repasaž se igra
// čim može, ne tek posle celog glavnog žreba.
function playOrder(t) {
  const k = t.wB.length, order = [t.wB[0], t.lB[0]];
  for (let r = 1; r < k; r++) {
    order.push(t.wB[r], t.lB[2 * r - 1]);
    if (t.lB[2 * r]) order.push(t.lB[2 * r]);
  }
  order.push([t.gf], [t.gfr]);
  return order.flat().filter(Boolean);
}

// ─── STRUKTURA ────────────────────────────────────────────────
function mkM(id, p1 = null, p2 = null) {
  return { id, num: 0, p1, p2, s1: null, s2: null, winner: null, loser: null, done: false, nextWin: null, nextLose: null };
}
function applyRoutes(m, routes) { const r = routes[m.id]; if (!r) return; m.nextWin = r.win || null; m.nextLose = r.lose || null; }

function genBracket(t) {
  const players = [...t.seed], size = nextPow2(players.length), k = Math.log2(size);
  const routes = buildRoutingTable(size); t._routes = routes; t._size = size;
  t.wB = [];
  for (let r = 0; r < k; r++) {
    const cnt = size >> (r + 1), round = [];
    for (let i = 0; i < cnt; i++) {
      const m = r === 0 ? mkM(`W_R1_M${i}`, players[2 * i] ?? BYE, players[2 * i + 1] ?? BYE) : mkM(`W_R${r + 1}_M${i}`);
      applyRoutes(m, routes); round.push(m);
    }
    t.wB.push(round);
  }
  t.lB = [];
  for (let j = 0; j <= 2 * k - 3; j++) {
    const round = [];
    for (let i = 0; i < lCount(size, j); i++) { const m = mkM(`L_R${j + 1}_M${i}`); applyRoutes(m, routes); round.push(m); }
    t.lB.push(round);
  }
  t.gf = mkM('GF'); applyRoutes(t.gf, routes);
  t.gfr = mkM('GFR'); applyRoutes(t.gfr, routes);
  playOrder(t).forEach((m, i) => { m.num = i + 1; });
}

// ─── REPLAY ───────────────────────────────────────────────────
// Bracket se uvek gradi iz nule i svi uneti rezultati se ponovo "odigraju".
// Rezultat važi samo ako su u meču i dalje isti igrači — ako se promeni
// raniji rezultat, zavisni mečevi se poništavaju umesto da se tiho prepišu.
function replayAll(t) {
  const results = collectResults(t);
  genBracket(t);
  resolveByes(t);
  for (const res of results) {
    const m = findM(t, res.id);
    if (!m || m.done || !isPlayable(m)) continue;
    if (res.p1 !== m.p1 || res.p2 !== m.p2) continue;
    applyResult(m, res.s1, res.s2);
    propagate(t, m);
    resolveByes(t);
  }
}
function isPlayable(m) { return !!m.p1 && !!m.p2 && m.p1 !== BYE && m.p2 !== BYE; }
function applyResult(m, s1, s2) {
  m.s1 = s1; m.s2 = s2; m.done = true;
  m.winner = s1 > s2 ? m.p1 : m.p2;
  m.loser  = s1 > s2 ? m.p2 : m.p1;
}
function collectResults(t) {
  return allMatches(t)
    .filter(m => m.done && isPlayable(m) && m.s1 != null && m.s2 != null && m.s1 !== m.s2)
    .map(m => ({ id: m.id, s1: m.s1, s2: m.s2, p1: m.p1, p2: m.p2 }));
}
// BYE mečevi: pravi igrač prolazi; BYE vs BYE → BYE prolazi dalje (da bi se
// sledeći meč mogao rešiti); ako protivnik još nije poznat — čeka se.
function resolveByes(t) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of allMatches(t)) {
      if (m.done || !m.p1 || !m.p2 || (m.p1 !== BYE && m.p2 !== BYE)) continue;
      m.done = true; m.s1 = null; m.s2 = null;
      if (m.p1 === BYE && m.p2 === BYE) { m.winner = BYE; m.loser = BYE; }
      else { m.winner = m.p1 === BYE ? m.p2 : m.p1; m.loser = BYE; }
      propagate(t, m); changed = true;
    }
  }
}
function propagate(t, m) { if (m.winner) placeInSlot(t, m.nextWin, m.winner); if (m.loser) placeInSlot(t, m.nextLose, m.loser); }
function placeInSlot(t, ref, player) { if (!ref || !player) return; const m = getMatchByRef(t, ref); if (!m) return; if (ref.s === 1) m.p1 = player; else m.p2 = player; }
function getMatchByRef(t, ref) {
  if (!ref) return null;
  if (ref.b === 'GF') return t.gf; if (ref.b === 'GFR') return t.gfr;
  if (ref.b === 'W') return t.wB[ref.r]?.[ref.m] || null;
  if (ref.b === 'L') return t.lB[ref.r]?.[ref.m] || null;
  return null;
}
function allMatches(t) { return [...(t.wB || []).flat(), ...(t.lB || []).flat(), t.gf, t.gfr].filter(Boolean); }
function findM(t, id) { return id ? allMatches(t).find(m => m.id === id) || null : null; }
function getChamp(t) {
  if (!t.gf || !t.gf.done) return null;
  if (t.gf.winner === t.gf.p1) return t.gf.winner;
  return t.gfr && t.gfr.done ? t.gfr.winner : null;
}

// ─── NAZIVI KOLA ──────────────────────────────────────────────
function wRoundName(t, ri) {
  const n = t.wB.length;
  if (ri === n - 1) return 'FINALE';
  if (ri === n - 2) return 'POLUFINALE';
  if (ri === n - 3) return 'ČETVRTFINALE';
  return `${ri + 1}. KOLO`;
}
function lRoundName(t, ri) { return ri === t.lB.length - 1 ? 'FINALE REPASAŽA' : `REPASAŽ ${ri + 1}`; }

// ─── RASPORED ─────────────────────────────────────────────────
// Spremni mečevi po broju meča (= redosled igranja sa listića)
function getReadyMatches(t) { return allMatches(t).filter(m => !m.done && isPlayable(m)).sort((a, b) => a.num - b.num); }
// Prvih N spremnih = IGRA SE, sledećih N = SLEDEĆI. Odloženi mečevi nikad ne
// ulaze u IGRA SE sami od sebe — stoje na početku SLEDEĆI dok se ne vrate.
function getScheduleQueue(t) {
  const n = t.num_boards || 2, ready = getReadyMatches(t);
  const postponed = (t.postponed || []).map(id => ready.find(m => m.id === id)).filter(Boolean);
  const normal = ready.filter(m => !postponed.includes(m));
  return { playing: normal.slice(0, n), next: [...postponed, ...normal.slice(n)].slice(0, n), postponed };
}
