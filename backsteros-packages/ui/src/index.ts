export {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
  isTaskStatus,
  getTaskStatusLabel,
  isTriageStatus,
  migrateLegacyTaskStatus,
  type TaskStatus,
} from "./task-status.js";

export {
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_ORDER,
  isTaskPriority,
  toTaskPriorityDropdownValue,
  fromTaskPriorityDropdownValue,
  getTaskPriorityLabel,
  getTaskPriorityActiveBars,
  isTaskPriorityUrgent,
  isTaskPriorityNone,
  type TaskPriority,
  type TaskPriorityDropdownValue,
} from "./task-priority.js";

export {
  formatTaskStatusOklch,
  parseTaskStatusColor,
  adaptTaskStatusOklch,
  resolveTaskStatusColorScheme,
  subscribeToPreferredColorScheme,
  getPreferredColorSchemeSnapshot,
  resolveTaskStatusColor,
  type TaskStatusColorScheme,
  type TaskStatusOklch,
} from "./task-status-color.js";

export {
  formatTaskStatusHeaderGradientCss,
  getTaskStatusHeaderGradient,
  getTaskStatusHeaderGradientStyle,
  type TaskStatusHeaderGradient,
} from "./task-status-header-gradient.js";

export {
  computeTaskStatusIconModel,
  describeTaskStatusPieWedge,
  taskStatusRingPath,
  TASK_STATUS_RING_RADIUS,
  TASK_STATUS_RING_STROKE_WIDTH,
  type TaskStatusIconModel,
} from "./task-status-icon-model.js";

export {
  DEFAULT_ENTITY_ICON_COLOR,
  resolveEntityIconPaintColor,
  iconSvgColorStyle,
  mergeIconSvgClassName,
  classNameWithoutTextColor,
} from "./icon-color.js";

export {
  INBOX_TASK_KEY,
  formatTaskDisplayId,
  getTaskDisplayId,
  type TaskDisplayIdSource,
} from "./task-display-id.js";

export {
  TaskStatusIcon,
  type TaskStatusIconProps,
} from "./components/task-status-icon.js";

export {
  TaskStatusBadge,
  type TaskStatusBadgeProps,
} from "./components/task-status-badge.js";

export {
  TaskListItem,
  type TaskListItemProps,
  type TaskListItemTask,
} from "./components/task-list-item.js";

export {
  routeFamilies,
  navigation,
  navigationSections,
  routeCopy,
  isRouteFamily,
  isNavigationPathActive,
  titleForPath,
  type RouteFamily,
  type NavigationItem,
  type NavigationItemIconId,
  type NavigationSectionId,
} from "./navigation.js";

export {
  getNavigationItemIcon,
  NavigationItemIcon,
  NAVIGATION_ITEM_ICONS,
} from "./components/navigation-item-icon.js";

export {
  InboxNavIcon,
  TasksNavIcon,
  JournalNavIcon,
  KnowledgeBaseNavIcon,
  ContactsNavIcon,
  LettersNavIcon,
  OrganizationsNavIcon,
  ProjectsNavIcon,
  SidebarSettingsIcon,
  SidebarChevronIcon,
  SidebarHistoryClockIcon,
  SidebarComposeIcon,
  SidebarAccountIcon,
  SidebarLogoutIcon,
  SyncStatusIdleIcon,
  SearchNavIcon,
} from "./components/sidebar-nav-icons.js";

export { ProfileLogoIcon } from "./components/profile-logo-icon.js";

export {
  ProductSidebar,
  type ProductSidebarProps,
  type ProductSidebarLinkComponent,
} from "./components/product-sidebar.js";

export { SidePanelPlusIcon } from "./components/side-panel-plus-icon.js";

export {
  ProductContentTabs,
  type ProductContentTabsProps,
} from "./components/product-content-tabs.js";

export {
  ProductContentShell,
  type ProductContentShellProps,
} from "./components/product-content-shell.js";

export {
  ProductAppShell,
  type ProductAppShellProps,
} from "./components/product-app-shell.js";

export {
  createProductTab,
  createDefaultTabsState,
  getTabTitleForHref,
  normalizeTabHref,
  resolveTabNavIconId,
  syncActiveTabToPath,
  type ProductTab,
  type ProductTabsState,
} from "./tabs.js";

export {
  INBOX_TASK_LIST_PANEL_WIDTH_KEY,
  JOURNAL_LIST_PANEL_WIDTH_KEY,
  KNOWLEDGE_LIST_PANEL_WIDTH_KEY,
  DOCUMENTS_LIST_PANEL_WIDTH_KEY,
  CONTACTS_LIST_PANEL_WIDTH_KEY,
  ORGANIZATIONS_LIST_PANEL_WIDTH_KEY,
  LETTERS_LIST_PANEL_WIDTH_KEY,
  shouldShowContentSidePanel,
  getContentSidePanelWidthKey,
  isInboxPath,
  getSelectedInboxSlugFromPathname,
} from "./content-side-panel.js";

export { sidePanelItemClass } from "./side-panel-styles.js";

export {
  ResizableContextPanel,
  type ResizableContextPanelProps,
} from "./components/resizable-context-panel.js";

export {
  ContentSidePanelHeader,
  type ContentSidePanelHeaderProps,
} from "./components/content-side-panel-header.js";

export {
  ContentSidePanelList,
  ContentSidePanelEmpty,
} from "./components/content-side-panel-list.js";

export {
  buildInboxTaskListItem,
  encodeTaskSlug,
  findInboxItemBySlugOrId,
  formatInboxDueDateLabel,
  getFirstInboxItemHref,
  getInboxItemDisplayId,
  getInboxItemHref,
  getInboxItemRouteSlug,
  getInboxTaskRouteHref,
  getInboxTaskRouteSlugForTask,
  type InboxLetterListItem,
  type InboxListItem,
  type InboxTaskListItem,
} from "./inbox-items.js";

export {
  InboxItemTypeIcon,
  type InboxItemTypeIconProps,
} from "./components/inbox-item-type-icon.js";

export {
  InboxListItemRow,
  type InboxListItemRowProps,
  type InboxListItemLinkComponent,
} from "./components/inbox-list-item-row.js";

export {
  InboxSidePanelView,
  type InboxSidePanelViewProps,
} from "./components/inbox-side-panel-view.js";
export {
  AddInboxTaskInline,
  type AddInboxTaskInlineProps,
} from "./components/add-inbox-task-inline.js";
export {
  AddProjectInline,
  type AddProjectInlineProps,
} from "./components/add-project-inline.js";
export {
  ComposeQuickCapture,
  type ComposeQuickCaptureProps,
} from "./components/compose-quick-capture.js";
export { useComposeShortcut } from "./use-compose-shortcut.js";

export {
  InboxDetailLayout,
  type InboxDetailLayoutProps,
} from "./components/inbox-detail-layout.js";

export {
  formatLocalYmd,
  parseYmdLocal,
  formatDueDateInputValue,
  shouldShowTaskDueDateUrgency,
  getTaskDueDateUrgency,
  formatTaskDueMetaLabel,
  parseDueDateInputValue,
  type TaskDueDateUrgency,
} from "./task-due-date.js";

