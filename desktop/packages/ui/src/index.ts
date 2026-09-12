export {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
  isTaskStatus,
  getTaskStatusLabel,
  isTriageStatus,
  migrateLegacyTaskStatus,
  type TaskStatus,
} from "./tasks/task-status.js";

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
} from "./tasks/task-priority.js";

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
} from "./tasks/task-status-color.js";

export {
  formatTaskStatusHeaderGradientCss,
  getTaskStatusHeaderGradient,
  getTaskStatusHeaderGradientStyle,
  getTaskStatusIdBadgeStyle,
  type TaskStatusHeaderGradient,
} from "./tasks/task-status-header-gradient.js";

export {
  computeTaskStatusIconModel,
  describeTaskStatusPieWedge,
  taskStatusRingPath,
  TASK_STATUS_RING_RADIUS,
  TASK_STATUS_RING_STROKE_WIDTH,
  type TaskStatusIconModel,
} from "./tasks/task-status-icon-model.js";

export {
  DEFAULT_ENTITY_ICON_COLOR,
  resolveEntityIconPaintColor,
  iconSvgColorStyle,
  mergeIconSvgClassName,
  classNameWithoutTextColor,
} from "./entity/icon-color.js";

export {
  INBOX_TASK_KEY,
  coerceTaskDisplayNumber,
  formatTaskDisplayId,
  getTaskDisplayId,
  type TaskDisplayIdSource,
} from "./tasks/task-display-id.js";

export {
  DEFAULT_TASK_ID_COLUMN_CH,
  TASK_ID_COLUMN_CH_SLACK,
  computeTaskDisplayIdColumnCh,
  taskIdColumnCssVars,
  taskNumberDigitCount,
  type TaskIdColumnWidthSource,
} from "./tasks/task-id-column-width.js";

export {
  DEFAULT_TX_CATEGORY_COLUMN_PX,
  TX_CATEGORY_CHIP_CHROME_PX,
  TX_CATEGORY_COLUMN_SLACK_PX,
  computeTxCategoryColumnWidthPx,
  txCategoryColumnCssVars,
  useTxCategoryColumnWidthPx,
} from "./finance/finance-tx-category-column-width.js";

export {
  TaskStatusIcon,
  type TaskStatusIconProps,
} from "./components/tasks/task-status-icon.js";

export {
  TaskStatusWorkingPulse,
  type TaskStatusWorkingPulseProps,
} from "./components/tasks/task-status-working-pulse.js";

export {
  ShimmerText,
  type ShimmerTextProps,
} from "./components/shared/shimmer-text.js";

export {
  TaskStatusBadge,
  type TaskStatusBadgeProps,
} from "./components/tasks/task-status-badge.js";

export {
  TaskListItem,
  type TaskListItemProps,
  type TaskListItemTask,
} from "./components/tasks/task-list-item.js";

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
} from "./navigation/navigation.js";

export {
  getNavigationItemIcon,
  NavigationItemIcon,
  NAVIGATION_ITEM_ICONS,
} from "./components/navigation/navigation-item-icon.js";

export {
  InboxNavIcon,
  EmailNavIcon,
  TasksNavIcon,
  HabitsNavIcon,
  JournalNavIcon,
  KnowledgeBaseNavIcon,
  ContactsNavIcon,
  CommunicationNavIcon,
  SocialNavIcon,
  LettersNavIcon,
  OrganizationsNavIcon,
  AreasNavIcon,
  ProjectsNavIcon,
  DevelopmentNavIcon,
  SidebarSettingsIcon,
  SidebarChevronIcon,
  SidebarHistoryClockIcon,
  SidebarComposeIcon,
  SyncStatusIdleIcon,
  SearchNavIcon,
} from "./components/shell/sidebar-nav-icons.js";

export { DevelopmentAdeLogoIcon } from "./components/icons/development-ade-logo-icon.js";
export { ProfileLogoIcon } from "./components/icons/profile-logo-icon.js";

export {
  ProductSidebar,
  type ProductSidebarProps,
  type ProductSidebarLinkComponent,
} from "./components/shell/product-sidebar.js";

export {
  ProductHistoryToolbar,
  type ProductHistoryToolbarProps,
  type ProductHistoryRecentPage,
} from "./components/shell/product-history-toolbar.js";

export { SidePanelPlusIcon } from "./components/shell/side-panel-plus-icon.js";

export {
  ProductContentTabs,
  type ProductContentTabsProps,
} from "./components/shell/product-content-tabs.js";

export { ContentTabsTimer } from "./components/shell/content-tabs-timer.js";

export {
  TrackedTimeField,
  type TrackedTimeFieldProps,
} from "./components/shared/tracked-time-field.js";

export {
  ProductContentShell,
  type ProductContentShellProps,
} from "./components/shell/product-content-shell.js";

export {
  ProductAppShell,
  type ProductAppShellProps,
} from "./components/shell/product-app-shell.js";

export {
  ContentLayoutTransitionProvider,
  useContentLayoutTransition,
  SIDEBAR_COLLAPSE_DURATION_MS,
  type ContentLayoutTransitionContextValue,
} from "./components/shell/content-layout-transition-context.js";

export { OverlayScrollbarRoot } from "./components/shell/overlay-scrollbar-root.js";

export {
  TrackedTimerProvider,
  useTrackedTimer,
} from "./tracked-timer/tracked-timer-context.js";

export {
  buildProductTabHref,
  createProductTab,
  createDefaultTabsState,
  getTabTitleForHref,
  normalizeTabHref,
  refreshOpenTabTaskStatuses,
  resolveTabNavIconId,
  syncActiveTabTaskMeta,
  syncActiveTabToPath,
  type ProductTab,
  type ProductTabsState,
} from "./navigation/tabs.js";

export {
  clearPrimedTabTitles,
  getPrimedTabTitle,
  primeTabTitle,
} from "./navigation/primed-tab-title.js";

export {
  extractTaskRouteParamFromHref,
  findTaskForTabHref,
  resolveProductTabTaskMeta,
  taskMatchesTabRouteParam,
  type ProductTabTaskMeta,
} from "./navigation/product-tab-task-meta.js";

export {
  INBOX_TASK_LIST_PANEL_WIDTH_KEY,
  CALENDAR_TASK_LIST_PANEL_WIDTH_KEY,
  EMAIL_LIST_PANEL_WIDTH_KEY,
  JOURNAL_LIST_PANEL_WIDTH_KEY,
  KNOWLEDGE_LIST_PANEL_WIDTH_KEY,
  DOCUMENTS_LIST_PANEL_WIDTH_KEY,
  CONTACTS_LIST_PANEL_WIDTH_KEY,
  ORGANIZATIONS_LIST_PANEL_WIDTH_KEY,
  LETTERS_LIST_PANEL_WIDTH_KEY,
  FINANCE_LIST_PANEL_WIDTH_KEY,
  SOCIAL_LIST_PANEL_WIDTH_KEY,
  COMMUNICATION_LIST_PANEL_WIDTH_KEY,
  shouldShowContentSidePanel,
  getContentSidePanelWidthKey,
  isInboxPath,
  isInboxPanelPath,
  isCommunicationPanelPath,
  isCalendarPath,
  isCalendarListPath,
  isCalendarTaskDetailPath,
  isCalendarMeetingDetailPath,
  isEmailPath,
  getSelectedInboxSlugFromPathname,
} from "./content/content-side-panel.js";

export { sidePanelItemClass } from "./content/side-panel-styles.js";

export {
  CONTEXT_PANEL_COLLAPSE_DURATION_MS,
  ResizableContextPanel,
  type ResizableContextPanelProps,
} from "./components/shell/resizable-context-panel.js";

export {
  ContentSidePanelHeader,
  type ContentSidePanelHeaderProps,
} from "./components/content/content-side-panel-header.js";

export {
  ContentSidePanelList,
  ContentSidePanelEmpty,
} from "./components/content/content-side-panel-list.js";

export {
  ContentSidePanelShell,
  type ContentSidePanelShellProps,
} from "./components/content/content-side-panel-shell.js";

export {
  buildInboxEmailListItem,
  buildInboxTaskListItem,
  buildTaskListEmailItem,
  emailInboxItemId,
  encodeTaskSlug,
  findInboxItemBySlugOrId,
  formatInboxDueDateLabel,
  getEmailTaskListHref,
  getFirstInboxItemHref,
  getInboxAttentionGroupKey,
  getInboxAttentionGroupLabel,
  getInboxHrefAfterRemovingItem,
  getInboxItemDisplayId,
  getInboxItemHref,
  buildInboxItemHrefById,
  getInboxItemRouteSlug,
  getInboxTaskRouteHref,
  getInboxTaskRouteSlugForTask,
  getProjectTaskHref,
  getInboxAttentionKeyboardItemIds,
  groupInboxItemsByAttentionStatus,
  isAgentInboxPending,
  isEmailTaskListItem,
  isInboxOverdueTask,
  pickIdAfterRemoving,
  resolveInboxEmailIconColor,
  sortInboxItemsByAttentionStatus,
  taskBelongsInInbox,
  emailBelongsInInbox,
  meetingBelongsInInbox,
  buildInboxMeetingListItem,
  meetingInboxItemId,
  parseMeetingInboxItemId,
  isEmailIncomingStatus,
  INBOX_ATTENTION_REAL_STATUSES,
  INBOX_ATTENTION_STATUS_ORDER,
  type InboxAttentionStatus,
  type InboxAttentionStatusGroup,
  type InboxEmailListItem,
  type InboxLetterListItem,
  type InboxListItem,
  type InboxMeetingListItem,
  type InboxTaskListItem,
} from "./inbox/inbox-items.js";

export {
  buildInboxTriageNotification,
  buildInboxTriageEmailNotificationFromListItem,
  buildInboxTriageMeetingNotificationHref,
  buildInboxTriageTaskNotificationHref,
  collectInboxTriageArrivals,
  inboxTriageItemStableId,
  snapshotInboxTriageKeys,
} from "./inbox/inbox-triage-notifications.js";

export {
  buildInboxUpdatedNotification,
  collectInboxUpdatedArrivals,
  inboxUpdatedItemStableId,
  snapshotInboxUpdatedKeys,
} from "./inbox/inbox-updated-notifications.js";

export {
  emailListItemIsSelected,
  emailMailboxFromDisplay,
  emailMailboxLabel,
  getEmailComposeHref,
  getEmailDraftHref,
  getEmailItemHref,
  getEmailListContext,
  getEmailListItemHref,
  getSelectedEmailIdFromPathname,
  groupEmailItemsByMailbox,
  groupEmailItemsByStatus,
  filterEmailListItems,
  collapseEmailListItemsByThread,
  firstReceivedEmailAtMs,
  getEmailStatusLabel,
  isEmailComposePath,
  isEmailInboxListContext,
  isEmailCommunicationListContext,
  isEmailProjectListContext,
  isEmailTasksListContext,
  parseEmailDraftPath,
  parseEmailMessagePath,
  parseReplyToAddress,
  preserveEmailInboxListContext,
  replySubject,
  stripEmailDraftShell,
  formatEmailPersonWithAddress,
  formatEmailListPartyLabel,
  emailMessageBody,
  emailMessagePlainBody,
  emailMessageHtmlBody,
  type EmailThreadBodyViewMode,
  resolveEmailListItemStatus,
  withEmailInboxListContext,
  withEmailCommunicationListContext,
  withEmailListContext,
  EMAIL_COMPOSE_PATH,
  EMAIL_INBOX_LIST_PARAM,
  EMAIL_INBOX_LIST_VALUE,
  EMAIL_COMMUNICATION_LIST_VALUE,
  EMAIL_PROJECT_LIST_VALUE,
  EMAIL_TASKS_LIST_VALUE,
  EMAIL_STATUS_ORDER,
  type EmailDraftPath,
  type EmailListContext,
  type EmailListItem,
  type EmailListItemKind,
  type EmailMailbox,
  type EmailMailboxGroup,
  type EmailMessagePath,
  type EmailStatusGroup,
} from "./email/email.js";

export { resolveDuplicatedTaskHref } from "./tasks/duplicated-task-href.js";

export {
  InboxItemTypeIcon,
  type InboxItemTypeIconProps,
} from "./components/inbox/inbox-item-type-icon.js";

export {
  InboxListItemRow,
  type InboxListItemRowProps,
  type InboxListItemLinkComponent,
} from "./components/inbox/inbox-list-item-row.js";

export {
  InboxSidePanelView,
  type InboxSidePanelViewProps,
} from "./components/inbox/inbox-side-panel-view.js";
export {
  EmailSidePanelView,
  type EmailSidePanelViewProps,
} from "./components/email/email-side-panel-view.js";
export {
  EmailDraftActions,
  type EmailDraftActionsProps,
  type EmailDraftBodyMode,
  useEmailDraftBodyModeShortcuts,
} from "./components/email/email-draft-actions.js";
export { useEmailBodyViewModeShortcuts } from "./email/use-email-body-view-mode-shortcuts.js";
export {
  EmailDraftSignOffShell,
  type EmailDraftSignOffShellProps,
} from "./components/email/email-draft-sign-off-shell.js";
export {
  EmailComposeChrome,
  type EmailComposeChromeProps,
} from "./components/email/email-compose-chrome.js";
export {
  EmailComposeBodyStage,
  type EmailComposeBodyStageProps,
} from "./components/email/email-compose-body-stage.js";

export {
  EmailThreadCommentBubble,
  type EmailThreadCommentBubbleProps,
} from "./components/email/email-thread-comment-bubble.js";
export {
  TaskMentionBlockChip,
  type TaskMentionBlockChipProps,
  type TaskMentionBlockChipTask,
} from "./components/tasks/task-mention-block-chip.js";
export {
  EmailMentionBlockChip,
  type EmailMentionBlockChipProps,
  type EmailMentionBlockChipEmail,
} from "./components/email/email-mention-block-chip.js";

export {
  EmailThreadMinimap,
  type EmailThreadMinimapProps,
} from "./components/email/email-thread-minimap.js";

export {
  compactEmailMinimapPreview,
  deriveEmailThreadMinimapItems,
  emailThreadMinimapSectionId,
  resolveEmailThreadMinimapHasPersistentGutter,
  resolveEmailThreadMinimapHitStripWidth,
  type EmailThreadMinimapDirection,
  type EmailThreadMinimapItem,
  type EmailThreadMinimapMessageInput,
} from "./email/email-thread-minimap.js";

export {
  EmailThreadCommentComposer,
  type EmailThreadCommentComposerProps,
} from "./components/email/email-thread-comment-composer.js";

export {
  EmailAddressContactField,
  type EmailAddressContactFieldProps,
  type EmailThreadFromContactPicker,
} from "./components/email/email-address-contact-field.js";

