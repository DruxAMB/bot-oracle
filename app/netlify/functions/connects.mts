// Netlify Function — unique-wallets-connected counter. Serves at
// /.netlify/functions/connects; locally via `netlify dev`.
// Backed by Upstash REST when env is present; falls back to an
// in-memory set per warm instance otherwise.
import { isAddress } from "ethers";

const KV_URL = process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = "bot-oracle:connects";
const mem = new Set<string>();

async function kv(cmd: (string | number)[]): Promise<number> {
  const r = await fetch(KV_URL!, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  const j = (await r.json()) as { result: number };
  return j.result;
}

export default async (req: Request) => {
  if (req.method === "GET") {
    try {
      const count = KV_URL && KV_TOKEN ? await kv(["SCARD", KEY]) : mem.size;
      return Response.json({ count });
    } catch {
      return Response.json({ count: null });
    }
  }
  if (req.method === "POST") {
    try {
      const { address } = (await req.json()) as { address?: string };
      if (!address || !isAddress(address)) {
        return Response.json({ ok: false }, { status: 400 });
      }
      const a = address.toLowerCase();
      const count = KV_URL && KV_TOKEN
        ? await kv(["SADD", KEY, a]).then(() => kv(["SCARD", KEY]))
        : mem.add(a).size;
      return Response.json({ ok: true, count });
    } catch {
      return Response.json({ ok: false }, { status: 500 });
    }
  }
  return Response.json({ error: "method not allowed" }, { status: 405 });
};
