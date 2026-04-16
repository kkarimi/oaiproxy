import type { AppConfig } from "./config.js";
import { AuthService } from "./auth/service.js";

export type AppServices = {
  auth: AuthService;
};

export function createAppServices(config: AppConfig): AppServices {
  return {
    auth: new AuthService(config),
  };
}
