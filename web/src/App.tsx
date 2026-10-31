import { useCallback, useEffect, useRef, useState } from 'react';
import { api, haptic, tg, type Board, type Collection, type Me, type Num, type SpinRes } from './api';
import { R, RARITIES, type Rarity } from './rarity';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fmtDate = (s: string) => new Date(s).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const cvar = (c: string) => ({ '--c': c }) as React.CSSProperties;
type Phase = 'idle' | 'rolling' | 'reveal';
type Tab = 'play' | 'collection' | 'board' | 'profile';

function share(n: Num, bot: string) {
  const text = `📱 Мне выпал ${R[n.rarity].label.toLowerCase()} номер ${n.number} в PHONE RUSH! Попробуй и ты:`;
  const link = `https://t.me/share/url?url=${encodeURIComponent('https://t.me/' + bot)}&text=${encodeURIComponent(text)}`;
  tg?.openTelegramLink ? tg.openTelegramLink(link) : window.open(link, '_blank');
}

function Reel({ n, phase, onDone }: { n: Num | null; phase: Phase; onDone: () => void }) {
  const target = n?.digits ?? '';
  const [cells, setCells] = useState<string[]>([]);
  const [locked, setLocked] = useState(0);
  useEffect(() => {
    if (phase === 'idle') { setCells(target ? target.split('') : Array(7).fill('•')); setLocked(n ? 7 : 0); return; }
    let lk = 0, lock: ReturnType<typeof setInterval> | undefined;
    setLocked(0);
    const flick = setInterval(() => setCells(Array.from({ length: 7 }, (_, i) => (phase === 'reveal' && i < lk ? target[i] : String(Math.floor(Math.random() * 10))))), 60);
    if (phase === 'reveal') lock = setInterval(() => {
      lk++; setLocked(lk); haptic('light');
      if (lk >= 7) { clearInterval(lock); clearInterval(flick); setCells(target.split('')); haptic('heavy'); onDone(); }
    }, 170);
    return () => { clearInterval(flick); if (lock) clearInterval(lock); };
  }, [phase, target]);
  const c = cells.length ? cells : Array(7).fill('•');
  const D = (i: number) => <div key={i} className={`digit ${i < locked ? 'on' : ''}`}>{c[i]}</div>;
  return (
    <div className="flex items-center justify-center gap-1.5">
      {[0, 1, 2].map(D)}<span className="text-white/30">–</span>{[3, 4].map(D)}<span className="text-white/30">–</span>{[5, 6].map(D)}
    </div>
  );
}

