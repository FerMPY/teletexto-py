// CLASIFICACIÓN / LLAVES (sub-pestaña de P200 TABLA): el cuadro de eliminatorias.
// Mientras FIFA no publique los
// cruces (se definen al cerrar la fase de grupos, ~28 JUN), mostramos el cuadro
// vacío como guía + QUIÉNES CLASIFICARÍAN hoy (1º y 2º de cada grupo + los 8
// mejores terceros). Cuando se agreguen los partidos de eliminatorias a
// matches.ts (f >= 4), esta página los dibuja como llaves automáticamente.
import { MATCHES } from "../shared/matches";
import { canon } from "../shared/mundial";
import type { ApiData, ChannelKey, Match, StandingGroup } from "../shared/mundial";
import { C, Live, Sep, TitleBar } from "./teletext";
import { chOf, dayLabel, matchState, scoreStr } from "./state";
import type { Indexes } from "./state";

// nombre lindo + bandera de la grilla (FIFA usa otros nombres)
const flagBy: Record<string, string> = {}, nameBy: Record<string, string> = {};
for (const m of MATCHES) {
  flagBy[canon(m.a)] = m.fa; flagBy[canon(m.b)] = m.fb;
  nameBy[canon(m.a)] = m.a; nameBy[canon(m.b)] = m.b;
}
const team = (t: string) => `${flagBy[canon(t)] || "🏳"} ${nameBy[canon(t)] || t}`;

// f del torneo → nombre de la ronda (48 equipos: la 1ª eliminatoria son 32)
const ROUND: Record<number, string> = { 4: "DIECISÉISAVOS", 5: "OCTAVOS", 6: "CUARTOS", 7: "SEMIFINALES", 8: "FINAL", 9: "TERCER PUESTO" };
const roundName = (f: number) => ROUND[f] || `FASE ${f}`;

function KnockoutMatch({ m, idx, nowK, onWatch }: { m: Match; idx: Indexes; nowK: string; onWatch: (m: Match, ch: ChannelKey) => void }) {
  const st = matchState(m, idx, nowK);
  const pyHere = !!m.py;
  return (
    <div className={`tt-row${pyHere ? " py" : ""}`} style={{ minWidth: "18em" }}>
      <span style={{ color: C.c }}>{dayLabel(m.d)} {m.t}</span>
      <span style={{ color: C.y }} className="tt-glow w-full">
        {team(m.a)} <span style={{ color: st.hs != null ? "#fff" : C.dim }}>{scoreStr(st) ?? "vs"}</span> {team(m.b)}
      </span>
      {st.live ? <Live min={st.min} /> : st.final && st.hs != null ? <span style={{ color: C.dim }}>FINAL</span> : null}
      <button className="tt-btn ch" style={{ color: C.g }} onClick={() => onWatch(m, chOf(m)[0])}>VER</button>
    </div>
  );
}

// lista de un grupo de clasificados (1º / 2º / terceros) con resalte de Paraguay
function QualList({ label, color, rows }: { label: string; color: string; rows: { team: string; tag: string; out?: boolean }[] }) {
  return (
    <div>
      <Sep color={color} label={label} />
      {rows.map((r, i) => (
        <div key={i} className={`tt-row${canon(r.team) === "paraguay" ? " py" : ""}`}>
          <span style={{ color: r.out ? C.dim : color }} className="tt-glow">{team(r.team)}</span>
          <span style={{ color: C.dim }}>{r.tag}</span>
          {r.out && <span style={{ color: C.r }}>AFUERA HOY</span>}
        </div>
      ))}
    </div>
  );
}

