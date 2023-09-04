import { Interface } from '@ethersproject/abi';
import { BigNumber } from '@ethersproject/bignumber';
import { parseBytes32String } from '@ethersproject/strings';
import { ChainId, Token } from '@kinetix/sdk-core';
import _ from 'lodash';

import { IERC20Metadata__factory } from '../types/v3/factories/IERC20Metadata__factory';
import { log, WRAPPED_NATIVE_CURRENCY } from '../util';

import { IMulticallProvider, Result } from './multicall-provider';
import { ProviderConfig } from './provider';

/**
 * Provider for getting token data.
 *
 * @export
 * @interface ITokenProvider
 */
export interface ITokenProvider {
  /**
   * Gets the token at each address. Any addresses that are not valid ERC-20 are ignored.
   *
   * @param addresses The token addresses to get.
   * @param [providerConfig] The provider config.
   * @returns A token accessor with methods for accessing the tokens.
   */
  getTokens(
    addresses: string[],
    providerConfig?: ProviderConfig
  ): Promise<TokenAccessor>;
}

export type TokenAccessor = {
  getTokenByAddress(address: string): Token | undefined;
  getTokenBySymbol(symbol: string): Token | undefined;
  getAllTokens: () => Token[];
};

// Some well known tokens on each chain for seeding cache / testing.
export const WKAVA_KAVA = new Token(
  ChainId.KAVA,
  '0xc86c7C0eFbd6A49B35E8714C5f59D99De09A225b',
  18,
  'WKAVA',
  'Wrapped KAVA'
);

export const USDT_KAVA = new Token(
  ChainId.KAVA,
  '0x919C1c267BC06a7039e03fcc2eF738525769109c',
  6,
  'USDt',
  'TetherUSDt'
);

export const axlUSDC_KAVA = new Token(
  ChainId.KAVA,
  '0xEB466342C4d449BC9f53A865D5Cb90586f405215',
  6,
  'axlUSDC',
  'Axelar Wrapped USDC'
);

export const axlWBTC_KAVA = new Token(
  ChainId.KAVA,
  '0x1a35EE4640b0A3B87705B0A4B45D227Ba60Ca2ad',
  8,
  'axlUSDC',
  'Axelar Wrapped Bitcoin'
);

export const axlETH_KAVA = new Token(
  ChainId.KAVA,
  '0xb829b68f57CC546dA7E5806A929e53bE32a4625D',
  18,
  'axlETH',
  'Axelar Wrapped Ethereum'
);

export const ATOM_KAVA = new Token(
  ChainId.KAVA,
  '0x15932E26f5BD4923d46a2b205191C4b5d5f43FE3',
  6,
  'ATOM',
  'ATOM'
);

export const MIM_KAVA = new Token(
  ChainId.KAVA,
  '0x471EE749bA270eb4c1165B5AD95E614947f6fCeb',
  18,
  'MIM',
  'Magic Internet Money'
);

export class TokenProvider implements ITokenProvider {
  constructor(
    private chainId: ChainId,
    protected multicall2Provider: IMulticallProvider
  ) {}

  private async getTokenSymbol(
    addresses: string[],
    providerConfig?: ProviderConfig
  ): Promise<{
    result: {
      blockNumber: BigNumber;
      results: Result<[string]>[];
    };
    isBytes32: boolean;
  }> {
    let result;
    let isBytes32 = false;

    try {
      result =
        await this.multicall2Provider.callSameFunctionOnMultipleContracts<
          undefined,
          [string]
        >({
          addresses,
          contractInterface: IERC20Metadata__factory.createInterface(),
          functionName: 'symbol',
          providerConfig,
        });
    } catch (error) {
      log.error(
        { addresses },
        `TokenProvider.getTokenSymbol[string] failed with error ${error}. Trying with bytes32.`
      );

      const bytes32Interface = new Interface([
        {
          inputs: [],
          name: 'symbol',
          outputs: [
            {
              internalType: 'bytes32',
              name: '',
              type: 'bytes32',
            },
          ],
          stateMutability: 'view',
          type: 'function',
        },
      ]);

      try {
        result =
          await this.multicall2Provider.callSameFunctionOnMultipleContracts<
            undefined,
            [string]
          >({
            addresses,
            contractInterface: bytes32Interface,
            functionName: 'symbol',
            providerConfig,
          });
        isBytes32 = true;
      } catch (error) {
        log.fatal(
          { addresses },
          `TokenProvider.getTokenSymbol[bytes32] failed with error ${error}.`
        );

        throw new Error(
          '[TokenProvider.getTokenSymbol] Impossible to fetch token symbol.'
        );
      }
    }

    return { result, isBytes32 };
  }

  private async getTokenDecimals(
    addresses: string[],
    providerConfig?: ProviderConfig
  ) {
    return this.multicall2Provider.callSameFunctionOnMultipleContracts<
      undefined,
      [number]
    >({
      addresses,
      contractInterface: IERC20Metadata__factory.createInterface(),
      functionName: 'decimals',
      providerConfig,
    });
  }

  public async getTokens(
    _addresses: string[],
    providerConfig?: ProviderConfig
  ): Promise<TokenAccessor> {
    const addressToToken: { [address: string]: Token } = {};
    const symbolToToken: { [symbol: string]: Token } = {};

    const addresses = _(_addresses)
      .map((address) => address.toLowerCase())
      .uniq()
      .value();

    if (addresses.length > 0) {
      const [symbolsResult, decimalsResult] = await Promise.all([
        this.getTokenSymbol(addresses, providerConfig),
        this.getTokenDecimals(addresses, providerConfig),
      ]);

      const isBytes32 = symbolsResult.isBytes32;
      const { results: symbols } = symbolsResult.result;
      const { results: decimals } = decimalsResult;

      for (let i = 0; i < addresses.length; i++) {
        const address = addresses[i]!;

        const symbolResult = symbols[i];
        const decimalResult = decimals[i];

        if (!symbolResult?.success || !decimalResult?.success) {
          log.info(
            {
              symbolResult,
              decimalResult,
            },
            `Dropping token with address ${address} as symbol or decimal are invalid`
          );
          continue;
        }

        const symbol = isBytes32
          ? parseBytes32String(symbolResult.result[0]!)
          : symbolResult.result[0]!;
        const decimal = decimalResult.result[0]!;

        addressToToken[address.toLowerCase()] = new Token(
          this.chainId,
          address,
          decimal,
          symbol
        );
        symbolToToken[symbol.toLowerCase()] =
          addressToToken[address.toLowerCase()]!;
      }

      log.info(
        `Got token symbol and decimals for ${
          Object.values(addressToToken).length
        } out of ${addresses.length} tokens on-chain ${
          providerConfig ? `as of: ${providerConfig?.blockNumber}` : ''
        }`
      );
    }

    return {
      getTokenByAddress: (address: string): Token | undefined => {
        return addressToToken[address.toLowerCase()];
      },
      getTokenBySymbol: (symbol: string): Token | undefined => {
        return symbolToToken[symbol.toLowerCase()];
      },
      getAllTokens: (): Token[] => {
        return Object.values(addressToToken);
      },
    };
  }
}

export const WNATIVE_ON = (chainId: ChainId): Token => {
  return WRAPPED_NATIVE_CURRENCY[chainId];
};
