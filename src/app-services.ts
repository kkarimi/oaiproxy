import type { AppConfig } from "./config.js";
import { AuthService, type AuthServiceLike } from "./auth/service.js";

export type AppServices = {
  auth: AuthServiceLike;
};

export function createAppServices(config: AppConfig): AppServices {
  return {
    auth: new AuthService(config),
  };
}
