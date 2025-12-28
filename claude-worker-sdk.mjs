#!/usr/bin/env node
import { query } from '@anthropic-ai/claude-agent-sdk';
import * as readline from 'readline';
import * as os from 'os';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', async (line) => {
  try {
    const { prompt } = JSON.parse(line);
    const homedir = os.homedir();

    const result = query({
      prompt,
      options: {
        maxTurns: 1,
        model: 'claude-sonnet-4-20250514',
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        pathToClaudeCodeExecutable: `${homedir}/.local/bin/claude`,
        cwd: homedir,
      }
    });

    let response = '';
    for await (const message of result) {
      if (message.type === 'assistant') {
        for (const block of message.message.content) {
          if (block.type === 'text') {
            response += block.text;
          }
        }
      }
    }

    console.log(JSON.stringify({ success: true, result: response }));
  } catch (error) {
    console.log(JSON.stringify({ success: false, error: error.message }));
  }
});
