import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { runAntiEntropyForUser } from "@/utils/anti-entropy";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export type SyncResponse = {
  success: boolean;
  messagesProcessed: number;
  scheduledActionsExecuted: number;
  error?: string;
};

export const POST = withEmailAccount(async (request) => {
  const { emailAccountId } = request.auth;
  const logger = request.logger;

  const log = logger.with({ emailAccountId });

  try {
    const result = await runAntiEntropyForUser(emailAccountId, log);

    return NextResponse.json({
      success: !result.error,
      messagesProcessed: result.messagesProcessed,
      scheduledActionsExecuted: result.scheduledActionsExecuted,
      error: result.error,
    } satisfies SyncResponse);
  } catch (error) {
    log.error("User sync failed", { error });

    return NextResponse.json({
      success: false,
      messagesProcessed: 0,
      scheduledActionsExecuted: 0,
      error: error instanceof Error ? error.message : "Sync failed",
    } satisfies SyncResponse);
  }
});
