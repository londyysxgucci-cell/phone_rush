import { randomInt } from 'node:crypto';

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'secret'];
export const REWARDS = {
  common: { coins: 5, xp: 10 }, uncommon: { coins: 10, xp: 20 }, rare: { coins: 25, xp: 50 },
  epic: { coins: 75, xp: 120 }, legendary: { coins: 250, xp: 300 }, mythic: { coins: 1000, xp: 800 },
  secret: { coins: 5000, xp: 2000 },
};
export const SECRET_TOTAL = 19; // 10 одинаковых + 8 лестниц + 1 особый

const d = () => String(randomInt(10));
const rd = (n) => Array.from({ length: n }, d).join('');
const same = (s) => /^(\d)\1*$/.test(s);
const run = (s) => { let a = true, b = true; for (let i = 1; i < s.length; i++) { const x = s[i] - s[i - 1]; if (x !== 1) a = false; if (x !== -1) b = false; } return a || b; };

// n — 7 цифр: ABC-DE-FG. Проверяем от самых редких комбинаций к обычным.
export function classify(n) {
  const l4 = n.slice(3), l3 = n.slice(4), l2 = n.slice(5), r = (rarity, pattern) => ({ rarity, pattern });
  if (same(n)) return r('secret', 'Семь одинаковых цифр');
  if (run(n)) return r('secret', 'Полная лестница');
  if (n === '0070007') return r('secret', 'Агент 007');
  if (same(l4)) return r('mythic', `Четыре одинаковые: ${l4[0]}${l4[0]}-${l4[0]}${l4[0]}`);
  if (run(l4)) return r('legendary', `Лестница ${l4.slice(0, 2)}-${l4.slice(2)}`);
  if (same(n.slice(0, 3)) && /^(\d)\1(\d)\2$/.test(l4)) return r('legendary', 'Тройка и две пары');
  if (/^(\d)\1(\d)\2$/.test(l4)) return r('epic', 'Две пары');
  if (/^(\d)(\d)\1\2$/.test(l4)) return r('epic', 'Повтор пары');
  if (/^(\d)(\d)\2\1$/.test(l4)) return r('epic', 'Зеркальная концовка');
  if (same(n.slice(0, 3))) return r('epic', 'Тройка в начале');
  if (/(\d)\1\1/.test(n)) return r('rare', 'Три одинаковые подряд');
  if (run(l3)) return r('rare', 'Лесенка');
  if (l2[0] === l2[1]) return r('uncommon', 'Парная концовка');
  if (l2[1] === '0') return r('uncommon', 'Круглая концовка');
  if (/(\d)\1/.test(l4)) return r('uncommon', 'Пара цифр');
  return r('common', 'Обычная комбинация');
}

function runOf(len) {
  const asc = randomInt(2) === 0, s = asc ? randomInt(0, 11 - len) : randomInt(len - 1, 10);
  return Array.from({ length: len }, (_, i) => String(asc ? s + i : s - i)).join('');
}
const GEN = {
  common: () => rd(7),
  uncommon: () => { const x = d(); return rd(5) + x + x; },
  rare: () => { const x = d(); return randomInt(2) ? rd(3) + x + x + x + d() : rd(4) + runOf(3); },
  epic: () => { const a = d(), b = d(), x = d(); return [() => rd(3) + a + a + b + b, () => rd(3) + a + b + a + b, () => rd(3) + a + b + b + a, () => x + x + x + rd(4)][randomInt(4)](); },
  legendary: () => { if (randomInt(2)) return rd(3) + runOf(4); const x = d(), a = d(), b = d(); return x + x + x + a + a + b + b; },
  mythic: () => { const x = d(); return rd(3) + x.repeat(4); },
  secret: () => [() => d().repeat(7), () => runOf(7), () => '0070007'][randomInt(3)](),
};

// Все номера вымышленные: код «+999» не назначен ни одной стране.
export function generate(target) {
  let n;
  for (let i = 0; i < 60; i++) { n = GEN[target](); if (classify(n).rarity === target) break; }
  return { digits: n, number: `+999 ${n.slice(0, 3)}-${n.slice(3, 5)}-${n.slice(5)}`, ...classify(n) };
}

export function pickRarity(w) {
  const t = RARITIES.map((r) => Math.max(0, Math.round((w[r] || 0) * 100)));
  let x = randomInt(t.reduce((a, b) => a + b, 0) || 1);
  for (let i = 0; i < t.length; i++) { if (x < t[i]) return RARITIES[i]; x -= t[i]; }
  return 'common';
}
