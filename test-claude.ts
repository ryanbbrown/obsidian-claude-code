import { query } from '@anthropic-ai/claude-agent-sdk';

async function test() {
  console.log('Testing Claude Agent SDK...');

  const result = query({
    prompt: 'Say hello in exactly 5 words',
    options: {
      maxTurns: 1,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
    }
  });

  for await (const message of result) {
    if (message.type === 'assistant') {
      for (const block of message.message.content) {
        if (block.type === 'text') {
          console.log('Response:', block.text);
        }
      }
    } else if (message.type === 'result') {
      console.log('Done! Cost:', message.total_cost_usd);
    }
  }
}

test().catch(console.error);
