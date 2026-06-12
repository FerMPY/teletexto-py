// P500 — VISOR: el partido en la misma página. Pestañas = todos los canales
// (los de la grilla primero). GEN/VS abren el video del partido en YouTube
// cuando existe; Trece/Unicanal embeben su página en vivo entera; Popu va por
// el portal en vivo de GEN (mismo grupo Nación Media — su embed de YouTube no
// anda, verificado en partido por el usuario).
import { useEffect, useState } from "preact/hooks";
import { CHANNELS, CH_ORDER } from "../shared/mundial";
import type { ChannelKey, Match } from "../shared/mundial";
import { C, Live } from "./teletext";
import { chOf, matchState, mKey, scoreStr } from "./state";
import type { Indexes } from "./state";

const EMBEDS: Record<ChannelKey, { type: "iframe" | "yt"; src?: string; channel?: string; note: string; matchOnly?: boolean }> = {
  // GEN, simple (pedido del usuario): video del partido si lo capturamos; si no,
  // tarjeta SIN SEÑAL. matchOnly = su canal de YouTube pasa sus programas, no
  // los partidos.
  gen:   { type: "yt", channel: "UC9FQShRxvepLNn6lLfvBhyA", src: "https://www.gen.com.py/", matchOnly: true, note: "GEN — el video del partido aparece acá cerca de la hora." },
  trece: { type: "iframe", src: "https://trece.com.py/en-vivo/",    note: "Reproductor oficial de Trece. Tocá ▶ adentro si no arranca solo." },
  uni:   { type: "iframe", src: "https://unicanal.com.py/en-vivo/", note: "Señal en vivo oficial de Unicanal. Tocá ▶ adentro para arrancar." },
  popu:  { type: "iframe", src: "https://www.gen.com.py/live/",     note: "Popu TV — su señal va en el portal en vivo de GEN (mismo grupo). Tocá ▶ adentro si no arranca." },
  vs:    { type: "yt", channel: "UCj0RBdETcbD-mChW-ylt-sw",         note: "VS Sports — su video del partido en YouTube." },
};

const ytSrc = (url: string) => `${url}${url.includes("?") ? "&" : "?"}autoplay=1`;

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
  // fallbacks a pedido desde la tarjeta: "site" = sitio embebido, "yt" = señal
  // del canal de YouTube (para GEN no sabemos cuál anda en partido — probamos ambos)
  const [force, setForce] = useState<null | "site" | "yt">(null);
  useEffect(() => setForce(null), [ch, match]);

  // los portales tardan cuando hay mucha gente → aviso CARGANDO hasta que el
  // iframe dispare load (con tope de 25s por si el evento nunca llega)
  const [loading, setLoading] = useState(true);
  useEffect(() => setLoading(true), [ch, match, force]);
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setLoading(false), 25_000);
    return () => clearTimeout(t);
  }, [loading, ch, match, force]);
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
  const matchVideo = match && (ch === "gen" || ch === "vs") ? idx.video[mKey(match)]?.[ch] : undefined;
  const st = match ? matchState(match, idx, nowK) : null;

  // sin video del partido → tarjeta. Antes de la hora para todos los canales de
  // YouTube (su embed "live" da un feo "unavailable"); para GEN también durante
  // el partido (matchOnly: su canal pasa sus programas, no el partido).
  const noFeed = !matchVideo && e.type === "yt" && match && st && !st.final && !force &&
    (!st.live || e.matchOnly);

  let frame;
  if (noFeed) {
    frame = (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-center px-4">
        <div className="tt-blink" style={{ color: C.c, fontSize: "1.6em" }}>● SIN SEÑAL {st.live ? "ACA" : "TODAVIA"} ●</div>
        {st.live ? (
          <>
            <div style={{ color: C.y }}>EL VIDEO DEL PARTIDO NO NOS LLEGO — MIRALO EN EL SITIO DE {CHANNELS[ch].name}</div>
            <a className="tt-btn" style={{ color: C.g, fontSize: "1.2em" }} href={CHANNELS[ch].url} target="_blank" rel="noopener">ABRIR {CHANNELS[ch].name} EN VIVO ↗</a>
          </>
        ) : (
          <>
            <div style={{ color: C.y }}>{CHANNELS[ch].name} PRENDE SU TRANSMISION CERCA DE LAS {match.t}</div>
            <div style={{ color: C.dim }} className="text-[.85em]">VOLVE A ESTA PAGINA CUANDO ARRANQUE EL PARTIDO</div>
          </>
        )}
        <div className="flex gap-2 flex-wrap justify-center">
          {e.src && <button className="tt-btn" style={{ color: C.c }} onClick={() => setForce("site")}>VER EL SITIO DE {CHANNELS[ch].name} ACA MISMO</button>}
          <button className="tt-btn" style={{ color: C.c }} onClick={() => setForce("yt")}>PROBAR SEÑAL YOUTUBE</button>
        </div>
      </div>
    );
  } else if (matchVideo) {
    frame = <iframe src={ytSrc(matchVideo)} onLoad={onLoad} allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen />;
  } else if (force === "site" && e.src) {
    // sitio del canal entero embebido (scrolleás a su player vos)
    frame = <iframe src={e.src} onLoad={onLoad} allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen referrerpolicy="no-referrer-when-downgrade" />;
  } else if (e.type === "yt" && force !== "site") {
    frame = <iframe src={ytSrc(`https://www.youtube.com/embed/live_stream?channel=${e.channel}`)} onLoad={onLoad} allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen />;
  } else {
    frame = <iframe src={e.src} onLoad={onLoad} allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen referrerpolicy="no-referrer-when-downgrade" />;
  }

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

        {/* pantalla */}
        <div className="tt-screen">
          {frame}
          {loading && !noFeed && (
            <div className="tt-load">
              <span className="tt-blink" style={{ color: C.c }}>● CARGANDO SEÑAL {CHANNELS[ch].name} ●</span>
              <span style={{ color: C.dim, fontSize: ".75em" }}>LA PAGINA DEL CANAL PUEDE TARDAR SI HAY MUCHA GENTE MIRANDO</span>
            </div>
          )}
        </div>

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
