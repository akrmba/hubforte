import { createContext, useContext, useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  resolvedTheme: "light" | "dark";
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  setTheme: () => {},
  resolvedTheme: "light",
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try { return (localStorage.getItem("hubforte-theme") as Theme) || "system"; } catch { return "system"; }
  });

  const getResolved = (t: Theme): "light" | "dark" => {
    if (t === "system") return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    return t;
  };

  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() => getResolved(theme));

  const applyTheme = (t: Theme) => {
    const resolved = getResolved(t);
    setResolvedTheme(resolved);
    document.documentElement.classList.toggle("dark", resolved === "dark");
  };

  useEffect(() => {
    applyTheme(theme);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => { if (theme === "system") applyTheme("system"); };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = (t: Theme) => {
    try { localStorage.setItem("hubforte-theme", t); } catch {}
    setThemeState(t);
    applyTheme(t);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const options: { value: Theme; icon: React.ReactNode; label: string }[] = [
    { value: "light", icon: <Sun className="w-4 h-4" />, label: "Light" },
    { value: "dark", icon: <Moon className="w-4 h-4" />, label: "Dark" },
    { value: "system", icon: <Monitor className="w-4 h-4" />, label: "System" },
  ];
  const current = options.find(o => o.value === theme) || options[2];
  const next = options[(options.indexOf(current) + 1) % options.length];
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(next.value)}
      title={`Switch to ${next.label} mode`}
      className="h-8 w-8"
    >
      {current.icon}
    </Button>
  );
}
