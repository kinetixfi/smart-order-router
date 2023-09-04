import { CHAIN_TO_ADDRESSES_MAP, ChainId, Token } from '@kinetix/sdk-core';

import { NETWORKS_WITH_SAME_UNISWAP_ADDRESSES } from './chains';

// export const BNB_TICK_LENS_ADDRESS = CHAIN_TO_ADDRESSES_MAP[ChainId.BNB].tickLensAddress;
// export const BNB_NONFUNGIBLE_POSITION_MANAGER_ADDRESS = CHAIN_TO_ADDRESSES_MAP[ChainId.BNB].nonfungiblePositionManagerAddress;
// export const BNB_SWAP_ROUTER_02_ADDRESS = CHAIN_TO_ADDRESSES_MAP[ChainId.BNB].swapRouter02Address!;
// export const BNB_V3_MIGRATOR_ADDRESS = CHAIN_TO_ADDRESSES_MAP[ChainId.BNB].v3MigratorAddress;

export const V3_CORE_FACTORY_ADDRESSES: AddressMap = {
  [ChainId.KAVA]: CHAIN_TO_ADDRESSES_MAP[ChainId.KAVA].v3CoreFactoryAddress,
};

export const QUOTER_V2_ADDRESSES: AddressMap = {
  [ChainId.KAVA]: CHAIN_TO_ADDRESSES_MAP[ChainId.KAVA].quoterAddress,
};

export const MIXED_ROUTE_QUOTER_V1_ADDRESSES: AddressMap = {
  // [ChainId.MAINNET]:
  //   CHAIN_TO_ADDRESSES_MAP[ChainId.MAINNET].v1MixedRouteQuoterAddress,
  // [ChainId.GOERLI]:
  //   CHAIN_TO_ADDRESSES_MAP[ChainId.GOERLI].v1MixedRouteQuoterAddress,
};

export const MULTICALL_ADDRESSES: AddressMap = {
  [ChainId.KAVA]: CHAIN_TO_ADDRESSES_MAP[ChainId.KAVA].multicallAddress,
};

export const SWAP_ROUTER_02_ADDRESSES = (chainId: number): string => {
  if (chainId === ChainId.KAVA) {
    return CHAIN_TO_ADDRESSES_MAP[ChainId.KAVA].swapRouter02Address || '';
  }
  return '';
};

export const OVM_GASPRICE_ADDRESS =
  '0x420000000000000000000000000000000000000F';
export const ARB_GASINFO_ADDRESS = '0x000000000000000000000000000000000000006C';
export const TICK_LENS_ADDRESS =
  CHAIN_TO_ADDRESSES_MAP[ChainId.KAVA].tickLensAddress;
export const NONFUNGIBLE_POSITION_MANAGER_ADDRESS =
  CHAIN_TO_ADDRESSES_MAP[ChainId.KAVA].nonfungiblePositionManagerAddress;
export const V3_MIGRATOR_ADDRESS =
  CHAIN_TO_ADDRESSES_MAP[ChainId.KAVA].v3MigratorAddress;

export type AddressMap = { [chainId: number]: string | undefined };

export function constructSameAddressMap<T extends string>(
  address: T,
  additionalNetworks: ChainId[] = []
): { [chainId: number]: T } {
  return NETWORKS_WITH_SAME_UNISWAP_ADDRESSES.concat(
    additionalNetworks
  ).reduce<{
    [chainId: number]: T;
  }>((memo, chainId) => {
    memo[chainId] = address;
    return memo;
  }, {});
}

export const WETH9: {
  [chainId in Exclude<ChainId, ChainId.KAVA>]: Token;
} = {
  [ChainId.KAVA]: new Token(
    ChainId.KAVA,
    '0xc86c7C0eFbd6A49B35E8714C5f59D99De09A225b',
    18,
    'WKAVA',
    'Wrapped Kava'
  ),
};
