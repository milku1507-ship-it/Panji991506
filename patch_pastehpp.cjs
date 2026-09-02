const fs = require('fs');
let code = fs.readFileSync('src/components/PasteHppDialog.tsx', 'utf8');

if (!code.includes('import { runParseHpp }')) {
    code = code.replace(/import \{ X, Check, Copy \} from 'lucide-react';/, "import { X, Check, Copy } from 'lucide-react';\nimport { runParseHpp } from '../lib/aiParseHppShared';");
}

const target = `    try {
      const res = await fetch('/api/parse-hpp', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText,
          kategoriHpp,
          existingIngredients: ingredients.slice(0, 200).map(i => ({
            name: i.name,
            unit: i.unit,
            price: i.price,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || \`HTTP \${res.status}\`);
      }
      const data = (await res.json()) as ParsedHppResult;
      if (!data.variant || !Array.isArray(data.bahan)) {
        throw new Error('Format hasil AI tidak valid.');
      }`;

const replace = `    try {
      const customApiKey = localStorage.getItem('gemini_api_key');
      const data = await runParseHpp({
        customApiKey,
        rawText,
        kategoriHpp,
        existingIngredients: ingredients.slice(0, 200).map(i => ({
          name: i.name,
          unit: i.unit,
          price: i.price,
        })),
      }) as ParsedHppResult;
      
      if (!data.variant || !Array.isArray(data.bahan)) {
        throw new Error('Format hasil AI tidak valid.');
      }`;

code = code.replace(target, replace);
fs.writeFileSync('src/components/PasteHppDialog.tsx', code);
