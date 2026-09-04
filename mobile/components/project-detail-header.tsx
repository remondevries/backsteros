import type { ReactNode } from "react";

import { colors } from "../lib/theme";
import type { PillNavItem } from "./pill-nav";
import { ProjectOcticon } from "./project-octicon";
import { SectionedDetailHeader } from "./sectioned-detail-header";

type Props<T extends string> = {
  title: string;
  icon?: string | null;
  projectType?: string | null;
  tab: T;
  onTabChange: (next: T) => void;
  tabItems: readonly PillNavItem<T>[];
  tabsAccessibilityLabel: string;
  onBack: () => void;
  headerRight?: ReactNode;
  /** Loading shell — back only, no title or tabs. */
  minimal?: boolean;
};

/**
 * Project detail chrome — project icon + name between back and trailing actions;
 * section tabs on the row below (visible on every tab).
 */
export function ProjectDetailHeader<T extends string>({
  title,
  icon,
  projectType,
  tab,
  onTabChange,
  tabItems,
  tabsAccessibilityLabel,
  onBack,
  headerRight,
  minimal = false,
}: Props<T>) {
  return (
    <SectionedDetailHeader
      title={title}
      titleLeading={
        minimal ? undefined : (
          <ProjectOcticon
            icon={icon}
            type={projectType}
            size={14}
            color={colors.foreground}
          />
        )
      }
      tab={tab}
      onTabChange={onTabChange}
      tabItems={tabItems}
      tabsAccessibilityLabel={tabsAccessibilityLabel}
      onBack={onBack}
      headerRight={headerRight}
      minimal={minimal}
    />
  );
}
