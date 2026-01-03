import {App, Editor, MarkdownView, Modal, Notice, Plugin, WorkspaceLeaf} from 'obsidian';
import {DEFAULT_SETTINGS, ClaudeCodeSettings, ClaudeCodeSettingTab} from "./settings";
import {editTextWithClaude} from "./claude";
import CopilotView from "@/components/CopilotView";
import { CHAT_VIEWTYPE } from "@/constants";
import { VaultDataManager } from "@/state/vaultDataAtoms";
import fixPath from 'fix-path';

export default class ClaudeCodePlugin extends Plugin {
	settings: ClaudeCodeSettings;

	async onload() {
		// Fix PATH for spawned processes (gets full PATH from user's shell profile)
		fixPath();

		await this.loadSettings();

		// Initialize vault data manager for @ mention file search
		VaultDataManager.getInstance().initialize();

		// Register the chat view
		this.registerView(CHAT_VIEWTYPE, (leaf) => new CopilotView(leaf, this));

		// Add ribbon icon for chat
		this.addRibbonIcon('message-square', 'Claude Chat', () => this.activateChatView());

		// Add command to open chat
		this.addCommand({
			id: 'open-claude-chat',
			name: 'Open Chat',
			callback: () => this.activateChatView(),
		});

		// Add the "Edit Text" editor command
		this.addCommand({
			id: 'edit-text-with-claude',
			name: 'Edit Text',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const selectedText = editor.getSelection();
				if (!selectedText) {
					new Notice('Please select some text first');
					return;
				}

				new PromptModal(this.app, async (instruction) => {
					if (!instruction) return;

					new Notice('Sending to Claude...');

					try {
						const vaultPath = (this.app.vault.adapter as any).basePath;

						const result = await editTextWithClaude(selectedText, instruction, {
							claudePath: this.settings.claudePath,
							workingDir: vaultPath,
							envVars: this.settings.envVars,
							onText: (text) => {
								// Could update a status bar here for streaming feedback
							},
							onComplete: () => {
								new Notice('Claude finished editing');
							},
							onError: (err) => {
								new Notice(`Error: ${err.message}`);
							}
						});

						// Replace the selection with Claude's output
						editor.replaceSelection(result);
					} catch (err: any) {
						new Notice(`Failed to edit text: ${err.message}`);
						console.error('Claude edit error:', err);
					}
				}).open();
			}
		});

		this.addSettingTab(new ClaudeCodeSettingTab(this.app, this));
	}

	onunload() {
		VaultDataManager.getInstance().cleanup();
	}

	/** Activates the chat view in the right sidebar */
	async activateChatView() {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(CHAT_VIEWTYPE)[0];
		if (!leaf) {
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				await rightLeaf.setViewState({ type: CHAT_VIEWTYPE, active: true });
				leaf = rightLeaf;
			}
		}
		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<ClaudeCodeSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

/** Modal that prompts the user for editing instructions. */
class PromptModal extends Modal {
	private onSubmit: (instruction: string) => void;

	constructor(app: App, onSubmit: (instruction: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const {contentEl} = this;

		contentEl.createEl('h3', {text: 'Edit with Claude'});
		contentEl.createEl('p', {text: 'Enter your editing instructions:'});

		const inputContainer = contentEl.createDiv();
		const inputField = inputContainer.createEl('input', {
			type: 'text',
			cls: 'claude-prompt-input',
		});
		inputField.style.width = '100%';
		inputField.style.padding = '8px';
		inputField.style.marginBottom = '16px';
		inputField.placeholder = 'e.g., "Make this more concise" or "Fix grammar"';

		inputField.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				this.submit(inputField.value);
			}
		});

		const buttonContainer = contentEl.createDiv({cls: 'modal-button-container'});
		buttonContainer.style.display = 'flex';
		buttonContainer.style.justifyContent = 'flex-end';
		buttonContainer.style.gap = '8px';

		const cancelBtn = buttonContainer.createEl('button', {text: 'Cancel'});
		cancelBtn.addEventListener('click', () => this.close());

		const submitBtn = buttonContainer.createEl('button', {text: 'Edit', cls: 'mod-cta'});
		submitBtn.addEventListener('click', () => this.submit(inputField.value));

		// Focus the input
		inputField.focus();
	}

	private submit(value: string) {
		this.close();
		this.onSubmit(value);
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}
