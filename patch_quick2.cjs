const fs = require('fs');
let code = fs.readFileSync('src/components/QuickEntryDialog.tsx', 'utf8');

if (!code.includes('import { runAIParse }')) {
    code = code.replace(/import \{ X, Sparkles, CheckCircle2, ChevronDown, ListPlus \} from 'lucide-react';/, "import { X, Sparkles, CheckCircle2, ChevronDown, ListPlus } from 'lucide-react';\nimport { runAIParse } from '../lib/aiParseShared';");
}

code = code.replace(/const res = await fetch\('\/api\/ai-parse'[\s\S]*?let data: any = null;\s*try {\s*const text = await res\.text\(\);\s*data = text \? JSON\.parse\(text\) : null;\s*} catch {\s*data = null;\s*}\s*if \(!res\.ok\) {\s*throw new Error\(data\?\.error \|\| 'Gagal menghubungkan ke AI'\);\s*}/,
`const data = await runAIParse({
        customApiKey,
        userMessage: input,
        products,
        ingredients,
        categories,
        hppCategories,
        today: todayStr(),
      });`);

fs.writeFileSync('src/components/QuickEntryDialog.tsx', code);
