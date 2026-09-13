import { createCliClient, formatCliError, loadConfig } from "./config.js";
import { runCloudflareCommand } from "./commands/cloudflare.js";
import { runCommentCommand } from "./commands/comment.js";
import { runProjectCommand } from "./commands/project.js";
import { runSpacesCommand } from "./commands/spaces.js";
import { runTaskCommand } from "./commands/task.js";
import { runTransipCommand } from "./commands/transip.js";
import { printErr, printLine } from "./output.js";
import { parseCliArgv, usageText } from "./parse.js";

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const parsed = parseCliArgv(argv);

  if (parsed.global.help || parsed.resource === "help" || !parsed.resource) {
    printLine(usageText());
    return 0;
  }

  let config;
  try {
    config = loadConfig(parsed.global);
  } catch (error) {
    printErr(formatCliError(error));
    return 1;
  }

  const client = createCliClient(config);

  try {
    if (parsed.resource === "project") {
      await runProjectCommand(
        client,
        config,
        parsed.action,
        parsed.positionals,
        parsed.values,
      );
      return 0;
    }
    if (parsed.resource === "task") {
      await runTaskCommand(
        client,
        config,
        parsed.action,
        parsed.positionals,
        parsed.values,
      );
      return 0;
    }
    if (parsed.resource === "comment") {
      await runCommentCommand(
        client,
        config,
        parsed.action,
        parsed.positionals,
        parsed.values,
      );
      return 0;
    }
    if (parsed.resource === "spaces") {
      await runSpacesCommand(
        client,
        config,
        parsed.action,
        parsed.positionals,
        parsed.values,
      );
      return 0;
    }
    if (parsed.resource === "transip") {
      await runTransipCommand(client, config, parsed.action);
      return 0;
    }
    if (parsed.resource === "cloudflare") {
      await runCloudflareCommand(client, config, parsed.action);
      return 0;
    }
    printErr(
      `Unknown resource "${parsed.resource}". Use project|task|comment|spaces|transip|cloudflare.`,
    );
    printLine(usageText());
    return 1;
  } catch (error) {
    printErr(formatCliError(error));
    return 1;
  }
}
