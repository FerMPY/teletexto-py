// P700 — TRAYECTORIA DE UN EQUIPO: se abre tocando el nombre de cualquier equipo
// (en la agenda o la tabla). Muestra cómo le fue y qué le queda: su fila en el
// grupo, la racha (G/E/P con marcadores), los goleadores del equipo, los partidos
// jugados y los próximos (con canales), y un veredicto de clasificación —
// generalización del box de la Albirroja a CUALQUIER selección.
import { MATCHES } from "../shared/matches";
import { canon } from "../shared/mundial";
import type { ApiData, ChannelKey, Match, StandingGroup } from "../shared/mundial";
import { C, FormDots, Sep, TeamLink, TitleBar } from "./teletext";
import { Row } from "./agenda";
import { goalsFor, matchState, teamForm, teamMatches } from "./state";
import type { Indexes } from "./state";

type Watch = (m: Match, ch: ChannelKey) => void;
type TeamNav = (name: string) => void;

// nombre lindo + bandera (los toma de la propia agenda)
function display(teamCanon: string): { name: string; flag: string } {
  for (const m of MATCHES) {
    if (canon(m.a) === teamCanon) return { name: m.a, flag: m.fa };
    if (canon(m.b) === teamCanon) return { name: m.b, flag: m.fb };
  }
  return { name: teamCanon.toUpperCase(), flag: "🏳" };
}

// el grupo = los rivales de fase de grupos (f<=3), igual que en la Albirroja
function groupOf(teamCanon: string): Set<string> {
  const set = new Set<string>([teamCanon]);
  for (const m of MATCHES) {
    if (m.f > 3) continue;
    if (canon(m.a) === teamCanon) set.add(canon(m.b));
    if (canon(m.b) === teamCanon) set.add(canon(m.a));
  }
  return set;
}

// rango de puesto final enumerando todo lo que sigue abierto en el grupo (3^n)
function finalRange(teamCanon: string, group: Set<string>, pts: Record<string, number>, open: Match[]) {
  const base = { ...pts };
  let best = group.size, worst = 1;
  const rec = (i: number) => {
    if (i === open.length) {
      let above = 0, tied = 0;
      for (const t of group) {
        if (t === teamCanon) continue;
        if (base[t] > base[teamCanon]) above++;
        else if (base[t] === base[teamCanon]) tied++;
      }
      best = Math.min(best, 1 + above);
      worst = Math.max(worst, 1 + above + tied);
      return;
    }
    const a = canon(open[i].a), b = canon(open[i].b);
    for (const [da, db] of [[3, 0], [1, 1], [0, 3]]) {
      base[a] += da; base[b] += db; rec(i + 1); base[a] -= da; base[b] -= db;
    }
  };
  rec(0);
  return { best, worst };
}

function verdict(best: number, worst: number): { txt: string; color: string } {
  if (worst <= 2) return { txt: "YA CLASIFICÓ A OCTAVOS", color: C.g };
  if (best >= 4) return { txt: "ELIMINADO — NO LLEGA A OCTAVOS", color: C.r };
  if (best === 3) return { txt: "EN EL MEJOR CASO TERMINA 3º · PASA SOLO SI ENTRA EN LOS 8 MEJORES TERCEROS", color: C.c };
  return { txt: "TODAVÍA PUEDE TERMINAR 1º O 2º Y CLASIFICAR DIRECTO", color: C.y };
}