export {
  TASK_NO_DUE_DATE_VALUE,
  TASK_PICK_DUE_DATE_VALUE,
  taskDueDateDropdownValue,
  taskDueDateFromDropdownValue,
  isPickDueDateValue,
  buildTaskDueDateDropdownOptions,
} from "./task-due-date-dropdown.js";

export {
  parseNaturalLanguageDueDate,
  naturalLanguageDueDatePreview,
  type NaturalLanguageDueDateParseResult,
} from "./parse-natural-language-due-date.js";

export {
  buildDueDateCalendarGrid,
  DUE_DATE_CALENDAR_WEEKDAY_LABELS,
  formatCalendarMonthTitle,
  shiftCalendarMonth,
  type DueDateCalendarCell,
} from "./due-date-calendar.js";

export {
  DueDateCalendar,
  type DueDateCalendarProps,
} from "./components/due-date-calendar.js";

export {
  DueDateCalendarPopover,
  type DueDateCalendarPopoverProps,
} from "./components/due-date-calendar-popover.js";

export {
  TaskDueDateDropdown,
  type TaskDueDateDropdownProps,
} from "./components/task-due-date-dropdown.js";

export {
  TaskPriorityIcon,
  type TaskPriorityIconProps,
} from "./components/task-priority-icon.js";

export {
  TaskDueDateIcon,
  type TaskDueDateIconProps,
} from "./components/task-due-date-icon.js";

export {
  TaskListPriorityLabel,
  TaskListDueDateLabel,
} from "./components/task-list-property-label.js";

export {
  formatJournalDateSlug,
  getTodayJournalDateSlug,
  isValidJournalDateSlug,
  parseJournalDateSlug,
  formatJournalEntryTitle,
  formatJournalSidePanelLabel,
  getJournalHref,
  getSelectedJournalDateFromPathname,
  isJournalDetailPath,
  isJournalSectionPath,
} from "./journal.js";

export {
  JournalSidePanelView,
  type JournalSidePanelViewProps,
  type JournalSidePanelLinkComponent,
  type JournalListItem,
} from "./components/journal-side-panel-view.js";

export {
  JournalDetailLayout,
  type JournalDetailLayoutProps,
} from "./components/journal-detail-layout.js";

export { LetterIcon } from "./components/letter-icon.js";

export { DocumentIcon } from "./components/document-icon.js";
export { ContactPersonIcon } from "./components/contact-person-icon.js";
export { OrganizationIcon } from "./components/organization-icon.js";
export { DefaultProjectIcon } from "./components/default-project-icon.js";
export {
  ProjectOcticon,
  getDisplayProjectIcon,
  getEntityIconColor as getProjectOcticonDisplayColor,
  type ProjectOcticonProps,
} from "./components/project-octicon.js";
export {
  EntityAvatarIcon,
  type EntityAvatarIconProps,
} from "./components/entity-avatar-icon.js";
export {
  EntityListAvatar,
  type EntityListAvatarProps,
} from "./components/entity-list-avatar.js";
export { ProjectAreaBadge } from "./components/project-area-badge.js";
export {
  DROPDOWN_NONE_VALUE,
  DROPDOWN_NO_PROJECT_VALUE,
  buildAssigneeDropdownOptions,
  buildContactDropdownOptions,
  buildOrganizationDropdownOptions,
  buildProjectDropdownOptions,
  resolveDropdownNone,
  resolveDropdownProjectKey,
  type AssigneeDropdownContact,
  type OrganizationDropdownItem,
  type ProjectDropdownItem,
} from "./components/dropdown-options.js";

export { groupItemsByAlphaLetter } from "./alpha-group.js";

export {
  LETTER_DISPLAY_KEY,
  formatLetterDisplayId,
  groupLettersByStatus,
  getFirstLetterInListOrder,
  getLettersHref,
  getSelectedLetterSlugFromPathname,
  isLettersSectionPath,
  isProjectLettersSectionPath,
  isLetterDetailPath,
  normalizeProductPathname,
  letterMatchesSlug,
  parseLetterSlug,
  type LetterListItem,
  type LetterStatusGroup,
} from "./letters.js";

export {
  getOrganizationsHref,
  getSelectedOrganizationSlugFromPathname,
  isOrganizationSectionPath,
  organizationMatchesSlug,
  getContactsHref,
  getSelectedContactSlugFromPathname,
  isContactSectionPath,
  contactMatchesSlug,
  getUniqueListItemRouteParam,
  getKnowledgeHref,
  getSelectedKnowledgeSlugFromPathname,
  isKnowledgeSectionPath,
  getProjectsHref,
  isProjectsPath,
  type OrganizationListItem,
  type ContactListItem,
  type KnowledgeListItem,
  type ProjectListItem,
} from "./entity-routes.js";

export {
  DEFAULT_SETTINGS_TAB,
  SETTINGS_NAV_TABS,
  SETTINGS_TAB_GROUP_ORDER,
  SETTINGS_SHORTCUT_HINT,
  getSettingsTabFromPath,
  getSettingsTabMeta,
  getSettingsSectionLabel,
  getDefaultSettingsHref,
  formatLastSyncedAt,
  isSettingsPath,
  isSettingsTabId,
  type SettingsTabId,
  type SettingsTabGroup,
} from "./settings.js";

export {
  StatusGroupSection,
  type StatusGroupSectionProps,
  type StatusGroupSectionListDrag,
} from "./components/status-group-section.js";

export {
  OrganizationsSidePanelView,
  type OrganizationsSidePanelViewProps,
} from "./components/organizations-side-panel-view.js";

export {
  ContactsSidePanelView,
  type ContactsSidePanelViewProps,
} from "./components/contacts-side-panel-view.js";

export {
  LettersSidePanelView,
  type LettersSidePanelViewProps,
} from "./components/letters-side-panel-view.js";

export {
  KnowledgeSidePanelView,
  type KnowledgeSidePanelViewProps,
  type KnowledgeSidePanelLinkComponent,
  type KnowledgeSidePanelMutationResult,
} from "./components/knowledge-side-panel-view.js";

export {
  EntityDetailLayout,
  type EntityDetailLayoutProps,
} from "./components/entity-detail-layout.js";

export {
  SettingsSidePanelNavView,
  type SettingsSidePanelNavViewProps,
} from "./components/settings-side-panel-nav-view.js";

export {
  SettingsDetailLayout,
  type SettingsDetailLayoutProps,
} from "./components/settings-detail-layout.js";

export {
  SettingsContentHeader,
  type SettingsContentHeaderProps,
} from "./components/settings-content-header.js";

export {
  AccountSettingsSectionView,
  ComingSoonSettingsSectionView,
  GeneralSettingsSectionView,
  IntegrationConnectionSettingsView,
  SyncSettingsSectionView,
  type AccountSettingsSectionViewProps,
  type ComingSoonSettingsSectionViewProps,
  type GeneralSettingsSectionViewProps,
  type IntegrationConnectionSettingsViewProps,
  type SyncSettingsSectionViewProps,
} from "./components/settings-sections.js";

