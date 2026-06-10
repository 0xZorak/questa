import { create } from "zustand";

const CHAIN_ID    = "injective-888";
const STORAGE_KEY = "rb_keplr_connected";

interface WalletState {
  address:      string | null;
  isConnecting: boolean;
  connect:    () => Promise<void>;
  disconnect: () => void;
  /** Silently re-enable Keplr on page load if the user connected previously
   *  and did not explicitly disconnect. */
  restore:    () => Promise<void>;
}

async function readKeplrAddress(): Promise<string | null> {
  if (typeof window === "undefined" || !window.keplr) return null;
  await window.keplr.enable(CHAIN_ID);
  const signer   = window.keplr.getOfflineSigner(CHAIN_ID);
  const accounts = await signer.getAccounts();
  return accounts[0]?.address ?? null;
}

export const useWalletStore = create<WalletState>((set) => ({
  address:      null,
  isConnecting: false,

  connect: async () => {
    if (typeof window === "undefined" || !window.keplr) {
      // Throw so callers can surface this in their UI rather than blocking with alert()
      throw new Error("Please install the Keplr wallet extension.");
    }
    set({ isConnecting: true });
    try {
      const address = await readKeplrAddress();
      if (address) {
        set({ address });
        try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* storage blocked */ }
      }
    } catch (e) {
      console.error("Keplr connect error:", e);
      throw e;
    } finally {
      set({ isConnecting: false });
    }
  },

  restore: async () => {
    let flag: string | null = null;
    try { flag = localStorage.getItem(STORAGE_KEY); } catch { /* storage blocked */ }
    if (flag !== "1") return; // user never connected, or explicitly disconnected
    try {
      const address = await readKeplrAddress();
      if (address) set({ address });
    } catch {
      // Keplr locked or approval pending — stay disconnected but keep the flag so
      // the next load retries. Do NOT clear it (that would force a re-click).
    }
  },

  disconnect: () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage blocked */ }
    set({ address: null });
  },
}));

// Keplr type augmentation
declare global {
  interface Window {
    keplr?: {
      enable: (chainId: string) => Promise<void>;
      getOfflineSigner: (chainId: string) => {
        getAccounts: () => Promise<{ address: string; pubkey: Uint8Array }[]>;
      };
      signArbitrary?: (
        chainId: string,
        signer: string,
        data: string
      ) => Promise<{ signature: string; pub_key: { value: string } }>;
    };
  }
}
