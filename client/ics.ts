// Exportar partidos a calendario (.ics) — generado entero en el cliente, cero
// costo de server. Cada evento lleva los canales y el deep link al visor, más
// un aviso 30 minutos antes. Paraguay es UTC-3 fijo → los DTSTART van en UTC.
import type { Match } from "../shared/mundial";
import { CHANNELS, kickoffEpoch, pk } from "../shared/mundial";
import { chOf } from "./state";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/[,;]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
const dt = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, "-");

export function downloadIcs(matches: Match[], label: string) {
  const stamp = dt(Date.now());
  const events = matches.map((m) => {
    const start = kickoffEpoch(m);
    const chs = chOf(m).map((c) => CHANNELS[c].name).join(", ");
    const url = `${location.origin}/#500-${chOf(m)[0] || "gen"}-${slug(pk(m.a, m.b))}`;
    return [
      "BEGIN:VEVENT",
      `UID:${slug(pk(m.a, m.b))}@teletexto.lakebed.app`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${dt(start)}`,
      `DTEND:${dt(start + (m.f >= 4 ? 165 : 110) * 60_000)}`,
      `SUMMARY:${esc(`⚽ ${m.a} vs ${m.b} — Mundial 2026`)}`,
      `DESCRIPTION:${esc(`Canales: ${chs}. Miralo en ${url}`)}`,
      `URL:${url}`,
      "BEGIN:VALARM",
      "TRIGGER:-PT30M",
      "ACTION:DISPLAY",
      `DESCRIPTION:${esc(`Arranca ${m.a} vs ${m.b}`)}`,
      "END:VALARM",
      "END:VEVENT",
    ].join("\r\n");
  });
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TELETEXTO PY//MUNDIAL 2026//ES",
    `X-WR-CALNAME:${esc(label)}`,
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  a.download = matches.length === 1 ? `${slug(pk(matches[0].a, matches[0].b)).toLowerCase()}.ics` : "mundial-2026-py.ics";
  a.click();
  URL.revokeObjectURL(a.href);
}
