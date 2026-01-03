import { spawn, ChildProcess } from 'child_process';
import { MessageSegment } from '@/types/message';
import { makeRelativePath } from '@/utils';
import { PendingEditsManager } from '@/pendingEdits';

/** Tool names that modify files and should be tracked as pending edits. */
const EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit'];

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

/** Callbacks for chat streaming events. */
export interface ClaudeChatCallbacks {
	onSegmentsUpdate: (segments: MessageSegment[]) => void;
	onComplete: () => void;
	onError: (error: Error) => void;
	onSessionId?: (sessionId: string) => void;
}

/** Options for running Claude chat. */
export interface ClaudeChatOptions {
	claudePath: string;
	workingDir: string;
	sessionId?: string;
	envVars?: Record<string, string>;
}

/** Session state returned from Claude CLI. */
export interface ClaudeSessionState {
	sessionId?: string;
}

/** Formats a tool result summary showing file path and line range. */
function formatToolResultSummary(name: string, input: Record<string, unknown>, workingDir: string): string {
	// Handle Grep tool specially - show the search pattern
	if (name === 'Grep' || name === 'grep') {
		const pattern = input.pattern as string | undefined;
		return pattern ? `"${pattern}"` : 'Completed';
	}

	const filePath = input.file_path as string | undefined;
	if (!filePath) return 'Completed';

	const relativePath = makeRelativePath(filePath, workingDir);

	const offset = input.offset as number | undefined;
	const limit = input.limit as number | undefined;

	if (offset !== undefined && limit !== undefined) {
		return `${relativePath} (lines ${offset + 1}-${offset + limit})`;
	} else if (offset !== undefined) {
		return `${relativePath} (from line ${offset + 1})`;
	} else if (limit !== undefined) {
		return `${relativePath} (first ${limit} lines)`;
	}
	return relativePath;
}

let currentChatProcess: ChildProcess | null = null;

/** Runs Claude CLI chat with streaming callbacks for segments. */
export async function runClaudeChat(
	prompt: string,
	options: ClaudeChatOptions,
	callbacks: ClaudeChatCallbacks
): Promise<void> {
	return new Promise((resolve, reject) => {
		const env = {
			...process.env,
			...options.envVars,
		};

		const args = [
			'-p',
			'--output-format', 'stream-json',
			'--verbose',
			'--dangerously-skip-permissions',
		];

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

		// Segment-based state
		const segments: MessageSegment[] = [];

		/** Appends text to the last text segment or creates a new one. */
		const appendText = (text: string) => {
			const lastSegment = segments[segments.length - 1];
			if (lastSegment?.type === 'text') {
				lastSegment.content += text;
			} else {
				segments.push({ type: 'text', content: text });
			}
		};

		/** Adds a new tool call segment. */
		const addToolCall = async (id: string, name: string, input: Record<string, unknown>) => {
			// Check if tool call already exists
			const existing = segments.find(s => s.type === 'toolCall' && s.id === id);
			if (!existing) {
				// Simplify MCP tool names (e.g., mcp__plugin_perplexity__search -> search)
				const displayName = name.includes('__') ? name.split('__').pop()! : name;

				// Capture before state for edit tools
				if (EDIT_TOOLS.includes(displayName) && input.file_path) {
					await PendingEditsManager.getInstance().captureBeforeState(
						id,
						input.file_path as string,
						displayName
					);
				}

				segments.push({
					type: 'toolCall',
					id,
					name: displayName,
					input,
					isExecuting: true,
				});
			}
		};

		/** Completes a tool call with its result. */
		const completeToolCall = async (toolUseId: string) => {
			const segment = segments.find(s => s.type === 'toolCall' && s.id === toolUseId);
			if (segment && segment.type === 'toolCall') {
				segment.isExecuting = false;
				segment.result = formatToolResultSummary(segment.name, segment.input, options.workingDir);

				// Complete pending edit for edit tools
				if (EDIT_TOOLS.includes(segment.name)) {
					await PendingEditsManager.getInstance().completePendingEdit(toolUseId);
				}
			}
		};

		/** Emits current segments. */
		const emitSegments = () => {
			callbacks.onSegmentsUpdate([...segments]);
		};

		proc.stdout?.on('data', (data: Buffer) => {
			buffer += data.toString();

			const lines = buffer.split('\n');
			buffer = lines.pop() || '';

			/** Processes a single JSON line message. */
			const processLine = async (line: string) => {
				if (!line.trim()) return;

				try {
					const msg = JSON.parse(line);

					// Handle assistant message with content blocks
					if (msg.type === 'assistant' && msg.message?.content) {
						for (const block of msg.message.content) {
							if (block.type === 'text' && block.text) {
								appendText(block.text);
								emitSegments();
							} else if (block.type === 'tool_use' && block.id && block.name) {
								await addToolCall(block.id, block.name, block.input || {});
								emitSegments();
							}
						}
					}

					// Handle top-level tool_use event
					if (msg.type === 'tool_use' && msg.name) {
						const id = msg.id || `tool_${Date.now()}`;
						await addToolCall(id, msg.name, msg.input || {});
						emitSegments();
					}

					// Handle top-level tool_result event
					if (msg.type === 'tool_result') {
						const toolUseId = msg.tool_use_id;
						if (toolUseId) {
							await completeToolCall(toolUseId);
							emitSegments();
						}
					}

					// Handle user message with tool_result blocks
					if (msg.type === 'user' && msg.message?.content) {
						for (const block of msg.message.content as UserContentBlock[]) {
							if (block.type === 'tool_result' && block.tool_use_id) {
								await completeToolCall(block.tool_use_id);
								emitSegments();
							}
						}
					}

					// Handle message type with role (alternative format)
					if (msg.type === 'message' && msg.role === 'assistant' && msg.content) {
						for (const block of msg.content) {
							if (block.type === 'text' && block.text) {
								appendText(block.text);
								emitSegments();
							} else if (block.type === 'tool_use' && block.id && block.name) {
								await addToolCall(block.id, block.name, block.input || {});
								emitSegments();
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
			};

			// Process lines sequentially to maintain order
			(async () => {
				for (const line of lines) {
					await processLine(line);
				}
			})();
		});

		proc.stderr?.on('data', () => {
			// Stderr is ignored
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
	envVars?: Record<string, string>;
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
			...options.envVars,
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

		proc.stderr?.on('data', () => {
			// Stderr is ignored
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
