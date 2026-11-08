/** Bounded plain-text feedback only; never changes the submitted query. */
export function queryPreview(text: string): string {
  const points = Array.from(text.trim());
  return points.slice(0, 160).join('') + (points.length > 160 ? '…' : '');
}