export {
  ApiKeysSettingsSectionView,
  type ApiKeysSettingsSectionViewProps,
  type SettingsApiKeyItem,
} from "./components/api-keys-settings-section-view.js";

export {
  APP_TIMEZONE_OPTIONS,
  DEFAULT_APP_TIMEZONE,
  isValidAppTimezone,
  normalizeAppTimezone,
} from "./app-timezone.js";

export {
  ProjectsListView,
  type ProjectsListViewProps,
} from "./components/projects-list-view.js";

export {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_ORDER,
  isProjectStatus,
  getProjectStatusLabel,
  migrateLegacyProjectStatus,
  type ProjectStatus,
} from "./project-status.js";

export {
  describeProjectProgressHexagonPath,
  describeProjectProgressPieWedge,
  PROJECT_PROGRESS_HEX_STROKE_WIDTH,
  PROJECT_BACKLOG_HEX_STROKE_DASHARRAY,
  computeProjectTaskProgressRatio,
  formatProjectTaskProgressPercent,
  formatProjectTaskProgressLabel,
  type ProjectTaskProgress,
} from "./project-progress-ring.js";

export {
  computeProjectStatusIconModel,
  mapProjectStatusToTaskStatusIcon,
  type ProjectStatusIconModel,
} from "./project-status-icon-model.js";

export {
  ProjectStatusIcon,
  type ProjectStatusIconProps,
} from "./components/project-status-icon.js";

export {
  ProjectProgressRing,
  type ProjectProgressRingProps,
} from "./components/project-progress-ring.js";

export {
  groupTasksByStatus,
  type TaskStatusGroup,
  type TaskLikeForGrouping,
} from "./group-tasks-by-status.js";

export {
  groupProjectsByStatus,
  type ProjectStatusGroup,
  type ProjectLikeForGrouping,
  type GroupProjectsByStatusOptions,
} from "./group-projects-by-status.js";

export {
  PROJECT_LIST_DRAG_TYPE,
  projectOrderKey,
  projectGroupAppendOrderKey,
  createProjectDragPayload,
  readProjectDragPayload,
  isProjectListDragActive,
  resolveProjectDropBeforeProject,
  resolveProjectDropOnGroupAppend,
  type ProjectReorderRequest,
  type ProjectDragPayload,
  type ProjectLikeForDrag,
} from "./project-list-drag.js";

export {
  applyOptimisticProjectReorder,
  projectReorderPatches,
  type ProjectLikeForReorder,
} from "./project-reorder.js";

export {
  TASKS_DUE_FILTERS,
  DEFAULT_TASKS_DUE_FILTER,
  TASKS_DUE_FILTER_LABELS,
  INACTIVE_TASK_STATUSES,
  TASKS_DUE_SEARCH_PARAM,
  isTasksDueFilter,
  getTasksDueFilterLabel,
  getTasksDueFilterEmptyMessage,
  getDefaultDueDateYmdForTasksDueFilter,
  getTaskDueDateYmd,
  taskDueDateMatchesFilter,
  filterTasksByDueFilter,
  parseTasksDueFilter,
  buildTasksDueHref,
  isTasksDueListPathname,
  parseTasksDueFilterFromLocation,
  getCanonicalTasksDueTabLocation,
  type TasksDueFilter,
} from "./tasks-due-filters.js";

export {
  PROJECT_AREAS,
  PROJECT_AREA_FILTER_ALL,
  PROJECT_AREA_LABELS,
  PROJECT_AREA_FILTERS,
  PROJECT_AREA_ORDER,
  PROJECT_AREA_SEARCH_PARAM,
  getProjectAreaFilterLabel,
  filterProjectsByArea,
  isProjectAreaFilter,
  parseProjectAreaFilter,
  getProjectsListAreaHref,
  parseProjectAreaFilterFromLocation,
  type ProjectArea,
  type ProjectAreaFilter,
} from "./project-areas.js";

export { PillNav, type PillNavProps, type PillNavItem } from "./components/pill-nav.js";

export {
  ListBoardViewShell,
  SegmentedPillToggle,
  type ListBoardView,
  type ListBoardViewShellProps,
  type SegmentedPillToggleOption,
} from "./components/list-board-view-shell.js";

export {
  TaskOverviewRow,
  type TaskOverviewRowProps,
  type TaskOverviewRowTask,
} from "./components/task-overview-row.js";

export {
  TasksOverviewView,
  type TasksOverviewViewProps,
} from "./components/tasks-overview-view.js";

export {
  ProjectTasksView,
  type ProjectTasksViewProps,
} from "./components/project-tasks-view.js";

export {
  ProjectOverviewRow,
  ProjectsListHeader,
  type ProjectOverviewRowProps,
  type ProjectOverviewRowProject,
} from "./components/project-overview-row.js";

export {
  ProjectBoardCard,
  type ProjectBoardCardProps,
  type ProjectBoardCardProject,
} from "./components/project-board-card.js";

export {
  ProjectsOverviewView,
  type ProjectsOverviewViewProps,
} from "./components/projects-overview-view.js";

export {
  ProjectDetailView,
  type ProjectDetailViewProps,
  type ProjectDetailViewProject,
} from "./components/project-detail-view.js";

export {
  ProjectLettersSectionView,
  type ProjectLettersSectionViewProps,
} from "./components/project-letters-section-view.js";

export {
  ProjectLettersView,
  type ProjectLettersViewProps,
} from "./components/project-letters-view.js";

export {
  ProjectDocumentsSectionView,
  type ProjectDocumentsSectionViewProps,
} from "./components/project-documents-section-view.js";

export {
  ProjectDocumentsView,
  type ProjectDocumentsViewProps,
} from "./components/project-documents-view.js";

export {
  ProjectDocumentsSidePanelView,
  type ProjectDocumentsSidePanelViewProps,
  type ProjectDocumentsSidePanelMutationResult,
  type ProjectDocumentsSidePanelLinkComponent,
} from "./components/project-documents-side-panel-view.js";

export {
  DocumentTreeNodeView,
  type DocumentTreeLinkComponent,
} from "./components/document-tree.js";

export { AddFolderInline } from "./components/add-folder-inline.js";

export { FolderPlusIcon } from "./components/folder-plus-icon.js";

export {
  buildDocumentTree,
  folderNavId,
  parseFolderNavId,
  flattenVisibleDocumentTreeNavItemIds,
  findDocumentTreeNodeById,
  findDocumentIdByPath,
  countDocumentTreeFolderItems,
  formatFolderDeleteConfirmLabel,
  type DocumentTreeSource,
  type DocumentTreeNode,
  type DocumentTreeFolderNode,
  type DocumentTreeDocumentNode,
} from "./document-tree.js";

export {
  treeNodeOrderKey,
  parseTreeDragPayload,
  type TreeDragItemType,
  type TreeDragPayload,
  type TreeReorderRequest,
} from "./document-tree-order.js";

