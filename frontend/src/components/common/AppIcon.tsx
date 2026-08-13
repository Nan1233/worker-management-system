import type { CSSProperties, SVGProps } from "react";

type IconName =
    | "dashboard"
    | "pending"
    | "approved"
    | "workers"
    | "system"
    | "statistics"
    | "logout"
    | "process"
    | "history"
    | "bell"
    | "user"
    | "download"
    | "sheet"
    | "clock"
    | "ok"
    | "warning"
    | "settings"
    | "search"
    | "spark"
    | "checklist"
    | "cut"
    | "grind"
    | "caliper"
    | "inspect"
    | "verify"
    | "roller"
    | "press"
    | "deburr"
    | "assembly";

interface AppIconProps extends SVGProps<SVGSVGElement> {
    name: IconName;
    size?: number;
}

function Path(props: SVGProps<SVGPathElement>) {
    return <path fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...props} />;
}

function AppIcon({ name, size = 20, style, ...rest }: AppIconProps) {
    const svgStyle: CSSProperties = {
        width: size,
        height: size,
        display: "block",
        ...style
    };

    return (
        <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
            style={svgStyle}
            {...rest}
        >
            {name === "dashboard" && (
                <>
                    <Path d="M4 13.5h6.5V20H4z" />
                    <Path d="M13.5 4H20v9h-6.5z" />
                    <Path d="M13.5 16.5H20V20h-6.5z" />
                    <Path d="M4 4h6.5v6H4z" />
                </>
            )}
            {name === "pending" && (
                <>
                    <Path d="M8 4.5h8" />
                    <Path d="M9 2.5h6v4H9z" />
                    <Path d="M8 7H6.5A2.5 2.5 0 0 0 4 9.5v8A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5v-8A2.5 2.5 0 0 0 17.5 7H16" />
                    <Path d="M12 10v3.5l2.5 1.5" />
                    <Path d="M12 9.5a4 4 0 1 1 0 8 4 4 0 0 1 0-8" />
                </>
            )}
            {name === "approved" && (
                <>
                    <Path d="M7.5 4.5h9l2 2v12a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-12a2 2 0 0 1 2-2z" />
                    <Path d="M9 12.5l2 2 4-5" />
                    <Path d="M9 8.5h6" />
                </>
            )}
            {name === "workers" && (
                <>
                    <Path d="M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                    <Path d="M15.5 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
                    <Path d="M4.5 19a4.5 4.5 0 0 1 8 0" />
                    <Path d="M12.5 19a3.8 3.8 0 0 1 6.5-2.5" />
                </>
            )}
            {name === "system" && (
                <>
                    <Path d="M12 3.5a2.5 2.5 0 0 1 2.5 2.5c0 1.3.6 2.6 1.6 3.5l.6.6c.9.9 1.3 2 1.3 3.2V15H6v-1.7c0-1.2.4-2.3 1.3-3.2l.6-.6A4.9 4.9 0 0 0 9.5 6 2.5 2.5 0 0 1 12 3.5z" />
                    <Path d="M10 18a2 2 0 0 0 4 0" />
                </>
            )}
            {name === "statistics" && (
                <>
                    <Path d="M4 19.5h16" />
                    <Path d="M7 16v-4" />
                    <Path d="M12 16V8" />
                    <Path d="M17 16v-7" />
                    <Path d="M6 9l4-3 3 2 5-4" />
                </>
            )}
            {name === "logout" && (
                <>
                    <Path d="M10 5H6.5A2.5 2.5 0 0 0 4 7.5v9A2.5 2.5 0 0 0 6.5 19H10" />
                    <Path d="M13 8l4 4-4 4" />
                    <Path d="M9 12h8" />
                </>
            )}
            {name === "process" && (
                <>
                    <Path d="M6.5 7h4V4H6.5z" />
                    <Path d="M13.5 12h4V9h-4z" />
                    <Path d="M6.5 17h4v-3h-4z" />
                    <Path d="M10.5 5.5h2a2 2 0 0 1 2 2V9" />
                    <Path d="M10.5 15.5h2a2 2 0 0 0 2-2v-1.5" />
                </>
            )}
            {name === "history" && (
                <>
                    <Path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
                    <Path d="M4 5v4h4" />
                    <Path d="M12 8v4l2.5 1.5" />
                </>
            )}
            {name === "bell" && (
                <>
                    <Path d="M12 4a3.5 3.5 0 0 1 3.5 3.5v1.1c0 1.2.5 2.3 1.3 3.1l.7.7V14H6.5v-1.6l.7-.7a4.4 4.4 0 0 0 1.3-3.1V7.5A3.5 3.5 0 0 1 12 4z" />
                    <Path d="M10 17.5a2 2 0 0 0 4 0" />
                </>
            )}
            {name === "user" && (
                <>
                    <Path d="M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
                    <Path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
                </>
            )}
            {name === "download" && (
                <>
                    <Path d="M12 4v10" />
                    <Path d="M8.5 10.5 12 14l3.5-3.5" />
                    <Path d="M5 18.5h14" />
                </>
            )}
            {name === "sheet" && (
                <>
                    <Path d="M8 3.5h7l3 3V19a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 7 19V5a1.5 1.5 0 0 1 1-1.5z" />
                    <Path d="M15 3.5V7h3" />
                    <Path d="M10 11h5" />
                    <Path d="M10 14h5" />
                    <Path d="M10 17h3" />
                </>
            )}
            {name === "clock" && (
                <>
                    <Path d="M12 5a7 7 0 1 1 0 14 7 7 0 0 1 0-14z" />
                    <Path d="M12 8.5V12l2.5 1.5" />
                </>
            )}
            {name === "ok" && (
                <>
                    <Path d="M12 4.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15z" />
                    <Path d="m8.8 12.2 2.1 2.1 4.3-4.8" />
                </>
            )}
            {name === "warning" && (
                <>
                    <Path d="M12 5.5 19 18H5z" />
                    <Path d="M12 10v3.5" />
                    <Path d="M12 16h.01" />
                </>
            )}
            {name === "settings" && (
                <>
                    <Path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" />
                    <Path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.4 1a7.5 7.5 0 0 0-2.1-1.2L14 3h-4l-.4 2.7a7.5 7.5 0 0 0-2.1 1.2l-2.4-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.4-1a7.5 7.5 0 0 0 2.1 1.2L10 21h4l.4-2.7a7.5 7.5 0 0 0 2.1-1.2l2.4 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" />
                </>
            )}
            {name === "search" && (
                <>
                    <Path d="M11 5a6 6 0 1 1 0 12 6 6 0 0 1 0-12z" />
                    <Path d="m16 16 3.5 3.5" />
                </>
            )}
            {name === "spark" && (
                <>
                    <Path d="M12 3.5 13.5 8 18 9.5 13.5 11 12 15.5 10.5 11 6 9.5 10.5 8 12 3.5z" />
                    <Path d="M18.5 3.5v3" />
                    <Path d="M20 5h-3" />
                </>
            )}
            {name === "checklist" && (
                <>
                    <Path d="M8 6.5h9" />
                    <Path d="M8 12h9" />
                    <Path d="M8 17.5h9" />
                    <Path d="M4.5 6.5h.01" />
                    <Path d="M4.5 12h.01" />
                    <Path d="M4.5 17.5h.01" />
                </>
            )}
            {name === "cut" && (
                <>
                    <Path d="M7 7.5a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5z" />
                    <Path d="M7 12.2 17.5 5.5" />
                    <Path d="M7.2 12.8 17.5 18.5" />
                    <Path d="M15.2 9 19 5.3" />
                    <Path d="M15.2 15 19 18.7" />
                </>
            )}
            {name === "grind" && (
                <>
                    <Path d="M9.5 8a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z" />
                    <Path d="M9.5 6V4.5" />
                    <Path d="M9.5 19.5V18" />
                    <Path d="M7 9 5.8 7.8" />
                    <Path d="M12 15 13.2 16.2" />
                    <Path d="M5.5 12.5H4" />
                    <Path d="M15 12.5h-1.5" />
                    <Path d="M7 16 5.8 17.2" />
                    <Path d="M15 7.8 19.2 5.4" />
                    <Path d="M17.2 7 18.8 10.3" />
                    <Path d="M16.6 11.5h2.4" />
                </>
            )}
            {name === "caliper" && (
                <>
                    <Path d="M5 7.5h8.5" />
                    <Path d="M5 7.5v9" />
                    <Path d="M8 7.5v4" />
                    <Path d="M8 11.5h5.5" />
                    <Path d="M13.5 5v11.5" />
                    <Path d="M13.5 16.5H19" />
                    <Path d="M10.5 4.5V8" />
                    <Path d="M10.5 16v3.5" />
                </>
            )}
            {name === "inspect" && (
                <>
                    <Path d="M7 5.5h7v9H7z" />
                    <Path d="M9 8.5h3" />
                    <Path d="M9 11h2.2" />
                    <Path d="M15 15l3.5 3.5" />
                    <Path d="M14 12.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
                </>
            )}
            {name === "verify" && (
                <>
                    <Path d="M7 5.5h10v13H7z" />
                    <Path d="M10 5.5h4" />
                    <Path d="M9 10.5h6" />
                    <Path d="M9 14h2.5" />
                    <Path d="m10 13.8 1.2 1.2 2.6-2.8" />
                </>
            )}
            {name === "roller" && (
                <>
                    <Path d="M6.5 8.5h11" />
                    <Path d="M5 12h14" />
                    <Path d="M6.5 15.5h11" />
                    <Path d="M8 8.5V6" />
                    <Path d="M16 8.5V6" />
                    <Path d="M7 18a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" />
                    <Path d="M17 18a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" />
                </>
            )}
            {name === "press" && (
                <>
                    <Path d="M8 5.5h8" />
                    <Path d="M9.5 5.5v3.5" />
                    <Path d="M14.5 5.5v3.5" />
                    <Path d="M7 9h10v3H7z" />
                    <Path d="M6 14h12" />
                    <Path d="M10 14v4" />
                    <Path d="M14 14v4" />
                    <Path d="M10.5 11.5h3" />
                </>
            )}
            {name === "deburr" && (
                <>
                    <Path d="M7.5 6.5h8" />
                    <Path d="M8.5 6.5V5" />
                    <Path d="M12 6.5V4" />
                    <Path d="M15.5 6.5V5" />
                    <Path d="M8 9h8v7a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z" />
                    <Path d="M10.2 11.5h3.6" />
                    <Path d="M10.2 14h3.6" />
                    <Path d="M12 10v5.5" />
                </>
            )}
            {name === "assembly" && (
                <>
                    <Path d="M6 8.5h5v5H6z" />
                    <Path d="M13 10.5h5v5h-5z" />
                    <Path d="M8.5 13.5V16a2 2 0 0 0 2 2H13" />
                    <Path d="M13 7h-2.5a2 2 0 0 0-2 2v.5" />
                </>
            )}

        </svg>
    );
}

export default AppIcon;
export type { IconName };
