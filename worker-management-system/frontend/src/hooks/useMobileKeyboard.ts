import { useCallback, useEffect, useRef, useState } from "react";

const KEYBOARD_OPEN_THRESHOLD = 110;
const MOBILE_MAX_WIDTH = 900;

const isEditableElement = (element: Element | null): element is HTMLElement =>
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    (element instanceof HTMLElement && element.isContentEditable);

export function useMobileKeyboard() {
    const [keyboardOpen, setKeyboardOpen] = useState(false);
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const baselineHeightRef = useRef(0);

    useEffect(() => {
        const viewport = window.visualViewport;

        const getVisibleHeight = () => viewport?.height ?? window.innerHeight;

        const updateBaseline = () => {
            const activeElement = document.activeElement;
            if (!isEditableElement(activeElement)) {
                baselineHeightRef.current = Math.max(
                    baselineHeightRef.current,
                    window.innerHeight,
                    getVisibleHeight(),
                );
            }
        };

        const updateKeyboardState = () => {
            const activeElement = document.activeElement;
            const hasEditableFocus = isEditableElement(activeElement);
            const isMobileWidth = window.innerWidth <= MOBILE_MAX_WIDTH;
            const visibleHeight = getVisibleHeight();
            const viewportOffsetTop = viewport?.offsetTop ?? 0;

            if (!baselineHeightRef.current) {
                baselineHeightRef.current = Math.max(window.innerHeight, visibleHeight);
            }

            if (!hasEditableFocus) {
                updateBaseline();
            }

            const estimatedHeight = Math.max(
                0,
                baselineHeightRef.current - visibleHeight - viewportOffsetTop,
            );

            const open =
                isMobileWidth &&
                hasEditableFocus &&
                estimatedHeight > KEYBOARD_OPEN_THRESHOLD;

            setKeyboardOpen(open);
            setKeyboardHeight(open ? estimatedHeight : 0);

            document.documentElement.classList.toggle("mobile-keyboard-open", open);
            document.documentElement.style.setProperty(
                "--mobile-keyboard-height",
                `${open ? estimatedHeight : 0}px`,
            );
        };

        const revealFocusedField = (target: HTMLElement) => {
            window.setTimeout(() => {
                updateKeyboardState();
                target.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                    inline: "nearest",
                });
            }, 280);
        };

        const handleFocusIn = (event: FocusEvent) => {
            const target = event.target;
            if (target instanceof HTMLElement && isEditableElement(target)) {
                revealFocusedField(target);
            }
        };

        const handleFocusOut = () => {
            window.setTimeout(updateKeyboardState, 120);
        };

        const handleOrientationChange = () => {
            baselineHeightRef.current = 0;
            window.setTimeout(updateKeyboardState, 350);
        };

        updateBaseline();
        updateKeyboardState();

        viewport?.addEventListener("resize", updateKeyboardState);
        viewport?.addEventListener("scroll", updateKeyboardState);
        window.addEventListener("resize", updateKeyboardState);
        window.addEventListener("orientationchange", handleOrientationChange);
        document.addEventListener("focusin", handleFocusIn);
        document.addEventListener("focusout", handleFocusOut);

        return () => {
            viewport?.removeEventListener("resize", updateKeyboardState);
            viewport?.removeEventListener("scroll", updateKeyboardState);
            window.removeEventListener("resize", updateKeyboardState);
            window.removeEventListener("orientationchange", handleOrientationChange);
            document.removeEventListener("focusin", handleFocusIn);
            document.removeEventListener("focusout", handleFocusOut);
            document.documentElement.classList.remove("mobile-keyboard-open");
            document.documentElement.style.removeProperty("--mobile-keyboard-height");
        };
    }, []);

    const hideKeyboard = useCallback(() => {
        const activeElement = document.activeElement;
        if (isEditableElement(activeElement)) {
            activeElement.blur();
        }
    }, []);

    return { keyboardOpen, keyboardHeight, hideKeyboard };
}