export {
  DOCUMENT_TREE_DRAG_TYPE,
  createTreeDragPayload,
  readTreeDragPayload,
  isTreeDragActive,
  resolveFolderDragOverMode,
  resolveTreeDropAction,
} from "./document-tree-drag.js";

export {
  registerDocumentTreeDeleteResolver,
  resolveDocumentTreeDeleteConfig,
} from "./document-tree-delete-shortcut.js";

export {
  registerDocumentTreeCreateFolderHandler,
  requestDocumentTreeCreateFolder,
} from "./document-tree-create-folder-shortcut.js";

export {
  DOCUMENT_TREE_CREATE_FOLDER_SHORTCUT_HINT,
  isProjectDocumentsSectionPath,
  isDocumentLibrarySectionPath,
  isDocumentTreeCreateFolderShortcutKey,
  hasDocumentTreeCreateFolderShortcutModifiers,
  shouldHandleDocumentTreeCreateFolderShortcut,
} from "./should-handle-document-tree-create-folder-shortcut.js";

export { useDocumentTreeCreateFolderShortcut } from "./use-document-tree-create-folder-shortcut.js";

export {
  DocumentsEmptyCreateView,
  type DocumentsEmptyCreateResult,
  type DocumentsEmptyCreateViewProps,
} from "./components/documents-empty-create-view.js";

export {
  PROJECT_SECTIONS,
  PROJECT_SECTION_IDS,
  getActiveProjectSection,
  getProjectDocumentHref,
  getProjectLetterHref,
  getProjectSectionHref,
  getProjectSectionSegment,
  isProjectSectionId,
  parseProjectSectionId,
  type ProjectSectionConfig,
  type ProjectSectionId,
} from "./project-sections.js";

export {
  getOrganizationProjectHref,
  getProjectRouteScopeFromPathname,
  getScopedProjectBasePath,
  getScopedProjectDocumentHref,
  getScopedProjectLetterHref,
  getScopedProjectSectionHref,
  getScopedProjectTaskHref,
  isOrganizationProjectDetailPath,
  parseOrganizationProjectRoute,
  type ProjectRouteScope,
} from "./project-route-scope.js";

export {
  getContactRouteScopeFromPathname,
  getOrganizationContactHref,
  getScopedContactBasePath,
  getScopedContactLetterHref,
  getScopedContactSectionHref,
  getScopedContactTaskHref,
  getScopedContactsListHref,
  isOrganizationContactDetailPath,
  parseOrganizationContactRoute,
  type ContactRouteScope,
} from "./contact-route-scope.js";

export {
  ResizableSidePanel,
  RESIZABLE_SIDE_PANEL_LG_MEDIA_QUERY,
  readStoredPanelWidth,
  type ResizableSidePanelProps,
} from "./components/resizable-side-panel.js";

export {
  FloatingPillToggleDock,
  FLOATING_PILL_TOGGLE_DOCK_CLASS,
  type FloatingPillToggleDockProps,
} from "./components/floating-pill-toggle-dock.js";

export {
  TASK_PROPERTIES_PANEL_WIDTH_KEY,
  TASK_PROPERTIES_PANEL_LEGACY_WIDTH_KEYS,
  LEGACY_INBOX_TASK_PROPERTIES_PANEL_WIDTH_KEY,
  LETTER_PROPERTIES_PANEL_WIDTH_KEY,
  isTaskDetailPath,
} from "./properties-panel.js";

export {
  EntityPropertiesSection,
  TaskDetailPropertiesSection,
  type EntityPropertiesSectionProps,
} from "./components/entity-properties-section.js";

export {
  PropertyFieldGroup,
  type PropertyFieldGroupProps,
} from "./components/property-field-group.js";

export {
  TaskPropertiesDisplay,
  type TaskPropertiesDisplayProps,
  type TaskPropertiesDisplayTask,
} from "./components/task-properties-display.js";

export {
  LetterPropertiesDisplay,
  type LetterPropertiesDisplayProps,
  type LetterPropertiesDisplayLetter,
} from "./components/letter-properties-display.js";

export {
  DetailWithPropertiesLayout,
  type DetailWithPropertiesLayoutProps,
} from "./components/detail-with-properties-layout.js";

export {
  DocumentMarkdownEditor,
  type DocumentMarkdownEditorProps,
} from "./components/document-markdown-editor.js";

export {
  DocumentMentionMenu,
  type DocumentMentionMenuProps,
} from "./components/document-mention-menu.js";

export { MentionLeadingIcon } from "./components/mention-leading-icon.js";

export {
  MentionCatalogProvider,
  useMentionCatalog,
  useMentionCatalogOptional,
  useResolveMentionTokensInContent,
  type MentionCatalogContextValue,
} from "./mentions/mention-catalog-context.js";

export {
  EMPTY_MENTION_CATALOG,
} from "./mentions/empty-catalog.js";

export { mergeMentionCatalogs } from "./mentions/merge-catalog.js";

export { filterCatalogForTokens } from "./mentions/filter-catalog-for-tokens.js";

export {
  buildMentionSections,
  flattenMentionSections,
} from "./mentions/search-catalog.js";

export {
  buildMentionToken,
  getMentionTokenCacheKey,
  KNOWLEDGE_MENTION_PROJECT_KEY,
  resolveMentionHref,
} from "./mentions/tokens.js";

export {
  ClientLink,
  ClientLinkProvider,
  type ClientLinkComponent,
  type ClientLinkProps,
} from "./client-link.js";

export { isInternalAppHref } from "./is-internal-app-href.js";

export {
  MentionNavigationProvider,
  useMentionNavigationPathname,
} from "./mentions/mention-navigation-context.js";

export {
  isMentionTrailSourcePath,
  resolveMentionTrailHref,
} from "./navigation-trail/mention-trail.js";

export {
  createMentionExtensions,
  MentionMenuController,
  computeMentionTriggerState,
  type MentionMenuKeyHandlers,
} from "./mentions/codemirror/index.js";

export type {
  MentionCatalog,
  MentionCatalogContact,
  MentionCatalogDocument,
  MentionCatalogLetter,
  MentionCatalogOrganization,
  MentionCatalogProject,
  MentionCatalogTask,
  MentionItem,
  MentionMenuTriggerState,
  MentionSection,
} from "./mentions/mention-menu-types.js";

export {
  ContentMarkdownViewLayout,
  ContentMarkdownPreviewColumn,
  ContentMarkdownPreviewBody,
  ContentMarkdownPreviewTitleSlot,
  useMarkdownDetailEditor,
  type ContentMarkdownViewLayoutProps,
  type ContentMarkdownViewMode,
  type MarkdownDetailEditorMode,
} from "./components/content-markdown-view-layout.js";

export {
  DOCUMENT_CONTENT_MAX_WIDTH,
  documentEditorTheme,
  createDocumentEditorContentLayoutTheme,
} from "./document-editor-theme.js";

export {
  parseMarkdownDocument,
  serializeMarkdownDocument,
  stripDuplicateDocumentTitleHeading,
  getDocumentEditorBody,
  serializeDocumentBody,
  mergeJournalContent,
  type DocumentFrontmatter,
} from "./document-frontmatter.js";

