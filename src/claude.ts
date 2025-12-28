import { spawn, ChildProcess } from 'child_process';
import { Notice } from 'obsidian';

/** Response message from Claude CLI JSON stream. */
interface ClaudeMessage {
	type: string;
	message?: {
		content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: any }>;
	};
	result?: {
		content?: Array<{ type: string; text?: string }>;
	};
}

/** Content block in a user message (for tool results). */
interface UserContentBlock {
	type: string;
	tool_use_id?: string;
	content?: string;
}

/** User message from Claude CLI JSON stream. */
interface ClaudeUserMessage {
	type: 'user';
	message: {
		content: UserContentBlock[];
	};
}

/** Callbacks for chat streaming events. */
export interface ClaudeChatCallbacks {
	onContentUpdate: (content: string) => void;
	onComplete: () => void;
	onError: (error: Error) => void;
	onSessionId?: (sessionId: string) => void;
}

/** Options for running Claude chat. */
export interface ClaudeChatOptions {
	claudePath: string;
	workingDir: string;
	sessionId?: string;
}

/** Session state returned from Claude CLI. */
export interface ClaudeSessionState {
	sessionId?: string;
}

/** Formats a complete tool call marker (START + END) for embedding in streamed content. */
export function formatToolCallComplete(id: string, name: string, input: any, result: string): string {
	const encodedResult = 'ENC:' + encodeURIComponent(result);
	// Format: <!--TOOL_CALL_START:id:toolName:displayName:emoji:confirmationMessage:isExecuting-->content<!--TOOL_CALL_END:id:result-->
	return `<!--TOOL_CALL_START:${id}:${name}:${name}:🔧::false--><!--TOOL_CALL_END:${id}:${encodedResult}-->\n`;
}

let currentChatProcess: ChildProcess | null = null;

/** Content block from assistant message. */
interface ContentBlock {
	type: string;
	text?: string;
	id?: string;
	name?: string;
	input?: any;
}

