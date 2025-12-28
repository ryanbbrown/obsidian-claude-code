import { spawn, ChildProcess } from 'child_process';
import { Notice } from 'obsidian';

/** Response message from Claude CLI JSON stream. */
interface ClaudeMessage {
	type: string;
	message?: {
		content?: Array<{ type: string; text?: string }>;
	};
	result?: {
		content?: Array<{ type: string; text?: string }>;
	};
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
