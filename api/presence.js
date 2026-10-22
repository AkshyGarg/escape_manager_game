// Live "who's online / running now" endpoint for Escape the Manager.
// Each open game POSTs a heartbeat every few seconds; anyone seen in the last
// 30 seconds counts as online. Uses Upstash Redis when its env vars are set
// (Vercel Marketplace: "Upstash for Redis"), otherwise falls back to memory,
// which only works roughly because serverless instances don't share memory.

const WINDOW_MS = 30000;
const MAX_LIST = 50;
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const STATES = ['menu', 'playing', 'paused', 'over'];
const BOSSES = ['man', 'woman', 'youngman', 'youngwoman'];
const mem = globalThis.__etmPresence || (globalThis.__etmPresence = new Map());

const strip = (s) => String(s == null ? '' : s)
  .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff<>]/g, '')
  .trim().slice(0, 18);
const num = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));

function clean(b, id, now) {
  return {
    id,
    nick: strip(b.nick) || 'Someone',
    state: STATES.includes(b.state) ? b.state : 'menu',
    dist: num(b.dist, 1e7),
    score: num(b.score, 1e9),
    emp: b.emp === 'woman' ? 'woman' : 'man',
    boss: BOSSES.includes(b.boss) ? b.boss : 'man',
    t: now,
  };
}

async function redis(cmds) {
  const r = await fetch(REDIS_URL.replace(/\/$/, '') + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error('redis ' + r.status);
  return r.json();
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  if (!body || typeof body !== 'object') body = {};
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const id = typeof body.id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(body.id) ? body.id : null;

  try {
    let players;
    if (REDIS_URL && REDIS_TOKEN) {
      const cmds = [];
      if (req.method === 'POST' && id) {
        if (body.leave) cmds.push(['ZREM', 'etm:seen', id], ['HDEL', 'etm:players', id]);
        else cmds.push(['ZADD', 'etm:seen', String(now), id], ['HSET', 'etm:players', id, JSON.stringify(clean(body, id, now))]);
      }
      cmds.push(['ZRANGEBYSCORE', 'etm:seen', '-inf', '(' + cutoff]);
      cmds.push(['ZRANGEBYSCORE', 'etm:seen', String(cutoff), '+inf']);
      const out = await redis(cmds);
      const stale = (out[out.length - 2] && out[out.length - 2].result) || [];
      const live = ((out[out.length - 1] && out[out.length - 1].result) || []).slice(-MAX_LIST);
      const more = [];
      if (stale.length) more.push(['ZREM', 'etm:seen', ...stale], ['HDEL', 'etm:players', ...stale]);
      if (live.length) more.push(['HMGET', 'etm:players', ...live]);
      const out2 = more.length ? await redis(more) : [];
      const vals = live.length ? ((out2[out2.length - 1] && out2[out2.length - 1].result) || []) : [];
      players = vals.map((v) => { try { return JSON.parse(v); } catch (e) { return null; } }).filter(Boolean);
    } else {
      if (req.method === 'POST' && id) {
        if (body.leave) mem.delete(id);
        else mem.set(id, clean(body, id, now));
      }
      for (const [k, v] of mem) if (v.t < cutoff) mem.delete(k);
      players = [...mem.values()].slice(-MAX_LIST);
    }
    res.status(200).json({ players, storage: REDIS_URL && REDIS_TOKEN ? 'redis' : 'memory' });
  } catch (e) {
    res.status(500).json({ error: 'presence unavailable' });
  }
};
