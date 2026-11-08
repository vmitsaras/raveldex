import assert from 'node:assert/strict';

// Independent WCAG sRGB relative luminance arithmetic on opaque computed colors.
export function contrast(first, second) {
  const luminance = color => {
    const units = color.match(/[\d.]+/g)?.map(Number);
    assert.ok(color.startsWith('rgb(') || color.startsWith('rgba('), color);
    assert.ok(units?.length === 3 || units?.length === 4 && units[3] === 1, `Opaque color required: ${color}`);
    const linear = units.slice(0, 3).map(unit => {
      const value = unit / 255;
      return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    });
    return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
  };
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}
