/** Stub ToolResultFormatter */
export class ToolResultFormatter {
  static format(toolName: string, result: unknown): string {
    return String(result);
  }
}
export const formatToolResultForDisplay = (result: unknown) => String(result);
