// Estado del cliente: poll de /api/data, índices por partido y hora paraguaya.
// Puro Preact + shared — sin imports de lakebed acá.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { MATCHES } from "../shared/matches";
import { canon, pk } from "../shared/mundial";
import type { ApiData, ChannelKey, GoalEvent, Match, ScoreRow } from "../shared/mundial";

export const mKey = (m: Match) => pk(m.a, m.b);

/* ---------- hora paraguaya (Intl, sin offset hardcodeado en el cliente) ---------- */
const pyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Asuncion",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});
export function nowPY(at = new Date()) {
  const p = Object.fromEntries(pyFmt.formatToParts(at).map((x) => [x.type, x.value]));
  const hh = p.hour === "24" ? "00" : p.hour;
  return {
    key: `${p.year}-${p.month}-${p.day}T${hh}:${p.minute}`,
    date: `${p.year}-${p.month}-${p.day}`,
    clock: `${hh}:${p.minute}.${p.second}`,
  };
}
const tKey = (m: Match) => `${m.d}T${m.t}`;
function addMin(d: string, t: string, mins: number) {
  const [Y, Mo, D] = d.split("-").map(Number), [H, Mi] = t.split(":").map(Number);
  return new Date(Date.UTC(Y, Mo - 1, D, H, Mi + mins)).toISOString().slice(0, 16);
}
const LIVE_MIN = 125;

export const DOW = ["DOMINGO", "LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"];
export const MES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
export function dayLabel(d: string) {
  const [Y, Mo, D] = d.split("-").map(Number);
  return `${DOW[new Date(Date.UTC(Y, Mo - 1, D)).getUTCDay()]} ${D} ${MES[Mo - 1]}`;
}

/* ---------- índices sobre los datos del server ---------- */
export type Indexes = {
  score: Record<string, ScoreRow>;
  goals: Record<string, GoalEvent[]>;
  video: Record<string, Partial<Record<"gen" | "vs", string>>>;
};
export function buildIndexes(d: ApiData | null): Indexes {
  const idx: Indexes = { score: {}, goals: {}, video: {} };
  if (!d) return idx;
  for (const s of d.scores || []) if (s.teams) idx.score[pk(s.teams[0], s.teams[1])] = s;
  for (const g of d.goals || []) if (g.teams) idx.goals[pk(g.teams[0], g.teams[1])] = g.events;
  for (const prov of ["gen", "vs"] as const) {
    for (const v of d.videos?.[prov] || []) if (v.teams) (idx.video[pk(v.teams[0], v.teams[1])] ??= {})[prov] = v.url;
  }
  return idx;
}

// estado de un partido: marcador FIFA si hay, si no el reloj PY como respaldo
export type MState = { live: boolean; final: boolean; hs: number | null; as: number | null; min: string | null };
export function matchState(m: Match, idx: Indexes, nowK: string): MState {
  const s = idx.score[mKey(m)];
  if (!s || s.hs == null) {
    const live = tKey(m) <= nowK && nowK < addMin(m.d, m.t, LIVE_MIN);
    return { live, final: addMin(m.d, m.t, LIVE_MIN) <= nowK, hs: null, as: null, min: null };
  }
  // FIFA puede listar home/away al revés que nuestra grilla
  const sameOrder = canon(s.teams[0]) === canon(m.a);
  const live = s.status === 3;
  return {
    live, final: !live && s.status !== 1,
    hs: sameOrder ? s.hs : s.as, as: sameOrder ? s.as : s.hs,
    min: s.min,
  };
}
// los goles también vienen en orden FIFA → reordenar el lado si hace falta
export function goalsFor(m: Match, idx: Indexes): GoalEvent[] {
  const ev = idx.goals[mKey(m)] || [];
  const s = idx.score[mKey(m)];
  if (!s || canon(s.teams[0]) === canon(m.a)) return ev;
  return ev.map((e) => ({ ...e, side: e.side === "h" ? "a" : "h" }));
}