export function TeamPage({ team, idx, nowK, onWatch, onProde, onTeam, onClose, standings }: {
  team: string; idx: Indexes; nowK: string; onWatch: Watch; onProde?: (mk: string) => void; onTeam?: TeamNav; onClose: () => void; standings?: StandingGroup[];
}) {
  const teamCanon = canon(team);
  const { name, flag } = display(teamCanon);
  const all = teamMatches(teamCanon);
  const played = all.filter((m) => { const st = matchState(m, idx, nowK); return st.final && !st.live; });
  const live = all.filter((m) => matchState(m, idx, nowK).live);
  const upcoming = all.filter((m) => { const st = matchState(m, idx, nowK); return !st.final && !st.live; });
  const form = teamForm(teamCanon, idx, nowK);

  // fila y grupo reales desde la tabla (más fiel que recalcular)
  const grp = standings?.find((g) => g.rows.some((r) => canon(r.team) === teamCanon));
  const row = grp?.rows.find((r) => canon(r.team) === teamCanon);

  // goleadores del equipo (suma de los goles propios, sin goles en contra)
  const scorers = (() => {
    const by = new Map<string, number>();
    for (const m of played.concat(live)) {
      const isA = canon(m.a) === teamCanon;
      for (const e of goalsFor(m, idx)) {
        if (e.og || !e.name) continue;
        const mine = isA ? e.side === "h" : e.side === "a";
        if (mine) by.set(e.name, (by.get(e.name) || 0) + 1);
      }
    }
    return [...by.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  })();

  // veredicto de clasificación (solo en fase de grupos, con datos)
  let vdict: { txt: string; color: string } | null = null;
  if (grp && row && row.pj >= 1) {
    const group = groupOf(teamCanon);
    const groupMatches = MATCHES.filter((m) => m.f <= 3 && group.has(canon(m.a)) && group.has(canon(m.b)));
    const pts: Record<string, number> = {}; for (const t of group) pts[t] = 0;
    const open: Match[] = [];
    for (const m of groupMatches) {
      const st = matchState(m, idx, nowK);
      if (st.final && st.hs != null) {
        const a = canon(m.a), b = canon(m.b);
        if (st.hs > st.as!) pts[a] += 3; else if (st.hs < st.as!) pts[b] += 3; else { pts[a] += 1; pts[b] += 1; }
      } else open.push(m);
    }
    if (open.length === 0) {
      // grupo terminado → veredicto por posición final
      if (row.pos <= 2) vdict = { txt: `CLASIFICÓ ${row.pos}º — A OCTAVOS`, color: C.g };
      else if (row.pos === 3) vdict = { txt: "TERMINÓ 3º — PASA SOLO SI ESTÁ ENTRE LOS 8 MEJORES TERCEROS", color: C.c };
      else vdict = { txt: `TERMINÓ ${row.pos}º — ELIMINADO`, color: C.r };
    } else {
      const r = finalRange(teamCanon, group, pts, open);
      vdict = verdict(r.best, r.worst);
    }
  }

  return (
    <div>
      <button className="tt-chip" style={{ color: C.c }} onClick={onClose} title="Volver">◄ VOLVER</button>
      <TitleBar>{flag} {name}</TitleBar>

      {/* resumen de grupo + racha */}
      {row ? (
        <div className="mb-3 px-2 py-1" style={{ border: "1px solid var(--tt-c)" }}>
          <div className="tt-row" style={{ borderTop: "none" }}>
            <span style={{ color: C.y }} className="tt-glow">{row.pos}º · {grp?.group}</span>
            <span style={{ color: "#fff" }}>{row.pts} {row.pts === 1 ? "PT" : "PTS"}</span>
            <span style={{ color: C.dim }}>{row.pj} PJ · {row.w}G {row.d}E {row.l}P</span>
            <span style={{ color: C.dim }}>GF {row.gf} · GC {row.ga} · DG {row.gd > 0 ? `+${row.gd}` : row.gd}</span>
            {form.length > 0 && <FormDots form={form} />}
          </div>
          {vdict && <div style={{ color: vdict.color }} className="tt-glow">{vdict.txt}</div>}
        </div>
      ) : (
        <div className="mb-3" style={{ color: C.dim }}>
          {flag} {name} — {standings ? "SIN DATOS DE LA TABLA TODAVÍA." : "CARGANDO..."}
          {form.length > 0 && <span className="ml-2"><FormDots form={form} /></span>}
        </div>
      )}

      {/* el grupo: dónde está parado respecto a sus rivales (tocá un rival para saltar) */}
      {grp && (() => {
        const started = grp.rows.some((x) => x.pj > 0);
        return (
          <>
            <Sep color={C.c} label={`${grp.group.toUpperCase()} — CLASIFICACIÓN`} />
            <table className="mb-3" style={{ borderCollapse: "collapse", width: "100%", maxWidth: "34em" }}>
              <thead>
                <tr style={{ color: C.c }}>
                  <th className="text-left w-6">#</th>
                  <th className="text-left">EQUIPO</th>
                  <th className="text-right w-8">PJ</th>
                  <th className="text-right w-10">DG</th>
                  <th className="text-right w-10">PTS</th>
                </tr>
              </thead>
              <tbody>
                {grp.rows.map((r) => {
                  const rc = canon(r.team), d = display(rc), me = rc === teamCanon;
                  const q = started && r.pos <= 2;
                  return (
                    <tr key={r.team} style={me ? { color: q ? C.g : C.y, background: "linear-gradient(90deg, rgba(70,224,224,.18), rgba(20,20,200,.18))", outline: "1px solid rgba(70,224,224,.5)" } : { color: q ? C.g : C.y }}>
                      <td>{r.pos}</td>
                      <td className="tt-glow"><TeamLink name={d.name} flag={d.flag} onTeam={me ? undefined : onTeam} /></td>
                      <td className="text-right">{r.pj}</td>
                      <td className="text-right">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                      <td className="text-right" style={{ color: "#fff" }}>{r.pts}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        );
      })()}

      {/* en vivo */}
      {live.length > 0 && (
        <>
          <Sep color={C.g} label="EN VIVO AHORA" />
          {live.map((m) => <Row key={"l" + m.d + m.t + m.a} m={m} idx={idx} nowK={nowK} onWatch={onWatch} onProde={onProde} onTeam={onTeam} />)}
        </>
      )}

      {/* próximos */}
      {upcoming.length > 0 && (
        <>
          <Sep color={C.m} label="PRÓXIMOS" />
          {upcoming.map((m) => <Row key={"u" + m.d + m.t + m.a} m={m} idx={idx} nowK={nowK} onWatch={onWatch} onProde={onProde} onTeam={onTeam} />)}
        </>
      )}

      {/* resultados (jugados) */}
      {played.length > 0 && (
        <>
          <Sep color={C.c} label="RESULTADOS" />
          {played.map((m) => <Row key={"p" + m.d + m.t + m.a} m={m} idx={idx} nowK={nowK} onWatch={onWatch} onProde={onProde} onTeam={onTeam} />)}
        </>
      )}

      {/* goleadores del equipo */}
      {scorers.length > 0 && (
        <>
          <Sep color={C.y} label={`GOLES DE ${name.toUpperCase()}`} />
          <div className="tt-row" style={{ borderTop: "none" }}>
            {scorers.map(([n, g]) => (
              <span key={n} style={{ color: C.y }} className="tt-glow">{n}{g > 1 ? ` ×${g}` : ""}</span>
            ))}
          </div>
        </>
      )}

      <div className="mt-4" style={{ color: C.dim, fontSize: ".85em" }}>
        TOCÁ EL NOMBRE DE CUALQUIER EQUIPO (ACÁ O EN LA AGENDA/TABLA) PARA VER SU TRAYECTORIA.
      </div>
    </div>
  );
}
