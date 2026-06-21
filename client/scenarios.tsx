// EN JUEGO — SI TERMINA ASÍ: proyección EN VIVO de la clasificación. Aparece solo
// cuando hay partidos de grupo en curso y muestra, por grupo, cómo quedaría la
// tabla si los marcadores de AHORA fueran finales: quién pasa (1º/2º), quién
// queda 3º (y si entra entre los 8 mejores terceros) y quién se va afuera.
//
// La matemática vive en shared/scenarios.ts (pura, testeable). Acá la adaptamos:
// armamos la base desde la tabla OFICIAL de FIFA y le superponemos los marcadores
// en vivo — sin contar dos veces si FIFA ya metió el partido en la tabla (su PJ
// ya subió respecto de los partidos terminados).
import { MATCHES } from "../shared/matches";
import { canon } from "../shared/mundial";
import type { Match, StandingGroup } from "../shared/mundial";
import { bestThirds, projectGroup, qualifyTag } from "../shared/scenarios";
import type { Overlay, ProjGroup, SimpleRow, Tone } from "../shared/scenarios";
import { C, TeamLink } from "./teletext";
import { matchState } from "./state";
import type { Indexes } from "./state";

// nombre lindo + bandera de la grilla (FIFA usa otros nombres)
const flagBy: Record<string, string> = {}, nameBy: Record<string, string> = {};
for (const m of MATCHES) {
  flagBy[canon(m.a)] = m.fa; flagBy[canon(m.b)] = m.fb;
  nameBy[canon(m.a)] = m.a; nameBy[canon(m.b)] = m.b;
}
const toneColor: Record<Tone, string> = { in: C.g, "third-in": C.c, "third-out": C.r, out: C.r };

type LiveMatch = { m: Match; hs: number; as: number; min: string | null };
type LiveGroup = { pg: ProjGroup; lives: LiveMatch[] };

// partidos de fase de grupos (f<=3) entre equipos de un conjunto canónico
const groupMatches = (set: Set<string>) =>
  MATCHES.filter((m) => m.f <= 3 && set.has(canon(m.a)) && set.has(canon(m.b)));

// proyecta TODOS los grupos (para los terceros) y separa los que están en juego
function project(standings: StandingGroup[], idx: Indexes, nowK: string): { liveGroups: LiveGroup[]; thirdsIn: Set<string> } {
  const built = standings.map((g) => {
    const base: SimpleRow[] = g.rows.map((r) => ({
      canon: canon(r.team), name: nameBy[canon(r.team)] || r.team, flag: flagBy[canon(r.team)] || "🏳",
      pts: r.pts, gd: r.gd, gf: r.gf, pj: r.pj,
    }));
    const pjBy = new Map(base.map((r) => [r.canon, r.pj]));
    const set = new Set(base.map((r) => r.canon));
    // ¿cuántos partidos TERMINADOS tiene cada equipo? si el PJ oficial es mayor,
    // FIFA ya contó el partido en vivo en la tabla → no lo superpongo de nuevo
    const finished = new Map<string, number>();
    for (const m of groupMatches(set)) {
      const st = matchState(m, idx, nowK);
      if (st.final && st.hs != null) {
        finished.set(canon(m.a), (finished.get(canon(m.a)) || 0) + 1);
        finished.set(canon(m.b), (finished.get(canon(m.b)) || 0) + 1);
      }
    }
    const overlays: Overlay[] = [];
    const lives: LiveMatch[] = [];
    for (const m of groupMatches(set)) {
      const st = matchState(m, idx, nowK);
      if (!st.live || st.hs == null) continue;
      const a = canon(m.a), b = canon(m.b);
      lives.push({ m, hs: st.hs, as: st.as!, min: st.min });
      const counted = (pjBy.get(a) || 0) > (finished.get(a) || 0) || (pjBy.get(b) || 0) > (finished.get(b) || 0);
      if (!counted) overlays.push({ a, b, hs: st.hs, as: st.as! });
    }
    const pg = projectGroup(g.group, base, overlays);
    // marcar EN VIVO las filas con partido en curso (aunque FIFA ya lo haya
    // contado y no se haya superpuesto) y el grupo si hay alguno
    const liveTeams = new Set(lives.flatMap((l) => [canon(l.m.a), canon(l.m.b)]));
    for (const r of pg.rows) r.live = liveTeams.has(r.canon);
    pg.live = lives.length > 0;
    return { pg, lives };
  });
  return { liveGroups: built.filter((b) => b.pg.live), thirdsIn: bestThirds(built.map((b) => b.pg)) };
}

