// Barra de preferencias (MODO): tubo CRT, paleta monocromo, pitido y aviso de
// gol. Colapsada por defecto para no ensuciar la cabecera.
import { useState } from "preact/hooks";
import { C } from "./teletext";
import { usePrefs } from "./prefs";
import type { Theme } from "./prefs";
import { askNotifyPermission, goalBeep } from "./alerts";

const THEMES: [Theme, string][] = [["color", "COLOR"], ["amber", "ÁMBAR"], ["green", "VERDE"]];

export function Settings() {
  const { prefs, set } = usePrefs();
  const [open, setOpen] = useState(false);

  const chip = (on: boolean, label: string, onClick: () => void, color = C.c) => (
    <button className={`tt-chip${on ? " on" : ""}`} style={{ color: on ? "#000" : color, background: on ? color : undefined }} onClick={onClick}>{label}</button>
  );

  return (
    <div className="tt-set mt-1" style={{ color: C.dim }}>
      <button className="tt-chip" style={{ color: open ? C.y : C.dim }} onClick={() => setOpen((o) => !o)} title="Preferencias">⚙ MODO</button>
      {open && (
        <>
          {chip(prefs.crt, "CRT", () => set({ crt: !prefs.crt }))}
          <span style={{ color: "#2a2a2a" }}>│</span>
          {THEMES.map(([t, label]) => chip(prefs.theme === t, label, () => set({ theme: t }), C.y))}
          <span style={{ color: "#2a2a2a" }}>│</span>
          {chip(prefs.sfx, "🔊 GOL", () => { const on = !prefs.sfx; set({ sfx: on }); if (on) goalBeep(); }, C.g)}
          {chip(prefs.notify, "🔔 AVISO", async () => {
            if (prefs.notify) { set({ notify: false }); return; }
            const ok = await askNotifyPermission();
            set({ notify: ok });
          }, C.g)}
        </>
      )}
    </div>
  );
}
