// Capsule del Mundial 2026 PY: sirve /api/data (videos por partido + marcadores
// en vivo + tabla + goleadores, igual que el server.mjs original) y el PRODE
// (pronósticos por usuario, con la db y auth integradas de Lakebed).
//
//  - GEN  → transmite cada partido como video de YouTube en una playlist de su
//           portada (gen.com.py). Se extrae del HTML (CORS lo bloquea en el navegador).
//  - VS   → publica un stream de YouTube por partido en su canal (/streams).
//  - FIFA → su API pública da marcador, estado, minuto, tabla y goleadores.
//
// OJO: el fetch saliente solo funciona en local y en deploys RECLAMADOS
// (npx lakebed claim); en deploys anónimos /api/data degrada a vacío.
import { capsule, endpoint, json, mutation, query, string, table, text } from "lakebed/server";
import { MATCHES } from "../shared/matches";
import { canon, CHANNELS, clampGoals, kickoffEpoch, pk, prodePoints } from "../shared/mundial";
import type { ChannelKey, GoalRow, LeaderRow, Match, ScoreRow, StandingGroup, VideoRow } from "../shared/mundial";

const UA = "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
// mínimo entre fetches reales a las fuentes (y reescrituras del caché). Es el
// techo del gasto de "mutations": 25s ≈ 144 writes/hora EN VIVO como máximo,
// sin importar cuántos miran (la query reactiva calla a los clientes de más).
const REFRESH_MS = 25_000;

// "México vs. Sudáfrica" / "Estados Unidos Vs. Paraguay - FIFA..." → ["méxico","sudáfrica"]
function teamsFromTitle(t: string): [string, string] | null {
  const core = t.split(" - ")[0].replace(/^#\S+\s*\|?\s*/, "");
  const m = core.split(/\s+vs\.?\s+/i);
  return m.length === 2 ? [m[0].trim(), m[1].trim()] : null;
}

let gc = { t: 0, v: null as VideoRow[] | null };
async function genVideos(): Promise<VideoRow[]> {
  if (Date.now() - gc.t < 60_000 && gc.v) return gc.v;
  const out: VideoRow[] = [];
  try {
    const html = await (await fetch("https://www.gen.com.py/", { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000) })).text();
    const i = html.indexOf('"versus-playlist"');
    const j = html.indexOf('"data":[', i);
    const k = html.indexOf('],"expires"', j);
    if (i !== -1 && j !== -1 && k !== -1) {
      for (const it of JSON.parse(html.slice(j + 7, k + 1))) {
        const url = (it.sources || []).find((s: { url?: string }) => s.url)?.url;
        const teams = teamsFromTitle(it.title || "");
        if (url && teams) out.push({ teams, url, title: it.title });
      }
    }
  } catch { /* GEN caído → sin videos, no rompe */ }
  gc = { t: Date.now(), v: out };
  return out;
}

let vc = { t: 0, v: null as VideoRow[] | null };
async function vsVideos(): Promise<VideoRow[]> {
  if (Date.now() - vc.t < 120_000 && vc.v) return vc.v;
  const out: VideoRow[] = [];
  try {
    const html = await (await fetch("https://www.youtube.com/channel/UCj0RBdETcbD-mChW-ylt-sw/streams", { headers: { "User-Agent": UA, "Accept-Language": "es" }, signal: AbortSignal.timeout(15_000) })).text();
    const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/);
    if (m) {
      const seen = new Set<string>();
      const walk = (o: unknown): void => {
        if (Array.isArray(o)) return o.forEach(walk);
        if (o && typeof o === "object") {
          const lv = (o as Record<string, any>).lockupViewModel;
          if (lv?.contentId && !seen.has(lv.contentId)) {
            const title = lv.metadata?.lockupMetadataViewModel?.title?.content || "";
            const teams = teamsFromTitle(title);
            if (teams && /world cup|fifa|mundial/i.test(title)) {
              seen.add(lv.contentId);
              out.push({ teams, url: `https://www.youtube.com/embed/${lv.contentId}`, title });
            }
          }
          Object.values(o as Record<string, unknown>).forEach(walk);
        }
      };
      walk(JSON.parse(m[1]));
    }
  } catch { /* YT cambió formato o bloqueó → sin videos */ }
  vc = { t: Date.now(), v: out };
  return out;
}

