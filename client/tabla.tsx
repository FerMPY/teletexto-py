// P200 — TABLA: posiciones de los 12 grupos, actualizada con cada partido.
import { MATCHES } from "../shared/matches";
import { canon } from "../shared/mundial";
import type { ApiData } from "../shared/mundial";
import { C, TitleBar } from "./teletext";

// nombre lindo + bandera de la grilla (FIFA usa otros nombres)
const flagBy: Record<string, string> = {}, nameBy: Record<string, string> = {};
for (const m of MATCHES) {
  flagBy[canon(m.a)] = m.fa; flagBy[canon(m.b)] = m.fb;
  nameBy[canon(m.a)] = m.a; nameBy[canon(m.b)] = m.b;
}

export function Tabla({ data }: { data: ApiData | null }) {
  const groups = data?.standings || [];
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
    </div>
  );
}
