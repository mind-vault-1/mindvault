declare global {
  interface Window {
    freighterApi?: {
      signTransaction: (xdr: string, options: { networkPassphrase: string }) => Promise<string>;
      isConnected: () => Promise<boolean>;
      getPublicKey: () => Promise<string>;
    };
  }
}

export {};
