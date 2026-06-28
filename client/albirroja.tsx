// ASÍ VA LA ALBIRROJA — resumen FACTUAL (matemático) de la situación de Paraguay
// en su grupo: posición y puntos reales (de la tabla), partidos que le quedan,
// puntaje máximo al que puede llegar, y UN veredicto en lenguaje claro.
//
// A propósito NO decimos "tiene que ganar" salvo que sea matemáticamente cierto:
// eso es probabilidad, no un hecho (un empate todavía no lo elimina). Mostramos
// solo lo que es seguro. El rango de puesto final sale de enumerar TODOS los
// resultados posibles de los partidos del grupo que siguen abiertos (3^n combos,
// exacto en puntos; los empates en puntos cuentan a favor en el mejor caso y en
// contra en el peor — la diferencia de gol queda abierta).
import { MATCHES } from "../shared/matches";
import { canon } from "../shared/mundial";
import type { Match, StandingGroup, StandingRow } from "../shared/mundial";
import { C } from "./teletext";
import { matchState } from "./state";
import type { Indexes } from "./state";

const PY = "paraguay";
// el grupo se deriva de la propia agenda: los rivales de Paraguay SON su grupo
const groupTeams = (() => {
  const set = new Set<string>([PY]);
  for (const m of MATCHES) {
    if (canon(m.a) === PY) set.add(canon(m.b));
    if (canon(m.b) === PY) set.add(canon(m.a));
  }
  return set;
})();
const groupMatches = MATCHES.filter((m) => m.f <= 3 && groupTeams.has(canon(m.a)) && groupTeams.has(canon(m.b)));

type Range = { best: number; worst: number };
// rango de puesto final de Paraguay enumerando todo lo que sigue abierto
function finalRange(pts: Record<string, number>, open: Match[]): Range {
  const base = { ...pts };
  let best = groupTeams.size, worst = 1;
  const rec = (i: number) => {
    if (i === open.length) {
      let above = 0, tied = 0;
      for (const t of groupTeams) {
        if (t === PY) continue;
        if (base[t] > base[PY]) above++;
        else if (base[t] === base[PY]) tied++;
      }
      best = Math.min(best, 1 + above);
      worst = Math.max(worst, 1 + above + tied);
      return;
    }
    const m = open[i], a = canon(m.a), b = canon(m.b);
    for (const [da, db] of [[3, 0], [1, 1], [0, 3]]) {
      base[a] += da; base[b] += db;
      rec(i + 1);
      base[a] -= da; base[b] -= db;
    }
  };
  rec(0);
  return { best, worst };
}

// veredicto en lenguaje claro. Con el grupo CERRADO usa la posición REAL de la
// tabla (no enumera nada); con el grupo en curso usa el rango de puestos posibles.
function veredicto(r: Range, ctx: { done: boolean; pos: number; inThirds: boolean; allDone: boolean }): { txt: string; color: string } {
  const { done, pos, inThirds, allDone } = ctx;
  if (done) {
    if (pos <= 2) return { txt: `CLASIFICÓ A OCTAVOS — TERMINÓ ${pos}º`, color: C.g };
    if (pos === 3) {
      if (allDone) return inThirds
        ? { txt: "TERMINÓ 3º · CLASIFICA ENTRE LOS 8 MEJORES TERCEROS", color: C.g }
        : { txt: "TERMINÓ 3º · QUEDÓ AFUERA (NO ENTRE LOS 8 MEJORES TERCEROS)", color: C.r };
      return inThirds
        ? { txt: "TERMINÓ 3º · HOY ENTRARÍA ENTRE LOS 8 MEJORES TERCEROS — SE DEFINE AL CERRAR TODOS LOS GRUPOS", color: C.c }
        : { txt: "TERMINÓ 3º · HOY QUEDARÍA AFUERA DE LOS MEJORES TERCEROS — SE DEFINE AL CERRAR TODOS LOS GRUPOS", color: C.c };
    }
    return { txt: `ELIMINADO — TERMINÓ ${pos}º, NO LLEGA A OCTAVOS`, color: C.r };
  }
  if (r.worst <= 2) return { txt: "YA CLASIFICÓ A OCTAVOS", color: C.g };
  if (r.best >= 4) return { txt: "ELIMINADO — NO LLEGA A OCTAVOS", color: C.r };
  if (r.best === 3) return { txt: "EN EL MEJOR CASO TERMINA 3º · PASA SOLO SI ENTRA EN LOS 8 MEJORES TERCEROS", color: C.c };
  return { txt: "TODAVÍA PUEDE TERMINAR 1º O 2º Y CLASIFICAR DIRECTO", color: C.y };
}

