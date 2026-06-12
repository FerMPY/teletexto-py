// P200 — TABLA: posiciones de los 12 grupos, actualizada con cada partido.
import { MATCHES } from "../shared/matches";
import { canon } from "../shared/mundial";
import type { ApiData } from "../shared/mundial";
import { C, Sep, TitleBar } from "./teletext";

// nombre lindo + bandera de la grilla (FIFA usa otros nombres)
const flagBy: Record<string, string> = {}, nameBy: Record<string, string> = {};
for (const m of MATCHES) {
  flagBy[canon(m.a)] = m.fa; flagBy[canon(m.b)] = m.fb;
  nameBy[canon(m.a)] = m.a; nameBy[canon(m.b)] = m.b;
}

export function Tabla({ data }: { data: ApiData | null }) {
  const groups = data?.standings || [];

  // los 12 terceros, ordenados como FIFA (pts, dif. de gol, goles a favor):
  // en este formato clasifican los 8 mejores — ESTA es la tabla que importa
  const terceros = groups
    .map((g) => ({ g: g.group, r: g.rows.find((x) => x.pos === 3) }))
    .filter((x): x is { g: string; r: NonNullable<typeof x.r> } => !!x.r && x.r.pj > 0)
    .sort((p, q) => q.r.pts - p.r.pts || q.r.gd - p.r.gd || q.r.gf - p.r.gf);

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
      <TitleBar color={C.g}>TABLA DE POSICIONES</TitleBar>
      {groups.length === 0 && (
        <div style={{ color: C.dim }}>
          {data ? "SIN DATOS DE LA TABLA TODAVIA." : "CARGANDO TABLA..."}
        </div>
      )}
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => {
          const started = g.rows.some((r) => r.pj > 0); // antes del 1er partido nadie clasifica
          return (
            <table key={g.group} className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th colSpan={5} className="tt-bar text-left" style={{ color: "#fff" }}>{g.group}</th>
                </tr>
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
        CLASIFICAN LOS 2 PRIMEROS DE CADA GRUPO + LOS 8 MEJORES TERCEROS.
        EN <span style={{ color: C.g }}>VERDE</span>: HOY CLASIFICARIAN.
      </div>

      {/* la pelea de los terceros */}
      {terceros.length > 0 && (
        <div className="mt-6">
          <Sep color={C.m} label="ASI VAN LOS TERCEROS — CLASIFICAN LOS 8 MEJORES" />
          {terceros.map((t, i) => {
            const c = canon(t.r.team);
            const pasa = i < 8;
            return (
              <div key={t.g} className="tt-row">
                <span style={{ color: C.c }} className="w-8">{i + 1}</span>
                <span style={{ color: pasa ? C.g : C.dim }} className="tt-glow">
                  {flagBy[c] || "🏳"} {nameBy[c] || t.r.team}
                </span>
                <span style={{ color: C.dim }}>{t.g}</span>
                <span style={{ color: C.dim }}>PJ {t.r.pj} · DG {t.r.gd > 0 ? `+${t.r.gd}` : t.r.gd}</span>
                <span style={{ color: "#fff" }}>{t.r.pts} PTS</span>
                {!pasa && <span style={{ color: C.r }}>AFUERA HOY</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* goleadores del torneo */}
      {goleadores.length > 0 && (
        <div className="mt-6">
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
        </div>
      )}
    </div>
  );
}
