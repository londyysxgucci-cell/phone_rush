import { q, tx } from './db.js';
import { HttpError } from './game.js';

// Активные лоты рынка (кроме своих)
export async function listMarket(userId) {
  const rows = (await q(
    `SELECT ml.*, u.first_name AS seller_name, u.username AS seller_username
     FROM market_listings ml
     JOIN users u ON u.id = ml.seller_id
     WHERE ml.status = 'active' AND ml.seller_id <> $1
     ORDER BY ml.created_at DESC LIMIT 100`,
    [userId]
  )).rows;
  return rows;
}

// Мои лоты
export async function myListings(userId) {
  const rows = (await q(
    `SELECT * FROM market_listings WHERE seller_id = $1 ORDER BY created_at DESC`,
    [userId]
  )).rows;
  return rows;
}

// Выставить номер на рынок
export async function createListing(userId, { phoneNumberId, priceCoins, priceStars }) {
  return tx(async (c) => {
    const num = (await c.query(
      'SELECT * FROM phone_numbers WHERE id=$1 AND user_id=$2',
      [phoneNumberId, userId]
    )).rows[0];
    if (!num) throw new HttpError(404, 'Номер не найден');

    const priceC = Number(priceCoins) || 0;
    const priceS = Number(priceStars) || 0;
    if (priceC <= 0 && priceS <= 0) throw new HttpError(400, 'Укажите цену');

    // Убираем из гаража при выставлении на продажу
    await c.query(
      'UPDATE phone_numbers SET in_garage = false WHERE id = $1',
      [phoneNumberId]
    );

    const ins = await c.query(
      `INSERT INTO market_listings
        (seller_id, phone_number_id, number, rarity, pattern, price_coins, price_stars)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [userId, phoneNumberId, num.number, num.rarity, num.pattern, priceC, priceS]
    );
    return ins.rows[0];
  });
}

// Купить лот
export async function buyListing(userId, listingId) {
  return tx(async (c) => {
    const listing = (await c.query(
      'SELECT * FROM market_listings WHERE id=$1 FOR UPDATE',
      [listingId]
    )).rows[0];
    if (!listing || listing.status !== 'active') throw new HttpError(404, 'Лот не найден');
    if (listing.seller_id === userId) throw new HttpError(400, 'Нельзя купить свой лот');

    const buyer = (await c.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [userId])).rows[0];
    const seller = (await c.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [listing.seller_id])).rows[0];

    const totalCoins = listing.price_coins;
    const totalStars = listing.price_stars;

    if (buyer.coins < totalCoins) throw new HttpError(402, 'Недостаточно монет');
    if (buyer.stars < totalStars) throw new HttpError(402, 'Недостаточно звёзд');

    // Передаём номер покупателю
    await c.query(
      'UPDATE phone_numbers SET user_id=$1, in_garage=false WHERE id=$2',
      [userId, listing.phone_number_id]
    );

    // Списываем у покупателя, начисляем продавцу
    await c.query(
      'UPDATE users SET coins = coins - $2, stars = stars - $3 WHERE id=$1',
      [userId, totalCoins, totalStars]
    );
    await c.query(
      'UPDATE users SET coins = coins + $2, stars = stars + $3 WHERE id=$1',
      [listing.seller_id, totalCoins, totalStars]
    );

    await c.query(
      'UPDATE market_listings SET status=$1 WHERE id=$2',
      ['sold', listingId]
    );

    return { ok: true, listing };
  });
}

// Отменить свой лот
export async function cancelListing(userId, listingId) {
  return tx(async (c) => {
    const listing = (await c.query(
      'SELECT * FROM market_listings WHERE id=$1 AND seller_id=$2 FOR UPDATE',
      [listingId, userId]
    )).rows[0];
    if (!listing) throw new HttpError(404, 'Лот не найден');
    if (listing.status !== 'active') throw new HttpError(400, 'Лот уже не активен');

    await c.query(
      'UPDATE market_listings SET status=$1 WHERE id=$2',
      ['cancelled', listingId]
    );
    return { ok: true };
  });
}
