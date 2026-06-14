// P500 — VISOR (EN VIVO): el partido en la misma página. Pestañas = todos los
// canales (los de la grilla primero).
//
// REALIDAD DE LAS SEÑALES (verificado 2026-06-13, partido Brasil-Marruecos):
//  - El video por partido de VS Sports en YouTube tiene la INCRUSTACIÓN
//    DESHABILITADA por el dueño (4/4 dan ERROR en iframe, aunque abren bien en
//    youtube.com). GEN apunta a esos mismos videos.
//  - El reproductor real de GEN (no.gendigi.net / gentv.desdepylabs.com) tiene
//    CSP frame-ancestors limitado a dominios Nación Media + chequeo de Referer:
//    NO se puede incrustar desde teletexto.lakebed.app NI anidado dentro del
//    home de GEN (Firefox/Zen corta toda la cadena → "no.gendigi.net will not
//    allow ... if another site has embedded it").
//  → Conclusión: GEN/VS/Popu NO se pueden incrustar. Van como LINKS a la
//    transmisión oficial (la mejor calidad es YouTube). Solo Trece y Unicanal
//    se embeben (su /en-vivo no bloquea el framing).
import { useEffect, useState } from "preact/hooks";
import { CHANNELS, CH_ORDER } from "../shared/mundial";
import type { ChannelKey, Match } from "../shared/mundial";
import { C, Live } from "./teletext";
import { chOf, matchState, mKey, scoreStr } from "./state";
import type { Indexes } from "./state";

const VS_YT = "https://www.youtube.com/@somosvssports/streams";   // canal de VS en YouTube (siempre anda)

// src = se embebe; sin src = solo links (su señal no se deja incrustar).
// open = a dónde apunta "ABRIR" en la tarjeta de links (por defecto el sitio del
// canal); Popu va al portal en vivo de GEN, que abierto en pestaña SÍ reproduce.
const EMBEDS: Record<ChannelKey, { src?: string; open?: string; note: string }> = {
  gen:   { note: "GEN no deja incrustar su señal. La mejor calidad del partido está en YouTube." },
  trece: { src: "https://trece.com.py/en-vivo/",    note: "Reproductor oficial de Trece. Tocá ▶ adentro si no arranca solo." },
  uni:   { src: "https://unicanal.com.py/en-vivo/", note: "Señal en vivo oficial de Unicanal. Tocá ▶ adentro para arrancar." },
  popu:  { open: "https://www.gen.com.py/live/", note: "Popu TV va por el portal en vivo de GEN (mismo grupo). Tampoco se deja incrustar; abrilo en pestaña nueva." },
  vs:    { note: "VS Sports transmite por la señal de GEN. Su video del partido va por YouTube (mejor calidad)." },
};

// el hash identifica partido+canal. Copiamos el link de COMPARTIR (/s?p=…), que
// trae vista previa linda en WhatsApp/Telegram y redirige a la app por el hash.
function CopyLink() {
  const [done, setDone] = useState(false);
  return (
    <button
      className="tt-btn"
      style={{ color: done ? C.g : C.c, marginLeft: "auto" }}
      title="Copiar el link para compartir esta señal/partido (con vista previa)"
      onClick={() => {
        const p = location.hash.slice(1) || "100";
        const url = `${location.origin}/s?p=${encodeURIComponent(p)}`;
        navigator.clipboard?.writeText(url).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        });
      }}
    >{done ? "COPIADO ✓" : "COMPARTIR"}</button>
  );
}

