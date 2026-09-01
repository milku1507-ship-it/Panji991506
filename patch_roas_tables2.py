import re

with open('src/components/ROASCalculator.tsx', 'r') as f:
    text = f.read()

text = text.replace(
    """<div className="text-[10px] font-bold text-emerald-600/70 mt-1">Margin: {formatCurrency(calcReversePrice(v1Hpp, v1FeePct, v1FeeNominal, targetRoasInput).marginIdeal)} ({(calcReversePrice(v1Hpp, v1FeePct, v1FeeNominal, targetRoasInput).marginIdeal / calcReversePrice(v1Hpp, v1FeePct, v1FeeNominal, targetRoasInput).hargaIdeal * 100).toFixed(1)}%)</div>""",
    """<div className="text-[10px] font-bold text-emerald-600/70 mt-1">Margin: {formatCurrency(calcReversePrice(v1Hpp, v1FeePct, v1FeeNominal, targetRoasInput).marginIdeal)} ({calcReversePrice(v1Hpp, v1FeePct, v1FeeNominal, targetRoasInput).hargaIdeal > 0 ? (calcReversePrice(v1Hpp, v1FeePct, v1FeeNominal, targetRoasInput).marginIdeal / calcReversePrice(v1Hpp, v1FeePct, v1FeeNominal, targetRoasInput).hargaIdeal * 100).toFixed(1) : 0}%)</div>"""
)

with open('src/components/ROASCalculator.tsx', 'w') as f:
    f.write(text)

