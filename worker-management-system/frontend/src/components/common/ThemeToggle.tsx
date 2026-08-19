import { useEffect, useState } from "react";

const THEME_KEY = "ktcTheme";
type Theme = "light" | "dark";

const readTheme = (): Theme => {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const applyTheme = (theme: Theme) => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
};

export default function ThemeToggle() {
    const [theme, setTheme] = useState<Theme>(() => readTheme());

    useEffect(() => {
        applyTheme(theme);
        localStorage.setItem(THEME_KEY, theme);
        window.dispatchEvent(new CustomEvent("ktc:theme-change", { detail: theme }));
    }, [theme]);

    return (
        <button
            type="button"
            className="ktc-theme-toggle"
            onClick={() => setTheme(current => current === "dark" ? "light" : "dark")}
            title={theme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
            aria-label={theme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
        >
            <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
            <span className="ktc-theme-toggle-label">{theme === "dark" ? "Sáng" : "Tối"}</span>
        </button>
    );
}
