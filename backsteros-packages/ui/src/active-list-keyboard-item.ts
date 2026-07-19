type Resolver = () => string | null;

let resolver: Resolver | null = null;

export function registerActiveListKeyboardItemResolver(next: Resolver | null) {
  resolver = next;
  return () => {
    if (resolver === next) resolver = null;
  };
}

export function getActiveListKeyboardItemId() {
  return resolver?.() ?? null;
}
