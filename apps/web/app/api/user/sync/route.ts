import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { runAntiEntropyForUser } from "@/utils/anti-entropy";
import prisma from "@/utils/prisma";
import { subMinutes } from "date-fns";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const RATE_LIMIT_MINUTES = 5;

export type SyncResponse = {
  success: boolean;
  messagesProcessed: number;
  scheduledActionsExecuted: number;
  error?: string;
  rateLimited?: boolean;
  nextSyncAvailableAt?: string;
};

export const POST = withEmailAccount(async (request) => {
  const { emailAccountId } = request.auth;
  const logger = request.logger;

  const log = logger.with({ emailAccountId });

  const account = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      id: true,
      updatedAt: true,
    },
  });

  if (!account) {
    return NextResponse.json({
      success: false,
      messagesProcessed: 0,
      scheduledActionsExecuted: 0,
      error: "Account not found",
    } satisfies SyncResponse);
  }

  const rateLimitCutoff = subMinutes(new Date(), RATE_LIMIT_MINUTES);
  const lastSync = account.updatedAt;

  if (lastSync > rateLimitCutoff) {
    const nextSyncAvailable = new Date(
      lastSync.getTime() + RATE_LIMIT_MINUTES * 60 * 1000,
    );
    log.info("User sync rate limited", {
      lastSync,
      nextSyncAvailable,
    });

    return NextResponse.json({
      success: false,
      messagesProcessed: 0,
      scheduledActionsExecuted: 0,
      rateLimited: true,
      nextSyncAvailableAt: nextSyncAvailable.toISOString(),
    } satisfies SyncResponse);
  }

  try {
    const result = await runAntiEntropyForUser(emailAccountId, log);

    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { updatedAt: new Date() },
    });

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
