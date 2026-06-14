// Pitido de gol (WebAudio) + aviso del navegador. Todo client-only y sin red:
// no toca la cuota de Lakebed, se dispara desde los goles que ya detectamos.
import type { Toast } from "./state";

// El audio del navegador está bloqueado hasta que el usuario toca algo. Creamos
// el contexto en el primer gesto y lo dejamos listo para el pitido del gol.
let actx: AudioContext | null = null;
export function unlockAudio() {
  if (actx) { if (actx.state === "suspended") void actx.resume(); return; }
  try {
    const AC = (window.AudioContext || (window as any).webkitAudioContext);
    if (AC) actx = new AC();
  } catch { /* sin audio se vive igual */ }
}

// pitido corto de dos tonos, tipo aviso de teletexto
export function goalBeep() {
  unlockAudio();
  if (!actx) return;
  const now = actx.currentTime;
  for (const [i, f] of [880, 1320].entries()) {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = "square"; o.frequency.value = f;
    const t = now + i * 0.13;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(actx.destination);
    o.start(t); o.stop(t + 0.13);
  }
}

// pide permiso (necesita gesto del usuario → llamalo al prender el toggle)
export async function askNotifyPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try { return (await Notification.requestPermission()) === "granted"; } catch { return false; }
}

// aviso del navegador SOLO si la pestaña está de fondo (si la estás mirando, ya
// ves el subtítulo de gol — no hace falta molestar)
export function notifyGoal(t: Toast) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (!document.hidden) return;
  try {
    new Notification(`⚽ ${t.title}`, { body: t.sub, tag: `gol-${t.match.a}-${t.match.b}`, icon: "/api/icon.svg" });
  } catch { /* algunos navegadores exigen SW para notificar; lo dejamos pasar */ }
}
