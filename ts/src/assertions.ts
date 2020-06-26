// tslint:disable:custom-no-magic-numbers
import { assert } from '@0x/assert';
import * as _ from 'lodash';

import { Configs } from './types';

enum EnvVarType {
    Port,
    Integer,
    ProfitAsset,
    EthGasStationApiKey
}

/**
 * Assert that the configs supplied are valid
 * @param configs Configs
 */
export function assertConfigsAreValid(configs: Configs): void {
    assertEnvVarType('CHAIN_ID', configs.CHAIN_ID, EnvVarType.Integer);
    assertEnvVarType('GAS_PRICE_POLL_RATE_MS', configs.GAS_PRICE_POLL_RATE_MS, EnvVarType.Integer);
    assertEnvVarType('API_POLL_RATE', configs.API_POLL_RATE, EnvVarType.Integer);
    assertEnvVarType('PROFIT_ASSET', configs.PROFIT_ASSET, EnvVarType.ProfitAsset);
    assertEnvVarType('ETHGASSTATION_API_KEY', configs.ETHGASSTATION_API_KEY, EnvVarType.EthGasStationApiKey);
    assert.isUri('ETHEREUM_RPC_HTTP_URL', configs.ETHEREUM_RPC_HTTP_URL);    
}

function assertEnvVarType(name: string, value: any, expectedType: EnvVarType): any {
    let returnValue;
    switch (expectedType) {
        case EnvVarType.Port:
            try {
                returnValue = parseInt(value, 10);
                const isWithinRange = returnValue >= 0 && returnValue <= 65535;
                if (!isWithinRange) {
                    throw new Error();
                }
            } catch (err) {
                throw new Error(`${name} must be between 0 to 65535, found ${value}.`);
            }
            return returnValue;

        case EnvVarType.Integer:
            try {
                returnValue = parseInt(value, 10);
            } catch (err) {
                throw new Error(`${name} must be a valid integer, found ${value}.`);
            }
            return returnValue;

        case EnvVarType.EthGasStationApiKey:
            if (!value || value.length < 60) {
                throw new Error(`${name} must be a valid EthGasStation API key, found ${value}.`);
            }
            return returnValue;

        case EnvVarType.ProfitAsset:
            if (![
                'USD',
                'AUD',
                'EUR',
                'CHF',
                'GBP',
                'JPY'
            ].includes(value)) {
                throw new Error(`${name} must be a valid profit asset, found ${value}.`);
            }
            return returnValue;

        default:
            throw new Error(`Unrecognised EnvVarType: ${expectedType} encountered for variable ${name}.`);
    }
}
