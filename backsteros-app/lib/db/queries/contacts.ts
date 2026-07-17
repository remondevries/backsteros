import type { Contact } from "@/lib/db/schema";

export function getContactById(id: string): Contact | null {
  void id;
  return null;
}

export function listContacts(): Array<Contact & { organization: { name: string } | null }> {
  return [];
}
