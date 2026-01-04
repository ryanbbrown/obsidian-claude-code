import {App, PluginSettingTab, Setting, setIcon} from "obsidian";
import ClaudeCodePlugin from "./main";
import { PendingEditsManager } from "@/pendingEdits";

export interface ClaudeCodeSettings {
	claudePath: string;
	envVars: Record<string, string>;
	showPendingEdits: boolean;
}

export const DEFAULT_SETTINGS: ClaudeCodeSettings = {
	claudePath: `${process.env.HOME}/.local/bin/claude`,
	envVars: {},
	showPendingEdits: true,
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

		new Setting(containerEl)
			.setName('Show pending edits')
			.setDesc('When enabled, file edits are shown as pending changes that you can accept or reject. When disabled, edits are applied immediately.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showPendingEdits)
				.onChange(async (value) => {
					this.plugin.settings.showPendingEdits = value;
					PendingEditsManager.getInstance().setEnabled(value);
					await this.plugin.saveSettings();
				}));

		// Environment Variables section
		containerEl.createEl('h3', {text: 'Environment Variables'});
		containerEl.createEl('p', {
			text: 'Add environment variables to pass to the Claude CLI process (e.g., API keys).',
			cls: 'setting-item-description'
		});

		const envVarsContainer = containerEl.createDiv({cls: 'env-vars-container'});
		this.renderEnvVars(envVarsContainer);
	}

	/** Shows a brief "Saved" indicator next to an element. */
	private showSavedIndicator(parent: HTMLElement): void {
		const indicator = parent.createSpan({text: 'Saved', cls: 'env-var-saved'});
		indicator.style.color = 'var(--text-success)';
		indicator.style.fontSize = '12px';
		indicator.style.marginLeft = '8px';
		indicator.style.opacity = '1';
		indicator.style.transition = 'opacity 0.3s';
		setTimeout(() => {
			indicator.style.opacity = '0';
			setTimeout(() => indicator.remove(), 300);
		}, 1500);
	}

	/** Renders the environment variables UI. */
	private renderEnvVars(container: HTMLElement): void {
		container.empty();

		const envVars = this.plugin.settings.envVars;

		// Render existing env vars
		for (const key of Object.keys(envVars)) {
			const row = container.createDiv({cls: 'env-var-row'});
			row.style.display = 'flex';
			row.style.gap = '8px';
			row.style.marginBottom = '8px';
			row.style.alignItems = 'center';

			const keyInput = row.createEl('input', {type: 'text', value: key});
			keyInput.style.flex = '1';
			keyInput.placeholder = 'KEY';

			const valueInput = row.createEl('input', {type: 'password', value: envVars[key]});
			valueInput.style.flex = '2';
			valueInput.placeholder = 'value';

			const showBtn = row.createEl('button', {attr: {title: 'Show/hide value'}});
			showBtn.style.padding = '4px 8px';
			showBtn.style.display = 'flex';
			showBtn.style.alignItems = 'center';
			setIcon(showBtn, 'eye');
			showBtn.addEventListener('click', () => {
				if (valueInput.type === 'password') {
					valueInput.type = 'text';
					setIcon(showBtn, 'eye-off');
				} else {
					valueInput.type = 'password';
					setIcon(showBtn, 'eye');
				}
			});

			const deleteBtn = row.createEl('button', {attr: {title: 'Delete'}});
			deleteBtn.style.padding = '4px 8px';
			deleteBtn.style.display = 'flex';
			deleteBtn.style.alignItems = 'center';
			setIcon(deleteBtn, 'x');

			keyInput.addEventListener('change', async () => {
				const newKey = keyInput.value.trim();
				if (newKey && newKey !== key) {
					delete this.plugin.settings.envVars[key];
					this.plugin.settings.envVars[newKey] = valueInput.value;
					await this.plugin.saveSettings();
					this.showSavedIndicator(row);
				}
			});

			valueInput.addEventListener('change', async () => {
				this.plugin.settings.envVars[key] = valueInput.value;
				await this.plugin.saveSettings();
				this.showSavedIndicator(row);
			});

			deleteBtn.addEventListener('click', async () => {
				delete this.plugin.settings.envVars[key];
				await this.plugin.saveSettings();
				this.renderEnvVars(container);
			});
		}

		// Add new variable button
		const addBtn = container.createEl('button', {text: '+ Add Variable'});
		addBtn.style.marginTop = '8px';
		addBtn.addEventListener('click', async () => {
			const newKey = `VAR_${Object.keys(envVars).length + 1}`;
			this.plugin.settings.envVars[newKey] = '';
			await this.plugin.saveSettings();
			this.renderEnvVars(container);
		});
	}
}
