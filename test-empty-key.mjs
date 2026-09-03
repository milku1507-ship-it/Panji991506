import { GoogleGenAI } from '@google/genai';
try {
  const ai = new GoogleGenAI({ apiKey: '' });
  await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: 'test',
  });
} catch (e) {
  console.log(JSON.stringify(e, null, 2));
}
