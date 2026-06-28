// CUADRO DE ELIMINATORIAS — Mundial 2026 (48 equipos, 12 grupos A–L).
//
// El ESQUELETO del cuadro (qué slot juega contra qué slot, y cómo el ganador
// avanza) es FIJO y público desde que FIFA publicó el fixture: lo tenemos abajo
// completo, partidos 73→104. Los EQUIPOS se van llenando solos a medida que se
// definen los grupos (1º/2º de cada grupo) — ver client/bracket.tsx.
//
// El único pedazo que NO se puede slotear de antemano son los 8 MEJORES TERCEROS:
// cada uno cae en un slot según una tabla de combinaciones de FIFA (Anexo C del
// reglamento, 495 casos) que recién se resuelve al cerrar la fase de grupos. Por
// eso esos slots quedan como "3º (uno de C/E/F/H/I)" y los terceros que hoy
// entrarían se listan aparte, en una bolsa. Cuando FIFA confirme los cruces (o se
// carguen los partidos a matches.ts con f>=4), el cuadro los muestra de una.
//
// Puro: sin DOM, sin Node, sin Lakebed. Testeable y reusable.

// De dónde sale el equipo de un slot del cuadro.
export type Slot =
  | { k: "w"; g: string }       // 1X — ganador del grupo X
  | { k: "r"; g: string }       // 2X — segundo del grupo X
  | { k: "t"; gs: string[] }    // 3º de UNO de estos grupos (se define al final)
  | { k: "win"; m: number }     // ganador del partido m
  | { k: "lose"; m: number };   // perdedor del partido m (solo para el 3er puesto)

// f del torneo: 4=dieciseisavos 5=octavos 6=cuartos 7=semis 8=final 9=3er puesto
// (mismo convenio que matches.ts, donde 1-3 es la fase de grupos)
export type Tie = { m: number; f: number; a: Slot; b: Slot };

const W = (g: string): Slot => ({ k: "w", g });
const R = (g: string): Slot => ({ k: "r", g });
const T = (...gs: string[]): Slot => ({ k: "t", gs });
const Gw = (m: number): Slot => ({ k: "win", m });
const Gl = (m: number): Slot => ({ k: "lose", m });

// Plantilla oficial FIFA del Mundial 2026 (partidos 73–104). NO inventar: estos
// cruces salen del fixture publicado; los terceros usan los grupos exactos del
// Anexo C. Si FIFA corrige algo, se edita solo acá.
export const BRACKET: Tie[] = [
  // ── DIECISÉISAVOS (Ronda de 32) ──────────────────────────────────────────
  { m: 73, f: 4, a: R("A"), b: R("B") },
  { m: 74, f: 4, a: W("E"), b: T("A", "B", "C", "D", "F") },
  { m: 75, f: 4, a: W("F"), b: R("C") },
  { m: 76, f: 4, a: W("C"), b: R("F") },
  { m: 77, f: 4, a: W("I"), b: T("C", "D", "F", "G", "H") },
  { m: 78, f: 4, a: R("E"), b: R("I") },
  { m: 79, f: 4, a: W("A"), b: T("C", "E", "F", "H", "I") },
  { m: 80, f: 4, a: W("L"), b: T("E", "H", "I", "J", "K") },
  { m: 81, f: 4, a: W("D"), b: T("B", "E", "F", "I", "J") },
  { m: 82, f: 4, a: W("G"), b: T("A", "E", "H", "I", "J") },
  { m: 83, f: 4, a: R("K"), b: R("L") },
  { m: 84, f: 4, a: W("H"), b: R("J") },
  { m: 85, f: 4, a: W("B"), b: T("E", "F", "G", "I", "J") },
  { m: 86, f: 4, a: W("J"), b: R("H") },
  { m: 87, f: 4, a: W("K"), b: T("D", "E", "I", "J", "L") },
  { m: 88, f: 4, a: R("D"), b: R("G") },
  // ── OCTAVOS (Ronda de 16) ────────────────────────────────────────────────
  { m: 89, f: 5, a: Gw(74), b: Gw(77) },
  { m: 90, f: 5, a: Gw(73), b: Gw(75) },
  { m: 91, f: 5, a: Gw(76), b: Gw(78) },
  { m: 92, f: 5, a: Gw(79), b: Gw(80) },
  { m: 93, f: 5, a: Gw(83), b: Gw(84) },
  { m: 94, f: 5, a: Gw(81), b: Gw(82) },
  { m: 95, f: 5, a: Gw(86), b: Gw(88) },
  { m: 96, f: 5, a: Gw(85), b: Gw(87) },
  // ── CUARTOS ──────────────────────────────────────────────────────────────
  { m: 97, f: 6, a: Gw(89), b: Gw(90) },
  { m: 98, f: 6, a: Gw(93), b: Gw(94) },
  { m: 99, f: 6, a: Gw(91), b: Gw(92) },
  { m: 100, f: 6, a: Gw(95), b: Gw(96) },
  // ── SEMIFINALES ──────────────────────────────────────────────────────────
  { m: 101, f: 7, a: Gw(97), b: Gw(98) },
  { m: 102, f: 7, a: Gw(99), b: Gw(100) },
  // ── FINAL + TERCER PUESTO ────────────────────────────────────────────────
  { m: 104, f: 8, a: Gw(101), b: Gw(102) },
  { m: 103, f: 9, a: Gl(101), b: Gl(102) },
];

