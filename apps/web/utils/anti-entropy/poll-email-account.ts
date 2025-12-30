import type { AntiEntropyResult, AntiEntropyAccountData } from "./types";
import {
  generateWebhookDiagnostics,
  logAntiEntropyFindings,
} from "./diagnostics";
import { processHistoryForUser } from "@/app/api/google/webhook/process-history";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

interface PollResult {
  messagesProcessed: number;
  caughtByAntiEntropy: boolean;
}

export async function pollEmailAccount(
  account: AntiEntropyAccountData,
  logger: Logger,
): Promise<AntiEntropyResult> {
  const log = logger.with({
    emailAccountId: account.id,
    email: account.email,
  });

  const providerName = account.account?.provider || "google";
  const isGoogle = isGoogleProvider(providerName);
  const isMicrosoft = isMicrosoftProvider(providerName);

  const result: AntiEntropyResult = {
    emailAccountId: account.id,
    email: account.email,
    provider: isGoogle ? "google" : "microsoft",
    messagesProcessed: 0,
    caughtByAntiEntropy: false,
    scheduledActionsExecuted: 0,
  };

  try {
    let pollResult: PollResult;

    if (isGoogle) {
      pollResult = await pollGoogleAccount(account, log);
    } else if (isMicrosoft) {
      // Outlook uses subscription-based notifications, so anti-entropy
      // for Outlook currently just logs that polling is not supported
      log.info(
        "Outlook anti-entropy not yet implemented - relies on subscription notifications",
      );
      pollResult = { messagesProcessed: 0, caughtByAntiEntropy: false };
    } else {
      log.warn("Unknown provider for anti-entropy polling", {
        provider: providerName,
      });
      result.error = `Unknown provider: ${providerName}`;
      return result;
    }

    result.messagesProcessed = pollResult.messagesProcessed;
    result.caughtByAntiEntropy = pollResult.caughtByAntiEntropy;

    if (pollResult.caughtByAntiEntropy && pollResult.messagesProcessed > 0) {
      const diagnostic = generateWebhookDiagnostics(
        result.provider,
        account.email,
        pollResult.messagesProcessed,
        account.lastWebhookReceivedAt,
      );
      logAntiEntropyFindings(diagnostic, log);
    }

    return result;
  } catch (error) {
    log.error("Error polling email account", { error });
    result.error = error instanceof Error ? error.message : String(error);
    return result;
  }
}

async function pollGoogleAccount(
  account: AntiEntropyAccountData,
  logger: Logger,
): Promise<PollResult> {
  const log = logger.with({ provider: "google" });

  if (!account.lastSyncedHistoryId) {
    log.info(
      "No lastSyncedHistoryId, skipping Google poll (likely new account)",
    );
    return { messagesProcessed: 0, caughtByAntiEntropy: false };
  }

  log.info("Polling Google account for missed emails", {
    lastSyncedHistoryId: account.lastSyncedHistoryId,
  });

  const historyIdBefore = account.lastSyncedHistoryId;

  await processHistoryForUser(
    {
      emailAddress: account.email,
      historyId: Number.parseInt(account.lastSyncedHistoryId),
    },
    { startHistoryId: account.lastSyncedHistoryId },
    log,
  );

  const updatedAccount = await prisma.emailAccount.findUnique({
    where: { id: account.id },
    select: { lastSyncedHistoryId: true },
  });

  const historyIdAfter = updatedAccount?.lastSyncedHistoryId;
  const historyMoved = historyIdAfter !== historyIdBefore;

  if (historyMoved) {
    log.info("Anti-entropy found and processed messages", {
      historyIdBefore,
      historyIdAfter,
    });
  }

  return {
    messagesProcessed: historyMoved ? 1 : 0,
    caughtByAntiEntropy: historyMoved,
  };
}
