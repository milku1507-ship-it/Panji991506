const fs = require('fs');
let code = fs.readFileSync('src/components/TransactionAIChat.tsx', 'utf8');

if (!code.includes('import { runAIParse }')) {
    code = code.replace(/import \{ Send, Bot, User, Loader2, Sparkles \} from 'lucide-react';/, "import { Send, Bot, User, Loader2, Sparkles } from 'lucide-react';\nimport { runAIParse } from '../lib/aiParseShared';");
}

const target = `    try {
      const res = await fetch('/api/ai-parse', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: messages,
          userMessage: text,
          products,
          categories,
          currentForm,
          today: new Date().toISOString().split('T')[0],
        }),
      });

      if (!res.ok) {
        throw new Error(\`HTTP \${res.status}\`);
      }

      const data = await res.json();`;

const replace = `    try {
      const customApiKey = localStorage.getItem('gemini_api_key');
      const data = await runAIParse({
        customApiKey,
        history: messages,
        userMessage: text,
        products,
        categories,
        currentForm,
        today: new Date().toISOString().split('T')[0],
      });`;

code = code.replace(target, replace);
fs.writeFileSync('src/components/TransactionAIChat.tsx', code);