export {
  EmailThreadMessageCard,
  type EmailThreadMessageCardProps,
} from "./components/email/email-thread-message-card.js";
export {
  EmailMessageHtmlBody,
  type EmailMessageHtmlBodyProps,
} from "./components/email/email-message-html-body.js";
export {
  resolveEmailInlineAttachments,
  type EmailMessageInlineAttachment,
} from "./email/email-message-html.js";
export {
  formatEmailSourceSize,
  parseEmailAuthenticationResults,
  type EmailAuthenticationCheck,
  type EmailMessageSourceDetail,
  type EmailMessageSourceHeader,
} from "./email/email-message-source.js";
export {
  EmailThreadView,
  type EmailDraftActionsConfig,
  type EmailThreadViewProps,
} from "./components/email/email-thread-view.js";
export {
  EmailPropertiesDisplay,
  type EmailPropertiesDisplayProps,
  type EmailPropertiesDisplayThread,
} from "./components/email/email-properties-display.js";
export {
  AddInboxTaskInline,
  type AddInboxTaskInlineProps,
} from "./components/inbox/add-inbox-task-inline.js";
export {
  AddProjectInline,
  type AddProjectInlineProps,
} from "./components/projects/add-project-inline.js";
export {
  ComposeQuickCapture,
  type ComposeQuickCaptureProps,
} from "./components/compose/compose-quick-capture.js";
export { useComposeShortcut } from "./compose/use-compose-shortcut.js";

export {
  InboxDetailLayout,
  type InboxDetailLayoutProps,
} from "./components/inbox/inbox-detail-layout.js";

export {
  DEFAULT_TIMED_TASK_DURATION_MINUTES,
  calendarChangeToTaskPatch,
  isTerminalCalendarTaskStatus,
  isHiddenCalendarTaskStatus,
  isHabitLinkedCalendarTask,
  isTimedHabitCalendarTask,
  shouldIncludeTaskInCalendarUi,
  taskCalendarEventClassNames,
  taskCalendarEventColors,
  taskCalendarEventNeutralColors,
  taskToCalendarEvent,
  tasksToCalendarEvents,
  tasksToCalendarEventsForDate,
  formatCalendarTaskScheduleLabel,
  calendarChangeToMeetingPatch,
  calendarSelectionToMeetingRange,
  calendarEntityFromEvent,
  meetingToCalendarEvent,
  meetingsToCalendarEvents,
  meetingsToCalendarEventsForDate,
  mergeCalendarGridEvents,
  birthdaysToCalendarEvents,
  normalizeBirthdayYmd,
  unscheduledCalendarTasks,
  type BirthdayCalendarLike,
  type CalendarEventChange,
  type CalendarTaskLike,
  type MeetingCalendarLike,
  type MeetingCalendarPatch,
  type TaskCalendarEvent,
  type TaskCalendarPatch,
} from "./calendar/calendar-events.js";

export {
  CALENDAR_VIEW_MODE_OPTIONS,
  CALENDAR_VIEW_MODE_PARAM,
  DEFAULT_CALENDAR_VIEW_MODE,
  buildCalendarViewHref,
  calendarAvailabilityViewModes,
  calendarViewModeToFcView,
  calendarViewModes,
  fcViewTypeToCalendarViewMode,
  getCalendarViewModeLabel,
  isCalendarViewMode,
  parseCalendarViewModeParam,
  readCalendarViewModeFromSearch,
  withCalendarViewSearch,
  CALENDAR_AVAILABILITY_VIEW_MODE_OPTIONS,
  normalizeCalendarAvailabilityViewMode,
  type CalendarAvailabilityViewMode,
  type CalendarViewMode,
} from "./calendar/calendar-view-modes.js";

export {
  CALENDAR_PAGE_MODE_OPTIONS,
  CALENDAR_PAGE_MODE_PARAM,
  DEFAULT_CALENDAR_PAGE_MODE,
  buildCalendarPageHref,
  calendarPageModes,
  isCalendarPageMode,
  parseCalendarPageModeParam,
  readCalendarPageModeFromSearch,
  resolveCalendarPageModeFromShortcutKey,
  withCalendarPageSearch,
  type CalendarPageMode,
} from "./calendar/calendar-page-mode.js";

export {
  addWeekdaySlot,
  formatSlotLabel,
  formatTime12h,
  formatWeekdaySlotsLabel,
  patchWeekdayHoursEntry,
  removeWeekdaySlot,
  suggestNextSlot,
  updateWeekdaySlot,
} from "./calendar/calendar-availability-slots.js";

export {
  AVAILABILITY_EVENT_TYPE,
  MEETINGS_AVAILABILITY_MARKER_TYPE,
  WEEKDAY_LABELS,
  calendarChangeToWeekdayHoursPatch,
  calendarSelectionToWeekdayHoursPatch,
  weekdayHoursToCalendarEvents,
  weekdayHoursToMeetingAvailabilityMarkers,
  weekdayLabel,
  type AvailabilityCalendarEvent,
  type MeetingsAvailabilityMarkerEvent,
} from "./calendar/calendar-availability-events.js";

export { buildCalendarBreadcrumbItems } from "./calendar/calendar-breadcrumb.js";

export {
  CALENDAR_TIMETRACKING_DATE_PARAM,
  CALENDAR_TIMETRACKING_WEEK_PARAM,
  CALENDAR_TIMETRACKING_MONTH_PARAM,
  CALENDAR_TIMETRACKING_DETAIL_PANEL_WIDTH_KEY,
  buildTimetrackingDayGroups,
  formatTimetrackingPeriodLabel,
  parseTimetrackingDateParam,
  parseTimetrackingWeekParam,
  parseTimetrackingMonthParam,
  readTimetrackingDateFromSearch,
  readTimetrackingPeriodFromSearch,
  timetrackingPeriodIncludesYmd,
  todayYmd,
  type TimetrackingDayItem,
  type TimetrackingMonthGroup,
  type TimetrackingPeriod,
  type TimetrackingWeekGroup,
} from "./calendar/calendar-timetracking-days.js";

export {
  buildTimetrackingSidePanelKeyboardItemIds,
  getSelectedTimetrackingSidePanelItemId,
  parseTimetrackingEntryKeyboardItemId,
  parseTimetrackingSidePanelItemId,
  timetrackingEntryKeyboardItemId,
  timetrackingSidePanelDayItemId,
  timetrackingSidePanelMonthItemId,
  timetrackingSidePanelWeekItemId,
} from "./calendar/calendar-timetracking-keyboard.js";

export {
  collectTimetrackingEntries,
  formatTimetrackingDuration,
  formatTimetrackingLeadingStamp,
  resolveTimetrackingGroupDateYmd,
  sumTimetrackingDurationSeconds,
  withLiveTimetrackingEntries,
  type LiveTimetrackingSource,
  type TimetrackingEntry,
  type TimetrackingEntryKind,
  type TimetrackingEntrySource,
} from "./calendar/calendar-timetracking-entries.js";

export {
  CalendarTimetrackingSidePanelView,
  type CalendarTimetrackingSidePanelViewProps,
} from "./components/calendar/calendar-timetracking-side-panel-view.js";

export {
  CalendarTimetrackingView,
  type CalendarTimetrackingViewProps,
} from "./components/calendar/calendar-timetracking-view.js";

export {
  TimetrackingLeadingStamp,
  type TimetrackingLeadingStampProps,
} from "./components/calendar/timetracking-leading-stamp.js";

export { TrackedTimeIcon, type TrackedTimeIconProps } from "./components/icons/tracked-time-icon.js";

export { calendarTaskDragEventData, taskDueEpochAttribute } from "./calendar/calendar-task-drag.js";

export {
  useCalendarExternalTaskDrag,
  type UseCalendarExternalTaskDragOptions,
} from "./calendar/use-calendar-external-task-drag.js";

export {
  resolveCalendarDateNavigationAction,
  isCalendarDateNavigationPopoverOpen,
  type CalendarDateNavigationAction,
} from "./calendar/calendar-date-navigation-shortcuts.js";

export {
  useCalendarDateNavigationShortcuts,
  type CalendarDateNavApi,
} from "./calendar/use-calendar-date-navigation-shortcuts.js";

export { useCalendarPageModeShortcuts } from "./calendar/use-calendar-page-mode-shortcuts.js";

export {
  CalendarDateNav,
  type CalendarDateNavProps,
} from "./components/calendar/calendar-date-nav.js";

export {
  CalendarView,
  type CalendarViewProps,
} from "./components/calendar/calendar-view.js";

export {
  CalendarAvailabilityDayPopover,
  type CalendarAvailabilityDayPopoverProps,
} from "./components/calendar/calendar-availability-day-popover.js";

export {
  CalendarAvailabilityView,
  type CalendarAvailabilityViewProps,
} from "./components/calendar/calendar-availability-view.js";

export {
  CalendarSidePanelModeFooter,
} from "./components/calendar/calendar-side-panel-mode-footer.js";

export {
  CalendarAvailabilitySidePanelView,
  type CalendarAvailabilitySidePanelViewProps,
} from "./components/calendar/calendar-availability-side-panel-view.js";

export {
  CalendarTaskEventPopover,
  type CalendarTaskEventPopoverProps,
  type CalendarTaskPopoverTask,
} from "./components/calendar/calendar-task-event-popover.js";

export {
  CalendarMeetingEventPopover,
  type CalendarMeetingEventPopoverProps,
  type CalendarMeetingPopoverMeeting,
} from "./components/calendar/calendar-meeting-event-popover.js";

export {
  CalendarBirthdayEventPopover,
  type CalendarBirthdayEventPopoverProps,
  type CalendarBirthdayPopoverContact,
} from "./components/calendar/calendar-birthday-event-popover.js";

export {
  BirthdayCalendarIcon,
  type BirthdayCalendarIconProps,
} from "./components/calendar/birthday-calendar-icon.js";

export {
  CalendarHabitsIconRow,
  type CalendarHabitsIconRowProps,
  type CalendarHabitIconItem,
} from "./components/calendar/calendar-habits-icon-row.js";

export {
  buildCalendarDayHabitsByDate,
  type CalendarHabitDefinition,
  type CalendarHabitDayTask,
} from "./calendar/calendar-day-habits.js";

export {
  CALENDAR_SIDE_PANEL_MEETING_PREFIX,
  CALENDAR_SIDE_PANEL_TASK_PREFIX,
  CALENDAR_SIDE_PANEL_HABIT_PREFIX,
  buildCalendarSidePanelKeyboardItemIds,
  calendarSidePanelMeetingItemId,
  calendarSidePanelTaskItemId,
  calendarSidePanelHabitItemId,
  getSelectedCalendarSidePanelItemId,
  parseCalendarSidePanelKeyboardItemId,
} from "./calendar/calendar-side-panel-keyboard.js";

export {
  CALENDAR_MEETING_OVERLAY_LAYOUT_PARAM,
  parseCalendarMeetingOverlayLayout,
  withCalendarMeetingSearch,
  isCalendarMeetingsPanelPath,
  formatMeetingBreadcrumbLabel,
  resolveInboxSidebarIndicator,
  resolveInboxSidebarIndicatorTone,
  inboxSidebarIndicatorColor,
  INBOX_SIDEBAR_INDICATOR_COLORS,
  buildTaskDueDatePatch,
  type CalendarMeetingOverlayLayout,
} from "./calendar/calendar-meeting-overlay.js";

export {
  buildCalendarDayColumnNavIds,
  buildCalendarEventKeyboardGrid,
  buildCalendarEventKeyboardGridForNavigation,
  buildCalendarEventKeyboardGridFromDom,
  flattenCalendarEventKeyboardGrid,
  findOpenCalendarMorePopoverForDay,
  findOpenCalendarMorePopoverYmd,
  closeCalendarMorePopoverForDay,
  getFirstPopoverAllDayEventId,
  getSelectedCalendarGridEventId,
  resolveCalendarGridKeyboardNextItemId,
  CALENDAR_GRID_KEYBOARD_ITEM_ATTR,
  CALENDAR_MORE_LINK_PREFIX,
  calendarMoreLinkItemId,
  parseCalendarMoreLinkItemId,
} from "./calendar/calendar-grid-keyboard.js";

export {
  CALENDAR_TASK_OVERLAY_PARAM,
  getCalendarTaskOverlayHref,
  parseCalendarTaskOverlayId,
} from "./calendar/calendar-task-overlay.js";

export { useCalendarGridKeyboardNavigation } from "./calendar/use-calendar-grid-keyboard-navigation.js";

export {
  getCalendarMainKeyboardHighlightId,
  setCalendarMainKeyboardHighlightId,
  getCalendarSidePanelKeyboardHighlightId,
  setCalendarSidePanelKeyboardHighlightId,
  getCalendarKeyboardActiveZone,
  setCalendarKeyboardActiveZone,
  type CalendarKeyboardActiveZone,
} from "./calendar/calendar-keyboard-session.js";

export {
  CalendarTasksSidePanelView,
  type CalendarTasksSidePanelViewProps,
  type CalendarSidePanelHabitItem,
} from "./components/calendar/calendar-tasks-side-panel-view.js";

export {
  CalendarDayTimeline,
  type CalendarDayTimelineProps,
} from "./components/calendar/calendar-day-timeline.js";

export {
  JournalDayLayout,
  type JournalDayLayoutProps,
} from "./components/journal/journal-day-layout.js";

export {
  formatLocalYmd,
  parseYmdLocal,
  formatDueDateInputValue,
  formatDueDateTimeStamp,
  shouldShowTaskDueDateUrgency,
  getTaskDueDateUrgency,
  formatTaskDueMetaLabel,
  parseDueDateInputValue,
  toApiDueDateIso,
  type TaskDueDateUrgency,
} from "./tasks/task-due-date.js";

export {
  TASK_NO_DUE_DATE_VALUE,
  TASK_PICK_DUE_DATE_VALUE,
  taskDueDateDropdownValue,
  taskDueDateFromDropdownValue,
  isPickDueDateValue,
  buildTaskDueDateDropdownOptions,
} from "./tasks/task-due-date-dropdown.js";

export {
  parseNaturalLanguageDueDate,
  naturalLanguageDueDatePreview,
  type NaturalLanguageDueDateParseResult,
} from "./tasks/parse-natural-language-due-date.js";

export {
  buildDueDateCalendarGrid,
  DUE_DATE_CALENDAR_WEEKDAY_LABELS,
  formatCalendarMonthTitle,
  shiftCalendarMonth,
  type DueDateCalendarCell,
} from "./tasks/due-date-calendar.js";

export {
  DueDateCalendar,
  type DueDateCalendarProps,
} from "./components/tasks/due-date-calendar.js";

export {
  DueDateCalendarPopover,
  type DueDateCalendarPopoverProps,
} from "./components/tasks/due-date-calendar-popover.js";

export {
  TaskDueDateDropdown,
  type TaskDueDateDropdownProps,
} from "./components/tasks/task-due-date-dropdown.js";

export {
  TaskPriorityIcon,
  type TaskPriorityIconProps,
} from "./components/tasks/task-priority-icon.js";

export {
  TaskDueDateIcon,
  type TaskDueDateIconProps,
} from "./components/tasks/task-due-date-icon.js";

export {
  TaskListPropertyFields,
  type TaskListPropertyFieldsProps,
} from "./components/tasks/task-list-property-fields.js";

export {
  TaskListPriorityLabel,
  TaskListDueDateLabel,
} from "./components/tasks/task-list-property-label.js";

