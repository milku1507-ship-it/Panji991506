import re

with open('src/components/ROASCalculator.tsx', 'r') as f:
    text = f.read()

# For v1 
text = re.sub(
    r'<div className="text-\[10px\] font-bold text-emerald-600/70 mt-1">Margin: \{formatCurrency\(calcReversePrice\(v1Hpp, v1FeePct, v1FeeNominal, targetRoasInput\)\.marginIdeal\)\}</div>',
    r'<div className="text-[10px] font-bold text-emerald-600/70 mt-1">Margin: {formatCurrency(calcReversePrice(v1Hpp, v1FeePct, v1FeeNominal, targetRoasInput).marginIdeal)} ({(calcReversePrice(v1Hpp, v1FeePct, v1FeeNominal, targetRoasInput).marginIdeal / calcReversePrice(v1Hpp, v1FeePct, v1FeeNominal, targetRoasInput).hargaIdeal * 100).toFixed(1)}%)</div>',
    text
)

# For v2 and v3
text = re.sub(
    r'<div className="text-\[10px\] font-bold text-emerald-600/70 mt-1">Margin: \{formatCurrency\(prices\.marginIdeal\)\}</div>',
    r'<div className="text-[10px] font-bold text-emerald-600/70 mt-1">Margin: {formatCurrency(prices.marginIdeal)} ({prices.hargaIdeal > 0 ? (prices.marginIdeal / prices.hargaIdeal * 100).toFixed(1) : 0}%)</div>',
    text
)

with open('src/components/ROASCalculator.tsx', 'w') as f:
    f.write(text)

