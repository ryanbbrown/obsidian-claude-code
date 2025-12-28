import {App, PluginSettingTab, Setting} from "obsidian";
import ClaudeCodePlugin from "./main";

export interface ClaudeCodeSettings {
	claudePath: string;
}

export const DEFAULT_SETTINGS: ClaudeCodeSettings = {
	claudePath: `${process.env.HOME}/.local/bin/claude`
}

export class ClaudeCodeSettingTab extends PluginSettingTab {
	plugin: ClaudeCodePlugin;

	constructor(app: App, plugin: ClaudeCodePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Claude CLI Path')
			.setDesc('Path to the Claude Code CLI executable')
			.addText(text => text
				.setPlaceholder('/path/to/claude')
				.setValue(this.plugin.settings.claudePath)
				.onChange(async (value) => {
					this.plugin.settings.claudePath = value;
					await this.plugin.saveSettings();
				}));
	}
}