export {
  formatJournalDateSlug,
  getTodayJournalDateSlug,
  isValidJournalDateSlug,
  parseJournalDateSlug,
  formatJournalEntryTitle,
  formatJournalSidePanelLabel,
  getJournalHref,
  getJournalV2Href,
  getSelectedJournalDateFromPathname,
  getSelectedJournalV2DateFromPathname,
  isJournalDetailPath,
  isJournalReservedSlug,
  isJournalSectionPath,
  JOURNAL_DAY_CALENDAR_PANEL_WIDTH_KEY,
} from "./journal/journal.js";

export {
  HABIT_TRACKER_ALL_ID,
  JOURNAL_NAV_ITEMS,
  getHabitTrackerHref,
  getHabitTrackerV2Href,
  getJournalNavHref,
  getSelectedHabitIdFromPathname,
  getSelectedHabitIdFromHabitsV2Pathname,
  getSelectedJournalNavIdFromPathname,
  isJournalHabitsPath,
  isHabitsV2Path,
  isJournalNavId,
  type JournalNavId,
  type JournalNavItem,
} from "./journal/journal-nav.js";

export {
  HABIT_CADENCE_OPTIONS,
  getHabitCadenceLabel,
  isHabitDueYmd,
  parseHabitCadence,
} from "./habits/habit-cadence.js";

export {
  HABIT_SORT_OPTIONS,
  getHabitSortLabel,
  parseHabitSort,
} from "./habits/habit-sort.js";

export {
  deriveHabitTimelineMinimapItems,
  habitTimelineSectionId,
  type HabitTimelineMinimapItem,
} from "./habits/habit-timeline-minimap.js";

export {
  buildHabitDayHeatByYmd,
  buildHabitMonthGrids,
  buildHabitTimelineGrids,
  buildHabitYearMonthGrids,
  earliestHabitInstanceYmd,
  focusYmdForHabitSort,
  habitInstanceCounts,
  isoWeekNumber,
  startOfWeekYmd,
  type HabitDayHeat,
  type HabitDayHeatEntry,
  type HabitDayHeatLevel,
  type HabitDayHeatTone,
  type HabitGridCell,
  type HabitGridCellState,
  type HabitGridInstance,
  type HabitMonthGrid,
  type HabitSortGranularity,
} from "./habits/habit-month-grid.js";

export {
  JournalSidePanelView,
  type JournalSidePanelViewProps,
  type JournalSidePanelLinkComponent,
  type JournalListItem,
} from "./components/journal/journal-side-panel-view.js";

export {
  HabitSidePanelView,
  type HabitListItem,
  type HabitSidePanelLinkComponent,
  type HabitSidePanelViewProps,
} from "./components/habits/habit-side-panel-view.js";

export {
  HabitTrackerView,
  type HabitDayRecordStatus,
  type HabitTrackerProjectOption,
  type HabitTrackerViewProps,
} from "./components/habits/habit-tracker-view.js";

export {
  JournalDetailLayout,
  type JournalDetailLayoutProps,
} from "./components/journal/journal-detail-layout.js";

export { LetterIcon } from "./components/letters/letter-icon.js";

export { DocumentIcon } from "./components/documents/document-icon.js";
export { ContactPersonIcon } from "./components/contacts/contact-person-icon.js";
export { OrganizationIcon } from "./components/organizations/organization-icon.js";
export { DefaultProjectIcon } from "./components/projects/default-project-icon.js";
export { TerminalConsoleIcon } from "./components/icons/terminal-console-icon.js";
export { BrowserWindowIcon } from "./components/icons/browser-window-icon.js";
export { ProjectsSidePanelIcon } from "./components/codebase/projects-side-panel-icon.js";
export {
  ProjectOcticon,
  getDisplayProjectIcon,
  getEntityIconColor as getProjectOcticonDisplayColor,
  type ProjectOcticonProps,
} from "./components/projects/project-octicon.js";
export {
  EntityAvatarIcon,
  type EntityAvatarIconProps,
} from "./components/entity/entity-avatar-icon.js";
export {
  EntityListAvatar,
  type EntityListAvatarProps,
} from "./components/entity/entity-list-avatar.js";
export {
  AssigneeListMark,
  assigneeListInitial,
  type AssigneeListMarkProps,
} from "./components/tasks/assignee-list-mark.js";
export {
  Tooltip,
  type TooltipProps,
  type TooltipSide,
} from "./components/shared/tooltip.js";
export { ProjectAreaBadge } from "./components/projects/project-area-badge.js";
export {
  DROPDOWN_NONE_VALUE,
  DROPDOWN_NO_GOAL_VALUE,
  DROPDOWN_NO_RECURRING_VALUE,
  DROPDOWN_NO_PROJECT_VALUE,
  buildAssigneeDropdownOptions,
  buildContactDropdownOptions,
  buildEmailMailboxDropdownOptions,
  buildOrganizationDropdownOptions,
  buildProjectDropdownOptions,
  resolveDropdownNone,
  resolveDropdownProjectKey,
  type AssigneeDropdownContact,
  type OrganizationDropdownItem,
  type ProjectDropdownItem,
} from "./components/dropdowns/dropdown-options.js";

export { groupItemsByAlphaLetter } from "./shared/alpha-group.js";

export {
  LETTER_DISPLAY_KEY,
  formatLetterDisplayId,
  groupLettersByStatus,
  getFirstLetterInListOrder,
  getLettersHref,
  getLettersV2Href,
  resolveLetterDetailHref,
  getSelectedLetterSlugFromPathname,
  isLettersSectionPath,
  isLettersV2SectionPath,
  isProjectLettersSectionPath,
  isLetterDetailPath,
  normalizeProductPathname,
  letterMatchesSlug,
  parseLetterSlug,
  isLetterEntityIdSlug,
  type LetterListItem,
  type LetterStatusGroup,
} from "./letters/letters.js";

export {
  getLetterListBaseHref,
  resolveScopedLetterDetailHref,
  type LetterRouteScope,
} from "./letters/letter-route-scope.js";

export {
  MEETING_DISPLAY_KEY,
  formatMeetingDisplayId,
  parseMeetingDisplayId,
  resolveMeetingAccentColor,
  resolveMeetingListIconColor,
  defaultNewMeetingTimes,
  getCalendarMeetingHref,
  getCalendarMeetingOverlayHref,
  CALENDAR_MEETING_OVERLAY_PARAM,
  parseCalendarMeetingOverlayId,
  sortMeetingsByStart,
  groupMeetingsByStatus,
  type MeetingListItem,
  type MeetingStatusGroup,
} from "./meetings/meetings.js";

export {
  MANUAL_MEETING_STATUSES,
  INCOMING_MEETING_STATUSES,
  isManualMeetingStatus,
  isIncomingMeetingStatus,
  parseMeetingScheduleInstant,
  deriveMeetingStatusForSchedule,
  resolveMeetingEffectiveStatus,
  isPastCompletedMeeting,
  meetingStatusNeedsReconcile,
} from "./meetings/meeting-status.js";

export {
  buildTaskListMeetingItem,
  isMeetingTaskListItem,
  getMeetingTaskListHref,
  filterMeetingTaskRowsForProject,
} from "./meetings/meeting-list-tasks.js";

export {
  CalendarMeetingDetailOverlay,
  type CalendarMeetingDetailOverlayProps,
} from "./components/calendar/calendar-meeting-detail-overlay.js";

export {
  CalendarTaskDetailOverlay,
  type CalendarTaskDetailOverlayProps,
} from "./components/calendar/calendar-task-detail-overlay.js";

export {
  MeetingDetailView,
  type MeetingDetailViewProps,
  type MeetingContentTab,
} from "./components/meetings/meeting-detail-view.js";

export {
  MEETING_CONTENT_TAB_ORDER,
  resolveMeetingContentTabFromShortcutKey,
} from "./meetings/meeting-content-tab-shortcuts.js";

export { useMeetingContentTabShortcuts } from "./meetings/use-meeting-content-tab-shortcuts.js";

export {
  MeetingFormatToggle,
  type MeetingFormatToggleProps,
} from "./components/meetings/meeting-format-toggle.js";

export {
  MeetingFormatIcon,
} from "./components/meetings/meeting-format-icons.js";

export {
  DEFAULT_MEETING_FORMAT,
  getMeetingFormatLabel,
  isMeetingFormat,
  MEETING_FORMAT_OPTIONS,
  MEETING_FORMATS,
  normalizeMeetingFormat,
  type MeetingFormat,
} from "./meetings/meeting-format.js";

export {
  MeetingPropertiesDisplay,
  type MeetingPropertiesDisplayProps,
} from "./components/meetings/meeting-properties-display.js";

export {
  MeetingPropertiesInlineChips,
  type MeetingPropertiesInlineChipsProps,
  type MeetingPropertiesMeeting,
} from "./components/meetings/meeting-properties-inline-chips.js";

export {
  MeetingScheduleDropdown,
  type MeetingScheduleDropdownProps,
} from "./components/meetings/meeting-schedule-dropdown.js";

export {
  EMAIL_DISPLAY_KEY,
  formatEmailDisplayId,
  parseEmailDisplayId,
} from "./email/email-display-id.js";

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
  resolveListItemFromSlug,
  getKnowledgeHref,
  getKnowledgeV2Href,
  getSelectedKnowledgeSlugFromPathname,
  getSelectedKnowledgeV2SlugFromPathname,
  isKnowledgeSectionPath,
  isKnowledgeV2SectionPath,
  getProjectsHref,
  isProjectsPath,
  getSelectedBankAccountSlugFromPathname,
  isFinanceSectionPath,
  bankAccountMatchesSlug,
  type OrganizationListItem,
  type ContactListItem,
  type KnowledgeListItem,
  type ProjectListItem,
  type BankAccountListItem,
} from "./navigation/entity-routes.js";

export {
  BANK_ACCOUNT_SECTION_IDS,
  BANK_ACCOUNT_SECTIONS,
  isBankAccountSectionId,
  parseBankAccountSectionId,
  getBankAccountSectionHref,
  getFinanceHref,
  type BankAccountSectionId,
  type BankAccountSectionConfig,
} from "./finance/bank-account-sections.js";

export {
  groupTransactionsByMonthWeek,
  startOfWeekMonday,
  type TransactionMonthGroup,
  type TransactionWeekGroup,
} from "./finance/group-transactions-by-month-week.js";

export { suggestOrganizationForPayee } from "./finance/suggest-organization-for-payee.js";

export {
  FinanceCsvDropzone,
  type FinanceCsvDropzoneProps,
} from "./components/finance/finance-csv-dropzone.js";

export {
  FinanceTransactionsView,
  FinanceTransactionDetailPanel,
  TransactionActionsMenu,
  type FinanceBankAccountCreateInput,
  type FinanceTransactionDetailPanelProps,
  type FinanceTransactionPatch,
  type FinanceTransactionsChromeState,
  type FinanceTransactionsViewProps,
} from "./components/finance/finance-transactions-view.js";

export {
  FinanceBankAccountModal,
  type FinanceBankAccountModalProps,
  type FinanceBankAccountModalValues,
  type FinanceMoneybirdAccountOption,
} from "./components/finance/finance-bank-account-modal.js";

export {
  FinanceImportModal,
  type FinanceImportModalProps,
} from "./components/finance/finance-import-modal.js";

export {
  FinanceCategoriesSettingsModal,
  type FinanceCategoriesSettingsModalProps,
} from "./components/finance/finance-categories-settings-modal.js";

export {
  FinanceSidePanelNavView,
  FinanceSectionNavIcon,
  financeSidePanelAccountKeyboardId,
  parseFinanceSidePanelKeyboardId,
  resolveFinanceSidePanelHref,
  type FinanceSidePanelLinkComponent,
  type FinanceSidePanelNavViewProps,
} from "./components/finance/finance-side-panel-nav-view.js";

export {
  FINANCE_NAV_IDS,
  FINANCE_NAV_ITEMS,
  FINANCE_ACCOUNT_GROUP_IDS,
  BANK_ACCOUNT_TYPE_OPTIONS,
  groupBankAccountsForFinanceNav,
  bankAccountTypeLabel,
  bankAccountTypeForFinanceAccountGroupId,
  financeAccountGroupIdForType,
  getFinanceNavHref,
  getFinanceDashboardHref,
  getFinanceTransactionsHref,
  getFinanceAccountHref,
  getSelectedFinanceNavIdFromPathname,
  isFinanceNavId,
  isFinanceAccountPath,
  DEFAULT_FINANCE_GO_NAVIGATION_ITEMS,
  FINANCE_GO_LETTER_HINT,
  financeGoNavigationItemSearchValue,
  type FinanceNavId,
  type FinanceNavItem,
  type FinanceAccountGroupId,
  type FinanceAccountGroup,
  type FinanceGoNavigationItem,
} from "./finance/finance-nav.js";

export {
  AccountActionsMenu,
  FinanceAccountsView,
  type FinanceAccountsChromeState,
  type FinanceAccountMetrics,
  type FinanceAccountUpdateInput,
  type FinanceAccountsViewProps,
} from "./components/finance/finance-accounts-view.js";

export {
  CategoryActionsMenu,
  FinanceCategoriesView,
  FinanceTransactionsPanelList,
  type FinanceCategoriesChromeState,
  type FinanceCategoriesViewProps,
  type FinanceCategoryCreateInput,
  type FinanceCategoryGroupOption,
  type FinanceCategoryMetrics,
  type FinanceCategoryMonthMetric,
  type FinanceCategoryOrganization,
  type FinanceCategoryTransactionPatch,
  type FinanceCategoryUpdateInput,
  type FinanceCategoryYearMetric,
} from "./components/finance/finance-categories-view.js";

export {
  FINANCE_CHROME_DROPDOWN_TRIGGER_CLASSNAME,
  FINANCE_FILTER_ALL_VALUE,
  FinanceTransactionsFilterBar,
  type FinanceTransactionsFilterBarProps,
} from "./components/finance/finance-transactions-filter-bar.js";

export {
  FinanceAmountRangeFilter,
  type FinanceAmountRangeFilterProps,
} from "./components/finance/finance-amount-range-filter.js";

export {
  buildAmountHistogramBins,
  computeAmountRangeDomain,
  DEFAULT_AMOUNT_RANGE_EXTENT_CENTS,
  filterFinanceTransactions,
  isFullAmountRange,
  type AmountHistogramBin,
  type AmountRangeDomain,
  type FinanceTransactionListFilters,
} from "./finance/filter-finance-transactions.js";

export {
  CategorySpendChart,
  type CategorySpendChartProps,
} from "./components/finance/category-spend-chart.js";

export {
  FinanceOverviewPie,
  type FinanceOverviewPieProps,
  type FinanceOverviewPieSlice,
} from "./components/finance/finance-overview-pie.js";

export {
  GoalActionsMenu,
  FinanceGoalsView,
  computeGoalSavedCents,
  nextGoalListingForSavings,
  resolveGoalSavedCents,
  shouldPromoteGoalToReadyToSpend,
  type FinanceGoalsChromeState,
  type FinanceGoalsViewProps,
  type FinanceGoalCreateInput,
  type FinanceGoalUpdateInput,
} from "./components/finance/finance-goals-view.js";

export {
  FinanceCashflowView,
  type FinanceCashflowViewProps,
} from "./components/finance/finance-cashflow-view.js";

export {
  CashflowPlannerScratchpad,
  type CashflowPlannerScratchpadProps,
} from "./components/finance/cashflow-planner-scratchpad.js";

