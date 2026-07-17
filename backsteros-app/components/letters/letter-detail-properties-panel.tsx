"use client";

import type { Letter } from "@/lib/db/schema";
import { TaskDetailPropertiesSection } from "@/components/tasks/task-detail-properties-section";

import { LetterDueDateField } from "./letter-due-date-field";
import { LetterReceivedDateField } from "./letter-received-date-field";
import {
  LetterProjectField,
  type AssignableProject,
} from "./letter-project-field";
import {
  LetterOrganizationField,
  type AssignableOrganization,
} from "./letter-organization-field";
import {
  LetterContactField,
  type AssignableContact,
} from "./letter-contact-field";
import { LetterStatusField } from "./letter-status-field";

type LetterDetailPropertiesPanelProps = {
  letter: Letter;
  assignableProjects?: AssignableProject[];
  assignableOrganizations?: AssignableOrganization[];
  assignableContacts?: AssignableContact[];
};

export function LetterDetailPropertiesPanel({
  letter,
  assignableProjects = [],
  assignableOrganizations = [],
  assignableContacts = [],
}: LetterDetailPropertiesPanelProps) {
  return (
    <div className="task-detail-properties-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-3">
      <div className="flex flex-col gap-2">
        <TaskDetailPropertiesSection title="From">
          <div className="flex flex-col gap-2">
            <LetterOrganizationField
              letterId={letter.id}
              organizationId={letter.organizationId}
              organizations={assignableOrganizations}
            />
            <LetterContactField
              letterId={letter.id}
              organizationId={letter.organizationId}
              contactId={letter.contactId}
              contacts={assignableContacts}
            />
            <div className="flex flex-col gap-1.5">
              <span className="px-1 text-[11px] font-medium text-foreground/45">
                Received date
              </span>
              <LetterReceivedDateField
                letterId={letter.id}
                projectId={letter.projectId}
                receivedDate={letter.receivedDate}
              />
            </div>
          </div>
        </TaskDetailPropertiesSection>

        <TaskDetailPropertiesSection title="Properties">
          <LetterStatusField
            letterId={letter.id}
            projectId={letter.projectId}
            status={letter.status}
          />
          <div className="flex flex-col gap-1.5">
            <span className="px-1 text-[11px] font-medium text-foreground/45">
              Due date
            </span>
            <LetterDueDateField
              letterId={letter.id}
              projectId={letter.projectId}
              dueDate={letter.dueDate}
              status={letter.status}
            />
          </div>
        </TaskDetailPropertiesSection>

        <TaskDetailPropertiesSection title="Project">
          <LetterProjectField
            letterId={letter.id}
            projectId={letter.projectId}
            projects={assignableProjects}
          />
        </TaskDetailPropertiesSection>
      </div>
    </div>
  );
}