const FIFA = "https://api.fifa.com/api/v3";
const COMP = "17", SEAS = "285023"; // Mundial 2026 (285023, NO 285026)
const fifaGet = (u: string) => fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000) }).then((r) => r.json());
const teamNames = new Map<string, string>(); // IdTeam → nombre (para resolver la tabla)

let fc = { t: 0, v: null as ScoreRow[] | null };
async function fifaScores(): Promise<ScoreRow[]> {
  if (Date.now() - fc.t < 30_000 && fc.v) return fc.v;
  const out: ScoreRow[] = [];
  try {
    const d = await fifaGet(`${FIFA}/calendar/matches?idCompetition=${COMP}&idSeason=${SEAS}&count=104&language=es`);
    for (const r of d.Results || []) {
      const home = (r.Home?.TeamName || [{}])[0].Description;
      const away = (r.Away?.TeamName || [{}])[0].Description;
      if (!home || !away) continue;
      if (r.Home?.IdTeam) teamNames.set(r.Home.IdTeam, home);
      if (r.Away?.IdTeam) teamNames.set(r.Away.IdTeam, away);
      out.push({
        teams: [home, away],
        hs: r.HomeTeamScore, as: r.AwayTeamScore,
        hp: r.HomeTeamPenaltyScore ?? null, ap: r.AwayTeamPenaltyScore ?? null,
        status: r.MatchStatus, min: r.MatchTime || null,
        idMatch: r.IdMatch, idStage: r.IdStage,
      });
    }
  } catch { /* FIFA caído → sin marcadores */ }
  fc = { t: Date.now(), v: out };
  return out;
}

// Tabla de posiciones (12 grupos). El nombre de equipo se resuelve por IdTeam.
let sc = { t: 0, v: null as StandingGroup[] | null };
async function standings(): Promise<StandingGroup[]> {
  if (Date.now() - sc.t < 60_000 && sc.v) return sc.v;
  const groups: Record<string, StandingGroup["rows"]> = {};
  try {
    const d = await fifaGet(`${FIFA}/calendar/${COMP}/${SEAS}/289273/standing?language=es`);
    for (const r of d.Results || []) {
      const g = (r.Group || [{}])[0].Description || "—";
      (groups[g] ??= []).push({
        team: teamNames.get(r.IdTeam) || (r.TeamName || [{}])[0]?.Description || "",
        pos: r.Position, pts: r.Points, pj: r.Played,
        w: r.Won, d: r.Drawn, l: r.Lost,
        gf: r.For, ga: r.Against, gd: r.GoalsDiference, // sí, FIFA lo escribe así
        q: r.QualificationStatus || null,
      });
    }
  } catch { /* sin tabla */ }
  const v = Object.entries(groups).map(([group, rows]) => ({ group, rows: rows.sort((a, b) => a.pos - b.pos) }));
  sc = { t: Date.now(), v };
  return v;
}

// Goleadores por partido: los EN VIVO se piden cada ciclo; los terminados una
// sola vez (no cambian) y de a 6 por ciclo para no rafaguear a FIFA.
const goalCache = new Map<string, GoalRow & { final: boolean }>();
async function fetchGoals(s: ScoreRow): Promise<void> {
  try {
    const m = await fifaGet(`${FIFA}/live/football/${COMP}/${SEAS}/${s.idStage}/${s.idMatch}?language=es`);
    const events: GoalRow["events"] = [];
    for (const side of ["HomeTeam", "AwayTeam"] as const) {
      const t = m[side] || {};
      const names = new Map((t.Players || []).map((p: any) => [p.IdPlayer, ((p.ShortName || p.PlayerName || [{}])[0] || {}).Description]));
      for (const g of t.Goals || []) {
        events.push({ side: side === "HomeTeam" ? "h" : "a", name: (names.get(g.IdPlayer) as string) || "", min: g.Minute, og: g.Type === 3, pen: g.Type === 4 });
      }
    }
    events.sort((a, b) => parseInt(a.min) - parseInt(b.min));
    goalCache.set(s.idMatch, { teams: s.teams, events, final: s.status !== 1 && s.status !== 3 });
  } catch { /* este partido no devolvió detalle ahora */ }
}
async function goals(scores: ScoreRow[]): Promise<GoalRow[]> {
  const live = scores.filter((s) => s.status === 3);
  const finishedNew = scores.filter((s) => s.status !== 1 && s.status !== 3 && !goalCache.get(s.idMatch)?.final).slice(0, 6);
  await Promise.all([...live, ...finishedNew].map(fetchGoals));
  return [...goalCache.values()].filter((g) => g.events.length).map((g) => ({ teams: g.teams, events: g.events }));
}

