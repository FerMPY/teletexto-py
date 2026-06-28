// P100 — AGENDA: todos los partidos con marcador en vivo, goleadores y los
// canales paraguayos que los transmiten. Tocar un canal abre el visor.
//
// Desde dieciseisavos, la agenda también muestra las LLAVES: el calendario es fijo
// (KO_SCHEDULE) y los equipos se llenan solos con la tabla en vivo (client/ko.ts).
// Antes de definirse, una llave se ve como su cruce ("2º A vs 2º B", "1º E vs 3º
// …") con su fecha y sede; cuando los dos equipos quedan, levanta marcador / EN
// VIVO / VER igual que un partido de grupos — sin tocar matches.ts.
import { useState } from "preact/hooks";
import { MATCHES } from "../shared/matches";
import { CH_ORDER, CHANNELS, kickoffEpoch } from "../shared/mundial";
import type { ChannelKey, Match, StandingGroup } from "../shared/mundial";
import { ROUND } from "../shared/bracket";
import { Albirroja } from "./albirroja";
import { MiniBracket } from "./bracket";
import { LiveScenarios } from "./scenarios";
import { downloadIcs, downloadKoIcs, downloadAgenda } from "./ics";
import { C, Live, Sep, TeamLink, TitleBar } from "./teletext";
import { chOf, countdown, dayLabel, goalsFor, liveMatches, matchState, mKey, nextMatch, nextPy, scoreStr } from "./state";
import type { Indexes } from "./state";
import { resolveKnockouts, koByDate, koUpcoming, koLive, koEpoch, nm, fl, isTeam } from "./ko";
import type { KoTie, Resolved } from "./ko";

type Watch = (m: Match, ch: ChannelKey) => void;
type TeamNav = (name: string) => void;

