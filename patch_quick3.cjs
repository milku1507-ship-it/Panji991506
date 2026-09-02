const fs = require('fs');
let code = fs.readFileSync('src/components/QuickEntryDialog.tsx', 'utf8');

if (!code.includes('import { runAIParse }')) {
    code = code.replace(/import \{ X, Sparkles, CheckCircle2, ChevronDown, ListPlus \} from 'lucide-react';/, "import { X, Sparkles, CheckCircle2, ChevronDown, ListPlus } from 'lucide-react';\nimport { runAIParse } from '../lib/aiParseShared';");
}

const target = `      const res = await fetch('/api/ai-parse', {
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
          hppCategories,
          today: todayStr(),
          customApiKey,
        }),
      });

      let data: any = null;
      try {
        const text = await res.text();
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (res.ok && data?.transactions && data.transactions.length > 0) {`;

const replace = `      const data = await runAIParse({
        customApiKey,
        userMessage: input,
        products,
        ingredients,
        categories,
        hppCategories,
        today: todayStr(),
      });

      if (data?.transactions && data.transactions.length > 0) {`;

code = code.replace(target, replace);
fs.writeFileSync('src/components/QuickEntryDialog.tsx', code);