export {
  FinanceSpendSidePanel,
  type FinanceSpendSidePanelProps,
} from "./components/finance/finance-spend-side-panel.js";

export {
  NetIncomeYearChart,
  type NetIncomeYearChartProps,
} from "./components/finance/net-income-year-chart.js";

export {
  CashflowIncomeYearChart,
  CashflowSpendYearChart,
  type CashflowIncomeYearChartProps,
  type CashflowSpendYearChartProps,
} from "./components/finance/cashflow-spend-income-charts.js";

export {
  RecurringActionsMenu,
  FinanceRecurringsView,
  recurringDateGroup,
  type FinanceRecurringsChromeState,
  type FinanceRecurringsViewProps,
  type FinanceRecurringCreateInput,
  type FinanceRecurringUpdateInput,
  type FinanceRecurringMetrics,
  type RecurringDateGroup,
} from "./components/finance/finance-recurrings-view.js";

export { advanceMonthlyNextDate, upcomingMonthlyPaymentDate } from "./finance/recurring-next-date.js";

export {
  RecurringYearChart,
  type RecurringYearChartProps,
} from "./components/finance/recurring-year-chart.js";

export {
  GoalProgressChart,
  type GoalProgressChartProps,
} from "./components/finance/goal-progress-chart.js";

export {
  buildGoalChartSeries,
  goalChartHasPlan,
  type BuildGoalChartSeriesInput,
  type GoalChartPoint,
  type GoalChartSeries,
} from "./finance/goal-chart-series.js";

export {
  buildCategorySpendBarSeries,
  categorySpendChartHasData,
  CATEGORY_SPEND_DIRECT_KEY,
  type CategorySpendBarSeries,
  type CategorySpendMonthInput,
} from "./finance/category-spend-chart-series.js";

export {
  FinanceSectionPlaceholder,
  type FinanceSectionPlaceholderProps,
} from "./components/finance/finance-section-placeholder.js";

export {
  FinanceInvoicesView,
  type FinanceInvoicesViewProps,
} from "./components/finance/finance-invoices-view.js";
export {
  FinanceInvoiceDetailDocument,
  type FinanceInvoiceDetailDocumentProps,
} from "./components/finance/finance-invoice-detail-document.js";
export {
  FinanceSyncIcon,
  type FinanceSyncIconProps,
} from "./components/finance/finance-sync-icon.js";

export {
  FINANCE_INVOICE_STATUS_OPTIONS,
  FinanceInvoicesFilterBar,
  type FinanceInvoicesFilterBarProps,
} from "./components/finance/finance-invoices-filter-bar.js";

export {
  buildMoneybirdContactInvoicesFilter,
  buildMoneybirdInvoicesFilter,
  filterFinanceInvoices,
  type FinanceInvoiceFilterRow,
  type FinanceInvoiceListFilters,
} from "./finance/filter-finance-invoices.js";

export {
  FinanceMonthNavigator,
  FinanceYearNavigator,
  asOfForMonthKey,
  formatMonthKey,
  formatMonthLong,
  localCalendarYear,
  localMonthKey,
  parseMonthKey,
  shiftMonthKey,
  type FinanceMonthNavigatorProps,
  type FinanceYearNavigatorProps,
} from "./components/finance/finance-month-navigator.js";

export {
  accountChartHasYearActivity,
  aggregateBankAccountCashflowMonths,
  buildAccountIncomeExpenseChartSeries,
  buildAccountIncomeExpenseChartSeriesFromCashflow,
  buildMonthIncomeExpenseDailyChartSeries,
  type AccountChartPoint,
  type AccountChartSeries,
} from "./finance/account-income-expense-chart-series.js";

export {
  FinanceChartLoading,
  FinanceChartEmpty,
  FinanceChartFadeIn,
  type FinanceChartLoadingProps,
  type FinanceChartEmptyProps,
  type FinanceChartFadeInProps,
} from "./components/finance/finance-chart-status.js";

export {
  FinanceChartTooltip,
  type FinanceChartTooltipProps,
} from "./components/finance/finance-chart-tooltip.js";

export {
  FinanceDashboardView,
  type FinanceDashboardTopCategory,
  type FinanceDashboardViewProps,
} from "./components/finance/finance-dashboard-view.js";

export {
  FinanceDetailSectionTitle,
  type FinanceDetailSectionTitleProps,
} from "./components/finance/finance-detail-section-title.js";

export {
  AssetsDebtChart,
  type AssetsDebtChartProps,
} from "./components/finance/assets-debt-chart.js";

export {
  DEFAULT_SETTINGS_TAB,
  SETTINGS_NAV_TABS,
  SETTINGS_TAB_GROUP_ORDER,
  SETTINGS_SHORTCUT_HINT,
  getSettingsTabFromPath,
  getSettingsTabMeta,
  getSettingsSectionLabel,
  getDefaultSettingsHref,
  isSettingsPath,
  isSettingsTabId,
  type SettingsTabId,
  type SettingsTabGroup,
} from "./navigation/settings.js";

export {
  StatusGroupSection,
  type StatusGroupSectionProps,
  type StatusGroupSectionListDrag,
  type StatusGroupSectionSelection,
} from "./components/list-nav/status-group-section.js";

export {
  OrganizationsSidePanelView,
  type OrganizationsSidePanelViewProps,
} from "./components/organizations/organizations-side-panel-view.js";

export {
  ContactsSidePanelView,
  CONTACTS_SIDE_PANEL_ALL_ID,
  type ContactsSidePanelViewProps,
  type ContactsSidePanelGroupItem,
  type ContactsSidePanelLinkComponent,
  type UpdateCrmGroupInput,
} from "./components/contacts/contacts-side-panel-view.js";

export {
  LettersSidePanelView,
  type LettersSidePanelViewProps,
} from "./components/letters/letters-side-panel-view.js";

export {
  KnowledgeSidePanelView,
  type KnowledgeSidePanelViewProps,
  type KnowledgeSidePanelLinkComponent,
  type KnowledgeSidePanelMutationResult,
} from "./components/documents/knowledge-side-panel-view.js";

export {
  EntityDetailLayout,
  type EntityDetailLayoutProps,
} from "./components/entity/entity-detail-layout.js";

export {
  SettingsSidePanelNavView,
  type SettingsSidePanelLinkComponent,
  type SettingsSidePanelNavViewProps,
} from "./components/settings/settings-side-panel-nav-view.js";

export {
  SettingsDetailLayout,
  type SettingsDetailLayoutProps,
} from "./components/settings/settings-detail-layout.js";

export {
  SettingsContentHeader,
  type SettingsContentHeaderProps,
} from "./components/settings/settings-content-header.js";

export {
  AccountSettingsSectionView,
  ComingSoonSettingsSectionView,
  GeneralSettingsSectionView,
  GithubSettingsSectionView,
  IntegrationConnectionSettingsView,
  type AccountSettingsSectionViewProps,
  type ComingSoonSettingsSectionViewProps,
  type GeneralSettingsSectionViewProps,
  type GithubSettingsOrganization,
  type GithubSettingsSectionViewProps,
  type IntegrationConnectionSettingsViewProps,
} from "./components/settings/settings-sections.js";

export {
  ApiKeysSettingsSectionView,
  type ApiKeysSettingsSectionViewProps,
  type SettingsApiKeyItem,
  type SettingsApiKeyContactOption,
} from "./components/settings/api-keys-settings-section-view.js";

export {
  APP_TIMEZONE_OPTIONS,
  DEFAULT_APP_TIMEZONE,
  isValidAppTimezone,
  normalizeAppTimezone,
} from "./shared/app-timezone.js";

export {
  ProjectsListView,
  type ProjectsListViewProps,
} from "./components/projects/projects-list-view.js";

export {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_ORDER,
  isProjectStatus,
  getProjectStatusLabel,
  migrateLegacyProjectStatus,
  type ProjectStatus,
} from "./projects/project-status.js";

export {
  PROJECT_TYPES,
  PROJECT_TYPE_LABELS,
  PROJECT_TYPE_ORDER,
  isProjectType,
  getProjectTypeLabel,
  migrateLegacyProjectType,
  type ProjectType,
} from "./projects/project-type.js";

export {
  describeProjectProgressHexagonPath,
  describeProjectProgressPieWedge,
  PROJECT_PROGRESS_HEX_STROKE_WIDTH,
  PROJECT_BACKLOG_HEX_STROKE_DASHARRAY,
  computeProjectTaskProgressRatio,
  formatProjectTaskProgressPercent,
  formatProjectTaskProgressLabel,
  type ProjectTaskProgress,
} from "./projects/project-progress-ring.js";

export {
  computeProjectStatusIconModel,
  mapProjectStatusToTaskStatusIcon,
  type ProjectStatusIconModel,
} from "./projects/project-status-icon-model.js";

export {
  ProjectStatusIcon,
  type ProjectStatusIconProps,
} from "./components/projects/project-status-icon.js";

export {
  ProjectProgressRing,
  type ProjectProgressRingProps,
} from "./components/projects/project-progress-ring.js";

export {
  groupTasksByStatus,
  type TaskStatusGroup,
  type TaskLikeForGrouping,
  type GroupTasksByStatusOptions,
} from "./tasks/group-tasks-by-status.js";

export {
  mapMarkdownOutsideCode,
  normalizeMarkdownTaskLists,
  parseMarkdownTaskCheckbox,
  findMarkdownTaskListCheckboxes,
  toggleMarkdownTaskListItem,
  type MarkdownTaskCheckboxParse,
  type MarkdownTaskListCheckboxMatch,
} from "./documents/markdown-task-list.js";

export { getTaskListItemChecked } from "./documents/markdown-task-list-checked.js";

export {
  MarkdownTaskCheckbox,
  type MarkdownTaskCheckboxProps,
} from "./components/documents/markdown-task-checkbox.js";

export {
  PolishedCheckbox,
  type PolishedCheckboxProps,
} from "./components/shared/polished-checkbox.js";
export {
  SwitchToggle,
  type SwitchToggleProps,
} from "./components/shared/switch-toggle.js";
export {
  EntityOverviewSubgroup,
  type EntityOverviewSubgroupProps,
} from "./components/shared/entity-overview-subgroup.js";

export {
  MarkdownTaskListInteractProvider,
  useMarkdownTaskListInteract,
  type MarkdownTaskListInteract,
} from "./documents/markdown-task-list-interact.js";

export {
  groupProjectsByStatus,
  type ProjectStatusGroup,
  type ProjectLikeForGrouping,
  type GroupProjectsByStatusOptions,
} from "./projects/group-projects-by-status.js";

export {
  groupProjectsByArea,
  groupProjectsByNestedArea,
  getProjectAreaGroupLabel,
  projectAreaGroupKey,
  projectNestedAreaCollapseKey,
  type ProjectAreaGroup,
  type ProjectAreaGroupKey,
  type NestedAreaRef,
  type NestedAreaGroup,
  type NestedAreaBucket,
  type ProjectLikeForAreaGrouping,
  type GroupProjectsByAreaOptions,
} from "./projects/group-projects-by-area.js";

export {
  groupProjectsByOrganization,
  projectOrganizationCollapseKey,
  type OrganizationRef,
  type OrganizationBucket,
  type ProjectLikeForOrganizationGrouping,
} from "./projects/group-projects-by-organization.js";

export {
  groupProjectsByType,
  projectTypeCollapseKey,
  type ProjectTypeGroup,
  type ProjectLikeForTypeGrouping,
} from "./projects/group-projects-by-type.js";

export {
  ProjectTypeGroupSection,
  type ProjectTypeGroupSectionProps,
  type ProjectTypeGroupSectionListDrag,
  type ProjectTypeGroupSectionSelection,
} from "./components/projects/project-type-group-section.js";

export {
  PROJECT_AREA_LIST_DRAG_TYPE,
  PROJECT_AREA_LIST_DRAG_FALLBACK_TYPE,
  projectAreaOrderKey,
  projectAreaGroupAppendOrderKey,
  createProjectAreaDragPayload,
  readProjectAreaDragPayload,
  writeProjectAreaDragPayload,
  isProjectAreaListDragActive,
  resolveProjectAreaDropBeforeProject,
  resolveProjectAreaDropOnGroupAppend,
  type ProjectAreaReorderRequest,
  type ProjectAreaDragPayload,
  type ProjectLikeForAreaDrag,
} from "./projects/project-area-list-drag.js";

export {
  applyOptimisticProjectAreaReorder,
  projectAreaReorderPatches,
  type ProjectLikeForAreaReorder,
} from "./projects/project-area-reorder.js";

export {
  PROJECT_LIST_DRAG_TYPE,
  PROJECT_LIST_DRAG_FALLBACK_TYPE,
  projectOrderKey,
  projectGroupAppendOrderKey,
  createProjectDragPayload,
  writeProjectDragPayload,
  readProjectDragPayload,
  isProjectListDragActive,
  resolveProjectDropBeforeProject,
  resolveProjectDropOnGroupAppend,
  type ProjectReorderRequest,
  type ProjectDragPayload,
  type ProjectLikeForDrag,
} from "./projects/project-list-drag.js";

export {
  applyOptimisticProjectReorder,
  projectReorderPatches,
  type ProjectLikeForReorder,
} from "./projects/project-reorder.js";

export {
  applyOptimisticGroupedSortReorder,
  applyOptimisticGoalReorder,
  goalReorderPatches,
  financeGoalOrderKey,
  financeGoalGroupKey,
  financeGoalGroupAppendOrderKey,
  applyOptimisticAccountReorder,
  accountReorderPatches,
  financeAccountOrderKey,
  financeAccountGroupKey,
  financeAccountGroupAppendOrderKey,
  applyOptimisticRecurringReorder,
  recurringReorderPatches,
  financeRecurringOrderKey,
  financeRecurringGroupAppendOrderKey,
  applyOptimisticCategoryReorder,
  categoryReorderPatches,
  financeCategoryOrderKey,
  financeCategoryGroupKey,
  financeCategoryListingGroupKey,
  financeCategoryParentGroupKey,
  financeCategoryGroupAppendOrderKey,
  parseFinanceCategoryGroupKey,
  type FinanceListReorderRequest,
  type RecurringReorderGroup,
  type RecurringGroupResolver,
} from "./finance/finance-list-reorder.js";

export {
  formatMoneyInput,
  moneyCentsToInput,
  moneyInputContentWidth,
  parseMoneyInput,
} from "./finance/money-input.js";

export {
  measureFinanceMoneyLabelWidthPx,
  useFinanceMoneyColumnWidthFromValues,
  useFinanceMoneyColumnWidthPx,
} from "./finance/finance-money-column-width.js";

export {
  buildNetThisMonthPeriods,
  computeNetThisMonthStats,
  formatNetThisMonthRangeLabel,
  previousMonthKey,
  resolveNetThisMonthAsOfDay,
  type NetThisMonthPeriod,
  type NetThisMonthStats,
} from "./finance/net-this-month.js";

export {
  buildNonCashflowCategoryIdSet,
  isCashflowCategory,
  isCashflowTransaction,
} from "./finance/cashflow-exclusion.js";

