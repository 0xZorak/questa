"use client";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/Toast";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useWalletStore } from "@/store/wallet";

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Reconnect Keplr on load if the user was connected (persists across reloads).
    useWalletStore.getState().restore();
    // Track Keplr account switches while connected.
    const onKeystoreChange = () => useWalletStore.getState().restore();
    window.addEventListener("keplr_keystorechange", onKeystoreChange);
    return () => window.removeEventListener("keplr_keystorechange", onKeystoreChange);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </ToastProvider>
    </QueryClientProvider>
  );
}
