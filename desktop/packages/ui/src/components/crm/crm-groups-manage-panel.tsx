"use client";

import { useMemo, useState } from "react";

import type { CrmGroup, CrmGroupSubjectType } from "@backsteros/contracts";

import {
  DEFAULT_CRM_GROUP_COLOR,
  nextCrmGroupPresetColor,
} from "../../crm/crm-group-color.js";
import { CrmGroupColorPicker } from "./crm-group-color-picker.js";
import { CrmGroupColorDot, CrmGroupLabel } from "./crm-group-label.js";

export type CrmGroupsChipsProps = {
  groups: CrmGroup[];
  emptyLabel?: string;
};

/** Compact group chips for contact/org overview. */
export function CrmGroupsChips({
  groups,
  emptyLabel,
}: CrmGroupsChipsProps) {
  if (groups.length === 0) {
    return emptyLabel ? (
      <p className="overview-empty">{emptyLabel}</p>
    ) : null;
  }
  return (
    <div className="crm-groups-chips" aria-label="Groups">
      {groups.map((group) => (
        <CrmGroupLabel
          key={group.id}
          name={group.name}
          color={group.color}
        />
      ))}
    </div>
  );
}

export type CreateCrmGroupInput = {
  name: string;
  color: string;
};

export type CrmGroupsManagePanelProps = {
  groups: CrmGroup[];
  subjectType: CrmGroupSubjectType;
  subjectId: string;
  memberGroupIds: string[];
  onCreateGroup?: (input: CreateCrmGroupInput) => void | Promise<void>;
  onToggleMembership?: (
    groupId: string,
    member: boolean,
  ) => void | Promise<void>;
  onDeleteGroup?: (groupId: string) => void | Promise<void>;
};

/**
 * Lightweight group manage UI — create groups and toggle membership for the
 * current contact/org.
 */
export function CrmGroupsManagePanel({
  groups,
  memberGroupIds,
  onCreateGroup,
  onToggleMembership,
  onDeleteGroup,
}: CrmGroupsManagePanelProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(() =>
    nextCrmGroupPresetColor(groups.length),
  );
  const memberSet = useMemo(() => new Set(memberGroupIds), [memberGroupIds]);

  return (
    <div className="organization-entity-list">
      {onCreateGroup ? (
        <div className="crm-groups-manage-create">
          <input
            className="entity-overview-input"
            value={name}
            placeholder="New group name"
            aria-label="New group name"
            onChange={(event) => setName(event.target.value)}
          />
          <CrmGroupColorPicker value={color} onChange={setColor} />
          <button
            type="button"
            className="task-activity-reply__submit"
            disabled={!name.trim()}
            onClick={() => {
              const next = name.trim();
              if (!next || !onCreateGroup) return;
              void Promise.resolve(
                onCreateGroup({ name: next, color }),
              ).then(() => {
                setName("");
                setColor(nextCrmGroupPresetColor(groups.length + 1));
              });
            }}
          >
            Create
          </button>
        </div>
      ) : null}
      {groups.length === 0 ? null : (
        <ul className="organization-entity-list__items">
          {groups.map((group) => {
            const member = memberSet.has(group.id);
            return (
              <li key={group.id} className="organization-entity-list__item">
                <label className="organization-entity-list__row">
                  <input
                    type="checkbox"
                    checked={member}
                    onChange={() =>
                      void onToggleMembership?.(group.id, !member)
                    }
                  />
                  <CrmGroupColorDot
                    color={group.color ?? DEFAULT_CRM_GROUP_COLOR}
                    size={8}
                  />
                  <span className="organization-entity-list__title">
                    {group.name}
                  </span>
                </label>
                {onDeleteGroup ? (
                  <button
                    type="button"
                    className="task-activity-comment-card__toggle"
                    onClick={() => void onDeleteGroup(group.id)}
                  >
                    Delete
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
