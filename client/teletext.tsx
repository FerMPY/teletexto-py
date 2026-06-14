// Sistema visual TELETEXTO: paleta saturada sobre negro, fuente de tubo (VT323),
// scanlines, blink y botones "fastext" de colores como los del control remoto.
import type { ComponentChildren } from "preact";

export const TT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=VT323&display=swap');
:root{
  --tt-bg:#000;
  --tt-fg:#e9e9e9;
  --tt-y:#ffd23d;   /* amarillo */
  --tt-c:#46e0e0;   /* cian */
  --tt-g:#3ddc3d;   /* verde */
  --tt-r:#ff4040;   /* rojo */
  --tt-m:#f06df0;   /* magenta */
  --tt-b:#1414c8;   /* azul de fondo de barras */
  --tt-dim:#7d7d7d;
}
html,body{background:var(--tt-bg);}
.tt{
  font-family:'VT323',ui-monospace,monospace;
  background:var(--tt-bg); color:var(--tt-fg);
  font-size:clamp(17px,2.4vw,23px); line-height:1.25;
  letter-spacing:.02em;
  min-height:100vh;
  text-transform:uppercase;
}
.tt ::selection{background:var(--tt-y);color:#000}
.tt-glow{text-shadow:0 0 6px currentColor}
/* scanlines + viñeta de tubo — z-index BAJO el visor (z-50): el efecto es para
   el teletexto, no para ensuciar los videos embebidos */
.tt-crt::after{
  content:""; position:fixed; inset:0; pointer-events:none; z-index:40;
  background:
    repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0 2px, rgba(0,0,0,.22) 2px 4px),
    radial-gradient(ellipse at center, rgba(0,0,0,0) 60%, rgba(0,0,0,.35) 100%);
}
@keyframes ttblink{0%,49%{opacity:1}50%,100%{opacity:0}}
.tt-blink{animation:ttblink 1.06s steps(1) infinite}
/* título doble altura estilo teletexto */
.tt-h{
  font-size:1.9em; line-height:1; letter-spacing:.04em;
  transform:scaleY(1.25); transform-origin:top left;
}
.tt-bar{background:var(--tt-b); padding:.05em .35em;}
/* fila de partido: aire + línea tenue para separar partido de partido */
.tt-row{display:flex; gap:.6em; align-items:baseline; flex-wrap:wrap; padding:.3em .3em;}
.tt-row + .tt-row, div + div > .tt-row{border-top:1px solid #181818}
.tt-row.py{background:linear-gradient(90deg, rgba(255,64,64,.22), rgba(20,20,200,.22)); outline:1px solid rgba(255,64,64,.4)}
.tt-row.past{opacity:.55}
/* botones de canal y fastext */
.tt-btn{
  font:inherit; text-transform:uppercase; cursor:pointer;
  background:#111; border:1px solid var(--tt-dim); color:var(--tt-fg);
  padding:0 .45em; line-height:1.35;
}
.tt-btn:hover{background:var(--tt-y); border-color:var(--tt-y); color:#000}
/* canal que NO figura en la grilla para ese partido: apagado pero probable
   (la grilla a veces miente — el usuario lo comprobó con Corea-Chequia) */
.tt-btn.alt{color:#555; border-color:#2a2a2a; background:#0a0a0a}
.tt-btn.alt:hover{background:var(--tt-y); border-color:var(--tt-y); color:#000}
/* la flechita de "ver": chiquita y pegada al nombre (el glifo ▶ cae a otra
   fuente y a tamaño normal mete un espacio feo) */
.tt-btn.ch::after{content:"▶"; font-size:.55em; margin-left:.3em; vertical-align:.12em}
.tt-fast{display:flex; gap:2px; flex-wrap:wrap}
.tt-fast .tt-btn{flex:1; border:none; color:#000; font-size:1.05em; padding:.15em .4em; text-align:center; min-width:7em}
.tt-fast .f-r{background:var(--tt-r)} .tt-fast .f-g{background:var(--tt-g)}
.tt-fast .f-y{background:var(--tt-y)} .tt-fast .f-c{background:var(--tt-c)}
.tt-fast .f-m{background:var(--tt-m)}
.tt-fast .tt-btn:hover{filter:brightness(1.25)}
.tt-fast .on{outline:3px solid #fff; outline-offset:-3px}
/* chips de filtro */
.tt-chip{background:transparent;border:none;color:var(--tt-c);cursor:pointer;font:inherit;text-transform:uppercase;padding:0 .2em}
.tt-chip:hover{color:#fff}
.tt-chip.on{background:var(--tt-c);color:#000}
/* inputs del prode */
.tt-in{
  width:2.2em; font:inherit; text-align:center; background:#101010;
  border:1px solid var(--tt-dim); color:var(--tt-y); padding:0;
}
.tt-in:focus{outline:2px solid var(--tt-y)}
/* pantalla del visor */
.tt-screen{position:relative; width:100%; aspect-ratio:16/9; background:#050505; overflow:hidden; border:1px solid #333}
.tt-screen iframe{width:100%; height:100%; border:0; position:relative; z-index:1}
/* aviso de carga: los portales tardan con mucha gente; queda DEBAJO del iframe
   (z 0) y además se saca en el evento load — doble seguro */
.tt-load{
  position:absolute; inset:0; z-index:0; display:flex; flex-direction:column;
  align-items:center; justify-content:center; gap:.6em; text-align:center;
  padding:1em; font-size:1.15em;
}
/* resaltado al llegar desde el chip PRODE de la agenda */
@keyframes tthl{0%,70%{outline:3px solid var(--tt-m); background:rgba(240,109,240,.14)}100%{outline:0}}
.tt-hl{animation:tthl 2.4s}
/* aviso central (ej: "no hay partidos en vivo") — caja teletexto que no se
   pierda: grande, al medio, y se va sola */
.tt-flash{
  position:fixed; left:50%; top:38%; transform:translateX(-50%);
  z-index:96; background:var(--tt-b); color:var(--tt-y);
  padding:.4em .9em; font-size:clamp(20px,3vw,30px); text-align:center;
  box-shadow:0 0 0 4px #000, 0 0 30px rgba(20,20,200,.6);
}
/* subtítulo de gol (toast) estilo teletexto */
.tt-sub{
  position:fixed; left:50%; transform:translateX(-50%);
  bottom:8vh; z-index:95; cursor:pointer; border:none; font:inherit;
  background:#000; color:var(--tt-y); text-transform:uppercase;
  padding:.2em .6em; box-shadow:0 0 0 3px #000; text-align:center;
  font-size:clamp(18px,2.6vw,26px);
}
.tt-sub .s2{color:#fff; display:block; font-size:.8em}
/* ---- modos monocromo (novedad retro): solo reescriben la paleta, el video del
   visor NO usa estas variables así que queda intacto ---- */
.tt-amber{--tt-fg:#ffb454; --tt-y:#ffc973; --tt-c:#ffb454; --tt-g:#ffd591; --tt-r:#ff8c42; --tt-m:#ffae5e; --tt-dim:#9c6b2e; --tt-b:#3a2400}
.tt-green{--tt-fg:#7cfc7c; --tt-y:#b6ffb6; --tt-c:#7cfc7c; --tt-g:#9dff9d; --tt-r:#5fd35f; --tt-m:#8cff8c; --tt-dim:#3f8f3f; --tt-b:#0b2e0b}
/* ---- cinta de partidos en vivo ---- */
.tt-ticker{display:flex; align-items:stretch; border:1px solid #1d1d1d; background:#070707; margin:.25em 0; overflow:hidden}
.tt-ticker-tag{flex:none; background:var(--tt-g); color:#000; padding:0 .5em; display:flex; align-items:center; font-size:.9em; letter-spacing:.05em}
.tt-ticker-win{position:relative; overflow:hidden; flex:1}
.tt-tape{display:inline-flex; align-items:center; white-space:nowrap; will-change:transform; animation-name:ttmarquee; animation-timing-function:linear; animation-iteration-count:infinite}
.tt-ticker-win:hover .tt-tape{animation-play-state:paused}
@keyframes ttmarquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.tt-tape-item{font:inherit; text-transform:uppercase; background:transparent; border:none; color:inherit; cursor:pointer; padding:0 .25em}
.tt-tape-item:hover{color:#fff}
.tt-tape-sep{padding:0 1.2em; color:var(--tt-dim)}
/* ---- barra de preferencias (modo) ---- */
.tt-set{display:flex; gap:.6em; align-items:center; flex-wrap:wrap; font-size:.82em}
.tt-set .tt-chip{border:1px solid #2a2a2a; padding:0 .35em}
.tt-set .tt-chip.on{border-color:currentColor}
@media (max-width:640px){ .tt-row{gap:.35em} .tt-fast .tt-btn{min-width:5em} .tt-ticker-tag{font-size:.78em} }
`;

export const C = {
  y: "var(--tt-y)", c: "var(--tt-c)", g: "var(--tt-g)",
  r: "var(--tt-r)", m: "var(--tt-m)", dim: "var(--tt-dim)", fg: "var(--tt-fg)",
};

export function TitleBar({ children, color = C.y }: { children: ComponentChildren; color?: string }) {
  return (
    <div className="tt-h tt-bar tt-glow mb-4 mt-2" style={{ color }}>
      {children}
    </div>
  );
}

export function Sep({ color = C.c, label }: { color?: string; label?: string }) {
  return (
    <div style={{ color }} className="overflow-hidden whitespace-nowrap select-none">
      {label ? `${label} ` : ""}{"·".repeat(120)}
    </div>
  );
}

export function Live({ min }: { min?: string | null }) {
  return (
    <span style={{ color: C.g }} className="tt-glow">
      <span className="tt-blink">●</span> EN VIVO{min ? ` ${min}` : ""}
    </span>
  );
}