// Tabla del prode: pronósticos de todos vs resultados finales de FIFA.
function buildLeaderboard(preds: any[], scores: ScoreRow[]): LeaderRow[] {
  const finals = new Map<string, { hs: number; as: number }>();
  for (const s of scores) {
    if (s.status !== 1 && s.status !== 3 && s.hs != null && s.as != null) {
      finals.set(pk(s.teams[0], s.teams[1]), { hs: s.hs, as: s.as });
    }
  }
  const by = new Map<string, LeaderRow>();
  for (const p of preds) {
    const row = by.get(p.userId) ?? { userId: p.userId, name: p.displayName || "hincha", pts: 0, exact: 0, played: 0 };
    // ojo: la clave del pronóstico ya viene en orden canónico, pero el resultado
    // de FIFA es home/away — para puntuar hay que comparar en el MISMO orden.
    const m = MATCHES.find((x) => pk(x.a, x.b) === p.matchKey);
    const real = finals.get(p.matchKey);
    if (m && real) {
      // el pronóstico se guarda como hs=goles de m.a, as=goles de m.b; FIFA puede
      // listar los equipos al revés, así que reordenamos el real si hace falta
      const score = scores.find((s) => pk(s.teams[0], s.teams[1]) === p.matchKey)!;
      const sameOrder = canon(score.teams[0]) === canon(m.a);
      const realOrdered = sameOrder ? real : { hs: real.as, as: real.hs };
      row.played++;
      const got = prodePoints({ hs: Number(p.hs), as: Number(p.as) }, realOrdered);
      row.pts += got;
      if (got === 3) row.exact++;
    }
    by.set(p.userId, row);
  }
  return [...by.values()].sort((a, b) => b.pts - a.pts || b.exact - a.exact || a.name.localeCompare(b.name)).slice(0, 50);
}

/* ---------- PWA: manifest + service worker + ícono ----------
   Lakebed no sirve estáticos arbitrarios, así que van como endpoints bajo
   /api/ (mismo ruteo que /api/data). El SW se registra con scope "/" gracias
   al header Service-Worker-Allowed. El cuerpo de endpoint es string → el
   ícono es SVG (Chrome/Android lo aceptan; iOS cae al genérico). */
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" rx="96" fill="#000"/>
<text x="256" y="318" font-size="270" text-anchor="middle">📺</text>
<rect x="96" y="400" width="80" height="30" fill="#ff4040"/>
<rect x="176" y="400" width="80" height="30" fill="#3ddc3d"/>
<rect x="256" y="400" width="80" height="30" fill="#ffd23d"/>
<rect x="336" y="400" width="80" height="30" fill="#46e0e0"/>
</svg>`;

// Shell con caché (abre al instante y aguanta sin red o con la cuota agotada);
// /api/* y las RPC de lakebed van SIEMPRE a la red. Navegación: red primero
// (los deploys se ven frescos), caché de respaldo. Assets: caché primero con
// refresco en segundo plano.
const SW_JS = `
const CACHE = "tt-shell-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  const asset = u.origin === self.location.origin && !u.pathname.startsWith("/api/") && /\\.(js|css|svg|png|woff2?)$/.test(u.pathname);
  const nav = e.request.mode === "navigate";
  if (e.request.method !== "GET" || (!nav && !asset)) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(e.request);
    const net = fetch(e.request).then((r) => { if (r && r.ok) c.put(e.request, r.clone()); return r; }).catch(() => null);
    if (nav) return (await net) || hit || new Response("SIN RED", { status: 503 });
    return hit || (await net) || new Response("", { status: 504 });
  })());
});
`;

/* ---------- COMPARTIR (Open Graph) ----------
   Los crawlers (WhatsApp, Telegram, Twitter…) NO ejecutan JS y NO ven el hash
   (#100, #500-…), así que el shell del SPA no sirve para la vista previa. La
   solución: links de path `/s?p=<destino>` que devuelven un HTML real con las
   etiquetas og:* y redirigen al humano a la app por el hash.
   La imagen (`/api/og.svg`) es un SVG: se ve en Telegram/Discord/iMessage; en
   WhatsApp/Facebook (que ignoran SVG) igual queda la tarjeta con título y texto. */
const xmlEsc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] as string));
const slugify = (s: string) => s.replace(/[^a-z0-9]+/gi, "-");
const matchBySlug = (s: string): Match | null => MATCHES.find((m) => slugify(pk(m.a, m.b)) === s) || null;
const MES3 = ["", "ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
const fechaCorta = (m: Match) => `${Number(m.d.slice(8, 10))} ${MES3[Number(m.d.slice(5, 7))]} ${m.t} HS`;

// tarjeta teletexto 1200×630 (sin emojis: los renderers de SVG no los dibujan)
function ogCard(tag: string, title: string, sub: string): string {
  // partir el título en hasta 2 líneas legibles
  const words = title.toUpperCase().split(/\s+/);
  const lines: string[] = []; let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > 20 && cur) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim();
    if (lines.length === 2) break;
  }
  if (cur && lines.length < 2) lines.push(cur);
  const fs = lines.some((l) => l.length > 15) ? 92 : 110;
  const ty = lines.length === 2 ? 300 : 340;
  const tspans = lines.map((l, i) => `<text x="60" y="${ty + i * (fs + 14)}" font-family="'Courier New',monospace" font-weight="bold" font-size="${fs}" fill="#ffd23d">${xmlEsc(l)}</text>`).join("");
  const stripe = ["#ff4040", "#3ddc3d", "#ffd23d", "#46e0e0"].map((c, i) => `<rect x="${60 + i * 90}" y="560" width="80" height="22" fill="${c}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#000"/>
