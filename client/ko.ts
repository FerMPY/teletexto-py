// CLIENTE — RESOLUCIÓN DE ELIMINATORIAS. Une el esqueleto fijo (shared/bracket.ts)
// con la tabla en vivo (data.standings), el calendario (KO_SCHEDULE) y los
// marcadores FIFA (idx). Lo usan el CUADRO (client/bracket.tsx) y la AGENDA
// (client/agenda.tsx) para no duplicar la lógica.
//
// Cada llave resuelve a equipos concretos (provisorios con " ·" si el grupo sigue
// abierto) o a un cartel ("2º A", "3º C/E/F/H/I", "GANADOR 73"). Cuando los dos
// lados son concretos y hay fecha en KO_SCHEDULE, sintetizamos un Match para que
// matchState() levante marcador / EN VIVO / FINAL igual que en la fase de grupos,
// y propagamos el ganador a la ronda siguiente — el cuadro y la agenda se llenan
// solos, sin tocar matches.ts.
import { MATCHES } from "../shared/matches";
import { canon } from "../shared/mundial";
import type { Match, StandingGroup, StandingRow } from "../shared/mundial";
import { BRACKET, KO_SCHEDULE, THIRDS_ASSIGN } from "../shared/bracket";
import type { KoSlot, Slot } from "../shared/bracket";
import { matchState } from "./state";
import type { Indexes, MState } from "./state";

// nombre lindo + bandera de la grilla (FIFA usa otros nombres; canon() los une)
const flagBy: Record<string, string> = {}, nameBy: Record<string, string> = {};
for (const m of MATCHES) {
  flagBy[canon(m.a)] = m.fa; flagBy[canon(m.b)] = m.fb;
  nameBy[canon(m.a)] = m.a; nameBy[canon(m.b)] = m.b;
}
export const nm = (t: string) => nameBy[canon(t)] || t;
export const fl = (t: string) => flagBy[canon(t)] || "🏳";

// un slot resuelto: equipo concreto (provisorio si su grupo no terminó) o cartel
export type Resolved = { team: string; prov: boolean } | { label: string };
export const isTeam = (r: Resolved): r is { team: string; prov: boolean } => "team" in r;

export type KoTie = {
  m: number; f: number;
  a: Resolved; b: Resolved;
  sched: KoSlot | null;
  match: Match | null;   // sintetizado cuando ambos lados son concretos + hay fecha
  st: MState | null;
  winA: boolean | null;  // true=ganó A, false=ganó B, null=sin definir
  py: boolean;           // juega Paraguay (lado concreto)
};

// "Grupo A" / "Group A" / "A" → "A"
const groupLetter = (name: string) => name.trim().toUpperCase().match(/([A-L])\s*$/)?.[1] || null;

// inicio en epoch ms desde la fecha/hora PY del calendario (PY = UTC-3 fijo)
export function koEpoch(s: KoSlot): number {
  const [Y, Mo, D] = s.d.split("-").map(Number);
  const [H, Mi] = s.t.split(":").map(Number);
  return Date.UTC(Y, Mo - 1, D, H + 3, Mi);
}

export function resolveKnockouts(standings: StandingGroup[] | undefined, idx: Indexes, nowK: string): Map<number, KoTie> {
  const groups = standings || [];
  // índice de grupos por letra: filas ordenadas + si arrancó + si ya terminó
  const gIndex = new Map<string, { rows: StandingRow[]; final: boolean; started: boolean }>();
  for (const g of groups) {
    const letter = groupLetter(g.group);
    if (!letter) continue;
    gIndex.set(letter, {
      rows: g.rows,
      started: g.rows.some((r) => r.pj > 0),
      final: g.rows.length > 0 && g.rows.every((r) => r.pj >= 3),
    });
  }
  const posTeam = (letter: string, pos: number): { team: string; prov: boolean } | null => {
    const g = gIndex.get(letter);
    if (!g || !g.started) return null;
    const r = g.rows.find((x) => x.pos === pos);
    return r && r.team ? { team: r.team, prov: !g.final } : null;
  };

  // winners/losers se van llenando ronda a ronda; resolveSlot los lee
  const winners = new Map<number, string>(), losers = new Map<number, string>();
  const resolveSlot = (s: Slot, m: number): Resolved => {
    switch (s.k) {
      case "w": return posTeam(s.g, 1) ?? { label: `1º ${s.g}` };
      case "r": return posTeam(s.g, 2) ?? { label: `2º ${s.g}` };
      // el 3º entra recién cuando se carga su grupo en THIRDS_ASSIGN (Anexo C)
      case "t": { const g = THIRDS_ASSIGN[m]; return (g && posTeam(g, 3)) || { label: `3º ${s.gs.join("/")}` }; }
      case "win": { const t = winners.get(s.m); return t ? { team: t, prov: false } : { label: `GANADOR ${s.m}` }; }
      case "lose": { const t = losers.get(s.m); return t ? { team: t, prov: false } : { label: `PERDEDOR ${s.m}` }; }
    }
  };

  const out = new Map<number, KoTie>();
  // una pasada por ronda (4→9) para que octavos vea a los ganadores de dieciseisavos
  for (const f of [4, 5, 6, 7, 8, 9]) {
    for (const tie of BRACKET.filter((t) => t.f === f)) {
      const a = resolveSlot(tie.a, tie.m), b = resolveSlot(tie.b, tie.m);
      const sched = KO_SCHEDULE[tie.m] ?? null;
      let match: Match | null = null, st: MState | null = null, winA: boolean | null = null;
      if (isTeam(a) && isTeam(b) && sched) {
        // Match sintético: nombres lindos para mostrar; canon() igual matchea el
        // marcador FIFA (la API usa otros nombres del mismo origen que standings)
        match = { d: sched.d, t: sched.t, a: nm(a.team), fa: fl(a.team), b: nm(b.team), fb: fl(b.team), ch: sched.ch ?? [], f: tie.f };
        st = matchState(match, idx, nowK);
        if (st.final && st.hs != null) {
          winA = st.hs > st.as! || (st.hs === st.as && (st.hp ?? 0) > (st.ap ?? 0));
          winners.set(tie.m, winA ? a.team : b.team);
          losers.set(tie.m, winA ? b.team : a.team);
        }
      }
      const py = (isTeam(a) && canon(a.team) === "paraguay") || (isTeam(b) && canon(b.team) === "paraguay");
      out.set(tie.m, { m: tie.m, f: tie.f, a, b, sched, match, st, winA, py });
    }
  }
  return out;
}

// llaves con fecha, en orden cronológico (para la agenda)
export function koByDate(map: Map<number, KoTie>): KoTie[] {
  return [...map.values()].filter((t) => t.sched).sort((p, q) => koEpoch(p.sched!) - koEpoch(q.sched!));
}
// próxima llave por jugarse (con fecha), de todas o solo las de Paraguay; si hay
// una de Paraguay EN VIVO la prioriza (igual que nextPy en la fase de grupos)
export function koUpcoming(map: Map<number, KoTie>, nowMs: number, pyOnly = false): KoTie | null {
  if (pyOnly) { for (const t of map.values()) if (t.py && t.st?.live) return t; }
  let best: KoTie | null = null, bestE = Infinity;
  for (const t of map.values()) {
    if (!t.sched || (pyOnly && !t.py)) continue;
    const e = koEpoch(t.sched);
    if (e > nowMs && e < bestE) { best = t; bestE = e; }
  }
  return best;
}
// llaves en vivo ahora
export const koLive = (map: Map<number, KoTie>): KoTie[] => [...map.values()].filter((t) => t.st?.live);