export const ROUND: Record<number, string> = {
  4: "DIECISÉISAVOS", 5: "OCTAVOS", 6: "CUARTOS", 7: "SEMIFINALES", 8: "FINAL", 9: "TERCER PUESTO",
};
// las columnas del cuadro, de la 1ª ronda a la final (el 3er puesto va aparte)
export const COLUMNS = [4, 5, 6, 7, 8];

const byMatch = new Map(BRACKET.map((t) => [t.m, t]));
export const tieByMatch = (m: number) => byMatch.get(m);

// ORDEN VERTICAL del cuadro: las llaves vienen numeradas 73→88, pero el partido
// 89 (octavos) lo alimentan el 74 y el 77, no dos llaves contiguas. Para que cada
// ronda quede pegada a sus alimentadores (y los conectores cierren), recorremos
// el árbol desde la final y devolvemos cada ronda en el orden en que cuelga.
export function roundOrder(f: number): Tie[] {
  const out: Tie[] = [];
  const walk = (m: number) => {
    const t = byMatch.get(m);
    if (!t) return;
    if (t.f === f) { out.push(t); return; }   // llegué a la ronda pedida: no bajo más
    if (t.f > f) {                              // más arriba en el árbol: bajo a los hijos
      if ("m" in t.a) walk(t.a.m);
      if ("m" in t.b) walk(t.b.m);
    }
  };
  walk(104); // raíz = la final
  return out;
}

export const thirdPlace = () => byMatch.get(103)!;

