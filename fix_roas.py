import re

with open('src/components/ROASCalculator.tsx', 'r') as f:
    text = f.read()

# Fix V1
text = re.sub(r'v1MinOrder = Math\.max\(1, Number\(v1Product\.min_order\) \|\| 1\);',
              r'v1MinOrder = Math.max(1, Number(v1Variant.min_order) || 1);', text)

# Fix V2
text = re.sub(
r"""    v2MinOrder = Math\.max\(1, Number\(v2Product\.min_order\) \|\| 1\);
    let sumPrice = 0, sumMargin = 0;
    v2Product\.varian\.forEach\(v => \{
      const hpp = calcHppPerPcs\(v, ingredients\);
      const feeConf = extractFeeRates\(v2Product, v\);
      const feeN = feeConf\.nominalPerUnit \+ \(feeConf\.nominalPerOrder / v2MinOrder\);""",
r"""    let sumPrice = 0, sumMargin = 0;
    v2Product.varian.forEach(v => {
      const vMinOrder = Math.max(1, Number(v.min_order) || 1);
      if (vMinOrder > v2MinOrder) v2MinOrder = vMinOrder;
      const hpp = calcHppPerPcs(v, ingredients);
      const feeConf = extractFeeRates(v2Product, v);
      const feeN = feeConf.nominalPerUnit + (feeConf.nominalPerOrder / vMinOrder);""", text)

# Fix V3
text = re.sub(
r"""      const pMinOrder = Math\.max\(1, Number\(p\.min_order\) \|\| 1\);
      p\.varian\?\.forEach\(v => \{
        totalVariantsGroup\+\+;
        const hpp = calcHppPerPcs\(v, ingredients\);
        const feeConf = extractFeeRates\(p, v\);
        const feeN = feeConf\.nominalPerUnit \+ \(feeConf\.nominalPerOrder / pMinOrder\);""",
r"""      p.varian?.forEach(v => {
        const pMinOrder = Math.max(1, Number(v.min_order) || 1);
        totalVariantsGroup++;
        const hpp = calcHppPerPcs(v, ingredients);
        const feeConf = extractFeeRates(p, v);
        const feeN = feeConf.nominalPerUnit + (feeConf.nominalPerOrder / pMinOrder);""", text)

# Fix table loop for adMode === 'product'
text = re.sub(
r"""                    \{adMode === 'product' && v2Product && v2Product\.varian\?\.map\(v => \{
                      const hpp = calcHppPerPcs\(v, ingredients\);
                      const feeConf = extractFeeRates\(v2Product, v\);
                      const feeN = feeConf\.nominalPerUnit \+ \(feeConf\.nominalPerOrder / v2MinOrder\);""",
r"""                    {adMode === 'product' && v2Product && v2Product.varian?.map(v => {
                      const vMinOrder = Math.max(1, Number(v.min_order) || 1);
                      const hpp = calcHppPerPcs(v, ingredients);
                      const feeConf = extractFeeRates(v2Product, v);
                      const feeN = feeConf.nominalPerUnit + (feeConf.nominalPerOrder / vMinOrder);""", text)

# Fix table loop for adMode === 'group'
text = re.sub(
r"""                    \{adMode === 'group' && v3SelectedProductIds\.length > 0 && products\.filter\(p => v3SelectedProductIds\.includes\(p\.id\)\)\.map\(p => \{
                      const pMinOrder = Math\.max\(1, Number\(p\.min_order\) \|\| 1\);
                      return p\.varian\?\.map\(v => \{
                        const hpp = calcHppPerPcs\(v, ingredients\);
                        const feeConf = extractFeeRates\(p, v\);
                        const feeN = feeConf\.nominalPerUnit \+ \(feeConf\.nominalPerOrder / pMinOrder\);""",
r"""                    {adMode === 'group' && v3SelectedProductIds.length > 0 && products.filter(p => v3SelectedProductIds.includes(p.id)).map(p => {
                      return p.varian?.map(v => {
                        const pMinOrder = Math.max(1, Number(v.min_order) || 1);
                        const hpp = calcHppPerPcs(v, ingredients);
                        const feeConf = extractFeeRates(p, v);
                        const feeN = feeConf.nominalPerUnit + (feeConf.nominalPerOrder / pMinOrder);""", text)


with open('src/components/ROASCalculator.tsx', 'w') as f:
    f.write(text)