export function Viewer({ match, ch, idx, nowK, onSwitch, onClose }: {
  match: Match | null; ch: ChannelKey; idx: Indexes; nowK: string;
  onSwitch: (ch: ChannelKey) => void; onClose: () => void;
}) {
  // los portales tardan cuando hay mucha gente → aviso CARGANDO hasta que el
  // iframe dispare load (con tope de 25s por si el evento nunca llega)
  const [loading, setLoading] = useState(true);
  useEffect(() => setLoading(true), [ch, match]);
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setLoading(false), 25_000);
    return () => clearTimeout(t);
  }, [loading, ch, match]);
  const onLoad = () => setLoading(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // la grilla a veces falla (Corea-Chequia salió por Popu/Uni, no GEN/Trece):
  // TODOS los canales son pestañas; los de la grilla primero, el resto apagados
  const grilla: ChannelKey[] = match ? chOf(match) : CH_ORDER;
  const tabs: ChannelKey[] = match ? [...grilla, ...CH_ORDER.filter((k) => !grilla.includes(k))] : CH_ORDER;
  const e = EMBEDS[ch];
  const st = match ? matchState(match, idx, nowK) : null;

  // Link a YouTube (mejor calidad). El scrape del video por partido a veces
  // vuelve vacío desde el datacenter de Lakebed → si lo tenemos, va DIRECTO al
  // partido; si no, al canal de VS Sports (ahí está el vivo igual).
  const vid = match ? idx.video[mKey(match)] : undefined;
  const rawVideo = vid && (vid.vs || vid.gen);
  const ytMatch = rawVideo && rawVideo.includes("youtube.com/embed/")
    ? rawVideo.replace("/embed/", "/watch?v=")
    : undefined;
  const ytHref = ytMatch || VS_YT;
  const ytLabel = ytMatch ? "▶ ESTE PARTIDO EN YOUTUBE — MEJOR CALIDAD ↗" : "▶ VER EN YOUTUBE (VS SPORTS) ↗";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: "#000" }}>
      <div className="mx-auto w-[min(1500px,97vw)] py-2">
        {/* barra superior */}
        <div className="tt-row mb-1">
          <button className="tt-btn" style={{ color: C.r }} onClick={onClose}>◄ VOLVER</button>
          <span style={{ color: C.dim }}>P500</span>
          {match && st ? (
            <span style={{ color: C.y }} className="tt-glow">
              {match.fa} {match.a} {scoreStr(st) ?? "vs"} {match.b} {match.fb}
            </span>
          ) : (
            <span style={{ color: C.y }}>SEÑAL {CHANNELS[ch].name}</span>
          )}
          {st?.live && <Live min={st.min} />}
          {st?.final && st.hs != null && <span style={{ color: C.dim }}>FINAL</span>}
          <CopyLink />
        </div>

        {/* pestañas de canal */}
        <div className="flex gap-1 mb-1 flex-wrap items-baseline">
          {tabs.map((k) => (
            <button
              key={k}
              className={`tt-btn${grilla.includes(k) ? "" : " alt"}`}
              style={k === ch ? { background: CHANNELS[k].color, borderColor: CHANNELS[k].color, color: "#000" } : grilla.includes(k) ? { color: CHANNELS[k].color } : undefined}
              onClick={() => onSwitch(k)}
              title={grilla.includes(k) ? `Ver ${CHANNELS[k].name}` : "No figura en la grilla para este partido — probá igual"}
            >{CHANNELS[k].name}</button>
          ))}
          {match && grilla.length < tabs.length && (
            <span style={{ color: C.dim, fontSize: ".8em" }}>LOS GRISES NO FIGURAN EN LA GRILLA — PROBA IGUAL</span>
          )}
        </div>

        {/* pantalla: Trece/Unicanal se embeben; GEN/VS/Popu son una tarjeta de
            links (su señal no se deja incrustar) */}
        <div className="tt-screen">
          {e.src ? (
            <>
              <iframe
                src={e.src} onLoad={onLoad}
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen
                referrerpolicy="no-referrer-when-downgrade"
              />
              {loading && (
                <div className="tt-load">
                  <span className="tt-blink" style={{ color: C.c }}>● CARGANDO SEÑAL {CHANNELS[ch].name} ●</span>
                  <span style={{ color: C.dim, fontSize: ".75em" }}>LA PAGINA DEL CANAL PUEDE TARDAR SI HAY MUCHA GENTE MIRANDO</span>
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-4 text-center px-6">
              <div className="tt-blink" style={{ color: C.c, fontSize: "1.5em" }}>● SEÑAL {CHANNELS[ch].name} ●</div>
              <div style={{ color: C.y }} className="max-w-xl">
                {st?.live ? "EL PARTIDO ESTÁ EN VIVO." : "ELEGÍ POR DÓNDE VERLO."} {CHANNELS[ch].name} no deja
                incrustar su señal acá — abrila en la transmisión oficial (la mejor calidad es YouTube):
              </div>
              <div className="flex flex-col gap-2 w-full" style={{ maxWidth: "30em" }}>
                <a className="tt-btn tt-glow" style={{ background: C.g, color: "#000", fontSize: "1.15em", padding: ".45em" }} href={ytHref} target="_blank" rel="noopener">{ytLabel}</a>
                <a className="tt-btn" style={{ color: C.c, fontSize: "1.05em", padding: ".4em" }} href={e.open || CHANNELS[ch].url} target="_blank" rel="noopener">ABRIR {CHANNELS[ch].name} EN SU SITIO ↗</a>
              </div>
            </div>
          )}
        </div>

        {/* nota + (para los que se embeben) accesos extra */}
        <div className="tt-row mt-1 flex-wrap items-center gap-2" style={{ fontSize: ".85em" }}>
          <span style={{ color: C.dim }} className="normal-case">{e.note}</span>
          {e.src && (
            <a href={CHANNELS[ch].url} target="_blank" rel="noopener" style={{ color: C.c }}>
              ABRIR EN EL SITIO DE {CHANNELS[ch].name} ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
