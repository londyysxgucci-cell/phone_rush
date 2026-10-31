import type { Rarity } from './rarity';
export const tg = (window as any).Telegram?.WebApp;
const initData: string = tg?.initData || '';

export type Num = { id: number; number: string; digits: string; rarity: Rarity; pattern: string; obtained_at: string; owners?: number };
export type State = {
  id: number; first_name: string; username: string | null; photo_url: string | null; coins: number; spins: number; spins_max: number;
  next_refill_at: string | null; coin_cost: number; level: number; xp: number; xp_from: number; xp_to: number;
  spin_count: number; numbers_count: number; rare_count: number; legendary_count: number; tutorial_done: boolean; created_at: string;
  garage_slots?: number; stars?: number;
  daily: { can_claim: boolean; streak: number; done: number; rewards: { coins: number; spins: number }[] };
};
export type Me = State & { last_number: Num | null; bot_username: string; is_admin: boolean; chances: { rarity: Rarity; pct: number }[] };
export type SpinRes = { number: Num; is_new: boolean; coins_reward: number; xp_gain: number; level_up: { to: number; bonus: number } | null; state: State };
export type Collection = { items: Num[]; top: Num[]; counts: Partial<Record<Rarity, number>>; secret_total: number };
export type Board = { top: { id: number; first_name: string; photo_url: string | null; level: number; value: number }[]; me: { rank: number; value: number } };

export type MarketListing = {
  id: number; seller_id: number; phone_number_id: number | null; number: string; rarity: Rarity; pattern: string;
  price_coins: number; price_stars: number; status: string; created_at: string;
  seller_name?: string; seller_username?: string;
};
export type Friend = { id: number; first_name: string; username: string | null; photo_url: string | null; created_at: string };
export type Invite = { id: number; from_id: number; first_name: string; username: string | null; photo_url: string | null; created_at: string };
export type SearchUser = { id: number; first_name: string; username: string | null; photo_url: string | null };
export type DailyTask = {
  task: { id: number; task_date: string; title: string; description: string; kind: string; target: number; reward_coins: number; reward_spins: number; reward_stars: number };
  progress: number; claimed: boolean; target: number;
};

async function call<T>(path: string, method = 'GET', body?: any): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: 'tma ' + initData };
  if (!initData && import.meta.env.DEV) headers['X-Dev-User'] = '1001'; // нужен DEV_AUTH=true на сервере
  const r = await fetch('/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Ошибка сети');
  return j;
}
export const api = {
  me: () => call<Me>('/me'),
  spin: () => call<SpinRes>('/spin', 'POST'),
  daily: () => call<{ reward: { coins: number; spins: number }; state: State }>('/daily', 'POST'),
  collection: (sort: string, rarity: string) => call<Collection>(`/collection?sort=${sort}&rarity=${rarity}`),
  number: (id: number) => call<Num>('/collection/' + id),
  board: (type: string) => call<Board>('/leaderboard?type=' + type),

  // Рынок
  market: () => call<MarketListing[]>('/market'),
  marketMy: () => call<MarketListing[]>('/market/my'),
  marketList: (phoneNumberId: number, priceCoins: number, priceStars: number) =>
    call<MarketListing>('/market/list', 'POST', { phone_number_id: phoneNumberId, price_coins: priceCoins, price_stars: priceStars }),
  marketBuy: (id: number) => call<{ ok: boolean }>(`/market/buy/${id}`, 'POST'),
  marketCancel: (id: number) => call<{ ok: boolean }>(`/market/cancel/${id}`, 'POST'),

  // Друзья
  friends: () => call<Friend[]>('/friends'),
  friendInvites: () => call<Invite[]>('/friends/invites'),
  friendInvite: (friendId: number) => call<{ ok: boolean }>('/friends/invite', 'POST', { friend_id: friendId }),
  friendRespond: (inviteId: number, accept: boolean) =>
    call<{ ok: boolean; accepted: boolean }>(`/friends/respond/${inviteId}`, 'POST', { accept }),
  friendRemove: (friendId: number) => call<{ ok: boolean }>(`/friends/remove/${friendId}`, 'POST'),
  usersSearch: (q: string) => call<SearchUser[]>(`/users/search?q=${encodeURIComponent(q)}`),

  // Ежедневное задание
  dailyTask: () => call<DailyTask>('/daily-task'),
  dailyTaskClaim: () => call<{ reward: { coins: number; spins: number; stars: number }; user: any }>('/daily-task/claim', 'POST'),
  tutorialDone: () => call<{ ok: boolean }>('/tutorial/done', 'POST'),
};
export const haptic = (s: 'light' | 'medium' | 'heavy' = 'light') => tg?.HapticFeedback?.impactOccurred(s);