// ── CALENDARIO DE ELIMINATORIAS (cuándo y dónde) ───────────────────────────────
// El esqueleto de arriba dice QUIÉN; esto dice CUÁNDO y DÓNDE, por número de
// partido. Horas en PARAGUAY (UTC-3 fijo). Sedes y horarios verificados contra
// Wikipedia "2026 FIFA World Cup knockout stage" + NBC Sports (coinciden en todo).
// `ch` queda para cuando los canales paraguayos publiquen la grilla de cada cruce;
// sin `ch`, la agenda muestra los 5 canales apagados (como en la fase de grupos).
export type KoSlot = { d: string; t: string; sede: string; ciudad: string; ch?: string[] };
export const KO_SCHEDULE: Record<number, KoSlot> = {
  // DIECISÉISAVOS — 28 jun → 3 jul
  73: { d: "2026-06-28", t: "16:00", sede: "SoFi Stadium", ciudad: "Los Ángeles", ch: ["gen", "trece"] },
  76: { d: "2026-06-29", t: "14:00", sede: "NRG Stadium", ciudad: "Houston" },
  74: { d: "2026-06-29", t: "17:30", sede: "Gillette Stadium", ciudad: "Boston", ch: ["gen", "trece", "popu", "vs"] },
  75: { d: "2026-06-29", t: "22:00", sede: "Estadio BBVA", ciudad: "Monterrey" },
  78: { d: "2026-06-30", t: "14:00", sede: "AT&T Stadium", ciudad: "Dallas" },
  77: { d: "2026-06-30", t: "18:00", sede: "MetLife Stadium", ciudad: "Nueva York" },
  79: { d: "2026-06-30", t: "22:00", sede: "Estadio Azteca", ciudad: "Ciudad de México" },
  80: { d: "2026-07-01", t: "13:00", sede: "Mercedes-Benz Stadium", ciudad: "Atlanta" },
  82: { d: "2026-07-01", t: "17:00", sede: "Lumen Field", ciudad: "Seattle" },
  81: { d: "2026-07-01", t: "21:00", sede: "Levi's Stadium", ciudad: "San Francisco" },
  84: { d: "2026-07-02", t: "16:00", sede: "SoFi Stadium", ciudad: "Los Ángeles" },
  83: { d: "2026-07-02", t: "20:00", sede: "BMO Field", ciudad: "Toronto" },
  85: { d: "2026-07-03", t: "00:00", sede: "BC Place", ciudad: "Vancouver" },
  88: { d: "2026-07-03", t: "15:00", sede: "AT&T Stadium", ciudad: "Dallas" },
  86: { d: "2026-07-03", t: "19:00", sede: "Hard Rock Stadium", ciudad: "Miami" },
  87: { d: "2026-07-03", t: "22:30", sede: "Arrowhead Stadium", ciudad: "Kansas City" },
  // OCTAVOS — 4 → 7 jul
  90: { d: "2026-07-04", t: "14:00", sede: "NRG Stadium", ciudad: "Houston" },
  89: { d: "2026-07-04", t: "18:00", sede: "Lincoln Financial Field", ciudad: "Filadelfia" },
  91: { d: "2026-07-05", t: "17:00", sede: "MetLife Stadium", ciudad: "Nueva York" },
  92: { d: "2026-07-05", t: "21:00", sede: "Estadio Azteca", ciudad: "Ciudad de México" },
  93: { d: "2026-07-06", t: "16:00", sede: "AT&T Stadium", ciudad: "Dallas" },
  94: { d: "2026-07-06", t: "21:00", sede: "Lumen Field", ciudad: "Seattle" },
  95: { d: "2026-07-07", t: "13:00", sede: "Mercedes-Benz Stadium", ciudad: "Atlanta" },
  96: { d: "2026-07-07", t: "17:00", sede: "BC Place", ciudad: "Vancouver" },
  // CUARTOS — 9 → 11 jul
  97: { d: "2026-07-09", t: "17:00", sede: "Gillette Stadium", ciudad: "Boston" },
  98: { d: "2026-07-10", t: "16:00", sede: "SoFi Stadium", ciudad: "Los Ángeles" },
  99: { d: "2026-07-11", t: "18:00", sede: "Hard Rock Stadium", ciudad: "Miami" },
  100: { d: "2026-07-11", t: "22:00", sede: "Arrowhead Stadium", ciudad: "Kansas City" },
  // SEMIFINALES — 14 → 15 jul
  101: { d: "2026-07-14", t: "16:00", sede: "AT&T Stadium", ciudad: "Dallas" },
  102: { d: "2026-07-15", t: "16:00", sede: "Mercedes-Benz Stadium", ciudad: "Atlanta" },
  // TERCER PUESTO — 18 jul · FINAL — 19 jul
  103: { d: "2026-07-18", t: "18:00", sede: "Hard Rock Stadium", ciudad: "Miami" },
  104: { d: "2026-07-19", t: "16:00", sede: "MetLife Stadium", ciudad: "Nueva York" },
};

// ── MEJORES TERCEROS → LLAVE (Anexo C) ─────────────────────────────────────────
// Los 8 cruces que enfrentan a un "mejor tercero" son 74, 77, 79, 80, 81, 82, 85,
// 87. Qué grupo cae en cada uno lo define FIFA con la tabla de combinaciones del
// Anexo C, recién al cerrar la fase de grupos (≈28 jun). Hasta entonces este mapa
// va VACÍO y esas llaves muestran el cartel "3º (…)". Al cierre se cargan las 8
// entradas — nº de llave → letra del grupo cuyo 3º entra ahí. Ejemplo de formato:
//   { 74: "D", 77: "F", 79: "C", 80: "K", 81: "E", 82: "A", 85: "G", 87: "L" }
// 74: Paraguay (3º D) ya confirmado por VS Sports (27/06) — Alemania (1º E) vs PY.
// Faltan los otros 7 cuando FIFA/medios confirmen los cruces de terceros restantes.
export const THIRDS_ASSIGN: Record<number, string> = { 74: "D" };
