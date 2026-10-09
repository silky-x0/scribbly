export interface PaletteColor {
  label: string;
  value: string;
}

export const PALETTE: PaletteColor[] = [
  { label: 'Ink', value: '--foreground' },
  { label: 'Cherry', value: '--primary' },
  { label: 'Sky', value: '--secondary' },
  { label: 'Butter', value: '--accent' },
  { label: 'Mint', value: '--mint' },
  { label: 'Ember', value: '#e5484d' },
  { label: 'Tangerine', value: '#f76b15' },
  { label: 'Leaf', value: '#30a46c' },
  { label: 'Lagoon', value: '#12a594' },
  { label: 'Azure', value: '#0091ff' },
  { label: 'Grape', value: '#8e4ec6' },
  { label: 'Cocoa', value: '#ad5700' },
  { label: 'Stone', value: '#8b8d98' },
  { label: 'Snow', value: '#ffffff' },
];

export const BRUSH_SIZES: { label: string; size: number }[] = [
  { label: 'Thin', size: 4 },
  { label: 'Medium', size: 8 },
  { label: 'Thick', size: 14 },
];

export const DEFAULT_COLOR = '--primary';
export const DEFAULT_SIZE = 8;

export function resolveColor(value: string): string {
  if (!value.startsWith('--')) return value;
  if (typeof document === 'undefined') return '#000000';
  return (
    getComputedStyle(document.documentElement).getPropertyValue(value).trim() ||
    '#000000'
  );
}

export function swatchBackground(value: string): string {
  return value.startsWith('--') ? `var(${value})` : value;
}
