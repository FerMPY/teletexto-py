// P200 — TABLA: todo lo de grupos en una sola página, con sub-pestañas.
//  · GRUPOS        las posiciones de los 12 grupos
//  · CLASIFICACIÓN quiénes pasan (1º/2º + 8 mejores terceros) y el camino a la
//                  final — cuando FIFA publique los cruces, las llaves de verdad
//  · GOLEADORES    los goleadores del torneo
import { useState } from "preact/hooks";
import { MATCHES } from "../shared/matches";
import { canon } from "../shared/mundial";
import type { ApiData, ChannelKey, Match } from "../shared/mundial";
import { C, Sep, TitleBar } from "./teletext";
import { Bracket } from "./bracket";
import type { Indexes } from "./state";

// nombre lindo + bandera de la grilla (FIFA usa otros nombres)
const flagBy: Record<string, string> = {}, nameBy: Record<string, string> = {};
for (const m of MATCHES) {
  flagBy[canon(m.a)] = m.fa; flagBy[canon(m.b)] = m.fb;
  nameBy[canon(m.a)] = m.a; nameBy[canon(m.b)] = m.b;
}

const TABS: [string, string][] = [["grupos", "GRUPOS"], ["clasif", "CLASIFICACIÓN"], ["goles", "GOLEADORES"]];

export function Tabla({ data, idx, nowK, onWatch }: { data: ApiData | null; idx: Indexes; nowK: string; onWatch: (m: Match, ch: ChannelKey) => void }) {
  const [tab, setTab] = useState("grupos");
  const groups = data?.standings || [];

  // goleadores: agregado en el cliente de los goles que ya vienen en /api/data
  // (sin goles en contra; los penales se anotan aparte)
  const goleadores = (() => {
    const by = new Map<string, { name: string; team: string; goles: number; pen: number }>();
    for (const g of data?.goals || []) {
      for (const e of g.events) {
        if (e.og || !e.name) continue;
        const team = e.side === "h" ? g.teams[0] : g.teams[1];
        const k = `${e.name}|${canon(team)}`;
        const row = by.get(k) ?? { name: e.name, team, goles: 0, pen: 0 };
        row.goles++; if (e.pen) row.pen++;
        by.set(k, row);
      }
    }
    return [...by.values()].sort((a, b) => b.goles - a.goles || a.pen - b.pen || a.name.localeCompare(b.name)).slice(0, 12);
  })();

  return (
    <div>
      <TitleBar color={C.g}>TABLA — MUNDIAL 2026</TitleBar>

      {/* sub-pestañas */}
      <div className="flex gap-3 flex-wrap mb-3 items-baseline" style={{ color: C.c }}>
        {TABS.map(([k, label]) => (
          <button key={k} className={`tt-chip${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {/* GRUPOS */}
      {tab === "grupos" && (
        <div>
          {groups.length === 0 && (
            <div style={{ color: C.dim }}>{data ? "SIN DATOS DE LA TABLA TODAVIA." : "CARGANDO TABLA..."}</div>
          )}
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
            {groups.map((g) => {
              const started = g.rows.some((r) => r.pj > 0); // antes del 1er partido nadie clasifica
              return (
                <table key={g.group} className="w-full" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr><th colSpan={5} className="tt-bar text-left" style={{ color: "#fff" }}>{g.group}</th></tr>
                    <tr style={{ color: C.c }}>
                      <th className="text-left w-6">#</th>
                      <th className="text-left">EQUIPO</th>
                      <th className="text-right w-8">PJ</th>
                      <th className="text-right w-10">DG</th>
                      <th className="text-right w-10">PTS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => {
                      const c = canon(r.team);
                      const q = started && r.pos <= 2;
                      return (
                        <tr key={r.team} style={{ color: q ? C.g : C.y }}>
                          <td>{r.pos}</td>
                          <td className="tt-glow">{flagBy[c] || "🏳"} {nameBy[c] || r.team}</td>
                          <td className="text-right">{r.pj}</td>
                          <td className="text-right">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                          <td className="text-right" style={{ color: "#fff" }}>{r.pts}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              );
            })}
          </div>
          <div className="mt-4" style={{ color: C.dim, fontSize: ".85em" }}>
            CLASIFICAN LOS 2 PRIMEROS DE CADA GRUPO. EN <span style={{ color: C.g }}>VERDE</span>: HOY CLASIFICARIAN.
            LA PELEA DE LOS TERCEROS Y EL CUADRO VAN EN <span style={{ color: C.c }}>CLASIFICACIÓN</span>.
          </div>
        </div>
      )}

      {/* CLASIFICACIÓN / LLAVES */}
      {tab === "clasif" && <Bracket data={data} idx={idx} nowK={nowK} onWatch={onWatch} embedded />}

      {/* GOLEADORES */}
      {tab === "goles" && (
        <div>
          {goleadores.length === 0 ? (
            <div style={{ color: C.dim }}>{data ? "TODAVIA NO HAY GOLES RELEVADOS." : "CARGANDO..."}</div>
          ) : (
            <>
              <Sep color={C.y} label="GOLEADORES" />
              {goleadores.map((s, i) => (
                <div key={`${s.name}|${s.team}`} className="tt-row">
                  <span style={{ color: C.c }} className="w-8">{i + 1}</span>
                  <span style={{ color: C.y }} className="tt-glow">{flagBy[canon(s.team)] || "🏳"} {s.name}</span>
                  <span style={{ color: "#fff" }}>{s.goles} {s.goles === 1 ? "GOL" : "GOLES"}</span>
                  {s.pen > 0 && <span style={{ color: C.dim }}>({s.pen} DE PENAL)</span>}
                </div>
              ))}
              <div style={{ color: C.dim, fontSize: ".8em" }} className="mt-1">
                SEGUN LOS PARTIDOS RELEVADOS POR EL SITIO · SIN GOLES EN CONTRA
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