function Home({ me, setMe, toast, open, refresh }: { me: Me; setMe: (f: (m: Me) => Me) => void; toast: (s: string) => void; open: (id: number) => void; refresh: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [res, setRes] = useState<SpinRes | null>(null);
  const [showRes, setShowRes] = useState(false);
  const [now, setNow] = useState(Date.now());
  const lastRefresh = useRef(0);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const left = me.next_refill_at ? new Date(me.next_refill_at).getTime() - now : null;
  useEffect(() => {
    if (left !== null && left <= 0 && Date.now() - lastRefresh.current > 5000) { lastRefresh.current = Date.now(); refresh(); }
  }, [left]);

  const shown = res?.number ?? me.last_number;
  const color = shown && phase !== 'rolling' ? R[shown.rarity].color : '#8b5cf6';
  const broke = me.spins === 0 && me.coins < me.coin_cost;

  const onSpin = async () => {
    if (phase !== 'idle') return;
    setShowRes(false); setPhase('rolling'); haptic('medium');
    try { const [r] = await Promise.all([api.spin(), sleep(1300)]); setRes(r); setPhase('reveal'); }
    catch (e: any) { setPhase('idle'); toast(e.message); }
  };
  const done = () => {
    if (!res) return;
    setMe((m) => ({ ...m, ...res.state, last_number: res.number }));
    setPhase('idle'); setShowRes(true);
    if (res.level_up) toast(`🎉 Уровень ${res.level_up.to}! Бонус +${res.level_up.bonus} 🪙`);
  };
  const daily = async () => {
    try { const r = await api.daily(); setMe((m) => ({ ...m, ...r.state })); toast(`🎁 +${r.reward.coins} 🪙 и +${r.reward.spins} попыт.`); haptic('medium'); }
    catch (e: any) { toast(e.message); }
  };
  const mm = left !== null && left > 0 ? `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}` : '';

  return (
    <div className="px-4 pb-4">
      <div className="mt-3 flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-wide neon-text">PHONE RUSH</h1>
        <div className="glass rounded-full px-3 py-1.5 font-bold">🪙 {me.coins}</div>
      </div>
      <div className="mt-1 text-sm text-white/50">Собрано номеров: {me.numbers_count} · Уровень {me.level}</div>

      <div className="glass rcard mt-4 rounded-3xl p-5 text-center" style={cvar(color)}>
        <div className="mb-3 text-sm text-white/40">+999 · вымышленный номер</div>
        <Reel n={shown} phase={phase} onDone={done} />
        <div className="mt-4 h-14">
          {phase === 'idle' && shown && (
            <div className={showRes ? 'rise' : ''}>
              <div className="text-lg font-extrabold" style={{ color }}>{R[shown.rarity].label} · {R[shown.rarity].en}</div>
              <div className="text-sm text-white/60">{shown.pattern}{showRes && res ? (res.is_new ? ` · новый! +${res.coins_reward} 🪙` : ` · дубликат, +${res.coins_reward} 🪙`) : ''}</div>
            </div>
          )}
          {phase === 'idle' && !shown && <div className="text-white/50">Нажмите «КРУТИТЬ», чтобы получить первый номер</div>}
          {phase !== 'idle' && <div className="text-white/50">Генерируем номер…</div>}
        </div>
        {phase === 'idle' && shown && (
          <div className="mt-2 flex justify-center gap-2">
            <button className="glass rounded-xl px-4 py-2 text-sm" onClick={() => open(shown.id)}>Карточка</button>
            <button className="glass rounded-xl px-4 py-2 text-sm" onClick={() => share(shown, me.bot_username)}>Поделиться</button>
          </div>
        )}
      </div>

      <button disabled={phase !== 'idle' || broke} onClick={onSpin} className="btn-spin mt-5 w-full rounded-3xl py-5 text-2xl font-black tracking-widest transition disabled:opacity-40">
        КРУТИТЬ
        <div className="text-xs font-medium tracking-normal text-white/80">
          {me.spins > 0 ? `Попыток: ${me.spins}/${me.spins_max}` : broke ? 'Нет попыток и монет' : `Без попыток: ${me.coin_cost} 🪙`}
        </div>
      </button>
      {mm && <div className="mt-2 text-center text-sm text-white/50">Следующая бесплатная попытка через {mm}</div>}

      {me.daily.can_claim && (
        <button onClick={daily} className="glass mt-4 w-full rounded-2xl py-3 font-bold">🎁 Забрать ежедневный бонус (день {me.daily.streak + 1})</button>
      )}

      <div className="glass mt-4 rounded-2xl p-4">
        <div className="mb-2 font-bold">Шансы выпадения</div>
        {me.chances.map((c) => (
          <div key={c.rarity} className="flex justify-between py-0.5 text-sm">
            <span style={{ color: R[c.rarity].color }}>{R[c.rarity].label}</span><span className="text-white/60">{c.pct < 1 ? c.pct.toFixed(2) : c.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NumCard({ n, onClick }: { n: Num; onClick: () => void }) {
  return (
    <button onClick={onClick} className="glass rcard rounded-2xl p-3 text-left" style={cvar(R[n.rarity].color)}>
      <div className="font-extrabold tabular-nums">{n.number.slice(5)}</div>
      <div className="text-xs" style={{ color: R[n.rarity].color }}>{R[n.rarity].label}</div>
      <div className="mt-1 text-[11px] text-white/40">{new Date(n.obtained_at).toLocaleDateString('ru-RU')}</div>
    </button>
  );
}

function CollectionTab({ open, tick }: { open: (id: number) => void; tick: number }) {
  const [sort, setSort] = useState('rarity');
  const [rar, setRar] = useState('');
  const [d, setD] = useState<Collection | null>(null);
  useEffect(() => { api.collection(sort, rar).then(setD).catch(() => {}); }, [sort, rar, tick]);
  const total = d ? Object.values(d.counts).reduce((a, b) => a + (b || 0), 0) : 0;
  const goals = [10, 25, 50, 100, 250, 500, 1000], goal = goals.find((g) => g > total) ?? total;
  return (
    <div className="px-4 pb-4">
      <h2 className="mt-3 text-xl font-black">Коллекция</h2>
      {d && <>
        <div className="glass mt-3 rounded-2xl p-4">
          <div className="flex justify-between text-sm"><span>Собрано: {total}</span><span className="text-white/50">цель {goal}</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500" style={{ width: `${Math.min(100, (total / goal) * 100)}%` }} /></div>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {RARITIES.map((r) => <span key={r} style={{ color: R[r].color }}>{R[r].label}: {d.counts[r] || 0}{r === 'secret' ? `/${d.secret_total}` : ''}</span>)}
          </div>
        </div>
        {d.top.length > 0 && <>
          <div className="mt-4 font-bold">Самые редкие</div>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">{d.top.map((n) => <div key={n.id} className="w-32 shrink-0"><NumCard n={n} onClick={() => open(n.id)} /></div>)}</div>
        </>}
        <div className="mt-4 flex gap-2">
          {[['rarity', 'По редкости'], ['date', 'По дате']].map(([k, l]) => <button key={k} onClick={() => setSort(k)} className={`rounded-full px-3 py-1.5 text-sm ${sort === k ? 'bg-violet-600' : 'glass'}`}>{l}</button>)}
        </div>
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
          {['', ...RARITIES].map((r) => <button key={r} onClick={() => setRar(r)} className={`shrink-0 rounded-full px-3 py-1 text-xs ${rar === r ? 'bg-blue-600' : 'glass'}`}>{r ? R[r as Rarity].label : 'Все'}</button>)}
        </div>
        {d.items.length === 0 ? <div className="mt-8 text-center text-white/50">Здесь пока пусто. Вернитесь на главный экран и нажмите «КРУТИТЬ».</div>
          : <div className="mt-3 grid grid-cols-2 gap-2">{d.items.map((n) => <NumCard key={n.id} n={n} onClick={() => open(n.id)} />)}</div>}
      </>}
    </div>
  );
}

function Avatar({ url, name, size }: { url: string | null; name: string; size: number }) {
  return url ? <img src={url} className="rounded-full object-cover" style={{ width: size, height: size }} />
    : <div className="grid place-items-center rounded-full bg-gradient-to-br from-violet-600 to-blue-600 font-bold" style={{ width: size, height: size }}>{(name || '?')[0]}</div>;
}

function BoardTab() {
  const [type, setType] = useState('numbers');
  const [b, setB] = useState<Board | null>(null);
  useEffect(() => { api.board(type).then(setB).catch(() => {}); }, [type]);
  return (
    <div className="px-4 pb-4">
      <h2 className="mt-3 text-xl font-black">Рейтинг</h2>
      <div className="mt-3 flex gap-2">
        {[['numbers', 'Номера'], ['rare', 'Редкие'], ['level', 'Уровень']].map(([k, l]) => <button key={k} onClick={() => setType(k)} className={`rounded-full px-3 py-1.5 text-sm ${type === k ? 'bg-violet-600' : 'glass'}`}>{l}</button>)}
      </div>
      {b && <>
        <div className="glass mt-3 rounded-2xl p-3 text-center">Ваше место: <b>#{b.me.rank}</b> · {b.me.value}</div>
        <div className="mt-3 space-y-1.5">
          {b.top.map((u, i) => (
            <div key={u.id} className="glass flex items-center gap-3 rounded-xl px-3 py-2">
              <span className="w-6 text-center font-black text-white/60">{i + 1}</span>
              <Avatar url={u.photo_url} name={u.first_name} size={32} />
              <span className="flex-1 truncate">{u.first_name || 'Игрок'}</span><b>{u.value}</b>
            </div>
          ))}
        </div>
      </>}
    </div>
  );
}

function ProfileTab({ me }: { me: Me }) {
  const pct = Math.min(100, ((me.xp - me.xp_from) / (me.xp_to - me.xp_from)) * 100);
  const stats: [string, number][] = [['Номеров', me.numbers_count], ['Редких и выше', me.rare_count], ['Легендарных и выше', me.legendary_count], ['Прокруток', me.spin_count]];
  return (
    <div className="px-4 pb-4">
      <div className="mt-6 flex flex-col items-center">
        <Avatar url={me.photo_url} name={me.first_name} size={88} />
        <div className="mt-3 text-xl font-black">{me.first_name}</div>
        {me.username && <div className="text-sm text-white/50">@{me.username}</div>}
      </div>
      <div className="glass mt-4 rounded-2xl p-4">
        <div className="flex justify-between"><b>Уровень {me.level}</b><span className="text-sm text-white/50">{me.xp - me.xp_from}/{me.xp_to - me.xp_from} XP</span></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500" style={{ width: pct + '%' }} /></div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {stats.map(([l, v]) => <div key={l} className="glass rounded-2xl p-4"><div className="text-2xl font-black">{v}</div><div className="text-xs text-white/50">{l}</div></div>)}
      </div>
      <div className="mt-3 text-center text-sm text-white/40">В игре с {new Date(me.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
    </div>
  );
}

function Detail({ id, bot, close }: { id: number; bot: string; close: () => void }) {
  const [n, setN] = useState<Num | null>(null);
  useEffect(() => { api.number(id).then(setN).catch(close); }, [id]);
  return (
    <div className="fixed inset-0 z-20 flex items-end bg-black/70" onClick={close}>
      <div className="glass rcard rise w-full rounded-t-3xl bg-[#0b0b14] p-6 text-center" style={cvar(n ? R[n.rarity].color : '#8b5cf6')} onClick={(e) => e.stopPropagation()}>
        {n && <>
          <div className="text-sm text-white/40">Вымышленный номер</div>
          <div className="mt-1 text-3xl font-black tabular-nums" style={{ color: R[n.rarity].color }}>{n.number}</div>
          <div className="mt-1 font-bold" style={{ color: R[n.rarity].color }}>{R[n.rarity].label} · {R[n.rarity].en}</div>
          <div className="mt-1 text-white/70">{n.pattern}</div>
          <div className="mt-3 text-sm text-white/50">Получен: {fmtDate(n.obtained_at)}</div>
          <div className="text-sm text-white/50">Такой номер есть у игроков: {n.owners}</div>
          <button onClick={() => share(n, bot)} className="btn-spin mt-5 w-full rounded-2xl py-3 font-bold">Поделиться</button>
        </>}
        <button onClick={close} className="mt-2 w-full py-2 text-white/50">Закрыть</button>
      </div>
    </div>
  );
}

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<Tab>('play');
  const [detail, setDetail] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  const [tick, setTick] = useState(0);
  const toast = useCallback((s: string) => { setMsg(s); setTimeout(() => setMsg(''), 3000); }, []);
  const refresh = useCallback(() => api.me().then(setMe).catch((e) => setErr(e.message)), []);
  useEffect(() => { tg?.ready(); tg?.expand(); tg?.setHeaderColor?.('#05050a'); tg?.setBackgroundColor?.('#05050a'); tg?.disableVerticalSwipes?.(); refresh(); }, [refresh]);
  useEffect(() => { if (tab === 'collection') setTick((t) => t + 1); }, [tab]);

  if (err) return <div className="aurora grid h-full place-items-center p-8 text-center"><div><div className="text-xl font-black">Не удалось войти</div><p className="mt-2 text-white/60">{err}</p></div></div>;
  if (!me) return <div className="aurora grid h-full place-items-center text-white/50">Загрузка…</div>;

  const tabs: [Tab, string, string][] = [['play', '🎰', 'Играть'], ['collection', '🗂', 'Коллекция'], ['board', '🏆', 'Рейтинг'], ['profile', '👤', 'Профиль']];
  return (
    <div className="aurora flex h-full flex-col">
      <div className="flex-1 overflow-y-auto" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        {tab === 'play' && <Home me={me} setMe={(f) => setMe((m) => (m ? f(m) : m))} toast={toast} open={setDetail} refresh={refresh} />}
        {tab === 'collection' && <CollectionTab open={setDetail} tick={tick} />}
        {tab === 'board' && <BoardTab />}
        {tab === 'profile' && <ProfileTab me={me} />}
      </div>
      <nav className="glass flex border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)]">
        {tabs.map(([k, i, l]) => (
          <button key={k} onClick={() => { haptic('light'); setTab(k); }} className={`flex-1 py-2.5 text-xs ${tab === k ? 'text-violet-300' : 'text-white/40'}`}>
            <div className="text-xl">{i}</div>{l}
          </button>
        ))}
      </nav>
      {msg && <div className="rise glass fixed inset-x-4 top-4 z-30 rounded-2xl bg-[#0b0b14] p-3 text-center">{msg}</div>}
      {detail && <Detail id={detail} bot={me.bot_username} close={() => setDetail(null)} />}
    </div>
  );
}
