export type LetterWithProjectSummary = {
  id: string;
  number: number | null;
  title: string;
  icon: string | null;
  updatedAt: Date;
  project?: { id: string; key: string; name: string; icon: string | null } | null;
};

export function listInboxLetters(): LetterWithProjectSummary[] {
  return [];
}
