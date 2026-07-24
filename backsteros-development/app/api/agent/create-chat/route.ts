import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

import { isCursorChatId } from "@/lib/cursor-agent-cli";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Create an empty Cursor Agent chat and return its id.
 * Used so task-bound sessions can be resumed later with `agent --resume`.
 */
export async function POST() {
  try {
    const { stdout, stderr } = await execFileAsync(
      "agent",
      ["create-chat"],
      {
        timeout: 20_000,
        env: process.env,
        maxBuffer: 1024 * 1024,
      },
    );
    const text = `${stdout}\n${stderr}`;
    const chatId = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => isCursorChatId(line));

    if (!chatId) {
      return NextResponse.json(
        {
          error: "Could not parse chat id from `agent create-chat`.",
          detail: text.trim().slice(0, 500) || null,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ chatId: chatId.toLowerCase() });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create Cursor chat.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
