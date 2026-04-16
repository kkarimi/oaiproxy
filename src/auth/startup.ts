import readline from "node:readline/promises";

import { beginOAuthLogin } from "./oauth.js";
import { buildOAuthRedirectUri, type AppConfig } from "../config.js";
import { getAuthStatus } from "./status.js";

type StartupLogger = {
  info: (message: string) => void;
  warn: (message: string) => void;
};

export async function maybePromptForLoginOnStartup(
  config: AppConfig,
  logger: StartupLogger,
): Promise<void> {
  const status = await getAuthStatus();

  if (status.authenticated) {
    logger.info(
      `Authenticated ChatGPT subscription found for ${status.email ?? "account"} (${status.plan_type ?? "unknown plan"}).`,
    );
    return;
  }

  const reason =
    status.reason === "expired"
      ? "Stored ChatGPT auth is expired."
      : "No valid ChatGPT auth found.";

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    logger.warn(`${reason} Start login later with POST /auth/login.`);
    return;
  }

  const prompt = `${reason} Launch browser login now? [Y/n] `;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = (await rl.question(prompt)).trim().toLowerCase();
    const shouldLaunch = answer === "" || answer === "y" || answer === "yes";

    if (!shouldLaunch) {
      logger.info("Login skipped. Use POST /auth/login to start OAuth later.");
      return;
    }

    const login = await beginOAuthLogin({
      redirectUri: buildOAuthRedirectUri(config),
      openBrowserWindow: true,
    });

    logger.info("Browser login started. Waiting for OAuth callback...");
    const storedAuth = await login.completion;
    logger.info(
      `Authenticated ${storedAuth.claims.email ?? "ChatGPT account"} (${storedAuth.claims.plan_type ?? "unknown plan"}).`,
    );
  } finally {
    rl.close();
  }
}