export {
  categoryNetSpendAbsCents,
  categoryNetSpendDisplayCents,
  categoryNetSpendSign,
  toCategoryNetSpendCents,
  type CategoryNetSpendSign,
} from "./finance/category-net-spend.js";

export {
  applyShiftRangeSelection,
  useKeyHeld,
} from "./list-nav/shift-range-selection.js";

export { useListMultiSelect } from "./list-nav/use-list-multi-select.js";
export type { UseListMultiSelectOptions } from "./list-nav/use-list-multi-select.js";

export {
  isSelectAllShortcut,
  shouldHandleSelectAllShortcut,
  selectAllInFocusedEditable,
  SELECT_ALL_EVENT,
} from "./list-nav/list-select-all-shortcut.js";

export {
  useListSelectAllShortcut,
  handleSelectAllRequest,
  installSelectAllShortcutListeners,
} from "./list-nav/use-list-select-all-shortcut.js";

export { shouldHandleClearSelectionShortcut } from "./list-nav/list-clear-selection-shortcut.js";

export {
  useListClearSelectionShortcut,
  useListDismissDetailShortcut,
  installClearSelectionShortcutListeners,
  shouldYieldListKeyboardEscapeToShortcutStack,
  isListDetailPanelOpen,
  ENTITY_TITLE_INPUT_ATTRIBUTE,
  isEntityTitleInputFocused,
  isOverviewNameEditorInputFocused,
} from "./list-nav/use-list-clear-selection-shortcut.js";

export {
  isToggleHighlightedSelectionShortcut,
  shouldHandleToggleHighlightedSelectionShortcut,
} from "./list-nav/list-toggle-highlighted-selection-shortcut.js";

export { useListToggleHighlightedSelectionShortcut } from "./list-nav/use-list-toggle-highlighted-selection-shortcut.js";

export {
  TASK_LIST_DRAG_TYPE,
  TASK_LIST_DRAG_FALLBACK_TYPE,
  taskOrderKey,
  taskGroupAppendOrderKey,
  createTaskDragPayload,
  writeTaskDragPayload,
  readTaskDragPayload,
  isTaskListDragActive,
  resolveTaskDropBeforeTask,
  resolveTaskDropOnGroupAppend,
  type TaskReorderRequest,
  type TaskDragPayload,
  type TaskLikeForDrag,
} from "./tasks/task-list-drag.js";

export {
  applyOptimisticTaskReorder,
  taskReorderPatches,
  type TaskLikeForReorder,
} from "./tasks/task-reorder.js";

export {
  LIST_REORDER_ITEM_ATTR,
  LIST_REORDER_GROUP_ATTR,
  LIST_REORDER_APPEND_ATTR,
  LIST_REORDER_NO_DRAG_SELECTOR,
  resolveGroupedListPointerDropTarget,
  groupedListPointerDropToRequest,
  insertBeforeKeyForPointerTarget,
  type GroupedListPointerDropTarget,
  type GroupedListPointerReorderRequest,
} from "./list-nav/grouped-list-pointer-reorder.js";

export {
  useGroupedListPointerReorder,
  type GroupedListPointerItemBind,
  type GroupedListPointerAppendBind,
  type UseGroupedListPointerReorderOptions,
} from "./list-nav/use-grouped-list-pointer-reorder.js";

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
} from "./tasks/tasks-due-filters.js";

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
} from "./projects/project-areas.js";

export { PillNav, type PillNavProps, type PillNavItem } from "./components/shared/pill-nav.js";

export {
  ListBoardViewShell,
  SegmentedPillToggle,
  type ListBoardView,
  type ListBoardViewShellProps,
  type SegmentedPillToggleOption,
} from "./components/list-nav/list-board-view-shell.js";

export {
  OVERLAY_SCROLLBAR_LEGEND_SCROLL_CLASS,
  OVERLAY_SCROLLBAR_MIN_THUMB_PX,
  OVERLAY_SCROLLBAR_OPT_OUT_ATTR,
  OVERLAY_SCROLLBAR_THUMB_WIDTH_PX,
  computeOverlayScrollbarFixedBox,
  computeOverlayScrollbarThumb,
  resolveOverlayScrollbarTarget,
  resolveScrollEventTarget,
  shouldTrackOverlayScrollbar,
  type OverlayScrollbarFixedBox,
  type OverlayScrollbarThumbInput,
  type OverlayScrollbarThumbMetrics,
} from "./list-nav/overlay-scrollbar.js";

export {
  OVERLAY_SCROLLBAR_IDLE_MS,
  useOverlayScrollbar,
} from "./list-nav/use-overlay-scrollbar.js";

export {
  TaskItemRow,
  type TaskItemRowProps,
  type TaskItemRowTask,
} from "./components/tasks/task-item-row.js";

export {
  TaskBulkEditBar,
  type TaskBulkEditBarProps,
  type TaskBulkPatch,
} from "./components/tasks/task-bulk-edit-bar.js";

/** @deprecated Prefer `TaskItemRow` / `TaskItemRowTask`. */
export {
  TaskOverviewRow,
  type TaskOverviewRowProps,
  type TaskOverviewRowTask,
} from "./components/tasks/task-overview-row.js";

/** @deprecated Prefer `TaskItemRow`. */
export {
  TaskWorkbenchRow,
  type TaskWorkbenchRowProps,
} from "./components/tasks/task-workbench-row.js";

export {
  HabitCheckChips,
  TasksTodayHabitsChips,
  collapseHabitItemsByHabitId,
  type HabitCheckChipItem,
  type HabitCheckChipsProps,
  type TasksTodayHabitsChipsProps,
} from "./components/tasks/tasks-today-habits-chips.js";

export {
  TasksOverviewView,
  type TasksOverviewViewProps,
} from "./components/tasks/tasks-overview-view.js";

export {
  ProjectTasksView,
  type ProjectTasksViewProps,
} from "./components/projects/project-tasks-view.js";

export {
  ProjectTasksWorkbenchView,
  type ProjectTasksWorkbenchViewProps,
} from "./components/projects/project-tasks-workbench-view.js";

export {
  ProjectOverviewRow,
  ProjectsListHeader,
  type ProjectOverviewRowProps,
  type ProjectOverviewRowProject,
} from "./components/projects/project-overview-row.js";

export {
  ProjectBoardCard,
  type ProjectBoardCardProps,
  type ProjectBoardCardProject,
} from "./components/projects/project-board-card.js";

export {
  ProjectsOverviewView,
  type ProjectsOverviewViewProps,
} from "./components/projects/projects-overview-view.js";

export {
  AreasOverviewView,
  type AreasOverviewViewProps,
} from "./components/projects/areas-overview-view.js";

export {
  ProjectDetailView,
  type ProjectDetailViewProps,
  type ProjectDetailViewProject,
  type ProjectDetailNestedArea,
} from "./components/projects/project-detail-view.js";

export {
  ProjectPanelDetailView,
  type ProjectPanelDetailViewProps,
} from "./components/projects/project-panel-detail-view.js";

export {
  ProjectKeyEditor,
  type ProjectKeyEditorProps,
} from "./components/projects/project-key-editor.js";

export {
  allocateUniqueProjectKey,
  buildProjectKeyRenameRedirectPath,
  buildTaskProjectChangeRedirectPath,
  encodeProjectSlug,
  isValidProjectKey,
  normalizeProjectKey,
  type TaskProjectChangeRedirectInput,
} from "./projects/project-key.js";

export {
  DEFAULT_PROJECT_KEY_COLUMN_CH,
  PROJECT_KEY_COLUMN_CH_SLACK,
  computeProjectKeyColumnCh,
  projectKeyColumnCssVars,
  type ProjectKeyColumnWidthSource,
} from "./projects/project-key-column-width.js";

export {
  ProjectLettersSectionView,
  type ProjectLettersSectionViewProps,
} from "./components/projects/project-letters-section-view.js";

export {
  ProjectLettersView,
  type ProjectLettersViewProps,
} from "./components/projects/project-letters-view.js";

export {
  ProjectDocumentsSectionView,
  type ProjectDocumentsSectionViewProps,
} from "./components/projects/project-documents-section-view.js";

export {
  ProjectDocumentsView,
  type ProjectDocumentsViewProps,
} from "./components/projects/project-documents-view.js";

export {
  ProjectDocumentsSidePanelView,
  type ProjectDocumentsSidePanelViewProps,
  type ProjectDocumentsSidePanelMutationResult,
  type ProjectDocumentsSidePanelLinkComponent,
} from "./components/projects/project-documents-side-panel-view.js";

export {
  DocumentTreeNodeView,
  type DocumentTreeLinkComponent,
} from "./components/documents/document-tree.js";

export { AddFolderInline } from "./components/documents/add-folder-inline.js";

export { FolderPlusIcon } from "./components/icons/folder-plus-icon.js";

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
} from "./documents/document-tree.js";

export {
  treeNodeOrderKey,
  parseTreeDragPayload,
  type TreeDragItemType,
  type TreeDragPayload,
  type TreeReorderRequest,
} from "./documents/document-tree-order.js";

export {
  DOCUMENT_TREE_DRAG_TYPE,
  DOCUMENT_TREE_DRAG_FALLBACK_TYPE,
  createTreeDragPayload,
  writeTreeDragPayload,
  readTreeDragPayload,
  isTreeDragActive,
  resolveFolderDragOverMode,
  resolveTreeDropAction,
} from "./documents/document-tree-drag.js";

export {
  registerDocumentTreeDeleteResolver,
  resolveDocumentTreeDeleteConfig,
} from "./documents/document-tree-delete-shortcut.js";

export {
  registerDocumentTreeCreateFolderHandler,
  requestDocumentTreeCreateFolder,
} from "./documents/document-tree-create-folder-shortcut.js";

export {
  DOCUMENT_TREE_CREATE_FOLDER_SHORTCUT_HINT,
  isProjectDocumentsSectionPath,
  isDocumentLibrarySectionPath,
  isDocumentTreeCreateFolderShortcutKey,
  hasDocumentTreeCreateFolderShortcutModifiers,
  shouldHandleDocumentTreeCreateFolderShortcut,
} from "./documents/should-handle-document-tree-create-folder-shortcut.js";

export { useDocumentTreeCreateFolderShortcut } from "./documents/use-document-tree-create-folder-shortcut.js";

export {
  DocumentsEmptyCreateView,
  type DocumentsEmptyCreateResult,
  type DocumentsEmptyCreateViewProps,
} from "./components/documents/documents-empty-create-view.js";

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
} from "./projects/project-sections.js";

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
} from "./projects/project-route-scope.js";

export {
  getContactRouteScopeFromPathname,
  getOrganizationContactHref,
  getScopedContactBasePath,
  getScopedContactEmailHref,
  getScopedContactEmailsListHref,
  getScopedContactLetterHref,
  getScopedContactMeetingHref,
  getScopedContactMeetingsListHref,
  getScopedContactSectionHref,
  getScopedContactTaskHref,
  getScopedContactsListHref,
  isContactScopedEntityDetailPath,
  isOrganizationContactDetailPath,
  parseContactScopedEntityDetail,
  parseOrganizationContactRoute,
  type ContactRouteScope,
  type ContactScopedEntityDetail,
} from "./contacts/contact-route-scope.js";

export {
  ResizableSidePanel,
  RESIZABLE_SIDE_PANEL_LG_MEDIA_QUERY,
  readStoredPanelWidth,
  type ResizableSidePanelProps,
} from "./components/shell/resizable-side-panel.js";

export {
  FloatingPillToggleDock,
  FLOATING_PILL_TOGGLE_DOCK_CLASS,
  type FloatingPillToggleDockProps,
} from "./components/shared/floating-pill-toggle-dock.js";

export {
  TASK_PROPERTIES_PANEL_WIDTH_KEY,
  TASK_PROPERTIES_PANEL_LEGACY_WIDTH_KEYS,
  LEGACY_INBOX_TASK_PROPERTIES_PANEL_WIDTH_KEY,
  LETTER_PROPERTIES_PANEL_WIDTH_KEY,
  EMAIL_PROPERTIES_PANEL_WIDTH_KEY,
  MEETING_PROPERTIES_PANEL_WIDTH_KEY,
  isTaskDetailPath,
} from "./content/properties-panel.js";

export {
  EntityPropertiesSection,
  TaskDetailPropertiesSection,
  type EntityPropertiesSectionProps,
} from "./components/entity/entity-properties-section.js";

export {
  PropertyFieldGroup,
  type PropertyFieldGroupProps,
} from "./components/content/property-field-group.js";

export {
  TaskPropertiesDisplay,
  type TaskPropertiesDisplayProps,
  type TaskPropertiesDisplayTask,
} from "./components/tasks/task-properties-display.js";

export {
  TaskPropertiesInlineChips,
  type TaskPropertiesInlineChipsProps,
} from "./components/tasks/task-properties-inline-chips.js";

export {
  SupportContactCard,
  type SupportContactCardProps,
} from "./components/tasks/support-contact-card.js";

export {
  SupportOrganizationCard,
  type SupportOrganizationCardProps,
} from "./components/tasks/support-organization-card.js";

export type {
  SupportContactCardModel,
  SupportOrganizationCardModel,
  SupportPartyEmail,
  SupportPartyPhone,
} from "./components/tasks/support-party-card-types.js";

export {
  resolveSupportParties,
  type ResolveSupportPartiesInput,
  type ResolvedSupportParties,
  type SupportPartyTaskLike,
} from "./tasks/resolve-support-parties.js";

export {
  LetterPropertiesDisplay,
  type LetterPropertiesDisplayProps,
  type LetterPropertiesDisplayLetter,
} from "./components/letters/letter-properties-display.js";

export {
  DetailWithPropertiesLayout,
  type DetailWithPropertiesLayoutProps,
} from "./components/content/detail-with-properties-layout.js";

export {
  DocumentMarkdownEditor,
  type DocumentMarkdownEditorProps,
} from "./components/documents/document-markdown-editor.js";

export {
  DocumentMentionMenu,
  type DocumentMentionMenuProps,
} from "./components/documents/document-mention-menu.js";

export { MentionLeadingIcon } from "./components/mentions/mention-leading-icon.js";
export { NamedLinkChip } from "./components/mentions/named-link-chip.js";

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
  preferredContactMentionDisplayId,
  resolveMentionHref,
  rewriteContactMentionTokensToDisplayIds,
} from "./mentions/tokens.js";

export {
  ClientLink,
  ClientLinkProvider,
  type ClientLinkComponent,
  type ClientLinkProps,
} from "./shared/client-link.js";

export { isInternalAppHref } from "./navigation/is-internal-app-href.js";

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
  namedLinkDecorations,
  type MentionMenuKeyHandlers,
} from "./mentions/codemirror/index.js";

export type {
  MentionCatalog,
  MentionCatalogContact,
  MentionCatalogDocument,
  MentionCatalogEmail,
  MentionCatalogLetter,
  MentionCatalogOrganization,
  MentionCatalogProject,
  MentionCatalogTask,
  MentionItem,
  MentionMenuTriggerState,
  MentionSection,
} from "./mentions/mention-menu-types.js";

export {
  ContentMarkdownDescriptionLayout,
  type ContentMarkdownDescriptionLayoutProps,
} from "./components/content/content-markdown-description-layout.js";

