import { db } from "../db/index.js";
import { workspaces } from "../db/schema.js";
import { ensureSpacesHierarchy } from "../services/documents.js";
import { healSpacesHierarchy } from "../services/spaces-hierarchy.js";
import {
  listSpacesCategories,
  listSpacesInCategory,
} from "../services/spaces.js";

async function main() {
  const ws = await db.select().from(workspaces).limit(1);
  if (!ws[0]) {
    console.error("no workspace");
    process.exit(1);
  }
  const id = ws[0].id;
  console.log("workspace", id);
  await ensureSpacesHierarchy(id);
  const report = await healSpacesHierarchy(id);
  console.log("heal", report);
  const cats = await listSpacesCategories(id);
  console.log("categories", JSON.stringify(cats, null, 2));
  for (const cat of ["support", "knowledge-base", "websites"] as const) {
    const spaces = await listSpacesInCategory(id, cat);
    console.log(
      cat,
      spaces.map((s) => ({
        title: s.title,
        path: s.path,
        articles: s.articleCount,
      })),
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
