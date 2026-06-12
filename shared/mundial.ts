// Tipos y helpers puros compartidos entre server y client (sin DOM, sin Node).

export type ChannelKey = "gen" | "trece" | "uni" | "popu" | "vs";

export type Match = {
  d: string;          // fecha PY "YYYY-MM-DD"
  t: string;          // hora PY "HH:MM"
  a: string; fa: string;
  b: string; fb: string;
  ch: string[];       // canales que lo transmiten
  f: number;          // fecha del torneo (1-3 grupos, 4+ eliminatorias)
  py?: number;        // 1 si juega Paraguay
};

export type ScoreRow = {
  teams: [string, string];
  hs: number | null; as: number | null;
  status: number;     // 1 = por jugarse, 3 = en vivo, otros = jugado
  min: string | null;
  idMatch: string; idStage: string;
};

export type GoalEvent = { side: "h" | "a"; name: string; min: string; og: boolean; pen: boolean };
export type GoalRow = { teams: [string, string]; events: GoalEvent[] };
export type VideoRow = { teams: [string, string]; url: string; title: string };
export type StandingRow = { team: string; pos: number; pts: number; pj: number; w: number; d: number; l: number; gf: number; ga: number; gd: number; q: string | null };
export type StandingGroup = { group: string; rows: StandingRow[] };
export type LeaderRow = { userId: string; name: string; pts: number; exact: number; played: number };

export type ApiData = {
  videos: { gen: VideoRow[]; vs: VideoRow[] };
  scores: ScoreRow[];
  standings: StandingGroup[];
  goals: GoalRow[];
  leaderboard: LeaderRow[];
  usage?: { served: number; since: number; today?: number; visits?: number }; // hits de /api/data + visitas del día
  fetched: number;
};

export const CHANNELS: Record<ChannelKey, { name: string; kind: string; url: string; color: string }> = {
  gen:   { name: "GEN",       kind: "TV abierta + web",    url: "https://www.gen.com.py/",                   color: "#e8e8e8" },
  trece: { name: "TRECE",     kind: "TV abierta + web",    url: "https://trece.com.py/en-vivo/",             color: "#b27bff" },
  uni:   { name: "UNICANAL",  kind: "TV abierta + web",    url: "https://unicanal.com.py/en-vivo/",          color: "#5ad7ff" },
  popu:  { name: "POPU TV",   kind: "En vivo por YouTube", url: "https://www.youtube.com/@somospopupy/live", color: "#ff6b6b" },
  vs:    { name: "VS SPORTS", kind: "Web + YouTube",       url: "https://www.vssports.com.py/",              color: "#ff9b3d" },
};
export const CH_ORDER: ChannelKey[] = ["gen", "trece", "uni", "popu", "vs"];

// NOTA Unicanal: su stream es un player de Dailymotion (geo.dailymotion.com/
// player/x1apn6.html?video=...) que SOLO reproduce si llegás con Referer de
// unicanal.com.py — directo, embebido o linkeado desde acá da "Unable to play
// video". Probado en vivo 12/06: no hay atajo legítimo; el camino es su página.

// Normaliza nombres de equipo (FIFA en español vs nuestra grilla) a una clave canónica.
const ALIAS: Record<string, string> = {
  "ee uu": "estados unidos", "eeuu": "estados unidos",
  "islas de cabo verde": "cabo verde",
  "ri de iran": "iran",
  "republica de corea": "corea del sur",
  "catar": "qatar",
  "bosnia y herzegovina": "bosnia",
  "arabia saudi": "arabia saudita",
};
export function canon(name: string): string {
  const s = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\./g, "").replace(/\s+/g, " ").trim();
  return ALIAS[s] || s;
}
// clave única de partido: par de equipos canónicos ordenados (sirve de id en el prode)
export const pk = (a: string, b: string) => [canon(a), canon(b)].sort().join("|");

// Hora de inicio en epoch ms. Paraguay está en UTC-3 permanente (sin cambios desde
// oct-2024), así que el offset fijo es seguro para todo el torneo.
export function kickoffEpoch(m: Match): number {
  const [Y, Mo, D] = m.d.split("-").map(Number);
  const [H, Mi] = m.t.split(":").map(Number);
  return Date.UTC(Y, Mo - 1, D, H + 3, Mi);
}

// Puntaje del prode: 3 por resultado exacto, 1 por acertar ganador/empate.
export function prodePoints(p: { hs: number; as: number }, real: { hs: number; as: number }): number {
  if (p.hs === real.hs && p.as === real.as) return 3;
  const sg = (x: { hs: number; as: number }) => Math.sign(x.hs - x.as);
  return sg(p) === sg(real) ? 1 : 0;
}

export const clampGoals = (n: number) => Math.max(0, Math.min(20, Math.floor(Number(n) || 0)));
