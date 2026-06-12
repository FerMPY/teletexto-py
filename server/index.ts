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
import { capsule, endpoint, json, mutation, query, string, table } from "lakebed/server";
import { MATCHES } from "../shared/matches";
import { canon, clampGoals, kickoffEpoch, pk, prodePoints } from "../shared/mundial";
import type { GoalRow, LeaderRow, ScoreRow, StandingGroup, VideoRow } from "../shared/mundial";

const UA = "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
let served = 0; const bootAt = Date.now(); // medidor casero de uso (por instancia)
let pendingVisits = 0; // visitas sin persistir todavía

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
    // contador diario de pedidos a /api/data (no hay dashboard de Lakebed aún):
    // se persiste de a tandas de 25 para no gastar cuota de escrituras
    stats: table({
      day: string(),        // "YYYY-MM-DD" (UTC)
      count: string(),      // pedidos a /api/data
      visits: string(),     // visitas (1er pedido de cada sesión, ?v=1)
    }),
  },

  queries: {
    myPredictions: query((ctx) =>
      ctx.db.predictions.where("userId", ctx.auth.userId).all()
    ),
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
  },

  endpoints: {
    // Mismo contrato que el /api/data del server.mjs original, más el prode.
    // "usage" es un medidor casero de la cuota de Lakebed (10k req/día): cuenta
    // en memoria los hits de esta instancia (se reinicia en cada deploy/arranque).
    data: endpoint({ method: "GET", path: "/api/data" }, async (ctx, req) => {
      served++;
      if (req.query.get("v") === "1") pendingVisits++;
      let today = 0, visits = 0;
      try {
        const day = new Date().toISOString().slice(0, 10);
        const row = ctx.db.stats.where("day", day).all()[0] as any;
        today = Number(row?.count || 0) + (served % 25);
        visits = Number(row?.visits || 0) + pendingVisits;
        if (served % 25 === 0 || pendingVisits > 0) { // tandas: no gastar escrituras
          const add = served % 25 === 0 ? 25 : 0;
          if (row) ctx.db.stats.update(row.id, { count: String(Number(row.count) + add), visits: String(Number(row.visits || 0) + pendingVisits) });
          else ctx.db.stats.insert({ day, count: String(add), visits: String(pendingVisits) });
          pendingVisits = 0;
        }
      } catch { /* sin stats no pasa nada */ }
      const [gen, vs, scores] = await Promise.all([genVideos(), vsVideos(), fifaScores()]);
      const [table_, gls] = await Promise.all([standings(), goals(scores)]); // dependen de scores
      let leaderboard: LeaderRow[] = [];
      try { leaderboard = buildLeaderboard(ctx.db.predictions.all(), scores); } catch { /* sin prode */ }
      return json({ videos: { gen, vs }, scores, standings: table_, goals: gls, leaderboard, usage: { served, since: bootAt, today, visits }, fetched: Math.floor(Date.now() / 1000) });
    }),
  },
});