export {
  ContentMarkdownViewLayout,
  ContentMarkdownPreviewColumn,
  ContentMarkdownPreviewBody,
  ContentMarkdownPreviewTitleSlot,
  useMarkdownDetailEditor,
  type ContentMarkdownViewLayoutProps,
  type ContentMarkdownViewMode,
  type MarkdownDetailEditorMode,
} from "./components/content/content-markdown-view-layout.js";

export {
  DOCUMENT_CONTENT_MAX_WIDTH,
  DOCUMENT_BODY_COLOR,
  DOCUMENT_MARKER_COLOR,
  documentEditorTheme,
  documentEditorHighlightStyle,
  documentEditorSyntaxHighlighting,
  createDocumentEditorContentLayoutTheme,
} from "./documents/document-editor-theme.js";

export {
  documentEditorListBullets,
  isCursorInRange,
  isTaskListMarkAfter,
  isUnorderedListMark,
  listMarkReplaceTo,
  LIST_BULLET_GUTTER,
} from "./documents/document-editor-list-bullets.js";

export {
  documentEditorListHangIndent,
  listHangIndentColumns,
  LIST_HANG_INDENT_PREFIX,
} from "./documents/document-editor-list-hang-indent.js";

export {
  parseMarkdownDocument,
  serializeMarkdownDocument,
  stripDuplicateDocumentTitleHeading,
  getDocumentEditorBody,
  serializeDocumentBody,
  mergeJournalContent,
  type DocumentFrontmatter,
} from "./documents/document-frontmatter.js";

export {
  compactDocumentHeadingPreview,
  deriveDocumentHeadingMinimapItems,
  documentHeadingMinimapSectionId,
  resolveDocumentHeadingMinimapHasPersistentGutter,
  resolveDocumentHeadingMinimapHitStripWidth,
  type DocumentHeadingLevel,
  type DocumentHeadingMinimapItem,
} from "./documents/document-heading-minimap.js";

export {
  COMMAND_PALETTE_RECENT_CONTACTS_LIMIT,
  COMMAND_PALETTE_RECENT_ORGANIZATIONS_LIMIT,
  COMMAND_PALETTE_RESULT_SECTIONS,
  DEFAULT_GO_NAVIGATION_ITEMS,
  NAVIGATION_GO_LETTER_HINT,
  activateFilterModeFromTab,
  applyAllModeInputChange,
  applyScopedModeInputChange,
  commandPaletteSectionsForMode,
  createDefaultCommandPaletteFilterState,
  goNavigationItemSearchValue,
  isCommandPaletteContactsListScope,
  isCommandPaletteOrganizationsListScope,
  isScopedFilterMode,
  resolveFilterModeFromTabInput,
  sectionForSearchResultType,
  selectRecentCommandPaletteContacts,
  selectRecentCommandPaletteOrganizations,
  type CommandPaletteFilterMode,
  type CommandPaletteFilterState,
  type CommandPaletteHit,
  type CommandPaletteRecentContact,
  type CommandPaletteRecentOrganization,
  type CommandPaletteResultSection,
  type GoNavigationItem,
} from "./command-palette/command-palette.js";

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
  useCommandPaletteActions,
  useCommandPaletteRuntimeRefs,
  useCommandPaletteState,
  type CommandPaletteMode,
} from "./components/command-palette/command-palette-context.js";

export {
  CommandPaletteView,
  TOGGLE_COMMAND_PALETTE_EVENT,
  type CommandPaletteViewProps,
} from "./components/command-palette/command-palette-view.js";

export { isCommandPaletteToggleKey } from "./command-palette/command-palette-toggle-key.js";

export { shouldBlockBrowserTabFocus } from "./shortcuts/should-block-browser-tab-focus.js";
export { useBlockBrowserTabFocus } from "./shortcuts/use-block-browser-tab-focus.js";

export {
  buildSpellcheckSegments,
  composeSpellcheckText,
  diffHighlightRanges,
  spellcheckHasChanges,
  spellcheckMarkRanges,
  toggleSpellcheckSegment,
  type SpellcheckMarkRange,
  type SpellcheckSegment,
  type TextRange,
} from "./shared/text-diff-ranges.js";

export { SpellcheckSegmentText } from "./components/shared/spellcheck-segment-text.js";

export {
  TaskDetailView,
  TASK_DETAIL_PROPERTIES_RAIL_BREAKPOINT,
  type TaskDetailBelowDescriptionContext,
  type TaskDetailViewProps,
  type TaskDetailViewTask,
  type TaskSpellcheckHighlight,
} from "./components/tasks/task-detail-view.js";

export {
  TaskLinkAttachments,
  TaskLinkIcon,
  coerceSparkEmailUrl,
  isAppDocumentTaskLinkUrl,
  isAppEmailTaskLinkUrl,
  isAppLetterTaskLinkUrl,
  isGithubTaskLinkUrl,
  isSparkEmailTaskLinkUrl,
  normalizeTaskLinkUrl,
  resolveTaskLinkAttachmentLabel,
  taskLinkDisplayLabel,
  type TaskFileAttachmentItem,
  type TaskLinkAttachmentKind,
  type TaskLinkAttachmentsProps,
  type TaskLinkPickerOption,
} from "./components/tasks/task-link-attachments.js";

export { PdfFileIcon } from "./components/tasks/pdf-file-icon.js";

export {
  ADD_TASK_LINK_SHORTCUT_HINT,
  isAddTaskLinkShortcut,
  shouldHandleAddTaskLinkShortcut,
} from "./tasks/task-link-add-shortcut.js";

export {
  TaskStackedDetailView,
  type TaskStackedDetailViewProps,
} from "./components/tasks/task-stacked-detail-view.js";

export {
  TaskActivityPanel,
  type TaskActivityPanelProps,
  type TaskActivityCommentMutations,
  type TaskActivityCommentResolveMode,
  type TaskActivityRequestJson,
  type TaskActivityCurrentUser,
} from "./components/tasks/task-activity-panel.js";

export {
  TaskCommentEditor,
  type TaskCommentEditorHandle,
  type TaskCommentEditorProps,
  type TaskCommentEditorVariant,
} from "./components/tasks/task-comment-editor.js";

export {
  AgentActivityIcon,
} from "./components/tasks/agent-activity-icon.js";

export {
  AGENT_HOLD_COMMENT_PREFIXES,
  isAgentHoldCommentBody,
} from "./tasks/agent-hold-comment.js";

export {
  agentWorkTotals,
  ACTIVITY_COALESCE_WINDOW_MS,
  coalescePropertyActivities,
  formatActivityDurationMs,
  formatActivityTokenCount,
  groupConsecutiveAgentWorked,
  mergeAgentWorkedActivities,
  type GroupedActivity,
} from "./tasks/task-activity-format.js";

export {
  ContentChromeHeader,
  ContentBreadcrumb,
  type ContentChromeHeaderProps,
  type ContentBreadcrumbProps,
  type ContentBreadcrumbItem,
  type ContentBreadcrumbLinkProps,
} from "./components/content/content-chrome-header.js";

export {
  ChromeHeaderProvider,
  useChromeHeader,
  useRegisterChromeHeader,
} from "./components/shell/chrome-header-context.js";

export {
  EntityHeaderActionsShell,
  EntityHeaderActionsSlot,
} from "./components/entity-actions/entity-header-actions-shell.js";

export {
  EntityActionsMenu,
  type EntityActionsMenuItem,
  type EntityActionsMenuProps,
} from "./components/entity-actions/entity-actions-menu.js";

export { RegisterEntityDeleteAction } from "./components/entity-actions/register-entity-delete-action.js";

export { RegisterEntityDuplicateAction } from "./components/entity-actions/register-entity-duplicate-action.js";

export { RegisterEntityMenuItems } from "./components/entity-actions/register-entity-menu-items.js";

export {
  EntityHeaderActionsProvider,
  useEntityHeaderActionsContext,
  type EntityDeleteConfig,
  type EntityDeleteResult,
  type EntityDuplicateConfig,
  type EntityDuplicateOptions,
  type EntityExtraMenuItem,
} from "./components/entity-actions/entity-header-actions-context.js";

export {
  LetterDetailView,
  type LetterDetailViewProps,
  type LetterDetailViewLetter,
} from "./components/letters/letter-detail-view.js";

export {
  LetterComposeView,
  type LetterComposeViewProps,
  type LetterComposeContact,
  type LetterComposeSubmitPayload,
} from "./components/letters/letter-compose-view.js";

export {
  ContentDetailTitleHeader,
  ContentDetailStaticTitle,
  ContentDetailIconTitleHeader,
  ContentDetailTitleSlot,
  CONTENT_DETAIL_TITLE_CLASS,
  buildContentIconTitleHeaders,
} from "./components/content/content-detail-title-header.js";

export {
  DocumentDetailIcon,
  type DocumentDetailIconProps,
} from "./components/documents/document-detail-icon.js";

export {
  LetterDetailIcon,
  type LetterDetailIconProps,
} from "./components/letters/letter-detail-icon.js";

export {
  DocumentOcticon,
  type DocumentOcticonProps,
} from "./components/documents/document-octicon.js";

export {
  OverviewNameEditor,
  type OverviewNameEditorProps,
} from "./components/content/overview-name-editor.js";

export {
  DocumentMarkdownPreview,
  type DocumentMarkdownPreviewProps,
  type ResolveMarkdownImageSrc,
} from "./components/documents/document-markdown-preview.js";

export {
  DocumentHeadingMinimap,
  type DocumentHeadingMinimapProps,
} from "./components/documents/document-heading-minimap.js";

export {
  collectImageFiles,
  createMarkdownImagePasteExtensions,
  markdownImageSnippet,
  type UploadMarkdownImages,
} from "./documents/markdown-image-paste.js";

export {
  DocumentMentionHoverCard,
  type DocumentMentionHoverCardProps,
} from "./components/documents/document-mention-hover-card.js";

export {
  MentionChipHoverShell,
  type MentionChipHoverShellProps,
} from "./components/mentions/mention-chip-hover-shell.js";

export {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  useHoverCardClose,
} from "./components/shared/hover-card.js";

export {
  contactMatchesMentionRef,
  resolveMentionCatalogTask,
  resolveMentionCatalogProject,
  resolveMentionCatalogContact,
  resolveMentionCatalogOrganization,
  resolveMentionCatalogDocument,
  resolveMentionCatalogLetter,
  resolveMentionCatalogEmail,
} from "./mentions/resolve-catalog-entry.js";

export {
  getDeletedMentionDisplay,
  type DeletedMentionDisplay,
} from "./mentions/deleted-mention-display.js";

export {
  resolveMentionLayout,
  splitTrailingStructuralPrefix,
  stripStructuralLinePrefix,
  matchListItemOpener,
  listItemLeadingNewlinesContinueList,
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
  type ParsedNamedLinkToken,
} from "./mentions/mention-tokens.js";

export {
  parseNamedLinkToken,
  normalizeNamedLinkUrl,
  faviconHostForNamedLinkUrl,
  NAMED_LINK_TOKEN_RE,
} from "./mentions/named-link-tokens.js";

export {
  ContactOverviewView,
  formatContactAddressLine,
  type ContactOverviewViewProps,
  type ContactOverviewViewContact,
  type ContactOverviewDetails,
  type ContactLocationParts,
  type ContactGroupDropdownItem,
  type ContactSocialAccount,
} from "./components/contacts/contact-overview-view.js";

export {
  ContactPeekCard,
  formatContactPeekJobSubtitle,
  splitContactPeekName,
  type ContactPeekCardProps,
  type ContactPeekCardContact,
  type ContactPeekCardAction,
  type ContactPeekSocialAccount,
} from "./components/contacts/contact-peek-card.js";

export {
  listCountries,
  listRegionsForCountry,
  countryHasRegions,
  resolveCountryOption,
  resolveRegionOption,
  formatCountryLabel,
  formatRegionLabel,
  type CountryOption,
  type RegionOption,
} from "./geo/country-region.js";

export {
  ContactSocialAccountsEditor,
  type ContactSocialAccountsEditorProps,
} from "./components/contacts/contact-social-accounts-editor.js";

export {
  ContactSocialLabel,
  type ContactSocialLabelProps,
} from "./components/contacts/contact-social-label.js";

export {
  SocialPlatformIcon,
} from "./components/social/social-platform-icon.js";

export {
  SocialSidePanelView,
  type SocialSidePanelViewProps,
  type SocialSidePanelLinkComponent,
} from "./components/social/social-side-panel-view.js";

export {
  SocialContactDetailView,
  type SocialContactDetailViewProps,
  type SocialContactDetailViewContact,
} from "./components/social/social-contact-detail-view.js";

export {
  normalizeContactSocialAccounts,
  contactHasSocialAccounts,
  getSocialHref,
  getSelectedSocialSlugFromPathname,
  isSocialSectionPath,
  socialContactMatchesSlug,
  primarySocialAccount,
  normalizeSocialPlatform,
  type SocialContactListItem,
  type SocialPlatformId,
} from "./social/social-contacts.js";

export {
  COMMUNICATION_LIST_PATH,
  buildCommunicationItemHrefById,
  findCommunicationItemBySlugOrId,
  getCommunicationHref,
  getCommunicationItemHref,
  getCommunicationTaskRouteHref,
  getFirstCommunicationItemHref,
  getSelectedCommunicationSlugFromPathname,
  isCommunicationSectionPath,
} from "./communication/communication.js";

export {
  ContactEmailsEditor,
  type ContactEmailsEditorProps,
  type ContactEmailEntry,
  type ContactEmailLabel,
} from "./components/contacts/contact-emails-editor.js";

export {
  ContactPhonesEditor,
  type ContactPhonesEditorProps,
  type ContactPhoneEntry,
  type ContactPhoneLabel,
} from "./components/contacts/contact-phones-editor.js";

export {
  ContactLanguageFlagIcon,
  type ContactLanguageFlagIconProps,
} from "./components/contacts/contact-language-flag-icon.js";

export {
  ContactLanguagesEditor,
  type ContactLanguagesEditorProps,
} from "./components/contacts/contact-languages-editor.js";

export {
  ContactDetailView,
  type ContactDetailViewProps,
} from "./components/contacts/contact-detail-view.js";

export {
  ContactPortalTabView,
  type ContactPortalTabViewProps,
  type ContactPortalPersistInput,
  type ContactPortalProjectOption,
  type ContactPortalEmailOption,
} from "./components/contacts/contact-portal-tab-view.js";

export {
  ContactsOverviewView,
  type ContactsOverviewViewProps,
} from "./components/contacts/contacts-overview-view.js";

export {
  ContactDetailOverlay,
  type ContactDetailOverlayProps,
} from "./components/contacts/contact-detail-overlay.js";

export {
  CONTACT_DETAIL_COLLAPSE_DURATION_MS,
  CONTACT_DETAIL_CONTENT_FADE_MS,
  CONTACT_DETAIL_EXPAND_FADE_MS,
  CONTACT_DETAIL_PANEL_WIDTH,
  CONTACT_DETAIL_PANEL_WIDTH_KEY,
  CONTACT_DETAIL_STRIP_WIDTH_PX,
  CONTACT_EXPANDED_WORKSPACE_TAB_IDS,
  CONTACT_EXPANDED_WORKSPACE_TABS,
  CONTACT_OVERLAY_LAYOUT_PARAM,
  getContactOverlayHref,
  parseContactOverlayLayout,
  type ContactExpandedWorkspaceTabId,
  type ContactOverlayLayout,
} from "./contacts/contact-overlay.js";

