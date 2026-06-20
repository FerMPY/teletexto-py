// P100 — AGENDA: todos los partidos con marcador en vivo, goleadores y los
// canales paraguayos que los transmiten. Tocar un canal abre el visor.
import { useState } from "preact/hooks";
import { MATCHES } from "../shared/matches";
import { CH_ORDER, CHANNELS, kickoffEpoch } from "../shared/mundial";
import type { ChannelKey, Match, StandingGroup } from "../shared/mundial";
import { Albirroja } from "./albirroja";
import { downloadIcs } from "./ics";
import { C, Live, Sep, TeamLink, TitleBar } from "./teletext";
import { chOf, countdown, dayLabel, goalsFor, liveMatches, matchState, mKey, nextMatch, nextPy, scoreStr } from "./state";
import type { Indexes } from "./state";

type Watch = (m: Match, ch: ChannelKey) => void;
type TeamNav = (name: string) => void;

const FILTERS: [string, string][] = [
  ["next", "PRÓXIMOS"], ["all", "TODOS"], ["live", "EN VIVO"], ["today", "HOY"], ["py", "ALBIRROJA"],
  ["f1", "FECHA 1"], ["f2", "FECHA 2"], ["f3", "FECHA 3"],
];

// la grilla a veces miente (Corea-Chequia: decía gen+trece, salió por popu+uni)
// → SIEMPRE los 5 canales: los de la grilla con su color, el resto apagados
export function ChannelBtns({ m, onWatch }: { m: Match; onWatch: Watch }) {
  const grilla = chOf(m);
  return (
    <span className="inline-flex gap-1 flex-wrap">
      {CH_ORDER.map((k) => {
        const enGrilla = grilla.includes(k);
        return (
          <button
            key={k}
            className={`tt-btn ch${enGrilla ? "" : " alt"}`}
            style={enGrilla ? { color: CHANNELS[k].color } : undefined}
            onClick={() => onWatch(m, k)}
            title={enGrilla ? `Ver ${CHANNELS[k].name} acá mismo` : "No figura en la grilla para este partido — probá igual"}
          >
            {CHANNELS[k].name}
          </button>
        );
      })}
    </span>
  );
}

export function Row({ m, idx, nowK, onWatch, onProde, onTeam }: { m: Match; idx: Indexes; nowK: string; onWatch: Watch; onProde?: (mk: string) => void; onTeam?: TeamNav }) {
  const st = matchState(m, idx, nowK);
  const goals = goalsFor(m, idx);
  const score = scoreStr(st) ?? "vs";
  return (
    <div className={`tt-row${m.py ? " py" : ""}${st.final && !st.live ? " past" : ""}`}>
      <span style={{ color: C.c }}>{m.t}</span>
      <span style={{ color: C.y }} className="tt-glow">
        <TeamLink name={m.a} flag={m.fa} onTeam={onTeam} /> <span style={{ color: st.hs != null ? "#fff" : C.dim }}>{score}</span> <TeamLink name={m.b} flag={m.fb} flagAfter onTeam={onTeam} />
      </span>
      {st.live ? <Live min={st.min} /> : st.final && st.hs != null ? <span style={{ color: C.dim }}>FINAL</span> : null}
      <ChannelBtns m={m} onWatch={onWatch} />
      {onProde && Date.now() < kickoffEpoch(m) && (
        <button className="tt-btn" style={{ color: C.m }} onClick={() => onProde(mKey(m))} title="Pronosticá este partido en el prode (P300)">PRODE</button>
      )}
      {Date.now() < kickoffEpoch(m) && (
        <button className="tt-btn" onClick={() => downloadIcs([m], `${m.a} vs ${m.b}`)} title="Agendar este partido en tu calendario (.ics) — con aviso 30 min antes">📅</button>
      )}
      {goals.length > 0 && (
        <div className="w-full" style={{ color: C.fg, fontSize: ".85em", paddingLeft: "3.2em" }}>
          ⚽ {goals.map((e) => `${e.name}${e.pen ? " (P)" : ""}${e.og ? " (EC)" : ""} ${e.min}`).join(", ")}
        </div>
      )}
    </div>
  );
}

