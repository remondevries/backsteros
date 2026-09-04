let resolver = null;
export function registerActiveListKeyboardItemResolver(next) {
    resolver = next;
    return () => {
        if (resolver === next)
            resolver = null;
    };
}
export function getActiveListKeyboardItemId() {
    return resolver?.() ?? null;
}
