import { OpenAIProvider } from '../index';

async function runExample() {
  console.log('--- AI Provider Module Example ---');

  const provider = new OpenAIProvider({
    apiKey: 'fake-key-for-demo',
    defaultModel: 'gpt-4o-mini',
  });

  console.log('Provider initialized successfully:', !!provider);
}

runExample().catch(console.error);
