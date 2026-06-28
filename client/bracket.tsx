// CLASIFICACIÓN / LLAVES (sub-pestaña de P200 TABLA): el CUADRO de eliminatorias
// de verdad — un árbol Dieciseisavos → Octavos → Cuartos → Semis → Final, con el
// 3er puesto aparte.
//
// El esqueleto (qué slot juega con qué slot) y el CALENDARIO (fecha/hora/sede de
// cada llave) son fijos y viven en shared/bracket.ts. La resolución en vivo —
// llenar los slots con la tabla de FIFA (data.standings), sintetizar el partido y
// propagar ganadores — vive en client/ko.ts (resolveKnockouts), compartida con la
// agenda. Acá solo DIBUJAMOS:
//   · 1º y 2º de cada grupo → entran a su slot apenas se definen (PROVISORIO " ·"
//     si el grupo sigue abierto).
//   · Los 8 mejores terceros NO se slotean de antemano (Anexo C). Esos slots
//     quedan como "3º (C/E/F/H/I)" y los terceros que hoy entrarían van en la
//     bolsa de abajo; al cargar THIRDS_ASSIGN cada uno cae en su llave.
//   · Rondas siguientes: "GANADOR 73", etc., hasta que haya resultado.
// Cada llave muestra su fecha y sede SIEMPRE; el marcador / EN VIVO / VER aparece
// cuando los dos equipos ya están definidos.
import { useRef } from "preact/hooks";
import { canon } from "../shared/mundial";
import type { ApiData, ChannelKey, Match, StandingGroup, StandingRow } from "../shared/mundial";
import { COLUMNS, ROUND, roundOrder } from "../shared/bracket";
import { C, Live, Sep, TeamLink, TitleBar } from "./teletext";
import { chOf, dayLabel } from "./state";
import type { Indexes } from "./state";
import { resolveKnockouts, nm, fl, isTeam } from "./ko";
import type { KoTie, Resolved } from "./ko";

// "Grupo A" / "Group A" / "A" → "A"
const gl = (name: string) => name.trim().toUpperCase().match(/([A-L])\s*$/)?.[1] || "?";

