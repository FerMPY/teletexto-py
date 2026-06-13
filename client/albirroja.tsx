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
import type { Match, StandingGroup } from "../shared/mundial";
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

// veredicto en lenguaje claro a partir del rango de puesto posible
function veredicto(r: Range): { txt: string; color: string } {
  if (r.worst <= 2) return { txt: "YA CLASIFICÓ A OCTAVOS", color: C.g };
  if (r.best >= 4) return { txt: "ELIMINADO — NO LLEGA A OCTAVOS", color: C.r };
  if (r.best === 3) return { txt: "EN EL MEJOR CASO TERMINA 3º · PASA SOLO SI ENTRA EN LOS 8 MEJORES TERCEROS", color: C.c };
  return { txt: "TODAVÍA PUEDE TERMINAR 1º O 2º Y CLASIFICAR DIRECTO", color: C.y };
}

export function Albirroja({ idx, nowK, standings }: { idx: Indexes; nowK: string; standings?: StandingGroup[] }) {
  // puntos por resultados FINALES; lo no terminado queda abierto (a enumerar)
  const pts: Record<string, number> = {};
  for (const t of groupTeams) pts[t] = 0;
  const open: Match[] = [];
  for (const m of groupMatches) {
    const st = matchState(m, idx, nowK);
    if (st.final && st.hs != null) {
      const a = canon(m.a), b = canon(m.b);
      if (st.hs > st.as!) pts[a] += 3;
      else if (st.hs < st.as!) pts[b] += 3;
      else { pts[a] += 1; pts[b] += 1; }
    } else open.push(m);
  }

  // jugando ahora → mejor mirá el partido, no el resumen
  if (open.some((m) => m.py && matchState(m, idx, nowK).live)) return null;

  // posición y puntos REALES desde la tabla (más fiel que recalcular)
  const grp = standings?.find((g) => g.rows.some((r) => canon(r.team) === PY));
  const pyRow = grp?.rows.find((r) => canon(r.team) === PY);
  if (!grp || !pyRow || pyRow.pj < 1) return null; // sin datos / antes de jugar: nada que decir

  const left = 3 - pyRow.pj;
  const maxPts = pyRow.pts + left * 3;
  const rivals = open.filter((m) => m.py).map((m) => (canon(m.a) === PY ? m.b : m.a));
  const v = veredicto(finalRange(pts, open));

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
