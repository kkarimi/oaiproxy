import { spawn } from "node:child_process";

export async function openBrowser(url: string): Promise<void> {
  const command = getBrowserOpenCommand(url);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      detached: true,
      stdio: "ignore",
    });

    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function getBrowserOpenCommand(url: string): string[] {
  switch (process.platform) {
    case "darwin":
      return ["open", url];
    case "win32":
      return ["cmd", "/c", "start", "", url];
    default:
      return ["xdg-open", url];
  }
}
