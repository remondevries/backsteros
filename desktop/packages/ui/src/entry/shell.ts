export {
  ProductAppShell,
  type ProductAppShellProps,
} from "../components/shell/product-app-shell.js";

export {
  ProductSidebar,
  type ProductSidebarProps,
  type ProductSidebarLinkComponent,
  type ProductSidebarRecentPage,
} from "../components/shell/product-sidebar.js";

export {
  ResizableContextPanel,
  type ResizableContextPanelProps,
} from "../components/shell/resizable-context-panel.js";

export {
  SettingsSidePanelNavView,
  type SettingsSidePanelLinkComponent,
  type SettingsSidePanelNavViewProps,
} from "../components/settings/settings-side-panel-nav-view.js";

export {
  ChromeHeaderProvider,
  useChromeHeader,
  useRegisterChromeHeader,
} from "../components/shell/chrome-header-context.js";

export {
  EntityHeaderActionsShell,
  EntityHeaderActionsSlot,
} from "../components/entity-actions/entity-header-actions-shell.js";

export {
  TrackedTimerProvider,
  useTrackedTimer,
} from "../tracked-timer/tracked-timer-context.js";

export {
  CommandPaletteProvider,
  useCommandPalette,
  useCommandPaletteActions,
  useCommandPaletteRuntimeRefs,
  useCommandPaletteState,
  type CommandPaletteMode,
} from "../components/command-palette/command-palette-context.js";

export {
  ClientLink,
  ClientLinkProvider,
  type ClientLinkComponent,
  type ClientLinkProps,
} from "../shared/client-link.js";

export {
  MentionNavigationProvider,
  useMentionNavigationPathname,
} from "../mentions/mention-navigation-context.js";

export { HistoryEntryIcon } from "../components/navigation/history-entry-icon.js";

export { BreadcrumbChromeSkeleton } from "../components/skeletons/breadcrumb-chrome-skeleton.js";

export {
  RegisterPageTitle,
  RegisterPageTitleProvider,
  useRegisterPageTitleContext,
  type RegisterPageTitleContextValue,
} from "../navigation-history/register-page-title.js";

export {
  ListKeyboardNavigationProvider,
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
  useListKeyboardNavigationZone,
  isKeyboardNavHighlighted,
  type ListKeyboardNavigationRegistration,
} from "../components/list-nav/list-keyboard-navigation-provider.js";

export {
  shouldShowContentSidePanel,
  getContentSidePanelWidthKey,
} from "../content/content-side-panel.js";

export {
  buildProductTabHref,
  createProductTab,
  syncActiveTabToPath,
  type ProductTab,
  type ProductTabsState,
} from "../navigation/tabs.js";

export {
  clearPrimedTabTitles,
  getPrimedTabTitle,
  primeTabTitle,
} from "../navigation/primed-tab-title.js";

export { useBlockBrowserTabFocus } from "../shortcuts/use-block-browser-tab-focus.js";
export { useComposeShortcut } from "../compose/use-compose-shortcut.js";
export { useContentSidePanelToggleShortcut } from "../content/use-content-side-panel-toggle-shortcut.js";
export { useDocumentTreeCreateFolderShortcut } from "../documents/use-document-tree-create-folder-shortcut.js";
export { useContentPreviewScrollShortcuts } from "../content/use-content-preview-scroll-shortcuts.js";
export { useSettingsShortcut } from "../shortcuts/use-settings-shortcut.js";
export {
  resolveTabCycleShortcut,
  useTabShortcuts,
  type TabCycleDirection,
} from "../navigation/use-tab-shortcuts.js";

export {
  useListSelectAllShortcut,
  handleSelectAllRequest,
  installSelectAllShortcutListeners,
} from "../list-nav/use-list-select-all-shortcut.js";

export {
  useListClearSelectionShortcut,
  useListDismissDetailShortcut,
  installClearSelectionShortcutListeners,
} from "../list-nav/use-list-clear-selection-shortcut.js";

export { shouldHandleGlobalShortcut } from "../shortcuts/shortcut-guards.js";
