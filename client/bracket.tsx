// CLASIFICACIÓN / LLAVES (sub-pestaña de P200 TABLA): el CUADRO de eliminatorias
// de verdad — un árbol Dieciseisavos → Octavos → Cuartos → Semis → Final, con el
// 3er puesto aparte.
//
// El esqueleto (qué slot juega con qué slot) es fijo y vive en shared/bracket.ts.
// Acá lo LLENAMOS con la tabla en vivo de FIFA (data.standings):
//   · 1º y 2º de cada grupo → entran a su slot apenas se definen. Si el grupo
//     todavía no terminó, el equipo va PROVISORIO (marcado con " ·").
//   · Los 8 mejores terceros NO se slotean de antemano (dependen de la tabla de
//     combinaciones de FIFA, Anexo C). Esos slots quedan como "3º (C/E/F/H/I)" y
//     los terceros que hoy entrarían se listan en una bolsa abajo.
//   · Rondas siguientes: "GANADOR 73", etc., hasta que haya resultado.
//
// Cuando se carguen los partidos de eliminatorias a matches.ts (f>=4), cada llave
// con sus dos equipos ya definidos muestra fecha/marcador/EN VIVO/VER y propaga
// el ganador a la ronda siguiente — el cuadro se completa solo.
import { MATCHES } from "../shared/matches";
import { canon, pk } from "../shared/mundial";
import type { ApiData, ChannelKey, Match, StandingRow } from "../shared/mundial";
import { BRACKET, COLUMNS, ROUND, roundOrder } from "../shared/bracket";
import type { Slot } from "../shared/bracket";
import { C, Live, Sep, TeamLink, TitleBar } from "./teletext";
import { chOf, dayLabel, matchState } from "./state";
import type { Indexes, MState } from "./state";

// nombre lindo + bandera de la grilla (FIFA usa otros nombres; canon() los une)
const flagBy: Record<string, string> = {}, nameBy: Record<string, string> = {};
for (const m of MATCHES) {
  flagBy[canon(m.a)] = m.fa; flagBy[canon(m.b)] = m.fb;
  nameBy[canon(m.a)] = m.a; nameBy[canon(m.b)] = m.b;
}
const nm = (t: string) => nameBy[canon(t)] || t;
const fl = (t: string) => flagBy[canon(t)] || "🏳";
// "Grupo A" / "Group A" / "A" → "A"
const groupLetter = (name: string) => name.trim().toUpperCase().match(/([A-L])\s*$/)?.[1] || null;

// un slot resuelto: o un equipo concreto (provisorio si su grupo no terminó) o un
// cartel ("1º A", "3º C/E/F/H/I", "GANADOR 73")
type Resolved = { team: string; prov: boolean } | { label: string };
const isTeam = (r: Resolved): r is { team: string; prov: boolean } => "team" in r;

