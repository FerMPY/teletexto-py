// P100 — AGENDA: todos los partidos con marcador en vivo, goleadores y los
// canales paraguayos que los transmiten. Tocar un canal abre el visor.
import { useState } from "preact/hooks";
import { MATCHES } from "../shared/matches";
import { CH_ORDER, CHANNELS, kickoffEpoch } from "../shared/mundial";
import type { ChannelKey, Match, StandingGroup } from "../shared/mundial";
import { Albirroja } from "./albirroja";
import { downloadIcs } from "./ics";
import { C, Live, Sep, TitleBar } from "./teletext";
import { chOf, countdown, dayLabel, goalsFor, liveMatches, matchState, mKey, nextMatch, nextPy, scoreStr } from "./state";
import type { Indexes } from "./state";

type Watch = (m: Match, ch: ChannelKey) => void;

const FILTERS: [string, string][] = [
  ["all", "TODOS"], ["live", "EN VIVO"], ["today", "HOY"], ["py", "ALBIRROJA"],
  ["f1", "FECHA 1"], ["f2", "FECHA 2"], ["f3", "FECHA 3"],
];

// la grilla a veces miente (Corea-Chequia: decía gen+trece, salió por popu+uni)
// → SIEMPRE los 5 canales: los de la grilla con su color, el resto apagados
function ChannelBtns({ m, onWatch }: { m: Match; onWatch: Watch }) {
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

function Row({ m, idx, nowK, onWatch, onProde }: { m: Match; idx: Indexes; nowK: string; onWatch: Watch; onProde?: (mk: string) => void }) {
  const st = matchState(m, idx, nowK);
  const goals = goalsFor(m, idx);
  const score = scoreStr(st) ?? "vs";
  return (
    <div className={`tt-row${m.py ? " py" : ""}${st.final && !st.live ? " past" : ""}`}>
      <span style={{ color: C.c }}>{m.t}</span>
      <span style={{ color: C.y }} className="tt-glow">
        {m.fa} {m.a} <span style={{ color: st.hs != null ? "#fff" : C.dim }}>{score}</span> {m.b} {m.fb}
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
        <div className="w-full pl-[3.2em]" style={{ color: C.fg, fontSize: ".85em" }}>
          ⚽ {goals.map((e) => `${e.name}${e.pen ? " (P)" : ""}${e.og ? " (EC)" : ""} ${e.min}`).join(", ")}
        </div>
      )}
    </div>
  );
}

export function Agenda({ idx, nowK, today, onWatch, onProde, usage, standings }: { idx: Indexes; nowK: string; today: string; onWatch: Watch; onProde?: (mk: string) => void; usage?: { served: number; since: number; today?: number; visits?: number }; standings?: StandingGroup[] }) {
  const [filter, setFilter] = useState("all");
  const live = liveMatches(idx, nowK);
  const next = nextMatch(nowK);
  const py = nextPy(idx, nowK);
  const pyLive = py && matchState(py, idx, nowK).live;
  const cd = py && !pyLive ? countdown(py, nowK) : null;

  const visible = MATCHES.filter((m) => {
    const st = matchState(m, idx, nowK);
    if (filter === "today") return m.d === today;
    if (filter === "py") return !!m.py;
    if (filter === "live") return st.live;
    if (filter.startsWith("f")) return m.f === Number(filter[1]);
    return true;
  });

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
      {visible.length === 0 && <div style={{ color: C.dim }}>SIN PARTIDOS PARA ESTE FILTRO.</div>}
      {visible.map((m) => {
        const head = m.d !== curDay ? ((curDay = m.d), true) : false;
        return (
          <div key={m.d + m.t + m.a}>
            {head && <Sep label={`${dayLabel(m.d)}${m.d === today ? " ◄HOY" : ""}`} />}
            <Row m={m} idx={idx} nowK={nowK} onWatch={onWatch} onProde={onProde} />
          </div>
        );
      })}

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
