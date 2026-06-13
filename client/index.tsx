// TELETEXTO PY — el Mundial 2026 como lo hubiera dado el teletexto: agenda con
// los canales paraguayos, marcadores FIFA en vivo, tabla, prode y visor en la
// misma página. Páginas: P100 AGENDA · P200 TABLA · P300 PRODE · P500 VISOR.
// Podés tipear el número de página, como en el control remoto de antes.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { useMutation, useQuery } from "lakebed/client";
import { CH_ORDER, pk } from "../shared/mundial";
import type { ApiData, ChannelKey, Match } from "../shared/mundial";
import { MATCHES } from "../shared/matches";
import { Agenda } from "./agenda";
import { Prode } from "./prode";
import { C, TT_CSS } from "./teletext";
import { Tabla } from "./tabla";
import { Viewer } from "./viewer";
import { buildIndexes, chOf, liveMatches, matchState, mKey, scoreStr, useClock, useGoalToasts } from "./state";

type Page = 100 | 200 | 300;
const PAGES: { p: Page; label: string; cls: string }[] = [
  { p: 100, label: "AGENDA", cls: "f-r" },
  { p: 200, label: "TABLA", cls: "f-g" },
  { p: 300, label: "PRODE", cls: "f-y" },
];

const slugify = (s: string) => s.replace(/[^a-z0-9]+/gi, "-");

/* hash ↔ estado, como los números de página del teletexto de verdad:
     #100 / #200 / #300                  páginas
     #300-<equipo-equipo>                prode apuntado a ese partido
     #500-<canal>                        señal suelta de un canal
     #500-<canal>-<equipo-equipo>        ese partido en ese canal
   El partido va por par de equipos (slug de pk, igual que el prode) — acá
   mKey = pk(a,b), NO la hora. Todos linkeables; atrás cierra el visor. */
const matchBySlug = (s: string) => MATCHES.find((x) => slugify(pk(x.a, x.b)) === s) || null;
type Nav = { page: Page; watch: { m: Match | null; ch: ChannelKey } | null; target: string | null };
function parseHash(): Nav {
  const h = decodeURIComponent(location.hash.slice(1));
  const v = h.match(/^500-([a-z]+)(?:-(.+))?$/i);
  if (v && CH_ORDER.includes(v[1] as ChannelKey)) {
    return { page: 100, watch: { m: v[2] ? matchBySlug(v[2]) : null, ch: v[1] as ChannelKey }, target: null };
  }
  const p = h.match(/^([123])00(?:-(.+))?$/);
  const page = (p ? Number(p[1]) * 100 : 100) as Page;
  const target = page === 300 && p?.[2] ? (matchBySlug(p[2]) ? pk(matchBySlug(p[2])!.a, matchBySlug(p[2])!.b) : null) : null;
  return { page, watch: null, target };
}

