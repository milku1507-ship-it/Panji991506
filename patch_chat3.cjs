const fs = require('fs');
let code = fs.readFileSync('src/components/TransactionAIChat.tsx', 'utf8');

if (!code.includes('import { runAIParse }')) {
    code = code.replace(/import \{ Send, Bot, User, Loader2, Sparkles \} from 'lucide-react';/, "import { Send, Bot, User, Loader2, Sparkles } from 'lucide-react';\nimport { runAIParse } from '../lib/aiParseShared';");
}

code = code.replace(/const res = await fetch\('\/api\/ai-parse'[\s\S]*?const data: ParseResult & \{ error\?: string \} = await res\.json\(\);/,
`const customApiKey = localStorage.getItem('gemini_api_key') || undefined;
      const data = (await runAIParse({
        customApiKey,
        history: messages,
        userMessage: text,
        products,
        categories,
        currentForm,
        today: new Date().toISOString().split('T')[0],
      })) as ParseResult & { error?: string };
      const res = { ok: true }; // mock res for compatibility`);

fs.writeFileSync('src/components/TransactionAIChat.tsx', code);