export {
  COMMAND_PALETTE_RESULT_SECTIONS,
  DEFAULT_GO_NAVIGATION_ITEMS,
  NAVIGATION_GO_LETTER_HINT,
  activateFilterModeFromTab,
  applyAllModeInputChange,
  applyScopedModeInputChange,
  commandPaletteSectionsForMode,
  createDefaultCommandPaletteFilterState,
  goNavigationItemSearchValue,
  isScopedFilterMode,
  resolveFilterModeFromTabInput,
  sectionForSearchResultType,
  type CommandPaletteFilterMode,
  type CommandPaletteFilterState,
  type CommandPaletteHit,
  type CommandPaletteResultSection,
  type GoNavigationItem,
} from "./command-palette.js";

export {
  appendCommandPaletteSearchParams,
  resolveCommandPaletteSearchContext,
  type CommandPaletteSearchContext,
} from "./command-palette/search-context.js";

export {
  buildCommandPaletteContextBreadcrumb,
  peelRouteSearchContext,
} from "./command-palette/context-breadcrumb.js";

export {
  CommandPaletteProvider,
  useCommandPalette,
  type CommandPaletteMode,
} from "./components/command-palette-context.js";

export {
  CommandPaletteView,
  TOGGLE_COMMAND_PALETTE_EVENT,
  type CommandPaletteViewProps,
} from "./components/command-palette-view.js";

export { shouldBlockBrowserTabFocus } from "./shortcuts/should-block-browser-tab-focus.js";
export { useBlockBrowserTabFocus } from "./shortcuts/use-block-browser-tab-focus.js";

export {
  TaskDetailView,
  type TaskDetailViewProps,
  type TaskDetailViewTask,
} from "./components/task-detail-view.js";

export {
  ContentChromeHeader,
  ContentBreadcrumb,
  type ContentChromeHeaderProps,
  type ContentBreadcrumbProps,
  type ContentBreadcrumbItem,
  type ContentBreadcrumbLinkProps,
} from "./components/content-chrome-header.js";

export {
  ChromeHeaderProvider,
  useChromeHeader,
  useRegisterChromeHeader,
} from "./components/chrome-header-context.js";

export {
  EntityHeaderActionsShell,
  EntityHeaderActionsSlot,
} from "./components/entity-actions/entity-header-actions-shell.js";

export { RegisterEntityDeleteAction } from "./components/entity-actions/register-entity-delete-action.js";

export {
  EntityHeaderActionsProvider,
  useEntityHeaderActionsContext,
  type EntityDeleteConfig,
  type EntityDeleteResult,
} from "./components/entity-actions/entity-header-actions-context.js";

export {
  LetterDetailView,
  type LetterDetailViewProps,
  type LetterDetailViewLetter,
} from "./components/letter-detail-view.js";

export {
  LetterComposeView,
  type LetterComposeViewProps,
  type LetterComposeContact,
  type LetterComposeSubmitPayload,
} from "./components/letter-compose-view.js";

export {
  ContentDetailTitleHeader,
  ContentDetailStaticTitle,
  ContentDetailIconTitleHeader,
  ContentDetailTitleSlot,
  CONTENT_DETAIL_TITLE_CLASS,
  buildContentIconTitleHeaders,
} from "./components/content-detail-title-header.js";

export {
  DocumentDetailIcon,
  type DocumentDetailIconProps,
} from "./components/document-detail-icon.js";

export {
  LetterDetailIcon,
  type LetterDetailIconProps,
} from "./components/letter-detail-icon.js";

export {
  DocumentOcticon,
  type DocumentOcticonProps,
} from "./components/document-octicon.js";

export {
  OverviewNameEditor,
  type OverviewNameEditorProps,
} from "./components/overview-name-editor.js";

export {
  DocumentMarkdownPreview,
  type DocumentMarkdownPreviewProps,
} from "./components/document-markdown-preview.js";

export {
  DocumentMentionHoverCard,
  type DocumentMentionHoverCardProps,
} from "./components/document-mention-hover-card.js";

export {
  MentionChipHoverShell,
  type MentionChipHoverShellProps,
} from "./components/mention-chip-hover-shell.js";

