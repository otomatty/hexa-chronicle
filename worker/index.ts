// Cloudflare Worker: 静的アセットの配信は Workers Assets に任せ、ここではクラウドセーブ API だけを扱う。
//   GET    /api/saves/:id   セーブデータを取得
//   PUT    /api/saves/:id   セーブデータを保存（本文は serialize() の JSON）
//   DELETE /api/saves/:id   セーブデータを削除
// :id はクライアントが生成する推測困難なコードで、これを知っていることが読み書きの条件になる。

const MAX_BYTES = 1_500_000;
const TTL_SECONDS = 60 * 60 * 24 * 180;
const ID_PATTERN = /^[A-Za-z0-9]{12,40}$/;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

/** 上限を超えたら読み込みを打ち切る（巨大なボディをメモリに載せない） */
async function readLimited(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > limit || !request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
  return new TextDecoder().decode(buf);
}

async function handleSave(request: Request, env: Env, id: string): Promise<Response> {
  if (!ID_PATTERN.test(id)) return json({ error: 'invalid id' }, 400);
  const key = `save:${id}`;
  switch (request.method) {
    case 'GET': {
      const data = await env.SAVES.get(key, 'stream');
      if (!data) return json({ error: 'not found' }, 404);
      return new Response(data, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
    }
    case 'PUT': {
      const text = await readLimited(request, MAX_BYTES);
      if (text === null) return json({ error: 'payload too large' }, 413);
      let turn = 0;
      try {
        const parsed: unknown = JSON.parse(text);
        if (typeof parsed !== 'object' || parsed === null || !('version' in parsed) || !('tiles' in parsed)) throw new Error('shape');
        if ('turn' in parsed && typeof parsed.turn === 'number') turn = parsed.turn;
      } catch {
        return json({ error: 'invalid save data' }, 400);
      }
      await env.SAVES.put(key, text, { expirationTtl: TTL_SECONDS, metadata: { turn, savedAt: Date.now() } });
      return json({ ok: true, turn });
    }
    case 'DELETE':
      await env.SAVES.delete(key);
      return json({ ok: true });
    default:
      return json({ error: 'method not allowed' }, 405);
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    try {
      const m = url.pathname.match(/^\/api\/saves\/([^/]+)$/);
      if (m) return await handleSave(request, env, m[1]);
      if (url.pathname === '/api/health') return json({ ok: true });
      if (url.pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error(JSON.stringify({ message: 'request failed', path: url.pathname, error: e instanceof Error ? e.message : String(e) }));
      return json({ error: 'internal error' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