export {
  CRM_GROUP_PARAM,
  getContactsGroupHref,
  getOrganizationsGroupHref,
  mergeHrefSearch,
  parseCrmGroupId,
  withCrmGroupSearch,
} from "./contacts/contact-group-filter.js";

export {
  ContactTasksListView,
  type ContactTasksListViewProps,
} from "./components/contacts/contact-tasks-list-view.js";

export {
  ContactMeetingsListView,
  type ContactMeetingsListViewProps,
} from "./components/contacts/contact-meetings-list-view.js";

export {
  ContactEmailsListView,
  type ContactEmailsListViewProps,
} from "./components/contacts/contact-emails-list-view.js";

export {
  ContactRelationshipsListView,
  type ContactRelationshipsListViewProps,
  type ContactRelationshipListItemView,
} from "./components/contacts/contact-relationships-list-view.js";

export {
  RelationshipLabelEditModal,
  type RelationshipLabelEditModalProps,
  type RelationshipLabelEditValues,
} from "./components/contacts/relationship-label-edit-modal.js";

export {
  CrmActivityFeedView,
  type CrmActivityFeedViewProps,
  type CrmActivityFeedItem,
  type CrmActivityTaskRelation,
  type CrmActivityCreateKind,
} from "./components/crm/crm-activity-feed-view.js";

export {
  CrmGroupsChips,
  CrmGroupsManagePanel,
  type CrmGroupsChipsProps,
  type CrmGroupsManagePanelProps,
  type CreateCrmGroupInput,
} from "./components/crm/crm-groups-manage-panel.js";

export {
  CrmGroupColorDot,
  CrmGroupLabel,
  type CrmGroupColorDotProps,
  type CrmGroupLabelProps,
} from "./components/crm/crm-group-label.js";

export {
  CrmGroupColorPicker,
  type CrmGroupColorPickerProps,
} from "./components/crm/crm-group-color-picker.js";

export {
  CRM_GROUP_COLOR_PRESETS,
  DEFAULT_CRM_GROUP_COLOR,
  nextCrmGroupPresetColor,
  resolveCrmGroupColor,
} from "./crm/crm-group-color.js";

export {
  OrganizationOverviewView,
  type OrganizationOverviewViewProps,
  type OrganizationOverviewViewOrganization,
  type OrganizationOverviewDetails,
  type OrganizationLocationParts,
  type OrganizationGroupDropdownItem,
} from "./components/organizations/organization-overview-view.js";

export {
  OrganizationDetailView,
  type OrganizationDetailViewProps,
} from "./components/organizations/organization-detail-view.js";

export {
  OrganizationsOverviewView,
  type OrganizationsOverviewViewProps,
} from "./components/organizations/organizations-overview-view.js";

export {
  OrganizationDetailOverlay,
  type OrganizationDetailOverlayProps,
} from "./components/organizations/organization-detail-overlay.js";

export {
  ORGANIZATION_DETAIL_COLLAPSE_DURATION_MS,
  ORGANIZATION_DETAIL_CONTENT_FADE_MS,
  ORGANIZATION_DETAIL_EXPAND_FADE_MS,
  ORGANIZATION_DETAIL_PANEL_WIDTH,
  ORGANIZATION_DETAIL_STRIP_WIDTH_PX,
  ORGANIZATION_EXPANDED_WORKSPACE_TAB_IDS,
  ORGANIZATION_EXPANDED_WORKSPACE_TABS,
  ORGANIZATION_OVERLAY_LAYOUT_PARAM,
  getOrganizationOverlayHref,
  parseOrganizationOverlayLayout,
  type OrganizationExpandedWorkspaceTabId,
  type OrganizationOverlayLayout,
} from "./organizations/organization-overlay.js";

export {
  OrganizationTransactionsSection,
  type OrganizationTransactionsSectionProps,
} from "./components/organizations/organization-transactions-section.js";

export {
  OrganizationContactsListView,
  type OrganizationContactsListViewProps,
} from "./components/organizations/organization-contacts-list-view.js";

export {
  ScopedLettersListView,
  type ScopedLettersListViewProps,
} from "./components/letters/scoped-letters-list-view.js";

export {
  CONTACT_CARD_SECTIONS,
  CONTACT_PORTAL_SECTION,
  CONTACT_SECTIONS,
  CONTACT_SECTION_IDS,
  getActiveContactSection,
  getContactSectionHref,
  getContactSectionSegment,
  isContactCardSectionId,
  isContactSectionDetailPath,
  isContactSectionId,
  parseContactSectionId,
  resolveContactCardSections,
  shouldShowContactNav,
  type ContactSectionConfig,
  type ContactSectionId,
} from "./contacts/contact-sections.js";

export {
  ORGANIZATION_CARD_SECTIONS,
  ORGANIZATION_SECTIONS,
  ORGANIZATION_SECTION_IDS,
  ORGANIZATION_BASE_SECTION_IDS,
  buildOrganizationProjectsHref,
  getActiveOrganizationSection,
  getOrganizationIdFromProjectsPathname,
  getOrganizationSectionHref,
  getOrganizationSectionSegment,
  isOrganizationCardSectionId,
  isOrganizationProjectsListPathname,
  isOrganizationSectionId,
  parseOrganizationSectionId,
  resolveOrganizationWorkspaceTabs,
  resolveVisibleOrganizationSections,
  type OrganizationSectionConfig,
  type OrganizationSectionId,
  type VisibleOrganizationSectionsOptions,
} from "./organizations/organization-sections.js";

export {
  getRememberedContactSection,
  getRememberedOrganizationSection,
  rememberContactSection,
  rememberOrganizationSection,
} from "./navigation/entity-section-memory.js";

export {
  getContactSidePanelHref,
  getOrganizationSidePanelHref,
} from "./navigation/entity-side-panel-href.js";

export {
  MarkdownDocumentDetailView,
  type MarkdownDocumentDetailViewProps,
} from "./components/documents/markdown-document-detail-view.js";

export {
  JournalDueTasksSection,
  filterTasksDueOnJournalDate,
  isHabitLinkedTask,
  type JournalDayListMode,
  type JournalDueTasksSectionProps,
} from "./components/journal/journal-due-tasks-section.js";

export {
  buildJournalDayTaskModel,
  type JournalDayHabitMeta,
  type JournalDayTaskLike,
  type JournalDayTaskModel,
} from "./journal/journal-day-tasks.js";

export {
  JournalHabitsList,
  countHabitDayOutcomes,
  type JournalHabitDayItem,
  type JournalHabitsListProps,
} from "./components/journal/journal-habits-section.js";

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
} from "./navigation/resolve-history-entry-display.js";

export { HistoryEntryIcon } from "./components/navigation/history-entry-icon.js";
export {
  DotScrollLoader,
  type DotScrollLoaderProps,
} from "./components/shared/dot-scroll-loader.js";

export {
  isEntityRouteId,
  isEntityRouteUuid,
  ENTITY_ROUTE_UUID_PATTERN,
  ENTITY_ROUTE_NANOID_PATTERN,
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
} from "./components/dropdowns/searchable-dropdown.js";

export type { SearchableDropdownMenuApi } from "./dropdowns/searchable-dropdown-menu-api.js";

export {
  SEARCHABLE_DROPDOWN_REQUEST_CLOSE,
  requestCloseSearchableDropdowns,
} from "./dropdowns/searchable-dropdown-events.js";

export {
  SEARCHABLE_DROPDOWN_OPEN_PLACEMENT_ATTRIBUTE,
  markSearchableDropdownOpenPlacement,
  consumeSearchableDropdownOpenPlacement,
  type SearchableDropdownOpenPlacement,
} from "./dropdowns/searchable-dropdown-open-placement.js";

export {
  SEARCHABLE_DROPDOWN_ROOT_ATTRIBUTE,
  getOrderedSearchableDropdownRoots,
  openAdjacentSearchableDropdown,
} from "./dropdowns/searchable-dropdown-tab-chain.js";

export {
  getCreateEntityFromQueryLabel,
  PENDING_ASSIGNABLE_ENTITY_PREFIX,
  createPendingAssignableId,
  isPendingAssignableId,
} from "./dropdowns/searchable-dropdown-create-from-query.js";

export {
  TASK_PROPERTY_DROPDOWN_ATTRIBUTE,
  TASK_BULK_PROPERTY_SCOPE_ATTRIBUTE,
  FINANCE_FILTER_SCOPE_ATTRIBUTE,
  FINANCE_BULK_SCOPE_ATTRIBUTE,
  resolveTaskPropertyDropdownOpenCandidatesFromEvent,
  resolveFinanceTxPropertyDropdownOpenCandidatesFromEvent,
  resolveFinanceChromeDropdownOpenCandidatesFromEvent,
  pageHasFinanceTxPropertyHotkeyTargets,
  pageHasFinanceChromeHotkeyTargets,
  shouldYieldComposeToFinanceTxCategory,
  shouldYieldGoNavigationToFinanceTxGoal,
  isFinanceTxDetailPanelOpen,
  resolveTaskPropertyDropdownIdFromEvent,
  resolveTaskPropertyDropdownId,
  isTaskPropertyDropdownShortcutKey,
  type TaskPropertyDropdownId,
  type TaskPropertyDropdownShortcutKey,
} from "./tasks/task-property-dropdown-keys.js";

export {
  TaskRelatedChips,
  type TaskRelatedChipsProps,
} from "./components/tasks/task-related-chips.js";

export {
  encodeTaskRelatedValue,
  decodeTaskRelatedValue,
  encodeTaskRelatedValues,
  decodeTaskRelatedValues,
  buildTaskRelatedDropdownOptions,
  formatTaskRelatedSelectionLabel,
  type TaskRelatedKind,
  type TaskRelatedSelection,
} from "./tasks/task-related-entities.js";

export { isListKeyboardActivateKey } from "./list-nav/is-list-keyboard-activate-key.js";

export { createId } from "./shared/create-id.js";

export {
  PropertyDropdown,
  type PropertyDropdownProps,
  type PropertyDropdownTriggerVariant,
  PropertyInlineChip,
  type PropertyInlineChipProps,
} from "./components/dropdowns/property-dropdown.js";

export {
  PropertyDropdownNavigateRow,
  type PropertyDropdownNavigateRowProps,
} from "./components/dropdowns/property-dropdown-navigate-row.js";

export {
  KanbanBoard,
  type KanbanBoardProps,
  type KanbanBoardMoveRequest,
  type KanbanColumn,
  type KanbanDropIndicator,
} from "./components/list-nav/kanban-board.js";

export {
  computeKanbanDropIndicator,
} from "./list-nav/compute-kanban-drop-indicator.js";

export { isKanbanInteractiveCardTarget } from "./list-nav/kanban-interactive-target.js";

export {
  TaskBoardCard,
  type TaskBoardCardProps,
  type TaskBoardCardTask,
} from "./components/tasks/task-board-card.js";

export {
  ResizableBottomPanel,
  readStoredPanelHeight,
  type ResizableBottomPanelProps,
} from "./components/shell/resizable-bottom-panel.js";

export {
  useLetterPdfTabReorder,
  type LetterPdfTabReorderItem,
  type LetterPdfTabReorderBind,
} from "./letters/use-letter-pdf-tab-reorder.js";

export {
  LETTER_PDF_TAB_DRAG_TYPE,
  LETTER_PDF_TAB_DRAG_FALLBACK_TYPE,
  createLetterPdfTabDragPayload,
  parseLetterPdfTabDragPayload,
  readLetterPdfTabDragPayload,
  writeLetterPdfTabDragPayload,
  isLetterPdfTabDragActive,
  reorderAttachmentIds,
} from "./letters/letter-pdf-tab-drag.js";

export {
  LetterPdfDock,
  LETTER_PDF_PANEL_HEIGHT_KEY,
  LETTER_PDF_VISIBLE_KEY,
  type LetterPdfDockProps,
} from "./components/letters/letter-pdf-dock.js";

export {
  LetterPdfDropzone,
  type LetterPdfDropzoneProps,
} from "./components/letters/letter-pdf-dropzone.js";

export {
  LetterPdfTab,
  type LetterPdfTabAttachment,
  type LetterPdfRenameResult,
  type LetterPdfDeleteResult,
} from "./components/letters/letter-pdf-tab.js";

export {
  stripPdfExtension,
  letterPdfSubjectFromFilename,
  withPdfExtension,
} from "./letters/letter-pdf-filename.js";

export {
  LETTER_PDF_TOGGLE_SHORTCUT_HINT,
  isLetterPdfToggleShortcut,
  useLetterPdfToggleShortcut,
} from "./letters/letter-pdf-toggle-shortcut.js";

export {
  LETTER_PDF_MAXIMIZE_SHORTCUT_HINT,
  isLetterPdfMaximizeShortcut,
  useLetterPdfMaximizeShortcut,
} from "./letters/letter-pdf-maximize-shortcut.js";

export {
  LETTER_PDF_ATTACHMENT_SHORTCUT_MAX,
  parseLetterPdfAttachmentShortcutIndex,
  resolveLetterPdfAttachmentShortcutTarget,
  useLetterPdfAttachmentShortcuts,
} from "./letters/letter-pdf-attachment-shortcut.js";

export {
  LETTER_PDF_ZOOM_IN_SHORTCUT_HINT,
  LETTER_PDF_ZOOM_OUT_SHORTCUT_HINT,
  resolveLetterPdfZoomShortcut,
  useLetterPdfZoomShortcut,
  type LetterPdfZoomDirection,
} from "./letters/letter-pdf-zoom-shortcut.js";

export type { ProductSidebarRecentPage } from "./components/shell/product-sidebar.js";

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
  type OpenComposeModalDetail,
  type HorizontalArrowDirection,
} from "./compose/compose-modal-events.js";

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
} from "./compose/compose-task.js";

export {
  getNextComposeTaskTabField,
  type ComposeTaskTabField,
  type ComposeTaskTabFlowContext,
} from "./compose/compose-task-tab-flow.js";

export {
  COMPOSE_DOCUMENT_ROOT_FOLDER_VALUE,
  folderPathFromComposeFolderValue,
  getParentFolderPath,
  getSelectedProjectDocumentPathFromPathname,
  getSelectedKnowledgeDocumentPathFromPathname,
  getSelectedKnowledgeV2DocumentPathFromPathname,
  resolveComposeContextDocumentFolder,
  resolveComposeDocumentFolderValue,
  getDirectChildComposeFolderOptions,
  getComposeFolderPathChain,
  buildComposeFolderCascadeSegments,
  buildDocumentFoldersByTarget,
  type ComposeDocumentFolderOption,
  type ComposeDocumentFoldersByTarget,
  type ComposeFolderCascadeSegment,
} from "./compose/compose-document-folders.js";

export { ComposeFolderIcon, type ComposeFolderIconProps } from "./components/compose/compose-folder-icon.js";

export {
  ComposeDueDateDropdown,
  type ComposeDueDateDropdownProps,
} from "./components/compose/compose-due-date-dropdown.js";

