/**
 * @jest-environment hardhat
 */

import { JsonRpcSigner } from '@ethersproject/providers';
import { Protocol } from '@kinetix/router-sdk';
import {
  ChainId,
  Currency,
  CurrencyAmount,
  Ether,
  Percent,
  Token,
  TradeType,
} from '@kinetix/sdk-core';
import {
  PERMIT2_ADDRESS,
  UNIVERSAL_ROUTER_ADDRESS as UNIVERSAL_ROUTER_ADDRESS_BY_CHAIN,
} from '@kinetix/universal-router-sdk';
import { Permit2Permit } from '@kinetix/universal-router-sdk/dist/utils/inputTokens';
import { Pair } from '@kinetix/v2-sdk';
import { encodeSqrtRatioX96, FeeAmount, Pool } from '@kinetix/v3-sdk';
import bunyan from 'bunyan';
import { BigNumber, providers, Wallet } from 'ethers';
import { parseEther } from 'ethers/lib/utils';

import 'jest-environment-hardhat';
import _ from 'lodash';
import NodeCache from 'node-cache';
import {
  AlphaRouter,
  AlphaRouterConfig,
  CachingV3PoolProvider,
  EthEstimateGasSimulator,
  FallbackTenderlySimulator,
  ID_TO_NETWORK_NAME,
  ID_TO_PROVIDER,
  MethodParameters,
  MixedRoute,
  NATIVE_CURRENCY,
  nativeOnChain,
  NodeJSCache,
  OnChainQuoteProvider,
  parseAmount,
  setGlobalLogger,
  SimulationStatus,
  StaticGasPriceProvider,
  SUPPORTED_CHAINS,
  SWAP_ROUTER_02_ADDRESSES,
  SwapOptions,
  SwapType,
  TenderlySimulator,
  UniswapMulticallProvider,
  V2_SUPPORTED,
  V2PoolProvider,
  V2Route,
  V3PoolProvider,
  V3Route,
  WETH9,
  WNATIVE_ON,
} from '../../../../src';
import { DEFAULT_ROUTING_CONFIG_BY_CHAIN } from '../../../../src/routers/alpha-router/config';
import { Permit2__factory } from '../../../../src/types/other/factories/Permit2__factory';
import { getBalanceAndApprove } from '../../../test-util/getBalanceAndApprove';
import { WHALES } from '../../../test-util/whales';

const FORK_BLOCK = 17894002;
const UNIVERSAL_ROUTER_ADDRESS = UNIVERSAL_ROUTER_ADDRESS_BY_CHAIN(1);
const SLIPPAGE = new Percent(15, 100); // 5% or 10_000?

const checkQuoteToken = (
  before: CurrencyAmount<Currency>,
  after: CurrencyAmount<Currency>,
  tokensQuoted: CurrencyAmount<Currency>
) => {
  // Check which is bigger to support exactIn and exactOut
  const tokensSwapped = after.greaterThan(before)
    ? after.subtract(before)
    : before.subtract(after);
  const tokensDiff = tokensQuoted.greaterThan(tokensSwapped)
    ? tokensQuoted.subtract(tokensSwapped)
    : tokensSwapped.subtract(tokensQuoted);

  const percentDiff = tokensDiff.asFraction.divide(tokensQuoted.asFraction);
  expect(percentDiff.lessThan(SLIPPAGE.asFraction)).toBe(true);
};

const getQuoteToken = (
  tokenIn: Currency,
  tokenOut: Currency,
  tradeType: TradeType
): Currency => {
  return tradeType == TradeType.EXACT_INPUT ? tokenOut : tokenIn;
};

export function parseDeadline(deadlineOrPreviousBlockhash: number): number {
  return Math.floor(Date.now() / 1000) + deadlineOrPreviousBlockhash;
}

const expandDecimals = (currency: Currency, amount: number): number => {
  return amount * 10 ** currency.decimals;
};

let warnedTenderly = false;
const isTenderlyEnvironmentSet = (): boolean => {
  const isSet =
    !!process.env.TENDERLY_BASE_URL &&
    !!process.env.TENDERLY_USER &&
    !!process.env.TENDERLY_PROJECT &&
    !!process.env.TENDERLY_ACCESS_KEY;
  if (!isSet && !warnedTenderly) {
    console.log(
      'Skipping Tenderly Simulation Tests since env variables for TENDERLY_BASE_URL, TENDERLY_USER, TENDERLY_PROJECT and TENDERLY_ACCESS_KEY are not set.'
    );
    warnedTenderly = true;
  }
  return isSet;
};

let warnedTesterPK = false;
const isTesterPKEnvironmentSet = (): boolean => {
  const isSet = !!process.env.TESTER_PK;
  if (!isSet && !warnedTesterPK) {
    console.log(
      'Skipping Permit Tenderly Simulation Test since env variables for TESTER_PK is not set.'
    );
    warnedTesterPK = true;
  }
  return isSet;
};