/* ---------- hooks ---------- */
// Poll "amable" con la cuota de Lakebed (10k requests/día): 30s solo cuando
// hay partido en vivo, 90s el resto, y NADA con la pestaña oculta (se reanuda
// al volver). Una pestaña abierta todo el día pasa de ~2.880 a <1.000 pedidos.
export function useApiData(): ApiData | null {
  const [data, setData] = useState<ApiData | null>(null);
  // datos congelados: varios polls seguidos sin respuesta (cuota diaria de
  // Lakebed agotada, o se cayó la fuente). La agenda/los canales siguen.
  const [stale, setStale] = useState(false);
  useEffect(() => {
    let alive = true, timer: ReturnType<typeof setTimeout> | undefined;
    let first = true; // el 1er pedido de la visita lleva ?v=1 → contador de visitas
    let lastOk = Date.now();
    const tick = async () => {
      if (!alive || document.hidden) return; // oculta → pausa; visibilitychange reanuda
      let delay = 90_000;
      let ok = false;
      try {
        const r = await fetch(first ? "api/data?v=1" : "api/data");
        first = false;
        if (r.ok) {
          const j: ApiData = await r.json();
          ok = true;
          if (alive) { setData(j); setStale(false); }
          if ((j.scores || []).some((s) => s.status === 3)) delay = 30_000;
        }
      } catch { /* sin red → la agenda sigue sin marcadores */ }
      if (ok) lastOk = Date.now();
      else if (alive && Date.now() - lastOk > 4 * 60_000) setStale(true);
      timer = setTimeout(tick, delay);
    };
    const onVis = () => { if (!document.hidden) { clearTimeout(timer); void tick(); } };
    document.addEventListener("visibilitychange", onVis);
    void tick();
    return () => { alive = false; clearTimeout(timer); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  return { data, stale };
}

export function useClock() {
  const [now, setNow] = useState(() => nowPY());
  useEffect(() => {
    const id = setInterval(() => setNow(nowPY()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// avisos de gol: detecta goles nuevos entre polls (no avisa el primer load
// ni en pantalla completa, igual que el original)
export type Toast = { id: number; title: string; sub: string; match: Match };
export function useGoalToasts(idx: Indexes, nowK: string) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const prev = useRef<Indexes["goals"] | null>(null);
  const nextId = useRef(1);
  useEffect(() => {
    if (prev.current === null) { prev.current = idx.goals; return; }
    if (document.fullscreenElement) { prev.current = idx.goals; return; }
    const fresh: Toast[] = [];
    for (const m of MATCHES) {
      const k = mKey(m);
      const st = matchState(m, idx, nowK);
      if (!st.live) continue;
      const before = (prev.current[k] || []).length;
      const now = idx.goals[k] || [];
      for (let i = before; i < now.length; i++) {
        const e = now[i];
        const s = idx.score[k];
        const sameOrder = !s || canon(s.teams[0]) === canon(m.a);
        const side = sameOrder ? e.side : e.side === "h" ? "a" : "h";
        const team = side === "h" ? `${m.fa} ${m.a}` : `${m.fb} ${m.b}`;
        fresh.push({
          id: nextId.current++,
          title: `GOL ${team.toUpperCase()}`,
          sub: `${e.name} ${e.min} · ${m.a} ${st.hs ?? "?"}-${st.as ?? "?"} ${m.b}`,
          match: m,
        });
      }
    }
    prev.current = idx.goals;
    if (fresh.length) {
      setToasts((t) => [...t, ...fresh]);
      for (const f of fresh) setTimeout(() => setToasts((t) => t.filter((x) => x.id !== f.id)), 9000);
    }
  }, [idx]);
  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));
  return { toasts, dismiss };
}

export const liveMatches = (idx: Indexes, nowK: string) => MATCHES.filter((m) => matchState(m, idx, nowK).live);
export const nextMatch = (nowK: string) => MATCHES.find((m) => tKey(m) > nowK) || null;
export const nextPy = (idx: Indexes, nowK: string) =>
  MATCHES.find((m) => m.py && matchState(m, idx, nowK).live) || MATCHES.find((m) => m.py && tKey(m) > nowK) || null;

export function countdown(m: Match, nowK: string) {
  const t = new Date(`${m.d}T${m.t}:00Z`).getTime();
  const n = new Date(`${nowK}:00Z`).getTime();
  let s = Math.max(0, Math.floor((t - n) / 1000));
  const dd = Math.floor(s / 86400); s -= dd * 86400;
  const hh = Math.floor(s / 3600); s -= hh * 3600;
  const mm = Math.floor(s / 60);
  return { dd, hh, mm };
}

export const chOf = (m: Match): ChannelKey[] => m.ch.filter((c): c is ChannelKey => ["gen", "trece", "uni", "popu", "vs"].includes(c));