export {
  ComposeAssigneeDropdown,
  type ComposeAssigneeDropdownProps,
} from "./components/compose/compose-assignee-dropdown.js";

export {
  ComposeModal,
  type ComposeModalProps,
  type ComposeModalProject,
  type ComposeModalCreateTaskInput,
  type ComposeModalCreateDocumentInput,
} from "./components/compose/compose-modal.js";

export {
  AvatarUpload,
  type AvatarUploadProps,
  type AvatarActionResult,
} from "./components/entity/avatar-upload.js";

export {
  ProjectIconPicker,
  type ProjectIconPickerProps,
} from "./components/projects/project-icon-picker.js";

export {
  ProjectOverviewIcon,
  type ProjectOverviewIconProps,
} from "./components/projects/project-overview-icon.js";

export {
  PROJECT_ICON_KEYS,
  PROJECT_BRAND_ICON_KEYS,
  formatProjectIconLabel,
  isProjectIconKey,
  isProjectBrandIconKey,
  partitionProjectIconKeys,
  type ProjectIconKey,
  type ProjectBrandIconKey,
} from "./projects/project-icon-keys.js";

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
} from "./entity/entity-icon.js";

export {
  ENTITY_ICON_EMOJIS,
  filterEntityIconEmojis,
  type EntityIconEmojiEntry,
} from "./entity/entity-icon-emojis.js";

export {
  EntityIconPicker,
  type EntityIconPickerProps,
  type EntityIconPickerDefaultOption,
} from "./components/entity/entity-icon-picker.js";

export {
  CustomColorPickerPanel,
  type CustomColorPickerPanelProps,
} from "./components/entity/custom-color-picker-panel.js";

export {
  registerGoLeaderKeyPress,
  isGoLeaderSequencePending,
  clearGoLeaderSequence,
  GO_NAVIGATION_SEQUENCE_TIMEOUT_MS,
} from "./shortcuts/go-leader-sequence-gate.js";

export {
  registerFinanceLeaderKeyPress,
  isFinanceLeaderSequencePending,
  clearFinanceLeaderSequence,
  FINANCE_LEADER_SEQUENCE_TIMEOUT_MS,
} from "./finance/finance-leader-sequence-gate.js";

export { isAnyLeaderSequencePending } from "./shortcuts/leader-sequence-gate.js";

export {
  isBlockingModalOpen,
  isTargetInsideBlockingModal,
  isEditableShortcutTarget,
  isDirectRoleButtonActivationKey,
  shouldBlockPageShortcuts,
  shouldHandleGlobalShortcut,
  shouldHandleTabChromeShortcut,
  BLOCKING_MODAL_SELECTOR,
} from "./shortcuts/shortcut-guards.js";

export {
  resolveDesktopSectionTabHrefs,
  isCodebaseWorkbenchMounted,
  parseSectionTabIndex,
  normalizeTabLocation,
  resolveSectionTabCycleShortcut,
  findActiveSectionTabIndex,
  resolveAdjacentSectionTabHref,
  type SectionTabCycleDirection,
} from "./navigation/section-tab-hrefs.js";

export { useNavigationShortcuts } from "./navigation/use-navigation-shortcuts.js";
export { useFinanceNavigationShortcuts } from "./finance/use-finance-navigation-shortcuts.js";
export { useSettingsShortcut } from "./shortcuts/use-settings-shortcut.js";
export { useSectionTabShortcuts } from "./navigation/use-section-tab-shortcuts.js";
export { useEscapeBackNavigation } from "./navigation/use-escape-back-navigation.js";
export { useTaskPropertyDropdownShortcuts } from "./tasks/use-task-property-dropdown-shortcuts.js";
export { useListBoardViewShortcuts } from "./list-nav/use-list-board-view-shortcuts.js";
export {
  resolveTabCycleShortcut,
  useTabShortcuts,
  type TabCycleDirection,
} from "./navigation/use-tab-shortcuts.js";

export { useContentSidePanelToggleShortcut } from "./content/use-content-side-panel-toggle-shortcut.js";

export {
  TITLE_RENAME_EVENT,
  isTitleRenameShortcut,
  focusAndSelectTitleInput,
  installTitleRenameShortcutListeners,
  useTitleRenameShortcut,
} from "./shortcuts/title-rename-shortcut.js";

export {
  deferFocusAfterTitleLeave,
  useContentTitleEditorNavigation,
} from "./content/use-content-title-editor-navigation.js";

export {
  registerDocumentTreeFolderRenameHandler,
  requestDocumentTreeFolderRename,
} from "./documents/document-tree-folder-rename-shortcut.js";

export { isNativeDatePickerOpen } from "./dropdowns/native-date-picker.js";

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
} from "./list-nav/list-board-view.js";

export {
  LIST_BOARD_VIEW_LIST_KEY,
  LIST_BOARD_VIEW_BOARD_KEY,
  LIST_BOARD_VIEW_SHORTCUT_HINT,
  getListBoardViewForShortcutKey,
  hasListBoardViewShortcutModifiers,
  isListBoardViewShortcutKey,
} from "./list-nav/list-board-view-shortcut.js";

export {
  stepBoardTaskId,
  boardKeyboardNavDirection as boardKeyboardNavStepDirection,
  isBoardKeyboardNavigationKey,
} from "./list-nav/board-keyboard-nav.js";

export {
  isContentEditModeActive,
  isContentPreviewModeActive,
} from "./content/content-view-mode.js";

export {
  FORCE_CONTENT_PREVIEW_EVENT,
  TOGGLE_CONTENT_VIEW_MODE_EVENT,
  installContentViewModeShortcutListeners,
  isForceContentPreviewShortcut,
  isToggleContentViewModeShortcut,
  registerContentViewModeToggle,
  registerForceContentPreview,
} from "./content/content-view-mode-shortcut.js";

export { useContentViewModeShortcut } from "./content/use-content-view-mode-shortcut.js";

export {
  CONTENT_PREVIEW_SCROLL_SELECTOR,
  findContentPreviewScrollContainer,
  contentPreviewHasVerticalOverflow,
  getContentPreviewScrollStep,
  shouldHandleContentPreviewArrowScroll,
  scrollContentPreviewByArrowKey,
} from "./content/content-preview-scroll.js";

export {
  CONTENT_PREVIEW_LINKS_SELECTOR,
  contentPreviewLinkItemId,
  queryContentPreviewLinks,
  syncContentPreviewLinkMarkers,
  syncContentPreviewLinkHighlights,
  activateContentPreviewLink,
  isContentKeyboardNavZoneActive,
} from "./content/content-preview-links.js";

export { useContentPreviewScrollShortcuts } from "./content/use-content-preview-scroll-shortcuts.js";
export { useContentPreviewLinkNavigation } from "./content/use-content-preview-link-navigation.js";

export {
  getActiveListKeyboardItemId,
  registerActiveListKeyboardItemResolver,
} from "./list-nav/active-list-keyboard-item.js";

export {
  getFocusedListKeyboardItemId,
  registerFocusedListKeyboardItemResolver,
} from "./list-nav/focused-list-keyboard-item.js";

export {
  openTaskPropertyDropdown,
  openFinanceChromeDropdown,
  openFinanceTxPropertyDropdown,
} from "./tasks/open-task-property-dropdown.js";
export { isContentSidePanelToggleShortcut } from "./content/content-side-panel-toggle-shortcut.js";

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
  shouldApplyPageTitleToChrome,
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
} from "./list-nav/keyboard-nav-item.js";
export {
  stepListKeyboardIndex,
  resolveListKeyboardStepTarget,
  flattenGroupedListItemIds,
  type ListKeyboardNavDirection,
} from "./list-nav/list-keyboard-nav-index.js";
export {
  LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  LIST_KEYBOARD_NAV_ZONE_CONTENT,
  LIST_KEYBOARD_NAV_ZONE_MAIN,
  LIST_KEYBOARD_NAV_CONTENT_PRIORITY,
  LIST_KEYBOARD_NAV_ZONE_ORDER,
  LIST_KEYBOARD_NAV_ACTIVE_ZONE_ATTR,
  isEntitySectionListPathname,
  isInboxPathname,
  isInboxListKeyboardPathname,
  getDefaultListKeyboardNavZone,
  getListKeyboardNavSurfaceKey,
  isTasksListKeyboardPathname,
  shouldAutoSwitchJkToMainList,
  resolveZonePolicy,
  readCalendarPageModeFromDocument,
  filterListKeyboardNavZonesForTab,
  type ListKeyboardNavZone,
  type ApplyListKeyboardNavZoneOptions,
  type ResolveZonePolicyFlags,
  type ListKeyboardZonePolicy,
} from "./list-nav/list-keyboard-nav-zone.js";
export {
  shouldHandleListKeyboardNavigation,
  shouldHandleListKeyboardActivate,
  shouldHandleBoardKeyboardNavigation,
  boardKeyboardNavDirection,
  isShiftJkNavigation,
} from "./list-nav/should-handle-list-keyboard-navigation.js";
export {
  setKeyboardNavMouseResumeHandler,
  installKeyboardNavHoverModalityListeners,
  resolveListKeyboardAnchorId,
  suppressKeyboardNavHover,
} from "./list-nav/keyboard-nav-hover-modality.js";
export {
  ListKeyboardNavigationProvider,
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
  useListKeyboardNavigationZone,
  isKeyboardNavHighlighted,
  type ListKeyboardNavigationRegistration,
} from "./components/list-nav/list-keyboard-navigation-provider.js";
export {
  ListKeyboardNavMountGate,
  useListKeyboardNavMountGate,
} from "./list-nav/list-keyboard-nav-mount-gate.js";

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
export { ProjectPanelOverviewSkeleton } from "./components/skeletons/project-panel-overview-skeleton.js";
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
export { MainPaneSkeletonShell } from "./components/skeletons/main-pane-skeleton-shell.js";
export { InboxListSkeleton } from "./components/skeletons/inbox-list-skeleton.js";
export { AreasListSkeleton } from "./components/skeletons/areas-list-skeleton.js";
export { CalendarGridSkeleton } from "./components/skeletons/calendar-grid-skeleton.js";
export { FinanceSectionSkeleton } from "./components/skeletons/finance-section-skeleton.js";
export { EmailThreadSkeleton } from "./components/skeletons/email-thread-skeleton.js";
export { SettingsSectionSkeleton } from "./components/skeletons/settings-section-skeleton.js";
export { OrganizationOverviewSkeleton } from "./components/skeletons/organization-overview-skeleton.js";
export { ContactHubSkeleton } from "./components/skeletons/contact-hub-skeleton.js";
export { CodebaseWorkbenchSkeleton } from "./components/skeletons/codebase-workbench-skeleton.js";
export { JournalHabitsSkeleton } from "./components/skeletons/journal-habits-skeleton.js";
export { GenericRouteFallbackSkeleton } from "./components/skeletons/generic-route-fallback-skeleton.js";

export type {
  CodebaseApiClient,
  CodebaseGithubListTab,
  CodebaseRequestJson,
  FsTreeEntry,
  ProjectFsClient,
} from "./components/codebase/project-fs-types.js";

export type {
  SelectProjectFileHandler,
  SelectProjectFileOptions,
} from "./components/codebase/select-project-file.js";

export { normalizeWorkingDirectory } from "./components/codebase/normalize-working-directory.js";

export {
  getCachedBranches,
  getCachedCommits,
  getCachedPullRequests,
  getCachedRepositories,
  getCachedSelectedBranch,
  setCachedBranches,
  setCachedCommits,
  setCachedPullRequests,
  setCachedRepositories,
  setCachedSelectedBranch,
  branchesCacheKey,
  commitsCacheKey,
  pullRequestsCacheKey,
  type GithubBranchesPayload,
  type GithubCommitsCache,
  type GithubPullRequestsCache,
} from "./components/codebase/github-project-cache.js";

export { GithubCommitIcon } from "./components/codebase/github-commit-icon.js";
export { GithubPullRequestIcon } from "./components/codebase/github-pull-request-icon.js";

export {
  TerminalDirectoryGate,
  type TerminalDirectoryGateProps,
} from "./components/codebase/terminal-directory-gate.js";

export {
  ProjectWorkingDirectoryTree,
  type ProjectWorkingDirectoryTreeProps,
} from "./components/codebase/project-working-directory-tree.js";

export {
  FileTypeIcon,
  type FileTypeIconProps,
} from "./components/documents/file-type-icon.js";

export {
  ensurePierreIconSprite,
  hasSpecificPierreIconForFileName,
  resolvePierreIconForEntry,
  syntheticFileNameForLanguageId,
  basenameOfPath,
  inferEntryKindFromPath,
  T3_PIERRE_ICONS,
  type PierreIconResolution,
} from "./codebase/pierre-icons.js";

export {
  CodebaseProjectOverviewPane,
  type CodebaseProjectOverviewPaneProps,
} from "./components/codebase/codebase-project-overview-pane.js";

export { apiErrorMessage as codebaseApiErrorMessage } from "./components/codebase/api-error-message.js";
export {
  fileExtension,
  filePreviewKind,
  type FilePreviewKind,
} from "./components/codebase/fs-file-preview.js";
export {
  isFsTreeCreateShortcutKey,
  isFsTreeKeyboardActive,
  setFsTreeKeyboardActive,
} from "./components/codebase/fs-tree-create-shortcut.js";
export { GithubCodeMenu } from "./components/codebase/github-code-menu.js";
export { FileDeleteConfirmModal } from "./components/codebase/file-delete-confirm-modal.js";
export { UnsavedFileCloseModal } from "./components/codebase/unsaved-file-close-modal.js";
export { FileEditorTabBar } from "./components/codebase/file-editor-tab-bar.js";
export { FileCodeViewer } from "./components/codebase/file-code-viewer.js";
export {
  CommitFilesPane,
  GithubFilesDiffPane,
  PullRequestFilesPane,
} from "./components/codebase/pull-request-files-pane.js";
export {
  CommitDetailPane,
  type CommitDetailPaneProps,
} from "./components/codebase/commit-detail-pane.js";
export {
  TaskLinkedCommitSection,
  type TaskLinkedCommitSectionProps,
} from "./components/codebase/task-linked-commit-section.js";
export {
  PullRequestDetailPane,
  type PullDetailTab,
  type PullRequestDetailPaneProps,
} from "./components/codebase/pull-request-detail-pane.js";
export {
  FileDetailPane,
  type FileDetailPaneProps,
} from "./components/codebase/file-detail-pane.js";

export {
  getCodebaseWorkbenchHref,
  isCodebaseGithubListTab,
  isCodebaseWorkbenchPath,
  parseCodebaseWorkbenchPath,
  type CodebaseWorkbenchSelection,
} from "./codebase/codebase-workbench-path.js";

export {
  isCodebaseDetailEditorFocused,
  registerCodebaseDetailEnterFocus,
  registerCodebaseDetailLeaveFocus,
  requestCodebaseDetailEnterFocus,
  requestCodebaseDetailLeaveFocus,
} from "./codebase/codebase-detail-focus.js";

export {
  isCodebaseDetailHotkeysActive,
  setCodebaseDetailHotkeysActive,
} from "./codebase/codebase-detail-hotkeys.js";
