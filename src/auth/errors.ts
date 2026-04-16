export class AuthRequiredError extends Error {
  constructor(message = "No valid ChatGPT auth found. Start login with POST /auth/login.") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

export class AuthFlowError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
    this.name = "AuthFlowError";
  }
}
