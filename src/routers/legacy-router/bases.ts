/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { ChainId, Token } from '@kinetix/sdk-core';

import {
  ATOM_KAVA,
  axlETH_KAVA,
  axlUSDC_KAVA,
  axlWBTC_KAVA,
  ITokenProvider,
  MIM_KAVA,
  USDT_KAVA,
} from '../../providers/token-provider';
import { WRAPPED_NATIVE_CURRENCY } from '../../util/chains';

type ChainTokenList = {
  readonly [chainId in ChainId]: Token[];
};

export const BASES_TO_CHECK_TRADES_AGAINST = (
  _tokenProvider: ITokenProvider
): ChainTokenList => {
  return {
    [ChainId.KAVA]: [
      WRAPPED_NATIVE_CURRENCY[ChainId.KAVA]!,
      axlETH_KAVA,
      axlUSDC_KAVA,
      axlWBTC_KAVA,
      ATOM_KAVA,
      MIM_KAVA,
      USDT_KAVA,
    ],
  };
};

export const ADDITIONAL_BASES = async (
  tokenProvider: ITokenProvider
): Promise<{
  [chainId in ChainId]?: { [tokenAddress: string]: Token[] };
}> => {
  if (!tokenProvider) {
    return { [ChainId.KAVA]: {} };
  }
  return {
    [ChainId.KAVA]: {},
  };
};

/**
 * Some tokens can only be swapped via certain pairs, so we override the list of bases that are considered for these
 * tokens.
 */
export const CUSTOM_BASES = async (
  tokenProvider: ITokenProvider
): Promise<{
  [chainId in ChainId]?: { [tokenAddress: string]: Token[] };
}> => {
  if (!tokenProvider) {
    return { [ChainId.KAVA]: {} };
  }
  return {
    [ChainId.KAVA]: {},
  };
};