export function App() {
  // favicon (el scaffold de lakebed deja el nombre crudo del capsule) + PWA:
  // manifest y service worker (cachea el shell — abre al instante y aguanta
  // sin red o con la cuota agotada; /api siempre va a la red)
  useEffect(() => {
    const link = document.querySelector("link[rel='icon']") ?? document.head.appendChild(Object.assign(document.createElement("link"), { rel: "icon" }));
    link.setAttribute("href", "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📺</text></svg>"));
    // viewport-fit=cover habilita env(safe-area-inset-*): sin esto, en iPhone
    // la barra fastext queda pegada al indicador de inicio (sin aire abajo)
    const vp = document.querySelector("meta[name=viewport]");
    if (vp) vp.setAttribute("content", "width=device-width, initial-scale=1, viewport-fit=cover");
    const head = (tag: string, attrs: Record<string, string>) =>
      document.head.appendChild(Object.assign(document.createElement(tag), attrs));
    head("link", { rel: "manifest", href: "api/manifest.webmanifest" });
    head("meta", { name: "theme-color", content: "#000000" });
    head("meta", { name: "apple-mobile-web-app-capable", content: "yes" });
    head("meta", { name: "apple-mobile-web-app-status-bar-style", content: "black" });
    // solo en producción: en local el caché del SW te sirve JS viejo entre ediciones
    if (location.hostname.endsWith("lakebed.app")) {
      navigator.serviceWorker?.register("/api/sw.js", { scope: "/" }).catch(() => { /* sin SW se vive igual */ });
      // métricas de visitas (GoatCounter, sin cookies, fuera de Lakebed → no
      // gasta cuota). Solo en prod para no ensuciar el panel con dev/local.
      const gc = Object.assign(document.createElement("script"), { async: true, src: "//gc.zgo.at/count.js" });
      gc.setAttribute("data-goatcounter", "https://teletexto.goatcounter.com/count");
      document.head.appendChild(gc);
    }
  }, []);
  // datos por query REACTIVA (no más polling de endpoint): Lakebed empuja el
  // caché por WebSocket cuando `refresh` lo reescribe. Leer cuesta "requests"
  // (10k/día), no "mutations" (1k/día) — y un solo write llega a todos.
  const cacheRows = useQuery<{ id: string; k: string; blob: string; at: string }[]>("data");
  const triggerRefresh = useMutation<[], void>("refresh");
  const cacheRow = Array.isArray(cacheRows) ? cacheRows[0] : undefined;
  const data = useMemo<ApiData | null>(() => {
    try { return cacheRow?.blob ? JSON.parse(cacheRow.blob) as ApiData : null; } catch { return null; }
  }, [cacheRow?.blob]);
  const atMs = Number(cacheRow?.at || 0);
  const now = useClock();
  const idx = buildIndexes(data);
  const { toasts, dismiss } = useGoalToasts(idx, now.key);
  // datos congelados: el último fetch real quedó viejo (cuota agotada o fuente
  // caída). La agenda/los canales siguen; los marcadores vuelven solos.
  const stale = atMs > 0 && Date.now() - atMs > 5 * 60_000;

  // disparador del refresh: lo llaman los clientes, pero `refresh` se autolimita
  // (REFRESH_MS) y la query reactiva propaga el resultado, así que en la práctica
  // las fuentes se piden ~1 vez por ventana entre TODOS. 25s en vivo, 90s si no.
  // Pausa con la pestaña oculta. Jitter inicial para no llamar todos a la vez.
  const atRef = useRef(0); atRef.current = atMs;
  const idxRef = useRef(idx); idxRef.current = idx;
  const nowKRef = useRef(now.key); nowKRef.current = now.key;
  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (!alive || document.hidden) return;
      const live = liveMatches(idxRef.current, nowKRef.current).length > 0;
      // en vivo refresca ~30s; sin partidos, cada 5 min (los datos casi no
      // cambian). Como `at` se propaga reactivo, el primero que lo ve viejo
      // dispara el refresh y su write calla a los demás → ~1 write por ventana
      // entre TODOS, no por cliente. Cabe en la cuota de 1k mutations/día.
      const threshold = live ? 30_000 : 300_000;
      if (atRef.current === 0 || Date.now() - atRef.current > threshold) {
        void triggerRefresh().catch(() => { /* sin red → reintenta al próximo tick */ });
      }
    };
    const start = setTimeout(tick, 200 + Math.floor(Math.random() * 6000)); // jitter anti-manada
    const id = setInterval(tick, 15_000);
    const onVis = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; clearTimeout(start); clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  // marcador en el título de la pestaña: el resultado se ve aunque estés en
  // otra ventana (prioridad: el partido de Paraguay)
  useEffect(() => {
    const live = liveMatches(idx, now.key);
    const m = live.find((x) => x.py) || live[0];
    const st = m ? matchState(m, idx, now.key) : null;
    document.title = m && st && st.hs != null
      ? `⚽ ${m.fa} ${scoreStr(st)} ${m.fb} · TELETEXTO PY`
      : "MUNDIAL 2026 PY · TELETEXTO";
  }, [idx, now.key]);

  // estado de navegación inicial desde el hash (deep links del teletexto)
  const [init] = useState(parseHash);
  const [page, setPageRaw] = useState<Page>(init.page);
  const [watch, setWatchRaw] = useState<{ m: Match | null; ch: ChannelKey } | null>(init.watch);
  const [prodeTarget, setProdeTarget] = useState<string | null>(init.target); // partido al que saltar en P300
  const [buf, setBuf] = useState(""); // dígitos tipeados (navegación por número de página)
  const [flash, setFlash] = useState("");

  // atrás/adelante del navegador → re-aplicar el hash (cierra/reabre el visor)
  useEffect(() => {
    const onPop = () => {
      const s = parseHash();
      setPageRaw(s.page); setWatchRaw(s.watch);
      if (s.target) setProdeTarget(s.target);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // navegar a una página cierra el visor (como tipear un número en el control)
  const setPage = (p: Page, suffix?: string) => {
    setWatchRaw(null); setPageRaw(p);
    history.replaceState(null, "", `#${p}${suffix ? `-${suffix}` : ""}`);
  };
  // abrir el visor agrega UNA entrada de historial (atrás lo cierra); cambiar
  // de canal adentro solo reescribe el hash
  const openWatch = (m: Match | null, ch: ChannelKey) => {
    const h = `#500-${ch}${m ? `-${slugify(mKey(m))}` : ""}`;
    if (watch) history.replaceState({ tt: 500 }, "", h);
    else history.pushState({ tt: 500 }, "", h);
    setWatchRaw({ m, ch });
  };
  const closeWatch = () => {
    if ((history.state as { tt?: number } | null)?.tt === 500) history.back(); // popstate restaura la página
    else { setWatchRaw(null); history.replaceState(null, "", `#${page}`); }   // llegó por deep link directo
  };

  const goLive = () => {
    const live = liveMatches(idx, now.key);
    if (live.length) openWatch(live[0], chOf(live[0])[0]);
    else { setFlash("NO HAY PARTIDOS EN VIVO AHORA"); setTimeout(() => setFlash(""), 4000); }
  };

  // tipeo de número de página (1xx/2xx/3xx; 5xx abre el visor del vivo)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || e.metaKey || e.ctrlKey) return;
      if (!/^[0-9]$/.test(e.key)) return;
      setBuf((b) => {
        const nb = (b + e.key).slice(-3);
        if (nb.length === 3) {
          const n = Number(nb);
          if (n >= 100 && n < 200) setPage(100);
          else if (n >= 200 && n < 300) setPage(200);
          else if (n >= 300 && n < 400) setPage(300);
          else if (n >= 500 && n < 600) goLive();
          else { setFlash(`PAGINA ${nb} NO DISPONIBLE`); setTimeout(() => setFlash(""), 2500); }
          return "";
        }
        return nb;
      });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const pageNo = watch ? 500 : page;
  const [, mo, d] = now.date.split("-");
  const MES3 = ["", "ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"][Number(mo)];

  return (
    <div className="tt tt-crt">
      <style>{TT_CSS}</style>
      <div className="mx-auto max-w-6xl px-2 pt-1" style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" }}>

        {/* cabecera de teletexto: página · servicio · fecha · reloj */}
        <div className="flex justify-between gap-2 flex-wrap" style={{ color: C.fg }}>
          <span>
            <span style={{ color: C.g }}>{buf ? `P${buf.padEnd(3, "-")}` : `P${pageNo}`}</span>
            {" "}<span style={{ color: C.y }} className="tt-glow">TELETEXTO PY</span>
            {" "}<span style={{ color: C.m }}>MUNDIAL 26</span>
          </span>
          <span style={{ color: C.c }}>{d} {MES3} {now.clock}</span>
        </div>

        {flash && (
          <div className="tt-flash">
            <span className="tt-blink" style={{ color: "#fff" }}>⚠</span> {flash}
            <div style={{ color: "#fff", fontSize: ".7em" }}>PROXIMO PARTIDO EN LA AGENDA (P100)</div>
          </div>
        )}

        {/* datos congelados (cuota del día agotada o fuente caída) — banda fija,
            honesta y no bloqueante: la agenda y los canales siguen andando */}
        {stale && (
          <div className="tt-bar mt-1" style={{ color: "var(--tt-y)" }}>
            <span className="tt-blink">⚠</span> DATOS CONGELADOS — SE AGOTO LA CUOTA DIARIA O SE CAYO LA FUENTE.
            LOS HORARIOS, CANALES Y EL VISOR SIGUEN ANDANDO; LOS MARCADORES VUELVEN SOLOS.
          </div>
        )}

        {/* página activa */}
        {page === 100 && <Agenda idx={idx} nowK={now.key} today={now.date} onWatch={openWatch} onProde={(mk) => { setProdeTarget(mk); setPage(300, slugify(mk)); }} standings={data?.standings} />}
        {page === 200 && <Tabla data={data} />}
        {page === 300 && <Prode data={data} idx={idx} nowK={now.key} nowMs={Date.now()} target={prodeTarget} />}

        {/* fastext: los botones de colores del control */}
        <div className="fixed bottom-0 left-0 right-0 z-40 mx-auto max-w-6xl px-2" style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))", paddingTop: "0.25rem", background: "#000" }}>
          <div className="tt-fast">
            {PAGES.map(({ p, label, cls }) => (
              <button key={p} className={`tt-btn ${cls}${page === p && !watch ? " on" : ""}`} onClick={() => setPage(p)}>
                {label} {p}
              </button>
            ))}
            <button className="tt-btn f-c" onClick={goLive}>EN VIVO 500</button>
          </div>
        </div>

        {/* visor (P500) */}
        {watch && (
          <Viewer
            match={watch.m} ch={watch.ch} idx={idx} nowK={now.key}
            onSwitch={(ch) => openWatch(watch.m, ch)}
            onClose={closeWatch}
          />
        )}

        {/* subtítulos de gol */}
        {!document.fullscreenElement && toasts.map((t, i) => (
          <button
            key={t.id} className="tt-sub tt-glow" style={{ bottom: `${8 + i * 9}vh` }}
            onClick={() => { dismiss(t.id); openWatch(t.match, chOf(t.match)[0]); }}
          >
            ⚽ {t.title}<span className="s2">{t.sub} — TOCA PARA VER</span>
          </button>
        ))}
      </div>
    </div>
  );
}
