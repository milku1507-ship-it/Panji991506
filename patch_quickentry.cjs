const fs = require('fs');
let code = fs.readFileSync('src/components/QuickEntryDialog.tsx', 'utf8');

if (!code.includes('import { runAIParse }')) {
    code = code.replace(/import \{ X, Sparkles, CheckCircle2, ChevronDown, ListPlus \} from 'lucide-react';/, "import { X, Sparkles, CheckCircle2, ChevronDown, ListPlus } from 'lucide-react';\nimport { runAIParse } from '../lib/aiParseShared';");
}

const target = `    try {
      const customApiKey = localStorage.getItem('gemini_api_key') || undefined;
      const res = await fetch('/api/ai-parse', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(customApiKey ? { 'x-gemini-api-key': customApiKey } : {}),
        },
        body: JSON.stringify({
          userMessage: input,
          products,
          ingredients,
          categories,
          today: new Date().toISOString().split('T')[0],
        }),
      });

      if (!res.ok) {
        throw new Error('Gagal menghubungkan ke AI');
      }

      const data = await res.json();`;

const replace = `    try {
      const customApiKey = localStorage.getItem('gemini_api_key') || undefined;
      const data = await runAIParse({
        customApiKey,
        userMessage: input,
        products,
        ingredients,
        categories,
        today: new Date().toISOString().split('T')[0],
      });`;

code = code.replace(target, replace);
fs.writeFileSync('src/components/QuickEntryDialog.tsx', code);
