import {
  ChainId,
  Currency,
  Ether,
  NativeCurrency,
  Token,
} from '@kinetix/sdk-core';

// WIP: Gnosis, Moonbeam
export const SUPPORTED_CHAINS: ChainId[] = [ChainId.KAVA];

export const V2_SUPPORTED: ChainId[] = [
  ChainId.KAVA,
  // ChainId.GOERLI,
  // ChainId.SEPOLIA
];

export const HAS_L1_FEE: ChainId[] = [];

export const NETWORKS_WITH_SAME_UNISWAP_ADDRESSES: ChainId[] = [];

export const ID_TO_CHAIN_ID = (id: number): ChainId => {
  switch (id) {
    case 2222:
      return ChainId.KAVA;
    default:
      throw new Error(`Unknown chain id: ${id}`);
  }
};

export enum ChainName {
  KAVA = 'kava',
}

export enum NativeCurrencyName {
  // Strings match input for CLI
  KAVA = 'KAVA',
}

export const NATIVE_NAMES_BY_ID: { [chainId: number]: string[] } = {
  [ChainId.KAVA]: [
    'KAVA',
    'KAVA',
    '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  ],
};

export const NATIVE_CURRENCY: { [chainId: number]: NativeCurrencyName } = {
  [ChainId.KAVA]: NativeCurrencyName.KAVA,
};

export const ID_TO_NETWORK_NAME = (id: number): ChainName => {
  switch (id) {
    case 2222:
      return ChainName.KAVA;
    default:
      throw new Error(`Unknown chain id: ${id}`);
  }
};

export const CHAIN_IDS_LIST = Object.values(ChainId).map((c) =>
  c.toString()
) as string[];

export const ID_TO_PROVIDER = (id: ChainId): string => {
  switch (id) {
    case ChainId.KAVA:
      return process.env.JSON_RPC_PROVIDER_KAVA!;
    default:
      throw new Error(`Chain id: ${id} not supported`);
  }
};

export const WRAPPED_NATIVE_CURRENCY: { [chainId in ChainId]: Token } = {
  [ChainId.KAVA]: new Token(
    ChainId.KAVA,
    '0xc86c7C0eFbd6A49B35E8714C5f59D99De09A225b',
    18,
    'WKAVA',
    'Wrapped KAVA'
  ),
};

function isKava(chainId: number): chainId is ChainId.KAVA {
  return chainId === ChainId.KAVA;
}

class KavaNativeCurrency extends NativeCurrency {
  equals(other: Currency): boolean {
    return other.isNative && other.chainId === this.chainId;
  }

  get wrapped(): Token {
    if (!isKava(this.chainId)) throw new Error('Not kava');
    const nativeCurrency = WRAPPED_NATIVE_CURRENCY[this.chainId];
    if (nativeCurrency) {
      return nativeCurrency;
    }
    throw new Error(`Does not support this chain ${this.chainId}`);
  }

  public constructor(chainId: number) {
    if (!isKava(chainId)) throw new Error('Not kava');
    super(chainId, 18, 'KAVA', 'Kava');
  }
}

export class ExtendedEther extends Ether {
  public get wrapped(): Token {
    if (this.chainId in WRAPPED_NATIVE_CURRENCY) {
      return WRAPPED_NATIVE_CURRENCY[this.chainId as ChainId];
    }
    throw new Error('Unsupported chain ID');
  }

  private static _cachedExtendedEther: { [chainId: number]: NativeCurrency } =
    {};

  public static onChain(chainId: number): ExtendedEther {
    return (
      this._cachedExtendedEther[chainId] ??
      (this._cachedExtendedEther[chainId] = new ExtendedEther(chainId))
    );
  }
}

const cachedNativeCurrency: { [chainId: number]: NativeCurrency } = {};

export function nativeOnChain(chainId: number): NativeCurrency {
  if (cachedNativeCurrency[chainId] != undefined) {
    return cachedNativeCurrency[chainId]!;
  }
  if (isKava(chainId)) {
    cachedNativeCurrency[chainId] = new KavaNativeCurrency(chainId);
  } else {
    cachedNativeCurrency[chainId] = ExtendedEther.onChain(chainId);
  }

  return cachedNativeCurrency[chainId]!;
}