const FILTERS: [string, string][] = [
  ["next", "PRÓXIMOS"], ["all", "TODOS"], ["live", "EN VIVO"], ["today", "HOY"], ["py", "ALBIRROJA"],
  ["ko", "ELIMINATORIAS"],
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

// un lado de una llave en la agenda: equipo (con bandera, clickeable) o cartel del
// cruce ("2º A", "3º C/E/F/H/I", "GANADOR 73"). El " ·" marca provisorio.
function KoSide({ res, onTeam, flagAfter }: { res: Resolved; onTeam?: TeamNav; flagAfter?: boolean }) {
  if (isTeam(res)) {
    return (
      <>
        <TeamLink name={nm(res.team)} flag={fl(res.team)} flagAfter={flagAfter} onTeam={onTeam} />
        {res.prov ? <span style={{ color: C.dim }}> ·</span> : null}
      </>
    );
  }
  return <span style={{ color: C.dim }}>{res.label}</span>;
}

// fila de una llave de eliminatorias. Muestra hora + sede SIEMPRE; marcador / EN
// VIVO / VER / goles cuando los dos equipos ya están definidos (tie.match).
function KnockoutRow({ tie, idx, onWatch, onTeam }: { tie: KoTie; idx: Indexes; onWatch: Watch; onTeam?: TeamNav }) {
  const { sched, match, st } = tie;
  if (!sched) return null;
  const live = !!st?.live;
  const final = !!st?.final && st?.hs != null;
  const score = st && st.hs != null ? scoreStr(st) : "vs";
  const goals = match ? goalsFor(match, idx) : [];
  return (
    <div className={`tt-row${tie.py ? " py" : ""}${final && !live ? " past" : ""}`}>
      <span style={{ color: C.c }}>{sched.t}</span>
      <span style={{ color: C.dim, fontSize: ".72em" }}>#{tie.m}</span>
      <span style={{ color: C.y }} className="tt-glow">
        <KoSide res={tie.a} onTeam={onTeam} /> <span style={{ color: st?.hs != null ? "#fff" : C.dim }}>{score}</span> <KoSide res={tie.b} onTeam={onTeam} flagAfter />
      </span>
      {live ? <Live min={st?.min} /> : final ? <span style={{ color: C.dim }}>FINAL</span> : null}
      {st?.hp != null && <span style={{ color: C.dim }}>({st.hp}-{st.ap} PEN)</span>}
      <span style={{ color: C.dim, fontSize: ".85em" }}>{sched.sede} · {sched.ciudad}</span>
      {match && <ChannelBtns m={match} onWatch={onWatch} />}
      {live && match && (
        <button className="tt-btn ch" style={{ color: C.g }} onClick={() => onWatch(match, chOf(match)[0] || "gen")}>VER</button>
      )}
      {Date.now() < koEpoch(sched) && (
        <button className="tt-btn" onClick={() => downloadKoIcs([tie], `${ROUND[tie.f]} #${tie.m}`)} title="Agendar esta llave en tu calendario (.ics) — con aviso 30 min antes">📅</button>
      )}
      {goals.length > 0 && (
        <div className="w-full" style={{ color: C.fg, fontSize: ".85em", paddingLeft: "3.2em" }}>
          ⚽ {goals.map((e) => `${e.name}${e.pen ? " (P)" : ""}${e.og ? " (EC)" : ""} ${e.min}`).join(", ")}
        </div>
      )}
    </div>
  );
}

// entrada unificada de la lista: o un partido de grupos o una llave, con su epoch
// para ordenar todo cronológicamente y agrupar por día.
type Entry = { d: string; epoch: number } & ({ kind: "g"; m: Match } | { kind: "k"; tie: KoTie });

export function Agenda({ idx, nowK, today, onWatch, onProde, onTeam, onCuadro, usage, standings }: { idx: Indexes; nowK: string; today: string; onWatch: Watch; onProde?: (mk: string) => void; onTeam?: TeamNav; onCuadro?: () => void; usage?: { served: number; since: number; today?: number; visits?: number }; standings?: StandingGroup[] }) {
  const [filter, setFilter] = useState("next");
  const [showPast, setShowPast] = useState(false);

  // resolución de llaves (esqueleto + tabla en vivo + calendario + marcadores)
  const koMap = resolveKnockouts(standings, idx, nowK);
  const koTies = koByDate(koMap);

  // AHORA: partidos de grupos en vivo + llaves en vivo (mismas filas)
  const liveG = liveMatches(idx, nowK);
  const liveAll: Match[] = [...liveG, ...koLive(koMap).map((t) => t.match).filter((m): m is Match => !!m)];

  // PRÓXIMO: el más cercano entre el próximo de grupos y la próxima llave
  const nextG = nextMatch(nowK);
  const nextKt = koUpcoming(koMap, Date.now());
  const gE = nextG ? kickoffEpoch(nextG) : Infinity;
  const kE = nextKt?.sched ? koEpoch(nextKt.sched) : Infinity;
  const showNextKo = kE < gE;

  // ALBIRROJA: su próximo de grupos; si ya no quedan, su próxima llave
  const pyG = nextPy(idx, nowK);
  const pyLiveG = pyG ? matchState(pyG, idx, nowK).live : false;
  const cdG = pyG && !pyLiveG ? countdown(pyG, nowK) : null;
  const pyKt = !pyG ? koUpcoming(koMap, Date.now(), true) : null;
  const pyKtCd = pyKt?.sched && !pyKt.st?.live ? countdown({ d: pyKt.sched.d, t: pyKt.sched.t } as Match, nowK) : null;

  // lista unificada grupos + llaves
  const groupEntries: Entry[] = MATCHES.map((m) => ({ kind: "g", m, d: m.d, epoch: kickoffEpoch(m) }));
  const koEntries: Entry[] = koTies.map((t) => ({ kind: "k", tie: t, d: t.sched!.d, epoch: koEpoch(t.sched!) }));
  const allEntries = [...groupEntries, ...koEntries];

  const isPastEntry = (e: Entry): boolean => {
    if (e.kind === "g") { const st = matchState(e.m, idx, nowK); return st.final && !st.live; }
    return !!(e.tie.st?.final && !e.tie.st?.live);
  };
  // un lado "mostrable" en PRÓXIMOS: equipo o slot de grupo (1º/2º/3º). Las llaves
  // de rondas hondas todavía en "GANADOR 73 vs GANADOR 75" ensucian el default →
  // se ven solo en el filtro ELIMINATORIAS, no acá.
  const sideReady = (r: Resolved) => isTeam(r) || !/^(GANADOR|PERDEDOR)/.test(r.label);
  const koReady = (t: KoTie) => sideReady(t.a) && sideReady(t.b);
  const passes = (e: Entry): boolean => {
    if (filter === "next") return !isPastEntry(e) && (e.kind === "g" || koReady(e.tie));
    if (filter === "today") return e.d === today;
    if (filter === "py") return e.kind === "g" ? !!e.m.py : e.tie.py;
    if (filter === "live") return e.kind === "g" ? matchState(e.m, idx, nowK).live : !!e.tie.st?.live;
    if (filter === "ko") return e.kind === "k";
    if (filter.startsWith("f")) return e.kind === "g" && e.m.f === Number(filter[1]);
    return true; // all
  };

  const visible = allEntries.filter(passes).sort((a, b) => a.epoch - b.epoch);
  // los terminados (grupos + llaves), del más reciente al más viejo, para PRÓXIMOS
  const past = filter === "next" ? allEntries.filter(isPastEntry).sort((a, b) => b.epoch - a.epoch) : [];

  const renderEntry = (e: Entry) =>
    e.kind === "g"
      ? <Row m={e.m} idx={idx} nowK={nowK} onWatch={onWatch} onProde={onProde} onTeam={onTeam} />
      : <KnockoutRow tie={e.tie} idx={idx} onWatch={onWatch} onTeam={onTeam} />;

  // AGENDAR: baja lo visible (grupos + llaves) en un solo .ics
  const exportVisible = () => {
    const gms: Match[] = [], kts: KoTie[] = [];
    for (const e of visible) { if (e.kind === "g") gms.push(e.m); else kts.push(e.tie); }
    downloadAgenda(gms, kts, `Mundial 2026 PY${filter === "all" ? "" : ` — ${FILTERS.find(([k]) => k === filter)?.[1]}`}`);
  };

  let curDay = "";
  return (
    <div>
      <TitleBar>AGENDA MUNDIAL 2026</TitleBar>

      {/* ahora / próximo */}
      {liveAll.length > 0 ? (
        <div className="mb-2">
          {liveAll.map((m) => {
            const st = matchState(m, idx, nowK);
            return (
              <div key={m.d + m.t + m.a} className="tt-row">
                <Live min={st.min} />
                <span style={{ color: "#fff" }} className="tt-glow">
                  {m.fa} {m.a} {scoreStr(st) ?? ""} {m.b} {m.fb}
                </span>
                <button className="tt-btn ch" style={{ color: C.g }} onClick={() => onWatch(m, chOf(m)[0] || "gen")}>VER</button>
              </div>
            );
          })}
        </div>
      ) : showNextKo && nextKt && nextKt.sched ? (
        <div className="tt-row mb-2">
          <span style={{ color: C.m }}>PROXIMO:</span>
          <span style={{ color: C.m, fontSize: ".8em" }}>{ROUND[nextKt.f]}</span>
          <span style={{ color: C.y }}><KoSide res={nextKt.a} /> vs <KoSide res={nextKt.b} flagAfter /></span>
          <span style={{ color: C.c }}>{dayLabel(nextKt.sched.d)} {nextKt.sched.t}</span>
          <span style={{ color: C.dim, fontSize: ".85em" }}>{nextKt.sched.sede}</span>
          {nextKt.match && <ChannelBtns m={nextKt.match} onWatch={onWatch} />}
        </div>
      ) : nextG ? (
        <div className="tt-row mb-2">
          <span style={{ color: C.m }}>PROXIMO:</span>
          <span style={{ color: C.y }}>{nextG.fa} {nextG.a} vs {nextG.b} {nextG.fb}</span>
          <span style={{ color: C.c }}>{dayLabel(nextG.d)} {nextG.t}</span>
          <ChannelBtns m={nextG} onWatch={onWatch} />
          {onProde && <button className="tt-btn" style={{ color: C.m }} onClick={() => onProde(mKey(nextG))} title="Pronosticá este partido en el prode (P300)">PRODE</button>}
        </div>
      ) : null}

      {/* la albirroja */}
      {pyG ? (
        <div className="tt-row py mb-2">
          <span style={{ color: "#fff" }} className="tt-glow">🇵🇾 LA ALBIRROJA:</span>
          <span style={{ color: C.y }}>{pyG.a} vs {pyG.b}</span>
          {pyLiveG ? (
            <Live />
          ) : cdG ? (
            <span style={{ color: C.g }} className="tt-glow">EN {cdG.dd}D {cdG.hh}H {String(cdG.mm).padStart(2, "0")}M</span>
          ) : null}
          <ChannelBtns m={pyG} onWatch={onWatch} />
        </div>
      ) : pyKt && pyKt.sched ? (
        <div className="tt-row py mb-2">
          <span style={{ color: "#fff" }} className="tt-glow">🇵🇾 LA ALBIRROJA:</span>
          <span style={{ color: C.m, fontSize: ".8em" }}>{ROUND[pyKt.f]}</span>
          <span style={{ color: C.y }}><KoSide res={pyKt.a} /> vs <KoSide res={pyKt.b} flagAfter /></span>
          {pyKt.st?.live ? (
            <Live min={pyKt.st.min} />
          ) : pyKtCd ? (
            <span style={{ color: C.g }} className="tt-glow">EN {pyKtCd.dd}D {pyKtCd.hh}H {String(pyKtCd.mm).padStart(2, "0")}M</span>
          ) : null}
          <span style={{ color: C.c }}>{dayLabel(pyKt.sched.d)} {pyKt.sched.t}</span>
          <span style={{ color: C.dim, fontSize: ".85em" }}>{pyKt.sched.sede}</span>
          {pyKt.match && <ChannelBtns m={pyKt.match} onWatch={onWatch} />}
        </div>
      ) : null}

      {/* SI TERMINA ASÍ: proyección en vivo de quién clasifica (solo con partidos
          de grupo en curso) — el momento teletexto de la última fecha */}
      <LiveScenarios standings={standings} idx={idx} nowK={nowK} onTeam={onTeam} />

      {/* escenarios de clasificación de Paraguay */}
      <Albirroja idx={idx} nowK={nowK} standings={standings} />

      {/* el cuadro de un vistazo (reemplaza a SI TERMINA ASÍ cuando arrancan las
          eliminatorias): aparece solo con cruces reales; toca para abrir el cuadro */}
      <MiniBracket standings={standings} idx={idx} nowK={nowK} onOpen={onCuadro} />

      {/* filtros + exportar a calendario */}
      <div className="flex gap-3 flex-wrap mb-2 items-baseline" style={{ color: C.c }}>
        {FILTERS.map(([k, label]) => (
          <button key={k} className={`tt-chip${filter === k ? " on" : ""}`} onClick={() => setFilter(k)}>{label}</button>
        ))}
        <button
          className="tt-chip" style={{ color: C.m, marginLeft: "auto" }}
          title="Bajar los partidos de este filtro como eventos de calendario (.ics) con aviso 30 min antes"
          onClick={exportVisible}
        >AGENDAR 📅</button>
      </div>

      {/* agenda por día */}
      {visible.length === 0 && (
        <div style={{ color: C.dim }}>
          {filter === "next" ? "NO QUEDAN PARTIDOS POR JUGAR — MIRÁ LOS TERMINADOS ABAJO O TOCÁ TODOS." : "SIN PARTIDOS PARA ESTE FILTRO."}
        </div>
      )}
      {visible.map((e) => {
        const head = e.d !== curDay ? ((curDay = e.d), true) : false;
        return (
          <div key={(e.kind === "g" ? "g" + e.m.d + e.m.t + e.m.a : "k" + e.tie.m)}>
            {head && <Sep label={`${dayLabel(e.d)}${e.d === today ? " ◄HOY" : ""}`} />}
            {renderEntry(e)}
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
              {(() => { let d = ""; return past.map((e) => {
                const head = e.d !== d ? ((d = e.d), true) : false;
                return (
                  <div key={(e.kind === "g" ? "pg" + e.m.d + e.m.t + e.m.a : "pk" + e.tie.m)}>
                    {head && <Sep label={dayLabel(e.d)} />}
                    {renderEntry(e)}
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
