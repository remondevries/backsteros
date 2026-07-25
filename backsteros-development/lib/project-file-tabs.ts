export type SelectProjectFileOptions = {
  /** Open in a new editor tab (⌘/Ctrl-click). Default replaces the active tab. */
  newTab?: boolean;
  /** Focus the file editor so the user can edit immediately (Enter / open). */
  focusEditor?: boolean;
};

export type SelectProjectFileHandler = (
  path: string,
  options?: SelectProjectFileOptions,
) => void;
