// P500 — VISOR: el partido en la misma página. Pestañas = todos los canales
// (los de la grilla primero).
//
// REALIDAD DE LAS SEÑALES (verificado 2026-06-13, partido Brasil-Marruecos):
//  - VS Sports SUBE cada partido a YouTube pero con la INCRUSTACIÓN DESHABILITADA
//    por el dueño → en un iframe da "This video is unavailable" (probado: 4/4 de
//    sus videos del Mundial dan ERROR en contexto embed, aunque abren bien en
//    youtube.com). NINGÚN parámetro lo evita. GEN apunta a esos MISMOS videos en
//    su home → se rompe igual. Por eso el video por partido va como LINK, nunca embed.
//  - El ÚNICO reproductor incrustable es el PORTAL EN VIVO de GEN
//    (gen.com.py/live/): 200, sin X-Frame-Options, reproductor real con selector
//    de canal. Es lo que usa el propio sitio de VS Sports ("GEN 1") para pasar el
//    partido. GEN, Popu y VS (todos Nación Media) van por ahí para verlo EN LA APP.
//  - Trece y Unicanal: su propia página /en-vivo embebida.
import { useEffect, useState } from "preact/hooks";
import { CHANNELS, CH_ORDER } from "../shared/mundial";
import type { ChannelKey, Match } from "../shared/mundial";
import { C, Live } from "./teletext";
import { chOf, matchState, mKey, scoreStr } from "./state";
import type { Indexes } from "./state";

const GEN_LIVE = "https://www.gen.com.py/live/";
const EMBEDS: Record<ChannelKey, { src: string; note: string }> = {
  gen:   { src: GEN_LIVE,                          note: "GEN transmite el partido en su portal en vivo. Tocá ▶ adentro para arrancar." },
  trece: { src: "https://trece.com.py/en-vivo/",    note: "Reproductor oficial de Trece. Tocá ▶ adentro si no arranca solo." },
  uni:   { src: "https://unicanal.com.py/en-vivo/", note: "Señal en vivo oficial de Unicanal. Tocá ▶ adentro para arrancar." },
  popu:  { src: GEN_LIVE,                           note: "Popu TV va por el portal en vivo de GEN (mismo grupo). Tocá ▶ adentro si no arranca." },
  vs:    { src: GEN_LIVE,                           note: "VS Sports transmite por la señal de GEN (mismo grupo, su sitio también lo pasa así). Su video del partido en YouTube no se puede incrustar — abrilo con el botón verde." },
};

// el hash ya identifica partido+canal → la URL del momento ES el deep link
function CopyLink() {
  const [done, setDone] = useState(false);
  return (
    <button
      className="tt-btn"
      style={{ color: done ? C.g : C.c, marginLeft: "auto" }}
      title="Copiar el link directo a esta señal/partido"
      onClick={() => {
        navigator.clipboard?.writeText(location.href).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        });
      }}
    >{done ? "COPIADO ✓" : "COPIAR LINK"}</button>
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

  // video del partido en YouTube (VS/GEN): NO se incrusta (el dueño lo bloqueó),
  // pero SÍ reproduce en youtube.com → lo ofrecemos como link directo al partido
  const rawVideo = match && (ch === "gen" || ch === "vs") ? idx.video[mKey(match)]?.[ch] : undefined;
  const ytWatch = rawVideo && rawVideo.includes("youtube.com/embed/")
    ? rawVideo.replace("/embed/", "/watch?v=")
    : undefined;

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

        {/* pantalla: el portal en vivo del canal (lo único incrustable) */}
        <div className="tt-screen">
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
        </div>

        {/* video directo del partido (YouTube) cuando lo capturamos: NO se puede
            incrustar pero abre y reproduce en YouTube */}
        {ytWatch && (
          <a
            href={ytWatch} target="_blank" rel="noopener"
            className="tt-btn tt-glow block text-center mt-1"
            style={{ color: "#000", background: C.g, fontSize: "1.05em", padding: ".35em" }}
          >▶ VER ESTE PARTIDO EN YOUTUBE ↗</a>
        )}

        {/* nota */}
        <div className="tt-row mt-1" style={{ fontSize: ".85em" }}>
          <span style={{ color: C.dim }} className="normal-case">{e.note}</span>
          <a href={CHANNELS[ch].url} target="_blank" rel="noopener" style={{ color: C.c }}>
            ABRIR EN EL SITIO DE {CHANNELS[ch].name} ↗
          </a>
        </div>
      </div>
    </div>
  );
}
