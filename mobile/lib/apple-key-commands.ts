import { useEffect, useRef } from "react";
import { Platform } from "react-native";

type KeyCommandSpec = {
  id: string;
  input: string;
  modifiers: Array<"command" | "control" | "option" | "shift">;
  title?: string;
};

type RegistryEntry = {
  command: KeyCommandSpec;
  handler: () => void;
};

const entries = new Map<string, RegistryEntry>();
let listenerStarted = false;
let removeNativeListener: (() => void) | null = null;

type AppleKeyCommandsModule = {
  setKeyCommands: (commands: KeyCommandSpec[]) => void;
  clearKeyCommands: () => void;
  addKeyCommandListener: (
    listener: (id: string) => void,
  ) => { remove: () => void };
  isKeyCommandsSupported?: () => boolean;
};

function loadModule(): AppleKeyCommandsModule | null {
  if (Platform.OS !== "ios") return null;
  try {
    // Optional native module — absent in Expo Go / Jest / pre-rebuild binaries.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("react-native-apple-key-commands") as AppleKeyCommandsModule;
  } catch {
    return null;
  }
}

function syncNativeCommands(mod: AppleKeyCommandsModule): void {
  const commands = [...entries.values()].map((entry) => entry.command);
  if (commands.length === 0) {
    mod.clearKeyCommands();
    return;
  }
  mod.setKeyCommands(commands);
}

function ensureNativeListener(mod: AppleKeyCommandsModule): void {
  if (listenerStarted) return;
  listenerStarted = true;
  const sub = mod.addKeyCommandListener((id) => {
    entries.get(id)?.handler();
  });
  removeNativeListener = () => {
    sub.remove();
    listenerStarted = false;
    removeNativeListener = null;
  };
}

/**
 * Register an iPad/Mac UIKeyCommand. Replaces expo-key-event for ⌘ shortcuts,
 * which often never reach pressesBegan on iOS.
 */
export function useAppleKeyCommand(
  command: KeyCommandSpec | null,
  handler: () => void,
  enabled = true,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled || !command) return;
    const mod = loadModule();
    if (!mod) return;

    ensureNativeListener(mod);
    const id = command.id;
    entries.set(id, {
      command,
      handler: () => {
        handlerRef.current();
      },
    });
    syncNativeCommands(mod);

    return () => {
      entries.delete(id);
      syncNativeCommands(mod);
      if (entries.size === 0 && removeNativeListener) {
        removeNativeListener();
        mod.clearKeyCommands();
      }
    };
  }, [command, enabled]);
}