<rect x="0" y="0" width="1200" height="84" fill="#1414c8"/>
<text x="60" y="58" font-family="'Courier New',monospace" font-weight="bold" font-size="46" fill="#ffd23d">TELETEXTO PY</text>
<text x="1140" y="58" text-anchor="end" font-family="'Courier New',monospace" font-size="40" fill="#46e0e0">MUNDIAL 2026</text>
<text x="60" y="180" font-family="'Courier New',monospace" font-size="44" fill="#f06df0">${xmlEsc(tag.toUpperCase())}</text>
${tspans}
<text x="60" y="510" font-family="'Courier New',monospace" font-size="44" fill="#46e0e0">${xmlEsc(sub.toUpperCase())}</text>
${stripe}
<text x="1140" y="600" text-anchor="end" font-family="'Courier New',monospace" font-size="30" fill="#7d7d7d">teletexto.lakebed.app</text>
</svg>`;
}

// destino (p) → {tag, title, sub, desc} para las etiquetas og y la imagen
function shareMeta(p: string): { tag: string; title: string; sub: string; desc: string } {
  const v = p.match(/^500-([a-z]+)(?:-(.+))?$/i);
  if (v) {
    const ch = CHANNELS[v[1] as ChannelKey]?.name || v[1].toUpperCase();
    const m = v[2] ? matchBySlug(v[2]) : null;
    if (m) return { tag: "P500 · EN VIVO", title: `${m.a} vs ${m.b}`, sub: fechaCorta(m), desc: `Mirá ${m.a} vs ${m.b} del Mundial 2026 con los canales paraguayos: marcador en vivo y dónde verlo, en TELETEXTO PY.` };
    return { tag: "P500 · EN VIVO", title: `${ch} en vivo`, sub: "MUNDIAL 2026", desc: `Mirá ${ch} en TELETEXTO PY: el Mundial 2026 con los canales paraguayos.` };
  }
  const pg = p.match(/^([123])00(?:-(.+))?$/);
  if (pg) {
    const n = Number(pg[1]);
    const m = pg[2] ? matchBySlug(pg[2]) : null;
    if (n === 3 && m) return { tag: "P300 · PRODE", title: `Prode: ${m.a} vs ${m.b}`, sub: fechaCorta(m), desc: `Pronosticá ${m.a} vs ${m.b} en el prode de TELETEXTO PY — Mundial 2026.` };
    const map: Record<number, [string, string, string]> = {
      1: ["P100 · AGENDA", "Agenda del Mundial 2026", "Todos los partidos, marcadores en vivo y los canales paraguayos que los pasan."],
      2: ["P200 · TABLA", "Tabla del Mundial 2026", "Los 12 grupos, los clasificados, la pelea de los mejores terceros y los goleadores."],
      3: ["P300 · PRODE", "Prode del Mundial 2026", "Pronosticá los partidos y competí en la tabla del prode."],
    };
    const [tag, title, desc] = map[n] || map[1];
    return { tag, title, sub: "MUNDIAL 2026", desc };
  }
  return { tag: "MUNDIAL 2026", title: "TELETEXTO PY", sub: "MUNDIAL 2026", desc: "El Mundial 2026 con los canales paraguayos: agenda, marcadores en vivo, tabla, prode y visor." };
}

function shareHtml(origin: string, p: string): string {
  const { tag, title, sub, desc } = shareMeta(p);
  const app = `${origin}/#${p}`;
  const img = `${origin}/api/og.svg?tag=${encodeURIComponent(tag)}&t=${encodeURIComponent(title)}&s=${encodeURIComponent(sub)}`;
  const fullTitle = `${title} · TELETEXTO PY`;
  const M = (prop: string, val: string, name = false) => `<meta ${name ? "name" : "property"}="${prop}" content="${xmlEsc(val)}">`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${xmlEsc(fullTitle)}</title>
