import { GoogleGenAI } from '@google/genai';
try {
  const ai = new GoogleGenAI({ apiKey: 'fake-key' });
  console.log('Instance created successfully');
} catch (e) {
  console.error('Error creating instance:', e);
}
