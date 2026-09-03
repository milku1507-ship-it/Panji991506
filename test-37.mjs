import { GoogleGenAI } from '@google/genai';
try {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  await ai.models.generateContent({
    model: 'gemini-3.7-flash',
    contents: 'test',
  });
} catch (e) {
  console.log(JSON.stringify(e, null, 2));
}
