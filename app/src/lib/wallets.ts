// EIP-6963 wallet discovery: wallets announce themselves via
// "eip6963:announceProvider" events carrying name, icon (data URI), uuid
// and rdns; we collect them once at module level so the context and the
// modal share one source of truth.

export type Eip1193Provider = {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
};

export interface WalletInfo {
  uuid: string;
  name: string;
  icon: string; // data URI
  rdns: string;
}

export interface AnnouncedWallet {
  info: WalletInfo;
  provider: Eip1193Provider;
}

const announced = new Map<string, AnnouncedWallet>();
const subs = new Set<() => void>();
let listening = false;
let cachedList: AnnouncedWallet[] = [];

function rebuild() {
  cachedList = [...announced.values()];
}

export function startDiscovery() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("eip6963:announceProvider", (e: Event) => {
    const w = (e as CustomEvent<AnnouncedWallet>).detail;
    if (w?.info?.uuid && !announced.has(w.info.uuid)) {
      announced.set(w.info.uuid, w);
      rebuild();
      subs.forEach((f) => f());
    }
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

export function subscribeWallets(fn: () => void): () => void {
  startDiscovery();
  subs.add(fn);
  return () => subs.delete(fn);
}

// Stable snapshot for useSyncExternalStore - only replaced when the map changes.
export function getWallets(): AnnouncedWallet[] {
  startDiscovery();
  return cachedList;
}

export function findWallet(uuid: string): AnnouncedWallet | undefined {
  return announced.get(uuid);
}

export const CANONICAL = [
  { name: "MetaMask", rdns: "io.metamask", install: "https://metamask.io/download/" },
  { name: "Rainbow", rdns: "me.rainbow", install: "https://rainbow.me/download/" },
  { name: "Phantom", rdns: "app.phantom", install: "https://phantom.com/download" },
] as const;