// Flag for enabling logs for debugging integ tests
if (process.env.INTEG_TEST_DEBUG) {
  setGlobalLogger(
    bunyan.createLogger({
      name: 'Uniswap Smart Order Router',
      serializers: bunyan.stdSerializers,
      level: bunyan.DEBUG,
    })
  );
}

jest.retryTimes(0);

describe('alpha router integration', () => {
  let alice: JsonRpcSigner;
  jest.setTimeout(500 * 1000); // 500s

  let curNonce: number = 0;

  let nextPermitNonce: () => string = () => {
    const nonce = curNonce.toString();
    curNonce = curNonce + 1;
    return nonce;
  };

  let alphaRouter: AlphaRouter;
  let customAlphaRouter: AlphaRouter;
  const multicall2Provider = new UniswapMulticallProvider(
    ChainId.MAINNET,
    hardhat.provider
  );

  const ROUTING_CONFIG: AlphaRouterConfig = {
    // @ts-ignore[TS7053] - complaining about switch being non exhaustive
    ...DEFAULT_ROUTING_CONFIG_BY_CHAIN[ChainId.MAINNET],
    protocols: [Protocol.V3, Protocol.V2],
  };

  const executeSwap = async (
    swapType: SwapType,
    methodParameters: MethodParameters,
    tokenIn: Currency,
    tokenOut: Currency,
    gasLimit?: BigNumber,
    permit?: boolean
  ): Promise<{
    tokenInAfter: CurrencyAmount<Currency>;
    tokenInBefore: CurrencyAmount<Currency>;
    tokenOutAfter: CurrencyAmount<Currency>;
    tokenOutBefore: CurrencyAmount<Currency>;
  }> => {
    expect(tokenIn.symbol).not.toBe(tokenOut.symbol);
    let transactionResponse: providers.TransactionResponse;

    let tokenInBefore: CurrencyAmount<Currency>;
    let tokenOutBefore: CurrencyAmount<Currency>;
    if (swapType == SwapType.UNIVERSAL_ROUTER) {
      // Approve Permit2
      // We use this helper function for approving rather than hardhat.provider.approve
      // because there is custom logic built in for handling USDT and other checks
      tokenInBefore = await getBalanceAndApprove(
        alice,
        PERMIT2_ADDRESS,
        tokenIn
      );
      const MAX_UINT160 = '0xffffffffffffffffffffffffffffffffffffffff';

      // If not using permit do a regular approval allowing narwhal max balance.
      if (!permit) {
        const aliceP2 = Permit2__factory.connect(PERMIT2_ADDRESS, alice);
        const approveNarwhal = await aliceP2.approve(
          tokenIn.wrapped.address,
          UNIVERSAL_ROUTER_ADDRESS,
          MAX_UINT160,
          20_000_000_000_000
        );
        await approveNarwhal.wait();
      }

      tokenOutBefore = await hardhat.getBalance(alice._address, tokenOut);

      const transaction = {
        data: methodParameters.calldata,
        to: methodParameters.to,
        value: BigNumber.from(methodParameters.value),
        from: alice._address,
        gasPrice: BigNumber.from(2000000000000),
        type: 1,
      };

      if (gasLimit) {
        transactionResponse = await alice.sendTransaction({
          ...transaction,
          gasLimit: gasLimit,
        });
      } else {
        transactionResponse = await alice.sendTransaction(transaction);
      }
    } else {
      tokenInBefore = await getBalanceAndApprove(
        alice,
        SWAP_ROUTER_02_ADDRESSES(tokenIn.chainId),
        tokenIn
      );
      tokenOutBefore = await hardhat.getBalance(alice._address, tokenOut);

      const transaction = {
        data: methodParameters.calldata,
        to: methodParameters.to,
        value: BigNumber.from(methodParameters.value),
        from: alice._address,
        gasPrice: BigNumber.from(2000000000000),
        type: 1,
      };

      if (gasLimit) {
        transactionResponse = await alice.sendTransaction({
          ...transaction,
          gasLimit: gasLimit,
        });
      } else {
        transactionResponse = await alice.sendTransaction(transaction);
      }
    }

    const receipt = await transactionResponse.wait();

    expect(receipt.status == 1).toBe(true); // Check for txn success

    const tokenInAfter = await hardhat.getBalance(alice._address, tokenIn);
    const tokenOutAfter = await hardhat.getBalance(alice._address, tokenOut);

    return {
      tokenInAfter,
      tokenInBefore,
      tokenOutAfter,
      tokenOutBefore,
    };
  };

  /**
   * Function to validate swapRoute data.
   * @param quote: CurrencyAmount<Currency>
   * @param quoteGasAdjusted: CurrencyAmount<Currency>
   * @param tradeType: TradeType
   * @param targetQuoteDecimalsAmount?: number - if defined, checks that the quoteDecimals is within the range of this +/- acceptableDifference (non inclusive bounds)
   * @param acceptableDifference?: number - see above
   */
  const validateSwapRoute = async (
    quote: CurrencyAmount<Currency>,
    quoteGasAdjusted: CurrencyAmount<Currency>,
    tradeType: TradeType,
    targetQuoteDecimalsAmount?: number,
    acceptableDifference?: number
  ) => {
    // strict undefined checks here to avoid confusion with 0 being a falsy value
    if (targetQuoteDecimalsAmount !== undefined) {
      acceptableDifference =
        acceptableDifference !== undefined ? acceptableDifference : 0;

      expect(
        quote.greaterThan(
          CurrencyAmount.fromRawAmount(
            quote.currency,
            expandDecimals(
              quote.currency,
              targetQuoteDecimalsAmount - acceptableDifference
            )
          )
        )
      ).toBe(true);
      expect(
        quote.lessThan(
          CurrencyAmount.fromRawAmount(
            quote.currency,
            expandDecimals(
              quote.currency,
              targetQuoteDecimalsAmount + acceptableDifference
            )
          )
        )
      ).toBe(true);
    }

    if (tradeType == TradeType.EXACT_INPUT) {
      // == lessThanOrEqualTo
      expect(!quoteGasAdjusted.greaterThan(quote)).toBe(true);
    } else {
      // == greaterThanOrEqual
      expect(!quoteGasAdjusted.lessThan(quote)).toBe(true);
    }
  };

  /**
   * Function to perform a call to executeSwap and validate the response
   * @param quote: CurrencyAmount<Currency>
   * @param tokenIn: Currency
   * @param tokenOut: Currency
   * @param methodParameters: MethodParameters
   * @param tradeType: TradeType
   * @param checkTokenInAmount?: number - if defined, check that the tokenInBefore - tokenInAfter = checkTokenInAmount
   * @param checkTokenOutAmount?: number - if defined, check that the tokenOutBefore - tokenOutAfter = checkTokenOutAmount
   */
  const validateExecuteSwap = async (
    swapType: SwapType,
    quote: CurrencyAmount<Currency>,
    tokenIn: Currency,
    tokenOut: Currency,
    methodParameters: MethodParameters | undefined,
    tradeType: TradeType,
    checkTokenInAmount?: number,
    checkTokenOutAmount?: number,
    estimatedGasUsed?: BigNumber,
    permit?: boolean
  ) => {
    expect(methodParameters).not.toBeUndefined();
    const { tokenInBefore, tokenInAfter, tokenOutBefore, tokenOutAfter } =
      await executeSwap(
        swapType,
        methodParameters!,
        tokenIn,
        tokenOut!,
        estimatedGasUsed,
        permit
      );

    if (tradeType == TradeType.EXACT_INPUT) {
      if (checkTokenInAmount) {
        expect(
          tokenInBefore
            .subtract(tokenInAfter)
            .equalTo(
              CurrencyAmount.fromRawAmount(
                tokenIn,
                expandDecimals(tokenIn, checkTokenInAmount)
              )
            )
        ).toBe(true);
      }
      checkQuoteToken(
        tokenOutBefore,
        tokenOutAfter,
        /// @dev we need to recreate the CurrencyAmount object here because tokenOut can be different from quote.currency (in the case of ETH vs. WETH)
        CurrencyAmount.fromRawAmount(tokenOut, quote.quotient)
      );
    } else {
      if (checkTokenOutAmount) {
        expect(
          tokenOutAfter
            .subtract(tokenOutBefore)
            .equalTo(
              CurrencyAmount.fromRawAmount(
                tokenOut,
                expandDecimals(tokenOut, checkTokenOutAmount)
              )
            )
        ).toBe(true);
      }
      checkQuoteToken(
        tokenInBefore,
        tokenInAfter,
        CurrencyAmount.fromRawAmount(tokenIn, quote.quotient)
      );
    }
  };

  beforeAll(async () => {
    await hardhat.fork(FORK_BLOCK);

    alice = hardhat.providers[0]!.getSigner();
    const aliceAddress = await alice.getAddress();
    expect(aliceAddress).toBe(alice._address);


    // alice should always have 10000 ETH
    const aliceEthBalance = await hardhat.provider.getBalance(alice._address);
    /// Since alice is deploying the QuoterV3 contract, expect to have slightly less than 10_000 ETH but not too little
    expect(aliceEthBalance.toBigInt()).toBeGreaterThanOrEqual(
      parseEther('9995').toBigInt()
    );

  });

});