/** Runs Claude CLI chat with streaming callbacks for text and tool calls. */
export async function runClaudeChat(
	prompt: string,
	options: ClaudeChatOptions,
	callbacks: ClaudeChatCallbacks
): Promise<void> {
	return new Promise((resolve, reject) => {
		const env = {
			...process.env,
			PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin:${process.env.HOME}/.local/bin`,
		};

		const args = [
			'-p',
			'--output-format', 'stream-json',
			'--verbose',
			'--dangerously-skip-permissions',
		];

		// Resume existing session if we have one
		if (options.sessionId) {
			args.push('--resume', options.sessionId);
		}

		args.push(prompt);

		const proc: ChildProcess = spawn(options.claudePath, args, {
			cwd: options.workingDir,
			env,
			stdio: ['pipe', 'pipe', 'pipe'],
		});

		currentChatProcess = proc;
		let buffer = '';

		// Simple append-based state
		let fullContent = '';
		const pendingToolCalls = new Map<string, { name: string; input: any; position: number }>();

		/** Emits current content. */
		const emitContent = () => {
			callbacks.onContentUpdate(fullContent);
		};

		/** Inserts a completed tool marker at the position where tool_use was. */
		const completeToolCall = (toolUseId: string, result: string) => {
			const pending = pendingToolCalls.get(toolUseId);
			if (pending) {
				const marker = formatToolCallComplete(toolUseId, pending.name, pending.input, result);
				// Insert marker at the position where the tool was called
				fullContent = fullContent.slice(0, pending.position) + marker + fullContent.slice(pending.position);
				// Adjust positions of any pending tools that come after this one
				const insertedLength = marker.length;
				for (const [id, tool] of pendingToolCalls) {
					if (tool.position > pending.position) {
						tool.position += insertedLength;
					}
				}
				pendingToolCalls.delete(toolUseId);
				emitContent();
			}
		};

		proc.stdout?.on('data', (data: Buffer) => {
			buffer += data.toString();

			const lines = buffer.split('\n');
			buffer = lines.pop() || '';

			for (const line of lines) {
				if (!line.trim()) continue;

				try {
					const msg = JSON.parse(line);

					// Handle assistant message with content blocks
					if (msg.type === 'assistant' && msg.message?.content) {
						for (const block of msg.message.content) {
							if (block.type === 'text' && block.text) {
								fullContent += block.text;
								emitContent();
							} else if (block.type === 'tool_use' && block.id && block.name) {
								if (!pendingToolCalls.has(block.id)) {
									pendingToolCalls.set(block.id, {
										name: block.name,
										input: block.input,
										position: fullContent.length
									});
								}
							}
						}
					}

					// Handle top-level tool_use event
					if (msg.type === 'tool_use' && msg.name) {
						const id = msg.id || `tool_${Date.now()}`;
						if (!pendingToolCalls.has(id)) {
							pendingToolCalls.set(id, {
								name: msg.name,
								input: msg.input,
								position: fullContent.length
							});
						}
					}

					// Handle top-level tool_result event
					if (msg.type === 'tool_result') {
						const toolUseId = msg.tool_use_id || Array.from(pendingToolCalls.keys())[0];
						if (toolUseId) {
							completeToolCall(toolUseId, msg.output || msg.content || '');
						}
					}

					// Handle user message with tool_result blocks
					if (msg.type === 'user' && msg.message?.content) {
						for (const block of msg.message.content as UserContentBlock[]) {
							if (block.type === 'tool_result' && block.tool_use_id) {
								completeToolCall(block.tool_use_id, block.content || '');
							}
						}
					}

					// Handle message type with role (alternative format)
					if (msg.type === 'message' && msg.role === 'assistant' && msg.content) {
						for (const block of msg.content) {
							if (block.type === 'text' && block.text) {
								fullContent += block.text;
								emitContent();
							} else if (block.type === 'tool_use' && block.id && block.name) {
								if (!pendingToolCalls.has(block.id)) {
									pendingToolCalls.set(block.id, {
										name: block.name,
										input: block.input,
										position: fullContent.length
									});
								}
							}
						}
					}

					// Capture session ID from init or result messages
					if (msg.session_id && callbacks.onSessionId) {
						callbacks.onSessionId(msg.session_id);
					}

					if (msg.type === 'result') {
						callbacks.onComplete();
					}
				} catch (e) {
					// Skip non-JSON lines
				}
			}
		});

		proc.stderr?.on('data', (data: Buffer) => {
			console.error('[Claude stderr]', data.toString());
		});

		proc.on('error', (err) => {
			currentChatProcess = null;
			callbacks.onError(err);
			reject(err);
		});

		proc.on('close', (code) => {
			currentChatProcess = null;
			if (code === 0) {
				resolve();
			} else {
				const err = new Error(`Claude exited with code ${code}`);
				callbacks.onError(err);
				reject(err);
			}
		});

		proc.stdin?.end();
	});
}

/** Stops the current chat process if running. */
export function stopClaudeChat(): void {
	if (currentChatProcess) {
		currentChatProcess.kill('SIGTERM');
		currentChatProcess = null;
	}
}

/** Options for running Claude CLI. */
interface ClaudeOptions {
	claudePath: string;
	workingDir: string;
	onText?: (text: string) => void;
	onComplete?: (fullText: string) => void;
	onError?: (error: Error) => void;
}

/** Runs Claude CLI with a prompt and returns the result. */
export async function runClaude(prompt: string, options: ClaudeOptions): Promise<string> {
	return new Promise((resolve, reject) => {
		// Electron doesn't inherit shell PATH, so we need to set it manually
		const env = {
			...process.env,
			PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin:${process.env.HOME}/.local/bin`,
		};

		const args = [
			'-p',                          // Print mode (non-interactive)
			'--output-format', 'stream-json',
			'--verbose',
			prompt,
		];

		const proc: ChildProcess = spawn(options.claudePath, args, {
			cwd: options.workingDir,
			env,
			stdio: ['pipe', 'pipe', 'pipe'],
		});

		let fullText = '';
		let buffer = '';

		proc.stdout?.on('data', (data: Buffer) => {
			buffer += data.toString();

			// Process complete JSON lines
			const lines = buffer.split('\n');
			buffer = lines.pop() || ''; // Keep incomplete line in buffer

			for (const line of lines) {
				if (!line.trim()) continue;

				try {
					const msg: ClaudeMessage = JSON.parse(line);

					// Extract text from assistant messages
					if (msg.type === 'assistant' && msg.message?.content) {
						for (const block of msg.message.content) {
							if (block.type === 'text' && block.text) {
								fullText += block.text;
								options.onText?.(block.text);
							}
						}
					}

					// Final result
					if (msg.type === 'result' && msg.result?.content) {
						for (const block of msg.result.content) {
							if (block.type === 'text' && block.text) {
								// Result text is usually the same as accumulated text
							}
						}
					}
				} catch {
					// Skip non-JSON lines
				}
			}
		});

		proc.stderr?.on('data', (data: Buffer) => {
			console.error('[Claude stderr]', data.toString());
		});

		proc.on('error', (err) => {
			options.onError?.(err);
			reject(err);
		});

		proc.on('close', (code) => {
			if (code === 0) {
				options.onComplete?.(fullText);
				resolve(fullText);
			} else {
				const err = new Error(`Claude exited with code ${code}`);
				options.onError?.(err);
				reject(err);
			}
		});

		// Close stdin immediately - this signals to Claude that input is complete
		// Without this, the process hangs waiting for more input
		proc.stdin?.end();
	});
}

/** Prompts Claude to edit text based on user instructions. */
export async function editTextWithClaude(
	text: string,
	instruction: string,
	options: ClaudeOptions
): Promise<string> {
	const prompt = `Edit the following text according to these instructions: "${instruction}"

Return ONLY the edited text, nothing else. No explanations, no markdown code blocks, just the raw edited text.

Text to edit:
${text}`;

	return runClaude(prompt, options);
}

/** Finds the Claude CLI path by checking common locations. */
export function findClaudePath(): string {
	const home = process.env.HOME || '/Users/unknown';
	return `${home}/.local/bin/claude`;
}
