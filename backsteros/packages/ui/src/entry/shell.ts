export {
  ProductAppShell,
  type ProductAppShellProps,
} from "../components/shell/product-app-shell.js";

export {
  ProductChatPanel,
  CHAT_PANEL_COLLAPSE_DURATION_MS,
  CHAT_PANEL_VISIBLE_STORAGE_KEY,
  CHAT_PANEL_WIDTH_STORAGE_KEY,
  readStoredChatPanelCollapsed,
  readStoredChatPanelWidth,
  type ProductChatPanelProps,
} from "../components/shell/product-chat-panel.js";

export {
  ChatPanelToggleButton,
  type ChatPanelToggleButtonProps,
} from "../components/shell/chat-panel-toggle-button.js";

export { isChatPanelToggleShortcut } from "../chat/chat-panel-toggle-shortcut.js";

export {
  clearPersonalAssistantDoubleA,
  consumePersonalAssistantDoubleA,
  isPersonalAssistantDoubleAKey,
  isPersonalAssistantDoubleAPending,
  setPersonalAssistantDoubleAHandler,
  setPersonalAssistantSingleAHandler,
  PERSONAL_ASSISTANT_DOUBLE_A_MS,
} from "../chat/personal-assistant-double-a.js";

export {
  focusShellChatComposer,
  isFocusInsideShellChatPanel,
  isShellChatSlashMenuOpen,
  scheduleFocusShellChatComposer,
  SHELL_CHAT_COMPOSER_INPUT_SELECTOR,
} from "../chat/focus-shell-chat-composer.js";

export {
  clearGoLeaderSequence,
  isGoLeaderSequencePending,
} from "../shortcuts/go-leader-sequence-gate.js";

export {
  clearFinanceLeaderSequence,
  isFinanceLeaderSequencePending,
} from "../finance/finance-leader-sequence-gate.js";

export {
  plainAShortcutEvent,
  tryOpenPropertyDropdownForShortcutEvent,
} from "../tasks/try-open-property-dropdown-for-shortcut-event.js";

export { AppToastHost } from "../components/shell/app-toast-host.js";
export {
  APP_TOAST_EVENT,
  showAppToast,
  type AppToastDetail,
} from "../toast/app-toast.js";

export {
  ContentLayoutTransitionProvider,
  useContentLayoutTransition,
  SIDEBAR_COLLAPSE_DURATION_MS,
  type ContentLayoutTransitionContextValue,
} from "../components/shell/content-layout-transition-context.js";

export {
  ProductSidebar,
  type ProductSidebarProps,
  type ProductSidebarLinkComponent,
  type ProductSidebarRecentPage,
} from "../components/shell/product-sidebar.js";

export {
  CONTEXT_PANEL_COLLAPSE_DURATION_MS,
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
  useTrackedTimerOptional,
  type RemoteRunningTimerAdoption,
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
  useClientLinkComponent,
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
  shouldApplyPageTitleToChrome,
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
  ListKeyboardNavMountGate,
  useListKeyboardNavMountGate,
} from "../list-nav/list-keyboard-nav-mount-gate.js";
export {
  getDefaultListKeyboardNavZone,
} from "../list-nav/list-keyboard-nav-zone.js";

export {
  shouldShowContentSidePanel,
  getContentSidePanelWidthKey,
} from "../content/content-side-panel.js";

export {
  buildProductTabHref,
  createProductTab,
  normalizeTabHref,
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

export {
  installContentViewModeShortcutListeners,
  useContentViewModeShortcut,
} from "../content/use-content-view-mode-shortcut.js";

export {
  installTitleRenameShortcutListeners,
  useTitleRenameShortcut,
} from "../shortcuts/title-rename-shortcut.js";

export {
  COPY_ENTITY_ID_EVENT,
  isCopyEntityIdShortcut,
  installCopyEntityIdShortcutListeners,
  resolveCopyEntityId,
  useCopyEntityIdShortcut,
} from "../shortcuts/copy-entity-id-shortcut.js";

export { shouldHandleGlobalShortcut } from "../shortcuts/shortcut-guards.js";
