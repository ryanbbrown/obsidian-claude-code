/** Stub toolManager */
export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
}
export const getAllTools = (): ToolDefinition[] => [];
export const getToolDescription = (id: string): string => "";