${M("description", desc, true)}
${M("og:type", "website")}${M("og:site_name", "TELETEXTO PY")}
${M("og:title", fullTitle)}${M("og:description", desc)}
${M("og:url", app)}${M("og:image", img)}
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
${M("twitter:card", "summary_large_image", true)}
${M("twitter:title", fullTitle, true)}${M("twitter:description", desc, true)}${M("twitter:image", img, true)}
<link rel="canonical" href="${xmlEsc(app)}">
<meta http-equiv="refresh" content="0; url=${xmlEsc(app)}">
</head><body style="background:#000;color:#ffd23d;font-family:'Courier New',monospace;padding:2rem">
ABRIENDO TELETEXTO PY… <a href="${xmlEsc(app)}" style="color:#46e0e0">tocá acá si no abre solo</a>.
<script>location.replace(${JSON.stringify(app)})</script>
</body></html>`;
}

export default capsule({
  name: "mundial-py",

  schema: {
    predictions: table({
      userId: string(),
      displayName: string(),
      matchKey: string(),   // pk(a,b) del partido
      hs: string(),         // goles pronosticados del equipo "a" (la db no tiene number())
      as: string(),         // goles pronosticados del equipo "b"
    }),
    // contador diario (sin uso hoy; las métricas se rehacen aparte)
    stats: table({
      day: string(),        // "YYYY-MM-DD" (UTC)
      count: string(),      // pedidos
      visits: string(),     // visitas
    }),
    // caché de los datos (videos+marcadores+tabla+goleadores+prode) en UNA fila.
    // La escribe `refresh` (mutación, con fetch saliente); la leen todos por la
    // query reactiva `data` — un solo write se propaga a todos los que miran,
    // sin que cada cliente pague un pedido a un endpoint (que cuenta como mutación).
    cache: table({
      k: string(),          // siempre "data" (fila única)
      blob: string(),       // JSON del payload completo
      at: string(),         // epoch ms del último fetch real
    }),
  },

  queries: {
    myPredictions: query((ctx) =>
      ctx.db.predictions.where("userId", ctx.auth.userId).all()
    ),
    // lectura reactiva del caché: Lakebed empuja el cambio a todos los clientes
    // suscritos por WebSocket cuando `refresh` reescribe la fila (cuota de
    // "requests", 10k/día — NO de "mutations", 1k/día)
    data: query((ctx) => ctx.db.cache.where("k", "data").all()),
  },

  mutations: {
    predict: mutation((ctx, matchKey: string, hs: number, as: number) => {
      const m = MATCHES.find((x) => pk(x.a, x.b) === matchKey);
      if (!m) return;
      if (Date.now() >= kickoffEpoch(m)) return; // ya arrancó → pronóstico cerrado
      const H = clampGoals(hs), A = clampGoals(as);
      const mine = ctx.db.predictions.where("userId", ctx.auth.userId).all();
      const prev = mine.find((p: any) => p.matchKey === matchKey);
      const name = ctx.auth.displayName || "hincha";
      if (prev) ctx.db.predictions.update(prev.id, { hs: String(H), as: String(A), displayName: name });
      else ctx.db.predictions.insert({ userId: ctx.auth.userId, displayName: name, matchKey, hs: String(H), as: String(A) });
    }),

    // Refresca el caché desde las fuentes (FIFA/GEN/YT) y reescribe la única
    // fila de `cache`. La disparan los clientes, pero se AUTOLIMITA: si el último
    // fetch real fue hace < REFRESH_MS, no toca nada. Así, no importa cuántos la
    // llamen, las fuentes se piden ~1 vez por ventana y la tabla `cache` se
    // reescribe ~1 vez por ventana — un solo write se propaga por la query
    // reactiva a TODOS los que miran. Acá está el gasto de "mutations" del día,
    // acotado (~1/min en vivo) en vez de 1 por cada poll de cada pestaña.
    refresh: mutation(async (ctx) => {
      const cur = ctx.db.cache.where("k", "data").all()[0] as any;
      if (cur && Date.now() - Number(cur.at || 0) < REFRESH_MS) return; // ya fresco
      const [gen, vs, scores] = await Promise.all([genVideos(), vsVideos(), fifaScores()]);
      const [table_, gls] = await Promise.all([standings(), goals(scores)]); // dependen de scores
      let leaderboard: LeaderRow[] = [];
      try { leaderboard = buildLeaderboard(ctx.db.predictions.all(), scores); } catch { /* sin prode */ }
      const blob = JSON.stringify({ videos: { gen, vs }, scores, standings: table_, goals: gls, leaderboard, fetched: Math.floor(Date.now() / 1000) });
      // releer por si otra llamada concurrente ya insertó la fila
      const row = ctx.db.cache.where("k", "data").all()[0] as any;
      if (row) ctx.db.cache.update(row.id, { blob, at: String(Date.now()) });
      else ctx.db.cache.insert({ k: "data", blob, at: String(Date.now()) });
    }),
  },

  endpoints: {
    // PWA solamente. Los DATOS ya NO van por endpoint (cada hit a un endpoint
    // cuenta como "mutation" y reventaba la cuota de 1k/día): van por la query
    // reactiva `data` + la mutación `refresh`. Estos tres se cachean en el SW,
    // así que un visitante los pide una vez y listo.
    manifest: endpoint({ method: "GET", path: "/api/manifest.webmanifest" }, () =>
      json({
        name: "TELETEXTO PY — Mundial 2026",
        short_name: "TELETEXTO PY",
        description: "El Mundial 2026 con los canales paraguayos: agenda, marcadores en vivo, tabla, prode y visor.",
        lang: "es-PY",
        start_url: "/",
        display: "standalone",
        background_color: "#000000",
        theme_color: "#000000",
        icons: [{ src: "/api/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
      }, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "max-age=3600" } })),

    sw: endpoint({ method: "GET", path: "/api/sw.js" }, () =>
      text(SW_JS, { headers: { "Content-Type": "text/javascript; charset=utf-8", "Service-Worker-Allowed": "/", "Cache-Control": "no-cache" } })),

    icon: endpoint({ method: "GET", path: "/api/icon.svg" }, () =>
      text(ICON_SVG, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "max-age=86400" } })),

    // tarjeta Open Graph (SVG) para la vista previa al compartir
    og: endpoint({ method: "GET", path: "/api/og.svg" }, (_ctx, req) =>
      text(ogCard(req.query.get("tag") || "MUNDIAL 2026", req.query.get("t") || "TELETEXTO PY", req.query.get("s") || "MUNDIAL 2026"),
        { headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "max-age=3600" } })),

    // página de compartir: HTML con og:* + redirección al hash de la app
    share: endpoint({ method: "GET", path: "/s" }, (_ctx, req) => {
      const origin = new URL(req.url).origin;
      const p = (req.query.get("p") || "100").replace(/[^a-z0-9-]/gi, "");
      return text(shareHtml(origin, p), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "max-age=600" } });
    }),
  },
});
