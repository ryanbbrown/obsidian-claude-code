/** Simplified CopilotView - React ItemView wrapper */
import Chat from "@/components/Chat";
import { CHAT_VIEWTYPE } from "@/constants";
import { AppContext, EventTargetContext } from "@/context";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ItemView, WorkspaceLeaf, App } from "obsidian";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";

interface PluginWithSettings {
  app: App;
  settings: { claudePath: string; envVars: Record<string, string> };
}

export default class CopilotView extends ItemView {
  private root: Root | null = null;
  private plugin: PluginWithSettings;
  eventTarget: EventTarget;

  constructor(leaf: WorkspaceLeaf, plugin: PluginWithSettings) {
    super(leaf);
    this.plugin = plugin;
    this.app = plugin.app;
    this.eventTarget = new EventTarget();
  }

  getViewType(): string {
    return CHAT_VIEWTYPE;
  }

  getIcon(): string {
    return "message-square";
  }

  getTitle(): string {
    return "Claude Chat";
  }

  getDisplayText(): string {
    return "Claude Chat";
  }

  async onOpen(): Promise<void> {
    this.root = createRoot(this.containerEl.children[1]);
    this.renderView();
  }

  private renderView(): void {
    if (!this.root) return;

    this.root.render(
      <AppContext.Provider value={this.app}>
        <EventTargetContext.Provider value={this.eventTarget}>
          <Tooltip.Provider delayDuration={0}>
            <Chat app={this.app} claudePath={this.plugin.settings.claudePath} envVars={this.plugin.settings.envVars} />
          </Tooltip.Provider>
        </EventTargetContext.Provider>
      </AppContext.Provider>
    );
  }

  async onClose(): Promise<void> {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
  }
}
