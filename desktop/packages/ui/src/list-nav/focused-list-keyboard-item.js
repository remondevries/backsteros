let resolver = null;
export function registerFocusedListKeyboardItemResolver(next) {
    resolver = next;
    return () => {
        if (resolver === next)
            resolver = null;
    };
}
export function getFocusedListKeyboardItemId() {
    return resolver?.() ?? null;
}
