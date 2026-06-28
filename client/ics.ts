// Exportar partidos a calendario (.ics) — generado entero en el cliente, cero
// costo de server. Cada evento lleva los canales y el deep link al visor, más
// un aviso 30 minutos antes. Paraguay es UTC-3 fijo → los DTSTART van en UTC.
// Sirve para la fase de grupos (Match) y para las llaves de eliminatorias (KoTie,
// incluso con equipos sin definir: el evento usa el cartel del cruce y la sede).
import type { Match } from "../shared/mundial";
import { CHANNELS, kickoffEpoch, pk } from "../shared/mundial";
import { ROUND } from "../shared/bracket";
import { chOf } from "./state";
import { koEpoch, nm, isTeam } from "./ko";
import type { KoTie, Resolved } from "./ko";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/[,;]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
const dt = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, "-");

type IcsEvent = { uid: string; start: number; durMin: number; summary: string; desc: string; url: string };

function matchEvent(m: Match): IcsEvent {
  const chs = chOf(m).map((c) => CHANNELS[c].name).join(", ");
  const u = slug(pk(m.a, m.b));
  const url = `${location.origin}/#500-${chOf(m)[0] || "gen"}-${u}`;
  return {
    uid: `${u}@teletexto.lakebed.app`,
    start: kickoffEpoch(m),
    durMin: m.f >= 4 ? 165 : 110,
    summary: `⚽ ${m.a} vs ${m.b} — Mundial 2026`,
    desc: `Canales: ${chs}. Miralo en ${url}`,
    url,
  };
}

const sideLabel = (r: Resolved) => (isTeam(r) ? nm(r.team) : r.label);

// llave de eliminatorias → evento. UID estable por número de partido: si agendás
// el cruce con equipos sin definir y después con los equipos puestos, actualiza el
// mismo evento (no duplica).
function koEvent(tie: KoTie): IcsEvent | null {
  if (!tie.sched) return null;
  const round = ROUND[tie.f] || "ELIMINATORIAS";
  const chs = tie.match ? chOf(tie.match).map((c) => CHANNELS[c].name).join(", ") : "";
  const url = `${location.origin}/#100`;
  return {
    uid: `ko-${tie.m}@teletexto.lakebed.app`,
    start: koEpoch(tie.sched),
    durMin: 165,
    summary: `⚽ ${round}: ${sideLabel(tie.a)} vs ${sideLabel(tie.b)} — Mundial 2026`,
    desc: `${tie.sched.sede}, ${tie.sched.ciudad}.${chs ? ` Canales: ${chs}.` : ""} En ${url}`,
    url,
  };
}

function build(events: IcsEvent[], label: string): string {
  const stamp = dt(Date.now());
  const vevents = events.map((e) => [
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${dt(e.start)}`,
    `DTEND:${dt(e.start + e.durMin * 60_000)}`,
    `SUMMARY:${esc(e.summary)}`,
    `DESCRIPTION:${esc(e.desc)}`,
    `URL:${e.url}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(e.summary)}`,
    "END:VALARM",
    "END:VEVENT",
  ].join("\r\n"));
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TELETEXTO PY//MUNDIAL 2026//ES",
    `X-WR-CALNAME:${esc(label)}`,
    ...vevents,
    "END:VCALENDAR",
  ].join("\r\n");
}

function save(ics: string, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function downloadIcs(matches: Match[], label: string) {
  if (!matches.length) return;
  save(build(matches.map(matchEvent), label), matches.length === 1 ? `${slug(pk(matches[0].a, matches[0].b)).toLowerCase()}.ics` : "mundial-2026-py.ics");
}

export function downloadKoIcs(ties: KoTie[], label: string) {
  const events = ties.map(koEvent).filter((e): e is IcsEvent => !!e);
  if (!events.length) return;
  save(build(events, label), events.length === 1 ? `eliminatoria-${ties[0].m}.ics` : "eliminatorias-2026-py.ics");
}

// el botón AGENDAR de la agenda: baja en UN solo archivo lo visible del filtro,
// sean partidos de grupos, llaves de eliminatorias, o una mezcla de ambos.
export function downloadAgenda(matches: Match[], ties: KoTie[], label: string) {
  const events = [...matches.map(matchEvent), ...ties.map(koEvent).filter((e): e is IcsEvent => !!e)];
  if (!events.length) return;
  save(build(events, label), "mundial-2026-py.ics");
}
