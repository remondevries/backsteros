import { useCallback, useEffect, useMemo, useRef } from "react";

import { useCrmGroupsForSubject } from "../use-crm-data";

type CrmGroupSubjectType = Parameters<typeof useCrmGroupsForSubject>[0];

const SUBJECT_NOT_ON_SERVER = /subject not found|member subject|404/i;

/**
 * Group chips for one contact / organization: options, current member ids,
 * and a change handler that serializes add/remove calls so rapid toggles
 * never race each other.
 */
export function useCrmSubjectGroupMembership({
  subjectType,
  subjectId,
  enabled,
  notOnServerMessage,
}: {
  subjectType: CrmGroupSubjectType;
  subjectId: string | null;
  enabled: boolean;
  /** Alert copy when the subject has not reached the server yet. */
  notOnServerMessage: string;
}) {
  const crmGroups = useCrmGroupsForSubject(subjectType, subjectId, enabled);
  const crmGroupsRef = useRef(crmGroups);
  crmGroupsRef.current = crmGroups;
  const notOnServerMessageRef = useRef(notOnServerMessage);
  notOnServerMessageRef.current = notOnServerMessage;

  const groupOptions = useMemo(
    () =>
      crmGroups.allGroups.map((group) => ({
        id: group.id,
        name: group.name,
        color: group.color,
      })),
    [crmGroups.allGroups],
  );
  const memberGroupIds = useMemo(
    () => crmGroups.memberGroups.map((group) => group.id),
    [crmGroups.memberGroups],
  );
  const appliedMemberGroupIdsRef = useRef(memberGroupIds);
  useEffect(() => {
    appliedMemberGroupIdsRef.current = memberGroupIds;
  }, [memberGroupIds]);
  const membershipSyncChainRef = useRef(Promise.resolve());

  const onMemberGroupIdsChange = useCallback((nextIds: string[]) => {
    const groups = crmGroupsRef.current;
    const previous = new Set(appliedMemberGroupIdsRef.current);
    const next = new Set(nextIds);
    appliedMemberGroupIdsRef.current = nextIds;
    membershipSyncChainRef.current = membershipSyncChainRef.current
      .catch(() => {})
      .then(async () => {
        try {
          for (const groupId of next) {
            if (!previous.has(groupId)) {
              await groups.toggleMembership(groupId, true);
            }
          }
          for (const groupId of previous) {
            if (!next.has(groupId)) {
              await groups.toggleMembership(groupId, false);
            }
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to update groups";
          window.alert(
            SUBJECT_NOT_ON_SERVER.test(message)
              ? notOnServerMessageRef.current
              : message,
          );
          await groups.reload();
        }
      });
  }, []);

  return { groupOptions, memberGroupIds, onMemberGroupIdsChange };
}
