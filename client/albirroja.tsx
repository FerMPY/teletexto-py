// QUE NECESITA LA ALBIRROJA — rango de puesto final de Paraguay en su grupo,
// condicionado al próximo partido propio (gana/empata/pierde) y enumerando
// TODOS los resultados posibles de los demás partidos del grupo (3^n combos,
// exacto en puntos; los empates en puntos se cuentan a favor para el mejor
// caso y en contra para el peor — la diferencia de gol queda abierta).
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
function finalRange(pts: Record<string, number>, open: Match[], fixed?: { m: Match; out: "g" | "e" | "p" }): Range {
  const base = { ...pts };
  if (fixed) {
    const rival = canon(canon(fixed.m.a) === PY ? fixed.m.b : fixed.m.a);
    if (fixed.out === "g") base[PY] += 3;
    else if (fixed.out === "e") { base[PY] += 1; base[rival] += 1; }
    else base[rival] += 3;
  }
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

function veredicto(r: Range): { txt: string; color: string } {
  if (r.worst <= 2) return { txt: "CLASIFICA DIRECTO A OCTAVOS", color: C.g };
  if (r.best >= 4) return { txt: "ULTIMO — ELIMINADO", color: C.r };
  const rango = r.best === r.worst ? `TERMINA ${r.best}º` : `TERMINA ENTRE ${r.best}º Y ${r.worst}º`;
  const tercero = r.worst >= 3 && r.best <= 3 ? " · SIENDO 3º PASA SI ES DE LOS 8 MEJORES" : "";
  return { txt: rango + tercero, color: r.best <= 2 ? C.y : C.c };
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

  const nextPy = open.find((m) => m.py);
  if (nextPy && matchState(nextPy, idx, nowK).live) return null; // jugando: mirá el partido, no escenarios

  const grupo = standings?.find((g) => g.rows.some((r) => canon(r.team) === PY))?.group;
  const head = (
    <div style={{ color: C.m }} className="tt-glow">QUE NECESITA LA ALBIRROJA{grupo ? ` — ${grupo.toUpperCase()}` : ""}</div>
  );

  if (!nextPy) {
    const v = veredicto(finalRange(pts, open));
    return (
      <div className="mb-3 px-2 py-1" style={{ border: "1px solid var(--tt-m)" }}>
        {head}
        <div className="tt-row">
          <span style={{ color: C.y }}>YA JUGO SUS 3 PARTIDOS · {pts[PY]} PTS</span>
          <span style={{ color: v.color }} className="tt-glow">{v.txt}</span>
        </div>
      </div>
    );
  }

  const rival = (canon(nextPy.a) === PY ? nextPy.b : nextPy.a).toUpperCase();
  const others = open.filter((m) => m !== nextPy);
  const filas = ([
    { label: "GANA", out: "g", suma: 3 },
    { label: "EMPATA", out: "e", suma: 1 },
    { label: "PIERDE", out: "p", suma: 0 },
  ] as const).map((f) => {
    const r = finalRange(pts, others, { m: nextPy, out: f.out });
    return { ...f, r, v: veredicto(r) };
  });
  // mismas consecuencias → una sola fila ("SI GANA O EMPATA: ...")
  const merged: { labels: string[]; v: { txt: string; color: string }; suma: number | null }[] = [];
  for (const f of filas) {
    const last = merged[merged.length - 1];
    if (last && last.v.txt === f.v.txt) { last.labels.push(f.label); last.suma = null; }
    else merged.push({ labels: [f.label], v: f.v, suma: f.suma });
  }
  // si todos los resultados llevan a lo mismo Y eso no decide nada ("entre 1º
  // y 4º"), el box no dice nada → no mostrarlo. Aparece solo cuando el partido
  // separa escenarios o cuando ya hay un veredicto (clasifica / eliminado /
  // puesto exacto) — temprano en el grupo, eso es nunca, y está bien.
  const decide = ({ best, worst }: Range) => worst <= 2 || best >= 4 || best === worst;
  if (merged.length === 1 && !decide(filas[0].r)) return null;
  return (
    <div className="mb-3 px-2 py-1" style={{ border: "1px solid var(--tt-m)" }}>
      {head}
      <div style={{ color: C.dim, fontSize: ".8em" }}>
        VS {rival} — PUESTO FINAL POSIBLE, CON LOS DEMAS PARTIDOS DEL GRUPO ABIERTOS
      </div>
      {merged.map((f) => (
        <div key={f.labels.join()} className="tt-row">
          <span style={{ color: C.c }}>{f.labels.length === 3 ? "PASE LO QUE PASE" : `SI ${f.labels.join(" O ")}`}:</span>
          <span style={{ color: f.v.color }} className="tt-glow">{f.v.txt}</span>
          {f.suma != null && <span style={{ color: C.dim }}>({pts[PY] + f.suma} PTS)</span>}
        </div>
      ))}
    </div>
  );
}
