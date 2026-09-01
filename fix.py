import re

with open('src/components/ROASCalculator.tsx', 'r') as f:
    text = f.read()

# Fix broken template literals
text = text.replace(r"\`", "`")
text = text.replace(r"\$", "$")

with open('src/components/ROASCalculator.tsx', 'w') as f:
    f.write(text)