export {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "./components/hover-card.js";

export {
  resolveMentionCatalogTask,
  resolveMentionCatalogProject,
  resolveMentionCatalogContact,
  resolveMentionCatalogOrganization,
  resolveMentionCatalogDocument,
  resolveMentionCatalogLetter,
} from "./mentions/resolve-catalog-entry.js";

export {
  getDeletedMentionDisplay,
  type DeletedMentionDisplay,
} from "./mentions/deleted-mention-display.js";

export {
  resolveMentionLayout,
  splitTrailingStructuralPrefix,
  stripStructuralLinePrefix,
  type MentionChipLayout,
} from "./mentions/mention-layout.js";

export {
  parseMentionToken,
  segmentMarkdownWithMentions,
  mentionTokenLabel,
  MENTION_TOKEN_RE,
  type MentionKind,
  type MentionSegment,
  type ParsedMentionToken,
} from "./mention-tokens.js";

export {
  ContactOverviewView,
  type ContactOverviewViewProps,
  type ContactOverviewViewContact,
  type ContactOverviewDetails,
  type ContactSocialAccount,
} from "./components/contact-overview-view.js";

export {
  ContactSocialAccountsEditor,
  type ContactSocialAccountsEditorProps,
} from "./components/contact-social-accounts-editor.js";

export {
  ContactDetailView,
  type ContactDetailViewProps,
} from "./components/contact-detail-view.js";

export {
  ContactTasksListView,
  type ContactTasksListViewProps,
} from "./components/contact-tasks-list-view.js";

export {
  OrganizationOverviewView,
  type OrganizationOverviewViewProps,
  type OrganizationOverviewViewOrganization,
  type OrganizationOverviewDetails,
} from "./components/organization-overview-view.js";

export {
  OrganizationDetailView,
  type OrganizationDetailViewProps,
} from "./components/organization-detail-view.js";

export {
  OrganizationContactsListView,
  type OrganizationContactsListViewProps,
} from "./components/organization-contacts-list-view.js";

export {
  ScopedLettersListView,
  type ScopedLettersListViewProps,
} from "./components/scoped-letters-list-view.js";

export {
  CONTACT_SECTIONS,
  CONTACT_SECTION_IDS,
  getActiveContactSection,
  getContactSectionHref,
  getContactSectionSegment,
  isContactSectionDetailPath,
  isContactSectionId,
  parseContactSectionId,
  shouldShowContactNav,
  type ContactSectionConfig,
  type ContactSectionId,
} from "./contact-sections.js";

export {
  ORGANIZATION_SECTIONS,
  ORGANIZATION_SECTION_IDS,
  buildOrganizationProjectsHref,
  getActiveOrganizationSection,
  getOrganizationIdFromProjectsPathname,
  getOrganizationSectionHref,
  getOrganizationSectionSegment,
  isOrganizationProjectsListPathname,
  isOrganizationSectionId,
  parseOrganizationSectionId,
  type OrganizationSectionConfig,
  type OrganizationSectionId,
} from "./organization-sections.js";

export {
  getRememberedContactSection,
  getRememberedOrganizationSection,
  rememberContactSection,
  rememberOrganizationSection,
} from "./entity-section-memory.js";

export {
  getContactSidePanelHref,
  getOrganizationSidePanelHref,
} from "./entity-side-panel-href.js";

export {
  MarkdownDocumentDetailView,
  type MarkdownDocumentDetailViewProps,
} from "./components/markdown-document-detail-view.js";

export {
  JournalDueTasksSection,
  filterTasksDueOnJournalDate,
  type JournalDueTasksSectionProps,
} from "./components/journal-due-tasks-section.js";

export {
  NAVIGATION_TRAIL_KINDS,
  type NavigationTrail,
  type NavigationTrailEntityRef,
  type NavigationTrailKind,
  type ResolvedNavigationTrailItem,
} from "./navigation-trail/types.js";

export {
  appendNavigationTrailNode,
  buildNavigationTrailHref,
  encodeNavigationTrailNode,
  getNavigationTrailAncestorHref,
  parseNavigationTrailPath,
} from "./navigation-trail/codec.js";

export { buildJournalTaskTrailHref as buildSourceTaskTrailHref } from "./navigation-trail/journal-task-href.js";
export { buildJournalTaskTrailHref } from "./navigation-trail/journal-task-href.js";

export {
  resolveHistoryEntryDisplay,
  formatContactDisplayId,
  formatOrganizationDisplayId,
  parseTaskSlug,
  parseContactSlug,
  parseOrganizationSlug,
  CONTACT_DISPLAY_KEY,
  ORGANIZATION_DISPLAY_KEY,
  type HistoryEntryKind,
  type HistoryEntryDisplay,
} from "./resolve-history-entry-display.js";

export { HistoryEntryIcon } from "./components/history-entry-icon.js";
export {
  DotScrollLoader,
  type DotScrollLoaderProps,
} from "./components/dot-scroll-loader.js";

export {
  isEntityRouteUuid,
  ENTITY_ROUTE_UUID_PATTERN,
} from "./navigation-trail/entity-route-uuid.js";

export {
  isValidInternalPath,
  buildCurrentLocationHref,
} from "./navigation-trail/path-utils.js";

export {
  SearchableDropdown,
  searchableDropdownShortcut,
  searchableDropdownShortcutIndex,
  type SearchableDropdownOption,
  type SearchableDropdownProps,
} from "./components/searchable-dropdown.js";

export type { SearchableDropdownMenuApi } from "./searchable-dropdown-menu-api.js";

export {
  SEARCHABLE_DROPDOWN_REQUEST_CLOSE,
  requestCloseSearchableDropdowns,
} from "./searchable-dropdown-events.js";

export {
  SEARCHABLE_DROPDOWN_OPEN_PLACEMENT_ATTRIBUTE,
  markSearchableDropdownOpenPlacement,
  consumeSearchableDropdownOpenPlacement,
  type SearchableDropdownOpenPlacement,
} from "./searchable-dropdown-open-placement.js";

export {
  SEARCHABLE_DROPDOWN_ROOT_ATTRIBUTE,
  getOrderedSearchableDropdownRoots,
  openAdjacentSearchableDropdown,
} from "./searchable-dropdown-tab-chain.js";

export {
  getCreateEntityFromQueryLabel,
  PENDING_ASSIGNABLE_ENTITY_PREFIX,
  createPendingAssignableId,
  isPendingAssignableId,
} from "./searchable-dropdown-create-from-query.js";

export {
  TASK_PROPERTY_DROPDOWN_ATTRIBUTE,
  resolveTaskPropertyDropdownOpenCandidatesFromEvent,
  resolveTaskPropertyDropdownIdFromEvent,
  resolveTaskPropertyDropdownId,
  isTaskPropertyDropdownShortcutKey,
  type TaskPropertyDropdownId,
  type TaskPropertyDropdownShortcutKey,
} from "./task-property-dropdown-keys.js";

export { isListKeyboardActivateKey } from "./is-list-keyboard-activate-key.js";

export { createId } from "./create-id.js";

export {
  PropertyDropdown,
  type PropertyDropdownProps,
  type PropertyDropdownTriggerVariant,
} from "./components/property-dropdown.js";

export {
  PropertyDropdownNavigateRow,
  type PropertyDropdownNavigateRowProps,
} from "./components/property-dropdown-navigate-row.js";

export {
  KanbanBoard,
  type KanbanBoardProps,
  type KanbanBoardMoveRequest,
  type KanbanColumn,
  type KanbanDropIndicator,
} from "./components/kanban-board.js";

export {
  computeKanbanDropIndicator,
} from "./compute-kanban-drop-indicator.js";

export { isKanbanInteractiveCardTarget } from "./kanban-interactive-target.js";

export {
  TaskBoardCard,
  type TaskBoardCardProps,
  type TaskBoardCardTask,
} from "./components/task-board-card.js";

export {
  ResizableBottomPanel,
  readStoredPanelHeight,
  type ResizableBottomPanelProps,
} from "./components/resizable-bottom-panel.js";

export {
  useLetterPdfTabReorder,
  type LetterPdfTabReorderItem,
  type LetterPdfTabReorderBind,
} from "./use-letter-pdf-tab-reorder.js";

export {
  LETTER_PDF_TAB_DRAG_TYPE,
  LETTER_PDF_TAB_DRAG_FALLBACK_TYPE,
  createLetterPdfTabDragPayload,
  parseLetterPdfTabDragPayload,
  readLetterPdfTabDragPayload,
  writeLetterPdfTabDragPayload,
  isLetterPdfTabDragActive,
  reorderAttachmentIds,
} from "./letter-pdf-tab-drag.js";

export {
  LetterPdfDock,
  LETTER_PDF_PANEL_HEIGHT_KEY,
  LETTER_PDF_VISIBLE_KEY,
  type LetterPdfDockProps,
} from "./components/letter-pdf-dock.js";

export {
  LetterPdfDropzone,
  type LetterPdfDropzoneProps,
} from "./components/letter-pdf-dropzone.js";

export {
  LetterPdfTab,
  type LetterPdfTabAttachment,
  type LetterPdfRenameResult,
  type LetterPdfDeleteResult,
} from "./components/letter-pdf-tab.js";

export {
  stripPdfExtension,
  withPdfExtension,
} from "./letter-pdf-filename.js";

export {
  LETTER_PDF_TOGGLE_SHORTCUT_HINT,
  isLetterPdfToggleShortcut,
  useLetterPdfToggleShortcut,
} from "./letter-pdf-toggle-shortcut.js";

export {
  LETTER_PDF_MAXIMIZE_SHORTCUT_HINT,
  isLetterPdfMaximizeShortcut,
  useLetterPdfMaximizeShortcut,
} from "./letter-pdf-maximize-shortcut.js";

export {
  LETTER_PDF_ATTACHMENT_SHORTCUT_MAX,
  parseLetterPdfAttachmentShortcutIndex,
  resolveLetterPdfAttachmentShortcutTarget,
  useLetterPdfAttachmentShortcuts,
} from "./letter-pdf-attachment-shortcut.js";

export {
  LETTER_PDF_ZOOM_IN_SHORTCUT_HINT,
  LETTER_PDF_ZOOM_OUT_SHORTCUT_HINT,
  resolveLetterPdfZoomShortcut,
  useLetterPdfZoomShortcut,
  type LetterPdfZoomDirection,
} from "./letter-pdf-zoom-shortcut.js";

export type { ProductSidebarRecentPage } from "./components/product-sidebar.js";

export {
  OPEN_COMPOSE_MODAL_EVENT,
  COMPOSE_SHORTCUT_KEY,
  COMPOSE_SHORTCUT_HINT,
  getComposeKindForShortcutKey,
  getHorizontalArrowDirection,
  isHorizontalArrowKey,
  hasCmdShiftArrowShortcutModifiers,
  requestOpenComposeModal,
  type ComposeKind,
  type HorizontalArrowDirection,
} from "./compose-modal-events.js";

export {
  COMPOSE_NO_PROJECT_VALUE,
  COMPOSE_KNOWLEDGE_BASE_VALUE,
  resolveComposeContextKind,
  isComposeKnowledgeBaseValue,
  normalizeComposeProjectId,
  getProjectRouteParamFromPathname,
  resolveComposeContextProjectId,
  resolveComposeContextDocumentTarget,
  resolveComposeContextDueDate,
  isComposeTasksPagePathname,
  isProjectDocumentDetailPath,
  isKnowledgeDocumentDetailPath,
  type ComposeContextKind,
} from "./compose-task.js";

export {
  getNextComposeTaskTabField,
  type ComposeTaskTabField,
  type ComposeTaskTabFlowContext,
} from "./compose-task-tab-flow.js";

export {
  COMPOSE_DOCUMENT_ROOT_FOLDER_VALUE,
  folderPathFromComposeFolderValue,
  getParentFolderPath,
  getSelectedProjectDocumentPathFromPathname,
  getSelectedKnowledgeDocumentPathFromPathname,
  resolveComposeContextDocumentFolder,
  resolveComposeDocumentFolderValue,
  getDirectChildComposeFolderOptions,
  getComposeFolderPathChain,
  buildComposeFolderCascadeSegments,
  buildDocumentFoldersByTarget,
  type ComposeDocumentFolderOption,
  type ComposeDocumentFoldersByTarget,
  type ComposeFolderCascadeSegment,
} from "./compose-document-folders.js";

export { ComposeFolderIcon, type ComposeFolderIconProps } from "./components/compose-folder-icon.js";

export {
  ComposeDueDateDropdown,
  type ComposeDueDateDropdownProps,
} from "./components/compose-due-date-dropdown.js";

export {
  ComposeAssigneeDropdown,
  type ComposeAssigneeDropdownProps,
} from "./components/compose-assignee-dropdown.js";

export {
  ComposeModal,
  type ComposeModalProps,
  type ComposeModalProject,
  type ComposeModalCreateTaskInput,
  type ComposeModalCreateDocumentInput,
} from "./components/compose-modal.js";

export {
  AvatarUpload,
  type AvatarUploadProps,
  type AvatarActionResult,
} from "./components/avatar-upload.js";

export {
  ProjectIconPicker,
  type ProjectIconPickerProps,
} from "./components/project-icon-picker.js";

export {
  ProjectOverviewIcon,
  type ProjectOverviewIconProps,
} from "./components/project-overview-icon.js";

export {
  PROJECT_ICON_KEYS,
  formatProjectIconLabel,
  isProjectIconKey,
  type ProjectIconKey,
} from "./project-icon-keys.js";

export {
  ENTITY_ICON_COLOR_PRESETS,
  parseEntityIcon,
  serializeEntityIcon,
  isValidEntityIcon,
  isValidEntityIconColor,
  isAllowedEntityIconEmoji,
  entityIconsEqual,
  serializeEntityIconForApi,
  getEntityIconColor,
  type ParsedEntityIcon,
  type EntityIconApiDetail,
} from "./entity-icon.js";

export {
  ENTITY_ICON_EMOJIS,
  filterEntityIconEmojis,
  type EntityIconEmojiEntry,
} from "./entity-icon-emojis.js";

export {
  EntityIconPicker,
  type EntityIconPickerProps,
  type EntityIconPickerDefaultOption,
} from "./components/entity-icon-picker.js";

export {
  CustomColorPickerPanel,
  type CustomColorPickerPanelProps,
} from "./components/custom-color-picker-panel.js";

export {
  registerGoLeaderKeyPress,
  isGoLeaderSequencePending,
  clearGoLeaderSequence,
  GO_NAVIGATION_SEQUENCE_TIMEOUT_MS,
} from "./go-leader-sequence-gate.js";

export {
  isBlockingModalOpen,
  isTargetInsideBlockingModal,
  shouldBlockPageShortcuts,
  shouldHandleGlobalShortcut,
  BLOCKING_MODAL_SELECTOR,
} from "./shortcut-guards.js";

export {
  resolveDesktopSectionTabHrefs,
  parseSectionTabIndex,
  normalizeTabLocation,
} from "./section-tab-hrefs.js";

export { useNavigationShortcuts } from "./use-navigation-shortcuts.js";
export { useSettingsShortcut } from "./use-settings-shortcut.js";
export { useSectionTabShortcuts } from "./use-section-tab-shortcuts.js";
export { useEscapeBackNavigation } from "./use-escape-back-navigation.js";
export { useTaskPropertyDropdownShortcuts } from "./use-task-property-dropdown-shortcuts.js";
export { useListBoardViewShortcuts } from "./use-list-board-view-shortcuts.js";
export { useTabShortcuts } from "./use-tab-shortcuts.js";
export { useContentSidePanelToggleShortcut } from "./use-content-side-panel-toggle-shortcut.js";

export {
  isTitleRenameShortcut,
  focusAndSelectTitleInput,
  useTitleRenameShortcut,
} from "./title-rename-shortcut.js";

export {
  deferFocusAfterTitleLeave,
  useContentTitleEditorNavigation,
} from "./use-content-title-editor-navigation.js";

export {
  registerDocumentTreeFolderRenameHandler,
  requestDocumentTreeFolderRename,
} from "./document-tree-folder-rename-shortcut.js";

export { isNativeDatePickerOpen } from "./native-date-picker.js";

export {
  LIST_BOARD_VIEW_SEARCH_PARAM,
  LIST_BOARD_VIEWS,
  DEFAULT_LIST_BOARD_VIEW,
  TASKS_LIST_BOARD_STORAGE_KEY,
  PROJECTS_LIST_BOARD_STORAGE_KEY,
  isListBoardView,
  parseListBoardView,
  parseListBoardViewFromSearchParam,
  parseListBoardViewFromLocation,
  persistListBoardView,
  type ListBoardView as ListBoardViewMode,
} from "./list-board-view.js";

export {
  LIST_BOARD_VIEW_LIST_KEY,
  LIST_BOARD_VIEW_BOARD_KEY,
  LIST_BOARD_VIEW_SHORTCUT_HINT,
  getListBoardViewForShortcutKey,
  hasListBoardViewShortcutModifiers,
  isListBoardViewShortcutKey,
} from "./list-board-view-shortcut.js";

export {
  stepBoardTaskId,
  boardKeyboardNavDirection as boardKeyboardNavStepDirection,
  isBoardKeyboardNavigationKey,
} from "./board-keyboard-nav.js";

export {
  isContentEditModeActive,
  isContentPreviewModeActive,
} from "./content-view-mode.js";

export {
  CONTENT_PREVIEW_SCROLL_SELECTOR,
  findContentPreviewScrollContainer,
  contentPreviewHasVerticalOverflow,
  getContentPreviewScrollStep,
  shouldHandleContentPreviewArrowScroll,
  scrollContentPreviewByArrowKey,
} from "./content-preview-scroll.js";

export {
  CONTENT_PREVIEW_LINKS_SELECTOR,
  contentPreviewLinkItemId,
  queryContentPreviewLinks,
  syncContentPreviewLinkMarkers,
  syncContentPreviewLinkHighlights,
  activateContentPreviewLink,
  isContentKeyboardNavZoneActive,
} from "./content-preview-links.js";

export { useContentPreviewScrollShortcuts } from "./use-content-preview-scroll-shortcuts.js";
export { useContentPreviewLinkNavigation } from "./use-content-preview-link-navigation.js";

export {
  getActiveListKeyboardItemId,
  registerActiveListKeyboardItemResolver,
} from "./active-list-keyboard-item.js";

export {
  getFocusedListKeyboardItemId,
  registerFocusedListKeyboardItemResolver,
} from "./focused-list-keyboard-item.js";

export { openTaskPropertyDropdown } from "./open-task-property-dropdown.js";
export { isContentSidePanelToggleShortcut } from "./content-side-panel-toggle-shortcut.js";

export {
  NAVIGATION_HISTORY_STORAGE_KEY,
  NAVIGATION_HISTORY_MAX_ENTRIES,
  NAVIGATION_HISTORY_RECENT_LIMIT,
} from "./navigation-history/constants.js";
export type {
  NavigationHistoryEntry,
  NavigationHistoryState,
  NavigationHistoryStore,
} from "./navigation-history/types.js";
export {
  applyPathnameChange,
  applyPathnameChangeForTab,
  areHistoryStatesEqual,
  areHistoryStoresEqual,
  createEmptyHistoryStore,
  createInitialHistoryState,
  createInitialHistoryStore,
  getActiveStack,
  getRecentHistoryPages,
  getRecentHistoryPagesFromStore,
  historyEntryHrefsMatch,
  migrateLegacyStore,
  normalizeHistoryEntryHref,
  pruneStacks,
  resolveHistoryEntryTitle,
  setActiveStack,
  syncTabStackToHref,
} from "./navigation-history/history-engine.js";
export {
  useNavigationHistory,
  type NavigationHistoryRecentPage,
  type UseNavigationHistoryResult,
} from "./navigation-history/use-navigation-history.js";
export {
  RegisterPageIcon,
  RegisterPageTitle,
  RegisterPageTitleProvider,
  useRegisterPageTitleContext,
  type RegisterPageTitleContextValue,
} from "./navigation-history/register-page-title.js";

export {
  KEYBOARD_NAV_ITEM_ATTR,
  keyboardNavItemProps,
  keyboardNavItemClass,
  keyboardNavListItemClass,
  queryKeyboardNavItem,
  focusListKeyboardNavItem,
  scrollKeyboardNavItemIntoView,
} from "./keyboard-nav-item.js";
export {
  stepListKeyboardIndex,
  flattenGroupedListItemIds,
  type ListKeyboardNavDirection,
} from "./list-keyboard-nav-index.js";
export {
  LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  LIST_KEYBOARD_NAV_ZONE_CONTENT,
  LIST_KEYBOARD_NAV_ZONE_MAIN,
  LIST_KEYBOARD_NAV_CONTENT_PRIORITY,
  LIST_KEYBOARD_NAV_ZONE_ORDER,
  LIST_KEYBOARD_NAV_ACTIVE_ZONE_ATTR,
  isEntitySectionListPathname,
  getDefaultListKeyboardNavZone,
  shouldAutoSwitchJkToMainList,
  type ListKeyboardNavZone,
  type ApplyListKeyboardNavZoneOptions,
} from "./list-keyboard-nav-zone.js";
export {
  shouldHandleListKeyboardNavigation,
  shouldHandleListKeyboardActivate,
  shouldHandleBoardKeyboardNavigation,
  boardKeyboardNavDirection,
} from "./should-handle-list-keyboard-navigation.js";
export {
  setKeyboardNavMouseResumeHandler,
  installKeyboardNavHoverModalityListeners,
  resolveListKeyboardAnchorId,
  suppressKeyboardNavHover,
} from "./keyboard-nav-hover-modality.js";
export {
  ListKeyboardNavigationProvider,
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
  isKeyboardNavHighlighted,
  type ListKeyboardNavigationRegistration,
} from "./components/list-keyboard-navigation-provider.js";

export { SkeletonBlock } from "./components/skeletons/skeleton-block.js";
export {
  TaskDetailSkeleton,
  type TaskDetailSkeletonProps,
} from "./components/skeletons/task-detail-skeleton.js";
export {
  LetterDetailSkeleton,
  LettersSidePanelSkeleton,
  type LetterDetailSkeletonProps,
} from "./components/skeletons/letter-detail-skeleton.js";
export {
  KnowledgeDetailSkeleton,
  KnowledgeSidePanelSkeleton,
  type KnowledgeDetailSkeletonProps,
} from "./components/skeletons/knowledge-detail-skeleton.js";
export {
  DocumentDetailSkeleton,
  type DocumentDetailSkeletonProps,
} from "./components/skeletons/document-detail-skeleton.js";
export {
  JournalDetailSkeleton,
  JournalWhoopHeaderSkeleton,
  type JournalDetailSkeletonProps,
} from "./components/skeletons/journal-detail-skeleton.js";
export { ProjectOverviewSkeleton } from "./components/skeletons/project-overview-skeleton.js";
export { BreadcrumbChromeSkeleton } from "./components/skeletons/breadcrumb-chrome-skeleton.js";
export {
  InboxSidePanelSkeleton,
  InboxDetailSkeleton,
} from "./components/skeletons/inbox-side-panel-skeleton.js";
export {
  TasksListSkeleton,
  type TasksListSkeletonProps,
} from "./components/skeletons/tasks-list-skeleton.js";
export {
  ProjectsListSkeleton,
  type ProjectsListSkeletonProps,
} from "./components/skeletons/projects-list-skeleton.js";
