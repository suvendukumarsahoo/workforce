// Conversion factors are stored relative to a product's Base Unit:
// "1 Base Unit = lowest_unit_factor Lowest Units", "1 Base Unit = alt_unit_factor Alternate Units".

export function availableUnitsForProduct(p) {
  const opts = [{ value: 'base', label: p.unit || 'Unit' }]
  if (p.lowest_unit && p.lowest_unit_factor) opts.push({ value: 'lowest', label: p.lowest_unit })
  if (p.alt_unit && p.alt_unit_factor) opts.push({ value: 'alt', label: p.alt_unit })
  return opts
}

export function toBaseQty(product, unit, qty) {
  if (unit === 'lowest') return qty / (Number(product.lowest_unit_factor) || 1)
  if (unit === 'alt') return qty / (Number(product.alt_unit_factor) || 1)
  return qty
}

export function unitLabel(product, unit) {
  if (unit === 'lowest') return product.lowest_unit
  if (unit === 'alt') return product.alt_unit
  return product.unit
}
