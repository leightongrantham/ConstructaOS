/**
 * Quick OpenAI connectivity test - run with: npx tsx test/openai-connectivity.ts
 */
import 'dotenv/config';
import { chatClient, chatModel } from '../src/utils/openaiClient.js';

async function main() {
  console.log('Testing OpenAI chat...');
  console.log('AI_GATEWAY_API_KEY:', process.env.AI_GATEWAY_API_KEY ? 'set' : 'not set');
  console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'set' : 'not set');

  try {
    const res = await chatClient.responses.create({
      model: chatModel('gpt-4o-mini'),
      input: 'Reply with exactly: OK',
      max_output_tokens: 10,
    });
    const content = res.output_text?.trim();
    console.log('✅ Chat OK:', content);
  } catch (e) {
    console.error('❌ Chat FAIL:', (e as Error).message);
    process.exit(1);
  }
}

main();
