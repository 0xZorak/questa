import { defineChain } from "viem";
import { createConfig, http } from "wagmi";
import { metaMask, coinbaseWallet, injected } from "wagmi/connectors";

export const injectiveTestnet = defineChain({
  id: 888,
  name: "Injective Testnet",
  nativeCurrency: { name: "Injective", symbol: "INJ", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet.evm.injective.network"] },
  },
  blockExplorers: {
    default: {
      name: "Injective Testnet Explorer",
      url: "https://testnet.explorer.injective.network",
    },
  },
  testnet: true,
});

export const wagmiConfig = createConfig({
  chains: [injectiveTestnet],
  connectors: [
    injected(),           // MetaMask + any injected EIP-1193 wallet
    metaMask(),
    coinbaseWallet({ appName: "Questa" }),
  ],
  transports: {
    [injectiveTestnet.id]: http(),
  },
  ssr: true,
});
