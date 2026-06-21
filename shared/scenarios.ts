// Proyección de clasificación "SI TERMINA ASÍ": toma la tabla y le aplica los
// marcadores EN VIVO como si fueran finales. En la última fecha los dos partidos
// de cada grupo se juegan a la misma hora, así que quién pasa cambia minuto a
// minuto — esto lo calcula. Es lo más teletexto del torneo.
//
// Puro (sin DOM, sin Preact, sin Lakebed) para poder testearlo y reusarlo. El
// cliente decide QUÉ partidos superponer (maneja el no-contar-dos-veces si FIFA
// ya metió el vivo en la tabla); acá va solo la matemática.

export type SimpleRow = {
  canon: string; name: string; flag: string;
  pts: number; gd: number; gf: number; pj: number;
};
// un marcador en vivo a superponer sobre la tabla (equipos en clave canónica)
export type Overlay = { a: string; b: string; hs: number; as: number };
export type ProjRow = SimpleRow & { pos: number; live: boolean };
export type ProjGroup = { group: string; rows: ProjRow[]; live: boolean };

// orden de la tabla: puntos → diferencia de gol → goles a favor → nombre.
// Los desempates finos de FIFA (enfrentamiento directo, fair play, sorteo) no se
// modelan: con los marcadores moviéndose en vivo, pts/DG/GF cubren casi todo.
const byTable = (x: ProjRow, y: ProjRow) =>
  y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.name.localeCompare(y.name);

// aplica los marcadores en vivo a la tabla del grupo y reordena
export function projectGroup(group: string, base: SimpleRow[], overlays: Overlay[]): ProjGroup {
  const rows: ProjRow[] = base.map((r) => ({ ...r, pos: 0, live: false }));
  const by = new Map(rows.map((r) => [r.canon, r]));
  let live = false;
  for (const o of overlays) {
    const ra = by.get(o.a), rb = by.get(o.b);
    if (!ra || !rb) continue;
    live = ra.live = rb.live = true;
    ra.gf += o.hs; ra.gd += o.hs - o.as;
    rb.gf += o.as; rb.gd += o.as - o.hs;
    if (o.hs > o.as) ra.pts += 3;
    else if (o.hs < o.as) rb.pts += 3;
    else { ra.pts++; rb.pts++; }
  }
  rows.sort(byTable);
  rows.forEach((r, i) => (r.pos = i + 1));
  return { group, rows, live };
}

// los 8 mejores terceros del torneo: el 3º proyectado de cada grupo, ordenados
// por la misma tabla. Solo cuentan los grupos que ya jugaron algo (pj>0), para
// no meter ceros al principio del torneo.
export function bestThirds(groups: ProjGroup[]): Set<string> {
  const thirds = groups
    .map((g) => g.rows[2])
    .filter((r): r is ProjRow => !!r && r.pj > 0)
    .sort(byTable);
  return new Set(thirds.slice(0, 8).map((r) => r.canon));
}

// veredicto "si termina así" por posición proyectada (1º/2º pasan; el 3º depende
// de los 8 mejores terceros; del 4º para abajo, afuera)
export type Tone = "in" | "third-in" | "third-out" | "out";
export type Tag = { txt: string; tone: Tone };
export function qualifyTag(pos: number, canon: string, thirdsIn: Set<string>): Tag {
  if (pos <= 2) return { txt: "✓ PASA", tone: "in" };
  if (pos === 3) return thirdsIn.has(canon)
    ? { txt: "3º ENTRA", tone: "third-in" }
    : { txt: "3º AFUERA", tone: "third-out" };
  return { txt: "✗ AFUERA", tone: "out" };
}
