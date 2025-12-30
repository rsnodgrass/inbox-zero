import type { AntiEntropyMetrics, AntiEntropyAccountData } from "./types";
import { pollEmailAccount } from "./poll-email-account";
import { executePendingScheduledActions } from "./execute-pending-actions";
import { getPremiumUserFilter } from "@/utils/premium";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import { sleep } from "@/utils/sleep";

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1000;

export async function getAccountsToPolice(
  logger: Logger,
): Promise<AntiEntropyAccountData[]> {
  const log = logger.with({ module: "anti-entropy-accounts" });

  const accounts = await prisma.emailAccount.findMany({
    where: {
      ...getPremiumUserFilter(),
      rules: {
        some: { enabled: true },
      },
    },
    select: {
      id: true,
      email: true,
      lastSyncedHistoryId: true,
      watchEmailsExpirationDate: true,
      account: {
        select: {
          provider: true,
          access_token: true,
          refresh_token: true,
          expires_at: true,
        },
      },
      user: {
        select: {
          id: true,
          aiProvider: true,
          aiModel: true,
          aiApiKey: true,
          premium: {
            select: {
              tier: true,
              lemonSqueezyRenewsAt: true,
              stripeSubscriptionStatus: true,
            },
          },
        },
      },
      rules: {
        where: { enabled: true },
        select: {
          id: true,
          enabled: true,
        },
      },
    },
    orderBy: { updatedAt: "asc" },
  });

  log.info("Found accounts for anti-entropy polling", {
    count: accounts.length,
  });

  // map to AntiEntropyAccountData, adding lastWebhookReceivedAt as null for now
  return accounts.map((account) => ({
    ...account,
    lastWebhookReceivedAt: null,
  }));
}

export async function runAntiEntropy(
  logger: Logger,
): Promise<AntiEntropyMetrics> {
  const startTime = Date.now();
  const log = logger.with({ module: "anti-entropy" });

  log.info("Starting anti-entropy run");

  const metrics: AntiEntropyMetrics = {
    totalAccountsPolled: 0,
    googleAccounts: 0,
    microsoftAccounts: 0,
    totalMessagesCaught: 0,
    totalScheduledActionsExecuted: 0,
    accountsWithWebhookGaps: 0,
    errors: 0,
    durationMs: 0,
  };

  const scheduledResult = await executePendingScheduledActions(log);
  metrics.totalScheduledActionsExecuted = scheduledResult.executed;
  if (scheduledResult.failed > 0) {
    metrics.errors += scheduledResult.failed;
  }

  const accounts = await getAccountsToPolice(log);

  for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
    const batch = accounts.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (account) => {
        const result = await pollEmailAccount(account, log);

        metrics.totalAccountsPolled++;

        if (result.provider === "google") {
          metrics.googleAccounts++;
        } else {
          metrics.microsoftAccounts++;
        }

        if (result.error) {
          metrics.errors++;
        }

        if (result.caughtByAntiEntropy) {
          metrics.accountsWithWebhookGaps++;
          metrics.totalMessagesCaught += result.messagesProcessed;
        }
      }),
    );

    if (i + BATCH_SIZE < accounts.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  metrics.durationMs = Date.now() - startTime;

  log.info("Completed anti-entropy run", {
    ...metrics,
  });

  return metrics;
}

export async function runAntiEntropyForUser(
  emailAccountId: string,
  logger: Logger,
): Promise<{
  messagesProcessed: number;
  scheduledActionsExecuted: number;
  error?: string;
}> {
  const log = logger.with({ module: "anti-entropy-user", emailAccountId });

  log.info("Running anti-entropy for single user");

  const dbAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      id: true,
      email: true,
      lastSyncedHistoryId: true,
      watchEmailsExpirationDate: true,
      account: {
        select: {
          provider: true,
          access_token: true,
          refresh_token: true,
          expires_at: true,
        },
      },
      user: {
        select: {
          id: true,
          aiProvider: true,
          aiModel: true,
          aiApiKey: true,
          premium: {
            select: {
              tier: true,
              lemonSqueezyRenewsAt: true,
              stripeSubscriptionStatus: true,
            },
          },
        },
      },
      rules: {
        where: { enabled: true },
        select: {
          id: true,
          enabled: true,
        },
      },
    },
  });

  if (!dbAccount) {
    log.warn("Account not found");
    return {
      messagesProcessed: 0,
      scheduledActionsExecuted: 0,
      error: "Account not found",
    };
  }

  const account: AntiEntropyAccountData = {
    ...dbAccount,
    lastWebhookReceivedAt: null,
  };

  const pollResult = await pollEmailAccount(account, log);

  return {
    messagesProcessed: pollResult.messagesProcessed,
    scheduledActionsExecuted: pollResult.scheduledActionsExecuted,
    error: pollResult.error,
  };
}