export function Bracket({ data, idx, nowK, onWatch, embedded, onTeam }: { data: ApiData | null; idx: Indexes; nowK: string; onWatch: (m: Match, ch: ChannelKey) => void; embedded?: boolean; onTeam?: (name: string) => void }) {
  const groups = data?.standings || [];

  // índice de grupos por letra: filas ordenadas + si ya terminó (todos jugaron 3)
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

  // resolución de slots; winners/losers se van llenando ronda a ronda
  const winners = new Map<number, string>(), losers = new Map<number, string>();
  const resolveSlot = (s: Slot): Resolved => {
    switch (s.k) {
      case "w": return posTeam(s.g, 1) ?? { label: `1º ${s.g}` };
      case "r": return posTeam(s.g, 2) ?? { label: `2º ${s.g}` };
      case "t": return { label: `3º ${s.gs.join("/")}` };
      case "win": { const t = winners.get(s.m); return t ? { team: t, prov: false } : { label: `GANADOR ${s.m}` }; }
      case "lose": { const t = losers.get(s.m); return t ? { team: t, prov: false } : { label: `PERDEDOR ${s.m}` }; }
    }
  };
  const realMatch = (f: number, a: string, b: string) =>
    MATCHES.find((m) => m.f === f && pk(m.a, m.b) === pk(a, b)) || null;

  // una pasada por ronda (4→9) para que octavos vea a los ganadores de dieciseisavos
  type RTie = { a: Resolved; b: Resolved; match: Match | null; st: MState | null; winA: boolean | null };
  const rmap = new Map<number, RTie>();
  for (const f of [4, 5, 6, 7, 8, 9]) {
    for (const tie of BRACKET.filter((t) => t.f === f)) {
      const a = resolveSlot(tie.a), b = resolveSlot(tie.b);
      let match: Match | null = null, st: MState | null = null, winA: boolean | null = null;
      if (isTeam(a) && isTeam(b)) {
        match = realMatch(tie.f, a.team, b.team);
        if (match) {
          st = matchState(match, idx, nowK);
          if (st.final && st.hs != null) {
            winA = st.hs > st.as! || (st.hs === st.as && (st.hp ?? 0) > (st.ap ?? 0));
            winners.set(tie.m, winA ? a.team : b.team);
            losers.set(tie.m, winA ? b.team : a.team);
          }
        }
      }
      rmap.set(tie.m, { a, b, match, st, winA });
    }
  }

  // bolsa de mejores terceros: el 3º de cada grupo que ya jugó, ordenado por la
  // tabla; entran 8 (lo de FIFA puede variar por desempates finos)
  const thirds = groups
    .map((g) => ({ letter: groupLetter(g.group) || "?", r: g.rows.find((x) => x.pos === 3) }))
    .filter((x): x is { letter: string; r: StandingRow } => !!x.r && x.r.pj > 0)
    .sort((p, q) => q.r.pts - p.r.pts || q.r.gd - p.r.gd || q.r.gf - p.r.gf);
  const anyStarted = gIndex.size > 0 && [...gIndex.values()].some((g) => g.started);

  return (
    <div>
      {!embedded && <TitleBar color={C.m}>CUADRO — CAMINO A LA FINAL</TitleBar>}

      <div style={{ color: C.y }} className="mb-1 tt-glow">EL CAMINO A LA FINAL</div>
      <div style={{ color: C.dim, fontSize: ".85em" }} className="mb-3">
        EL ESQUELETO ES FIJO. LOS 1º Y 2º ENTRAN APENAS SE DEFINE EL GRUPO
        (<span style={{ color: C.fg }}>· = PROVISORIO, EL GRUPO SIGUE ABIERTO</span>).
        LOS 8 MEJORES TERCEROS VAN A SUS SLOTS CUANDO FIFA CIERRE LA FASE DE GRUPOS (≈28 JUN).
      </div>

      {/* EL CUADRO */}
      <div className="brk">
        {COLUMNS.map((f) => (
          <div className="brk-col" key={f}>
            <div className="brk-col-h tt-glow">{ROUND[f]}</div>
            <div className="brk-ties">
              {roundOrder(f).map((tie) => (
                <TieCard key={tie.m} m={tie.m} rt={rmap.get(tie.m)!} onWatch={onWatch} onTeam={onTeam} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* TERCER PUESTO (cuelga de los perdedores de semis, va aparte del árbol) */}
      <div className="mt-4" style={{ maxWidth: "20em" }}>
        <Sep color={C.dim} label="TERCER PUESTO" />
        <div className="brk-loose">
          <TieCard m={103} rt={rmap.get(103)!} onWatch={onWatch} onTeam={onTeam} />
        </div>
      </div>

      {/* BOLSA DE TERCEROS */}
      <div className="mt-5">
        <Sep color={C.c} label="MEJORES TERCEROS — ENTRAN 8" />
        {!anyStarted ? (
          <div style={{ color: C.dim }}>{data ? "TODAVÍA NO ARRANCÓ LA FASE DE GRUPOS." : "CARGANDO TABLA..."}</div>
        ) : (
          <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2 xl:grid-cols-4">
            {thirds.map((x, i) => {
              const c = canon(x.r.team), out = i >= 8;
              return (
                <div key={x.r.team} className={`tt-row${c === "paraguay" ? " py" : ""}`} style={{ minWidth: 0 }}>
                  <span style={{ color: C.dim }} className="w-5">{i + 1}</span>
                  <span className="tt-glow"><TeamLink name={nm(x.r.team)} flag={fl(x.r.team)} color={out ? C.dim : C.c} onTeam={onTeam} /></span>
                  <span style={{ color: C.dim }}>{x.letter} · {x.r.pts} PTS</span>
                  {out && <span style={{ color: C.r }}>AFUERA HOY</span>}
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-2" style={{ color: C.dim, fontSize: ".8em" }}>
          CLASIFICAN LOS 2 PRIMEROS DE CADA GRUPO + LOS 8 MEJORES TERCEROS (32 EQUIPOS).
          PROVISORIO: CAMBIA CON CADA RESULTADO HASTA EL CIERRE DE LA FASE DE GRUPOS.
        </div>
      </div>
    </div>
  );
}

// una llave del cuadro: caja con dos lados. Si ya hay partido real (matches.ts con
// f>=4) muestra fecha/marcador/EN VIVO/VER; si no, los carteles del esqueleto.
function TieCard({ m, rt, onWatch, onTeam }: { m: number; rt: RTie; onWatch: (m: Match, ch: ChannelKey) => void; onTeam?: (name: string) => void }) {
  const { a, b, match, st, winA } = rt;
  const py = (isTeam(a) && canon(a.team) === "paraguay") || (isTeam(b) && canon(b.team) === "paraguay");
  const live = !!st?.live;
  const final = !!st?.final && st?.hs != null;
  const chs = match ? chOf(match) : [];
  return (
    <div className="brk-tie">
      <div className={`brk-card${py ? " py" : ""}${live ? " live" : ""}`}>
        <div className="brk-meta">
          <span style={{ color: C.dim }}>#{m}</span>
          {match && <span style={{ color: C.c }}>{dayLabel(match.d)} {match.t}</span>}
          {live ? <Live min={st?.min} /> : final ? <span style={{ color: C.dim }}>FINAL</span> : null}
        </div>
        <Side res={a} score={st?.hs ?? null} win={winA === true} onTeam={onTeam} />
        <Side res={b} score={st?.as ?? null} win={winA === false} onTeam={onTeam} />
        {st?.hp != null && (
          <div className="brk-pen" style={{ color: C.dim }}>PENALES {st.hp}-{st.ap}</div>
        )}
        {chs.length > 0 && match && (
          <button className="tt-btn ch brk-ver" style={{ color: C.g }} onClick={() => onWatch(match, chs[0])}>VER</button>
        )}
      </div>
    </div>
  );
}

function Side({ res, score, win, onTeam }: { res: Resolved; score: number | null; win: boolean; onTeam?: (name: string) => void }) {
  const known = isTeam(res);
  const prov = known && res.prov;
  const col = win ? "#fff" : known ? (prov ? C.fg : C.y) : C.dim;
  return (
    <div className={`brk-side${win ? " win" : ""}`}>
      <span className="brk-team tt-glow">
        {known
          ? <TeamLink name={nm(res.team)} flag={fl(res.team)} color={col} onTeam={onTeam} />
          : <span style={{ color: col }}>{res.label}</span>}
        {prov ? <span style={{ color: col }}> ·</span> : null}
      </span>
      {score != null && <span className="brk-score" style={{ color: "#fff" }}>{score}</span>}
    </div>
  );
}
