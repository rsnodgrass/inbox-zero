export interface AntiEntropyResult {
  emailAccountId: string;
  email: string;
  provider: "google" | "microsoft";
  messagesProcessed: number;
  caughtByAntiEntropy: boolean;
  scheduledActionsExecuted: number;
  error?: string;
}

export interface AntiEntropyMetrics {
  totalAccountsFound: number;
  accountsSkipped: number;
  totalAccountsPolled: number;
  googleAccounts: number;
  microsoftAccounts: number;
  totalMessagesCaught: number;
  totalScheduledActionsExecuted: number;
  accountsWithWebhookGaps: number;
  errors: number;
  durationMs: number;
}

export interface WebhookDiagnostic {
  provider: "google" | "microsoft";
  accountEmail: string;
  missedMessageCount: number;
  timeSinceLastWebhook: number | null;
  suggestedFixes: string[];
}

export interface AntiEntropyAccountData {
  id: string;
  email: string;
  lastSyncedHistoryId: string | null;
  lastWebhookReceivedAt: Date | null;
  watchEmailsExpirationDate: Date | null;
  account: {
    provider: string | null;
    access_token: string | null;
    refresh_token: string | null;
    expires_at: Date | null;
  } | null;
  user: {
    id: string;
    aiProvider: string | null;
    aiModel: string | null;
    aiApiKey: string | null;
    premium: {
      tier: string | null;
      lemonSqueezyRenewsAt: Date | null;
      stripeSubscriptionStatus: string | null;
    } | null;
  };
  rules: Array<{
    id: string;
    enabled: boolean;
  }>;
}
