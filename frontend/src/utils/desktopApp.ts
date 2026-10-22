/** True when running inside the KTC Desktop app (Electron shell). */
export function isDesktopApp(): boolean {
    return typeof window !== "undefined" && Boolean(window.ktcDesktop?.isDesktop);
}