export function Agenda({ idx, nowK, today, onWatch, onProde, onTeam, usage, standings }: { idx: Indexes; nowK: string; today: string; onWatch: Watch; onProde?: (mk: string) => void; onTeam?: TeamNav; usage?: { served: number; since: number; today?: number; visits?: number }; standings?: StandingGroup[] }) {
  const [filter, setFilter] = useState("next");
  const [showPast, setShowPast] = useState(false);
  const live = liveMatches(idx, nowK);
  const next = nextMatch(nowK);
  const py = nextPy(idx, nowK);
  const pyLive = py && matchState(py, idx, nowK).live;
  const cd = py && !pyLive ? countdown(py, nowK) : null;

  // un partido "terminado" = final y ya no en vivo (lo escondemos en PRÓXIMOS)
  const isPast = (m: Match) => { const st = matchState(m, idx, nowK); return st.final && !st.live; };

  const visible = MATCHES.filter((m) => {
    const st = matchState(m, idx, nowK);
    if (filter === "next") return !isPast(m);          // en vivo + por jugar
    if (filter === "today") return m.d === today;
    if (filter === "py") return !!m.py;
    if (filter === "live") return st.live;
    if (filter.startsWith("f")) return m.f === Number(filter[1]);
    return true;
  });
  // los terminados, del más reciente al más viejo, para el desplegable de PRÓXIMOS
  const past = filter === "next" ? MATCHES.filter(isPast).slice().reverse() : [];

  let curDay = "";
  return (
    <div>
      <TitleBar>AGENDA MUNDIAL 2026</TitleBar>

      {/* ahora / próximo */}
      {live.length > 0 ? (
        <div className="mb-2">
          {live.map((m) => {
            const st = matchState(m, idx, nowK);
            return (
              <div key={m.d + m.t + m.a} className="tt-row">
                <Live min={st.min} />
                <span style={{ color: "#fff" }} className="tt-glow">
                  {m.fa} {m.a} {scoreStr(st) ?? ""} {m.b} {m.fb}
                </span>
                <button className="tt-btn ch" style={{ color: C.g }} onClick={() => onWatch(m, chOf(m)[0])}>VER</button>
              </div>
            );
          })}
        </div>
      ) : next ? (
        <div className="tt-row mb-2">
          <span style={{ color: C.m }}>PROXIMO:</span>
          <span style={{ color: C.y }}>{next.fa} {next.a} vs {next.b} {next.fb}</span>
          <span style={{ color: C.c }}>{dayLabel(next.d)} {next.t}</span>
          <ChannelBtns m={next} onWatch={onWatch} />
          {onProde && <button className="tt-btn" style={{ color: C.m }} onClick={() => onProde(mKey(next))} title="Pronosticá este partido en el prode (P300)">PRODE</button>}
        </div>
      ) : null}

      {/* la albirroja */}
      {py && (
        <div className="tt-row py mb-2">
          <span style={{ color: "#fff" }} className="tt-glow">🇵🇾 LA ALBIRROJA:</span>
          <span style={{ color: C.y }}>{py.a} vs {py.b}</span>
          {pyLive ? (
            <Live />
          ) : cd ? (
            <span style={{ color: C.g }} className="tt-glow">EN {cd.dd}D {cd.hh}H {String(cd.mm).padStart(2, "0")}M</span>
          ) : null}
          <ChannelBtns m={py} onWatch={onWatch} />
        </div>
      )}

      {/* escenarios de clasificación de Paraguay */}
      <Albirroja idx={idx} nowK={nowK} standings={standings} />

      {/* filtros + exportar a calendario */}
      <div className="flex gap-3 flex-wrap mb-2 items-baseline" style={{ color: C.c }}>
        {FILTERS.map(([k, label]) => (
          <button key={k} className={`tt-chip${filter === k ? " on" : ""}`} onClick={() => setFilter(k)}>{label}</button>
        ))}
        <button
          className="tt-chip" style={{ color: C.m, marginLeft: "auto" }}
          title="Bajar los partidos de este filtro como eventos de calendario (.ics) con aviso 30 min antes"
          onClick={() => downloadIcs(visible, `Mundial 2026 PY${filter === "all" ? "" : ` — ${FILTERS.find(([k]) => k === filter)?.[1]}`}`)}
        >AGENDAR 📅</button>
      </div>

      {/* agenda por día */}
      {visible.length === 0 && (
        <div style={{ color: C.dim }}>
          {filter === "next" ? "NO QUEDAN PARTIDOS POR JUGAR — MIRÁ LOS TERMINADOS ABAJO O TOCÁ TODOS." : "SIN PARTIDOS PARA ESTE FILTRO."}
        </div>
      )}
      {visible.map((m) => {
        const head = m.d !== curDay ? ((curDay = m.d), true) : false;
        return (
          <div key={m.d + m.t + m.a}>
            {head && <Sep label={`${dayLabel(m.d)}${m.d === today ? " ◄HOY" : ""}`} />}
            <Row m={m} idx={idx} nowK={nowK} onWatch={onWatch} onProde={onProde} onTeam={onTeam} />
          </div>
        );
      })}

      {/* terminados: plegados por defecto en PRÓXIMOS, del más reciente al más viejo */}
      {past.length > 0 && (
        <div className="mt-3">
          <button
            className="tt-chip" style={{ color: C.dim }}
            onClick={() => setShowPast((v) => !v)}
            title="Mostrar / ocultar los partidos que ya se jugaron"
          >
            {showPast ? "▾" : "▸"} {past.length} PARTIDOS TERMINADOS
          </button>
          {showPast && (
            <div className="mt-2" style={{ opacity: 0.8 }}>
              {(() => { let d = ""; return past.map((m) => {
                const head = m.d !== d ? ((d = m.d), true) : false;
                return (
                  <div key={"p" + m.d + m.t + m.a}>
                    {head && <Sep label={dayLabel(m.d)} />}
                    <Row m={m} idx={idx} nowK={nowK} onWatch={onWatch} onProde={onProde} onTeam={onTeam} />
                  </div>
                );
              }); })()}
            </div>
          )}
        </div>
      )}

      <div className="mt-4" style={{ color: C.dim, fontSize: ".85em" }}>
        LOS CANALES EN COLOR FIGURAN EN LA GRILLA; LOS GRISES NO, PERO LA GRILLA A VECES FALLA — PROBALOS IGUAL.
        <br />
        HORA PARAGUAYA · MARCADORES: API PUBLICA FIFA · GRILLA: @PUNTAJE_IDEAL / @FUTBOLENLATV
        {usage && (
          <span style={(usage.today ?? usage.served) > 9000 ? { color: C.r } : undefined}>
            {` · USO API HOY: ${usage.today ?? usage.served}/10000`}
            {(usage.today ?? usage.served) > 9000 && " ⚠ CERCA DEL LIMITE"}
          </span>
        )}
        {usage && ` · VISITAS HOY: ${usage.visits ?? 0}`}
      </div>
    </div>
  );
}
