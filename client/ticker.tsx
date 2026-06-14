// Cinta de teletexto: marcadores EN VIVO + goleadores, desplazándose. Aparece
// solo cuando hay partidos en vivo (si no, no molesta). 100% client, sin red.
import { CHANNELS } from "../shared/mundial";
import { C } from "./teletext";
import { goalsFor, liveMatches, matchState, scoreStr } from "./state";
import type { Indexes } from "./state";

export function Ticker({ idx, nowK, onWatch }: { idx: Indexes; nowK: string; onWatch?: (m: import("../shared/mundial").Match) => void }) {
  const live = liveMatches(idx, nowK);
  if (!live.length) return null;

  // un "ítem" por partido: marcador + el o los goleadores recientes
  const items = live.map((m) => {
    const st = matchState(m, idx, nowK);
    const sc = scoreStr(st) ?? "0-0";
    const gs = goalsFor(m, idx);
    const scorers = gs.length ? "  ⚽ " + gs.map((e) => `${e.name} ${e.min}`).join(", ") : "";
    return { m, txt: `🔴 ${m.fa} ${m.a} ${sc} ${m.b} ${m.fb}  ${st.min ?? ""}${scorers}` };
  });

  // la velocidad escala con el largo del texto → siempre legible
  const chars = items.reduce((n, it) => n + it.txt.length, 0) + 12;
  const dur = Math.max(22, Math.round(chars * 0.22));

  // el contenido va DOS veces dentro de la cinta → loop sin saltos (0 → -50%)
  const Tape = () => (
    <>
      {items.map((it, i) => (
        <button
          key={i} className="tt-tape-item" onClick={() => onWatch?.(it.m)}
          title={`Ver ${CHANNELS[(it.m.ch[0] as any)]?.name ?? "el partido"}`}
        >{it.txt}</button>
      ))}
      <span className="tt-tape-sep">●</span>
    </>
  );

  return (
    <div className="tt-ticker" style={{ color: C.g }} aria-hidden="true">
      <span className="tt-ticker-tag tt-blink">EN VIVO</span>
      <div className="tt-ticker-win">
        <div className="tt-tape" style={{ animationDuration: `${dur}s` }}>
          <Tape /><Tape />
        </div>
      </div>
    </div>
  );
}