export function Bracket({ data, idx, nowK, onWatch, embedded }: { data: ApiData | null; idx: Indexes; nowK: string; onWatch: (m: Match, ch: ChannelKey) => void; embedded?: boolean }) {
  const ko = MATCHES.filter((m) => m.f >= 4).sort((a, b) => a.f - b.f || `${a.d}T${a.t}`.localeCompare(`${b.d}T${b.t}`));

  // YA HAY ELIMINATORIAS → dibujar las llaves por ronda (columnas)
  if (ko.length) {
    const byRound = new Map<number, Match[]>();
    for (const m of ko) (byRound.get(m.f) ?? byRound.set(m.f, []).get(m.f)!).push(m);
    return (
      <div>
        {!embedded && <TitleBar color={C.m}>LLAVES — RONDA FINAL</TitleBar>}
        <div className="flex gap-6 overflow-x-auto pb-4">
          {[...byRound.entries()].map(([f, ms]) => (
            <div key={f} className="flex-none">
              <Sep color={C.m} label={roundName(f)} />
              {ms.map((m) => <KnockoutMatch key={m.d + m.t + m.a} m={m} idx={idx} nowK={nowK} onWatch={onWatch} />)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // TODAVÍA NO HAY CRUCES → guía del cuadro + quiénes clasificarían hoy
  const groups: StandingGroup[] = data?.standings || [];
  const started = groups.some((g) => g.rows.some((r) => r.pj > 0));
  const pick = (pos: number) => groups
    .map((g) => ({ g: g.group, r: g.rows.find((x) => x.pos === pos) }))
    .filter((x): x is { g: string; r: NonNullable<typeof x.r> } => !!x.r);
  const winners = pick(1), runners = pick(2);
  const thirds = pick(3)
    .filter((x) => x.r.pj > 0)
    .sort((p, q) => q.r.pts - p.r.pts || q.r.gd - p.r.gd || q.r.gf - p.r.gf);

  const STAGES = ["DIECISÉISAVOS (16)", "OCTAVOS (8)", "CUARTOS (4)", "SEMIS (2)", "FINAL"];

  return (
    <div>
      {!embedded && <TitleBar color={C.m}>LLAVES — RONDA FINAL</TitleBar>}

      {/* cuadro vacío como guía */}
      <div className="tt-bar tt-glow" style={{ color: "#fff" }}>EL CAMINO A LA FINAL</div>
      <div className="flex flex-wrap items-center gap-1 my-2" style={{ color: C.dim }}>
        {STAGES.map((s, i) => (
          <span key={s}>
            <span style={{ color: C.c }}>{s}</span>{i < STAGES.length - 1 && <span style={{ color: C.dim }}>{"  ►  "}</span>}
          </span>
        ))}
      </div>
      <div style={{ color: C.y }} className="mb-4">
        EL CUADRO SE DEFINE AL TERMINAR LA FASE DE GRUPOS (≈28 JUN). MIENTRAS TANTO,
        ASÍ ESTARÍAN LOS CLASIFICADOS SI LA FASE CERRARA HOY:
      </div>

      {!started ? (
        <div style={{ color: C.dim }}>{data ? "TODAVIA NO ARRANCO LA FASE DE GRUPOS." : "CARGANDO..."}</div>
      ) : (
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
          <QualList label="1º DE GRUPO" color={C.g} rows={winners.map((x) => ({ team: x.r.team, tag: x.g }))} />
          <QualList label="2º DE GRUPO" color={C.g} rows={runners.map((x) => ({ team: x.r.team, tag: x.g }))} />
          <QualList label="MEJORES TERCEROS — PASAN 8" color={C.c} rows={thirds.map((x, i) => ({ team: x.r.team, tag: `${x.g} · ${x.r.pts} PTS`, out: i >= 8 }))} />
        </div>
      )}

      <div className="mt-4" style={{ color: C.dim, fontSize: ".85em" }}>
        CLASIFICAN LOS 2 PRIMEROS DE CADA GRUPO + LOS 8 MEJORES TERCEROS (32 EQUIPOS).
        ESTO ES PROVISORIO: CAMBIA CON CADA RESULTADO HASTA EL CIERRE DE LA FASE DE GRUPOS.
      </div>
    </div>
  );
}