export function Albirroja({ idx, nowK, standings }: { idx: Indexes; nowK: string; standings?: StandingGroup[] }) {
  // jugando ahora → mejor mirá el partido, no el resumen
  if (groupMatches.some((m) => m.py && matchState(m, idx, nowK).live)) return null;

  // posición y puntos REALES desde la tabla (autoritativa: ya incluye lo jugado)
  const grp = standings?.find((g) => g.rows.some((r) => canon(r.team) === PY));
  const pyRow = grp?.rows.find((r) => canon(r.team) === PY);
  if (!grp || !pyRow || pyRow.pj < 1) return null; // sin datos / antes de jugar: nada que decir

  // base de puntos = la tabla; sólo enumeramos lo que GENUINAMENTE falta jugar
  // (partidos a futuro). Un partido pasado sin marcador en `idx` ya está contado
  // en la tabla — no se vuelve a abrir como "por jugar" (eso causaba el "todavía
  // puede 1º/2º" con el grupo ya terminado).
  const base: Record<string, number> = {};
  for (const t of groupTeams) base[t] = 0;
  for (const r of grp.rows) base[canon(r.team)] = r.pts;
  const open: Match[] = groupMatches.filter((m) => { const st = matchState(m, idx, nowK); return !st.final && !st.live; });

  const left = 3 - pyRow.pj;
  const maxPts = pyRow.pts + left * 3;
  const rivals = open.filter((m) => m.py).map((m) => (canon(m.a) === PY ? m.b : m.a));

  // ¿cerró el grupo de Paraguay? (la última fecha es simultánea → left 0 = cerrado)
  const done = grp.rows.every((r) => r.pj >= 3);
  // mejores terceros del torneo + si TODOS los grupos cerraron (para un veredicto
  // definitivo del 3º; si no, el del 3º es provisorio)
  const allGroups = standings || [];
  const allDone = allGroups.length > 0 && allGroups.every((g) => g.rows.length > 0 && g.rows.every((r) => r.pj >= 3));
  const inThirds = allGroups
    .map((g) => g.rows.find((r) => r.pos === 3))
    .filter((r): r is StandingRow => !!r && r.pj > 0)
    .sort((p, q) => q.pts - p.pts || q.gd - p.gd || q.gf - p.gf)
    .slice(0, 8)
    .some((r) => canon(r.team) === PY);

  const v = veredicto(finalRange(base, open), { done, pos: pyRow.pos, inThirds, allDone });

  return (
    <div className="mb-3 px-2 py-1" style={{ border: "1px solid var(--tt-m)" }}>
      <div style={{ color: C.m }} className="tt-glow">ASÍ VA LA ALBIRROJA — {grp.group.toUpperCase()}</div>
      <div className="tt-row">
        <span style={{ color: C.y }} className="tt-glow">🇵🇾 PARAGUAY {pyRow.pos}º · {pyRow.pts} {pyRow.pts === 1 ? "PT" : "PTS"}</span>
        <span style={{ color: C.dim }}>JUGÓ {pyRow.pj} DE 3</span>
        {left > 0 && <span style={{ color: C.c }}>LE QUEDA{rivals.length > 1 ? "N" : ""}: {rivals.join(" Y ")} (HASTA {maxPts} PTS)</span>}
      </div>
      <div style={{ color: v.color }} className="tt-glow">{v.txt}</div>
    </div>
  );
}