export function Bracket({ data, idx, nowK, onWatch, embedded, onTeam }: { data: ApiData | null; idx: Indexes; nowK: string; onWatch: (m: Match, ch: ChannelKey) => void; embedded?: boolean; onTeam?: (name: string) => void }) {
  const groups = data?.standings || [];
  const rmap = resolveKnockouts(data?.standings, idx, nowK);

  // ARRASTRAR para mover el cuadro (es ancho y el scroll horizontal es incómodo):
  // con el mouse se agarra y se tira como con la mano. En touch dejamos el scroll
  // nativo. Un umbral de 4px evita que un arrastre dispare el click de un equipo.
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef({ on: false, startX: 0, left: 0, moved: false });
  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;            // touch → scroll nativo
    const el = scroller.current; if (!el) return;
    drag.current = { on: true, startX: e.clientX, left: el.scrollLeft, moved: false };
  };
  const onMove = (e: PointerEvent) => {
    const el = scroller.current, d = drag.current;
    if (!el || !d.on) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 4) { d.moved = true; el.style.cursor = "grabbing"; }
    if (d.moved) { el.scrollLeft = d.left - dx; e.preventDefault(); }
  };
  const onUp = () => { const el = scroller.current; if (el) el.style.cursor = "grab"; drag.current.on = false; };
  // si el arrastre movió el cuadro, cancelamos el click que viene detrás (para no
  // abrir sin querer la trayectoria de un equipo al soltar)
  const onClickCapture = (e: MouseEvent) => {
    if (drag.current.moved) { e.preventDefault(); e.stopPropagation(); drag.current.moved = false; }
  };

  // bolsa de mejores terceros: el 3º de cada grupo que ya jugó, ordenado por la
  // tabla; entran 8 (lo de FIFA puede variar por desempates finos)
  const thirds = groups
    .map((g) => ({ letter: gl(g.group), r: g.rows.find((x) => x.pos === 3) }))
    .filter((x): x is { letter: string; r: StandingRow } => !!x.r && x.r.pj > 0)
    .sort((p, q) => q.r.pts - p.r.pts || q.r.gd - p.r.gd || q.r.gf - p.r.gf);
  const anyStarted = groups.some((g) => g.rows.some((r) => r.pj > 0));

  return (
    <div>
      {!embedded && <TitleBar color={C.m}>CUADRO — CAMINO A LA FINAL</TitleBar>}

      <div style={{ color: C.y }} className="mb-1 tt-glow">EL CAMINO A LA FINAL</div>
      <div style={{ color: C.dim, fontSize: ".85em" }} className="mb-3">
        EL ESQUELETO ES FIJO, CON FECHA Y SEDE DE CADA LLAVE. LOS 1º Y 2º ENTRAN
        APENAS SE DEFINE EL GRUPO (<span style={{ color: C.fg }}>· = PROVISORIO, EL GRUPO SIGUE ABIERTO</span>).
        LOS 8 MEJORES TERCEROS VAN A SUS SLOTS CUANDO FIFA CIERRE LA FASE DE GRUPOS (≈28 JUN).
      </div>

      {/* EL CUADRO — arrastrable con el mouse (ver onDown/onMove arriba) */}
      <div
        className="brk" ref={scroller} style={{ cursor: "grab" }}
        onPointerDown={onDown} onPointerMove={onMove}
        onPointerUp={onUp} onPointerLeave={onUp} onPointerCancel={onUp}
        onClickCapture={onClickCapture}
      >
        {COLUMNS.map((f) => (
          <div className="brk-col" key={f}>
            <div className="brk-col-h tt-glow">{ROUND[f]}</div>
            <div className="brk-ties">
              {roundOrder(f).map((tie) => (
                <TieCard key={tie.m} rt={rmap.get(tie.m)!} onWatch={onWatch} onTeam={onTeam} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* TERCER PUESTO (cuelga de los perdedores de semis, va aparte del árbol) */}
      <div className="mt-4" style={{ maxWidth: "20em" }}>
        <Sep color={C.dim} label="TERCER PUESTO" />
        <div className="brk-loose">
          <TieCard rt={rmap.get(103)!} onWatch={onWatch} onTeam={onTeam} />
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

// una llave del cuadro: caja con dos lados. La fecha/sede van SIEMPRE (vienen del
// calendario); el marcador / EN VIVO / VER aparece cuando hay partido sintetizado
// (los dos equipos definidos).
function TieCard({ rt, onWatch, onTeam }: { rt: KoTie; onWatch: (m: Match, ch: ChannelKey) => void; onTeam?: (name: string) => void }) {
  const { m, a, b, sched, match, st, winA, py } = rt;
  const live = !!st?.live;
  const final = !!st?.final && st?.hs != null;
  const chs = match ? chOf(match) : [];
  return (
    <div className="brk-tie">
      <div className={`brk-card${py ? " py" : ""}${live ? " live" : ""}`}>
        <div className="brk-meta">
          <span style={{ color: C.dim }}>#{m}</span>
          {sched && <span style={{ color: C.c }}>{dayLabel(sched.d)} {sched.t}</span>}
          {live ? <Live min={st?.min} /> : final ? <span style={{ color: C.dim }}>FINAL</span> : null}
        </div>
        {sched && (
          <div style={{ color: C.dim, fontSize: ".68em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {sched.sede} · {sched.ciudad}
          </div>
        )}
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

// ── EL CUADRO DE UN VISTAZO (mini-cuadro) ──────────────────────────────────────
// Resumen compacto del cuadro entero, SIN scroll horizontal: cada llave es un chip
// con las dos banderas (o el cartel del cruce) y el marcador si ya se jugó. Tocar
// cualquier chip abre el cuadro completo (P200 CLASIFICACIÓN). Aparece en la agenda
// recién cuando hay cruces de verdad (algún 16avo con sus dos equipos) — el reemplazo
// de "SI TERMINA ASÍ" cuando se acaban los grupos.
const shortLabel = (l: string) =>
  l.replace(/^1º\s*/, "1").replace(/^2º\s*/, "2").replace(/^3º.*/, "3º")
   .replace(/^GANADOR\s*/, "G").replace(/^PERDEDOR\s*/, "P");
const DATE_RANGE: Record<number, string> = { 4: "28 JUN–3 JUL", 5: "4–7 JUL", 6: "9–11 JUL", 7: "14–15 JUL", 8: "19 JUL" };

function MiniSide({ res, win }: { res: Resolved; win: boolean }) {
  const col = win ? "#fff" : isTeam(res) ? (res.prov ? C.fg : C.y) : C.dim;
  return <span style={{ color: col, fontWeight: win ? "bold" : "normal" }}>{isTeam(res) ? fl(res.team) : shortLabel(res.label)}</span>;
}

function MiniTie({ t, onOpen }: { t: KoTie; onOpen?: () => void }) {
  const played = !!(t.st && t.st.hs != null);
  const live = !!t.st?.live;
  return (
    <button
      className="tt-btn" onClick={onOpen} title={`Llave #${t.m} — abrir el cuadro completo`}
      style={{ whiteSpace: "nowrap", background: t.py ? "rgba(255,64,64,.12)" : "#0a0a0a", borderColor: t.py ? "var(--tt-r)" : live ? "var(--tt-g)" : "#2a2a2a" }}
    >
      <span style={{ color: C.dim, fontSize: ".8em" }}>#{t.m} </span>
      <MiniSide res={t.a} win={t.winA === true} />
      <span style={{ color: played ? "#fff" : C.dim }}> {played ? `${t.st!.hs}-${t.st!.as}` : "v"} </span>
      <MiniSide res={t.b} win={t.winA === false} />
    </button>
  );
}

export function MiniBracket({ standings, idx, nowK, onOpen }: { standings?: StandingGroup[]; idx: Indexes; nowK: string; onOpen?: () => void }) {
  const rmap = resolveKnockouts(standings, idx, nowK);
  // solo cuando el cuadro ya tiene cruces reales (algún 16avo con los 2 equipos)
  const anyConcrete = [...rmap.values()].some((t) => t.f === 4 && isTeam(t.a) && isTeam(t.b));
  if (!anyConcrete) return null;
  return (
    <div className="mb-3 px-2 py-1" style={{ border: "1px solid var(--tt-m)" }}>
      <div className="flex items-baseline gap-3 flex-wrap">
        <span style={{ color: C.m }} className="tt-glow">EL CUADRO DE UN VISTAZO</span>
        {onOpen && <button className="tt-chip" style={{ color: C.g }} onClick={onOpen}>VER COMPLETO ▶</button>}
      </div>
      {COLUMNS.map((f) => {
        const ties = roundOrder(f).map((tie) => rmap.get(tie.m)).filter((t): t is KoTie => !!t);
        if (ties.length === 0) return null;
        return (
          <div key={f} className="mt-1">
            <div style={{ color: C.c, fontSize: ".76em" }}>{ROUND[f]} · {DATE_RANGE[f]}</div>
            <div className="flex flex-wrap gap-x-2 gap-y-1" style={{ marginTop: ".15em" }}>
              {ties.map((t) => <MiniTie key={t.m} t={t} onOpen={onOpen} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
