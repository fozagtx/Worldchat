import { useEffect, useState } from "react";

export type ThemeId = "cream" | "radio-blue";

function readTheme(): ThemeId {
  try {
    return localStorage.getItem("worldchat.theme") === "radio-blue" ? "radio-blue" : "cream";
  } catch {
    return "cream";
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeId>(readTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("worldchat.theme", theme);
    } catch {}
  }, [theme]);

  return [theme, setTheme] as const;
}
