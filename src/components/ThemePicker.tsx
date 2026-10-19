import { useEffect, useRef, useState } from "react";
import type { ThemeId } from "../lib/theme";

export default function ThemePicker({ theme, onChange }: { theme: ThemeId; onChange: (theme: ThemeId) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const changeTheme = (nextTheme: ThemeId) => {
    const html = document.documentElement;
    html.dataset.theme = nextTheme;
    html.classList.add("theme-changing");
    window.setTimeout(() => html.classList.remove("theme-changing"), 500);
    onChange(nextTheme);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="theme-picker" ref={root}>
      {open && (
        <section className="theme-popover" aria-label="Choose theme">
          <strong>Choose theme</strong>
          <button className={`theme-choice ${theme === "cream" ? "selected" : ""}`} type="button" aria-pressed={theme === "cream"} onClick={() => changeTheme("cream")}>
            <span className="theme-preview theme-preview-cream"><i /></span>
            <span className="theme-choice-copy"><b>Cream</b><small>Worldchat classic</small></span>
          </button>
          <button className={`theme-choice ${theme === "radio-blue" ? "selected" : ""}`} type="button" aria-pressed={theme === "radio-blue"} onClick={() => changeTheme("radio-blue")}>
            <span className="theme-preview theme-preview-blue"><i /></span>
            <span className="theme-choice-copy"><b>Night</b><small>Theme of the week · dark</small></span>
            <span className="theme-week">WEEKLY</span>
          </button>
        </section>
      )}
      <button className="theme-toggle" type="button" aria-label="Choose theme" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="theme-toggle-orb" />
      </button>
    </div>
  );
}