function GroupBox({ pg, lives, thirdsIn, onTeam }: { pg: ProjGroup; lives: LiveMatch[]; thirdsIn: Set<string>; onTeam?: (n: string) => void }) {
  return (
    <div className="px-2 py-1" style={{ border: "1px solid var(--tt-g)" }}>
      {/* sin ● parpadeante ni "EN JUEGO": el panel YA es la proyección de los
          partidos en curso; el minuto del marcador alcanza como señal de vivo
          (los badges parpadeantes viven en la cinta y en la agenda, no acá) */}
      <div className="tt-bar tt-glow" style={{ color: "#fff" }}>{pg.group}</div>
      {/* los marcadores que se están jugando ahora (el minuto = está en vivo) */}
      {lives.map((l) => (
        <div key={l.m.a + l.m.b} className="flex flex-wrap gap-x-2 items-baseline" style={{ fontSize: ".9em", padding: ".12em .1em" }}>
          <span style={{ color: C.fg }}>{l.m.fa} {l.m.a} <span style={{ color: "#fff" }}>{l.hs}-{l.as}</span> {l.m.b} {l.m.fb}</span>
          <span style={{ color: C.g }}>{l.min || "EN VIVO"}</span>
        </div>
      ))}
      {/* tabla proyectada */}
      <table className="w-full mt-1" style={{ borderCollapse: "collapse" }}>
        <tbody>
          {pg.rows.map((r) => {
            const t = qualifyTag(r.pos, r.canon, thirdsIn);
            const col = toneColor[t.tone];
            return (
              <tr key={r.canon} style={r.live ? { background: "linear-gradient(90deg, rgba(61,220,61,.10), transparent)" } : undefined}>
                <td className="w-5" style={{ color: C.dim }}>{r.pos}</td>
                <td className="tt-glow" style={{ color: col }}><TeamLink name={r.name} flag={r.flag} onTeam={onTeam} /></td>
                <td className="text-right w-8" style={{ color: "#fff" }}>{r.pts}</td>
                <td className="text-right w-10" style={{ color: C.dim }}>{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                <td className="text-right" style={{ color: col, whiteSpace: "nowrap", paddingLeft: ".6em" }}>{t.txt}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="tt-glow mt-1" style={{ color: C.g }}>► PASAN {pg.rows[0].name} Y {pg.rows[1].name}</div>
    </div>
  );
}

// Panel completo. Devuelve null si no hay partidos de grupo en juego (así no
// estorba el resto del tiempo). Se usa en la AGENDA (P100) y en TABLA→GRUPOS (P200).
export function LiveScenarios({ standings, idx, nowK, onTeam }: { standings?: StandingGroup[]; idx: Indexes; nowK: string; onTeam?: (n: string) => void }) {
  if (!standings || standings.length === 0) return null;
  const { liveGroups, thirdsIn } = project(standings, idx, nowK);
  if (liveGroups.length === 0) return null;
  return (
    <div className="mb-3">
      <div style={{ color: C.g }} className="tt-glow">SI TERMINA ASÍ</div>
      {/* flex con base ~26em: con un solo grupo en juego la caja queda cómoda
          (no estirada a toda la página ni apretada a 1/3 con el texto cortándose);
          con 2-3 grupos se acomodan al lado y recién ahí envuelven */}
      <div className="flex flex-wrap gap-x-6 gap-y-3 mt-1">
        {liveGroups.map(({ pg, lives }) => (
          <div key={pg.group} style={{ flex: "1 1 26em", maxWidth: "34em" }}>
            <GroupBox pg={pg} lives={lives} thirdsIn={thirdsIn} onTeam={onTeam} />
          </div>
        ))}
      </div>
      <div style={{ color: C.dim, fontSize: ".8em" }} className="mt-1">
        PROYECCIÓN CON LOS MARCADORES DE AHORA · 1º Y 2º PASAN, EL 3º SEGÚN LOS 8 MEJORES TERCEROS · DESEMPATE POR DIFERENCIA DE GOL (LOS FINOS DE FIFA PUEDEN VARIAR).
      </div>
    </div>
  );
}
