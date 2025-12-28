/** Stub error */
export class CopilotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CopilotError";
  }
}
