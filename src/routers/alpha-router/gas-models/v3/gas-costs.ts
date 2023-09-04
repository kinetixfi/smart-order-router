import { BigNumber } from '@ethersproject/bignumber';
import { ChainId, Token } from '@kinetix/sdk-core';

import { V3Route } from '../../../router';

// Cost for crossing an uninitialized tick.
export const COST_PER_UNINIT_TICK = BigNumber.from(0);

//l2 execution fee on optimism is roughly the same as mainnet
export const BASE_SWAP_COST = (id: ChainId): BigNumber => {
  switch (id) {
    case ChainId.KAVA:
      return BigNumber.from(2000);
    default:
      return BigNumber.from(2000);
  }
};
export const COST_PER_INIT_TICK = (id: ChainId): BigNumber => {
  switch (id) {
    case ChainId.KAVA:
      return BigNumber.from(31000);
    default:
      return BigNumber.from(31000);
  }
};

export const COST_PER_HOP = (id: ChainId): BigNumber => {
  switch (id) {
    case ChainId.KAVA:
      return BigNumber.from(80000);
  }
};

export const SINGLE_HOP_OVERHEAD = (_id: ChainId): BigNumber => {
  console.log(_id);
  return BigNumber.from(15000);
};

export const TOKEN_OVERHEAD = (route: V3Route): BigNumber => {
  const tokens: Token[] = route.tokenPath;
  console.log(tokens);
  const overhead = BigNumber.from(0);

  return overhead;
};
