export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'secret';
export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'secret'];
export const R: Record<Rarity, { label: string; en: string; color: string }> = {
  common: { label: 'Обычный', en: 'Common', color: '#9ca3af' },
  uncommon: { label: 'Необычный', en: 'Uncommon', color: '#22c55e' },
  rare: { label: 'Редкий', en: 'Rare', color: '#3b82f6' },
  epic: { label: 'Эпический', en: 'Epic', color: '#a855f7' },
  legendary: { label: 'Легендарный', en: 'Legendary', color: '#f59e0b' },
  mythic: { label: 'Мифический', en: 'Mythic', color: '#ff2d75' },
  secret: { label: 'Секретный', en: 'Secret', color: '#22d3ee' },
};
