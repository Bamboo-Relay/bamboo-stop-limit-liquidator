// tslint:disable:custom-no-magic-numbers
import { assert } from '@0x/assert';
import * as _ from 'lodash';

import { Configs } from './types';

enum EnvVarType {
    Port,
    Integer,
}

/**
 * Assert that the configs supplied are valid
 * @param configs Configs
 */
export function assertConfigsAreValid(configs: Configs): void {
    assertEnvVarType('CHAIN_ID', configs.CHAIN_ID, EnvVarType.Integer);
    assertEnvVarType('GAS_PRICE_POLL_RATE_MS', configs.GAS_PRICE_POLL_RATE_MS, EnvVarType.Integer);
    assertEnvVarType('API_POLL_RATE', configs.API_POLL_RATE, EnvVarType.Integer);
    assert.isUri('ETHEREUM_RPC_HTTP_URL', configs.ETHEREUM_RPC_HTTP_URL);
/*ETHEREUM_RPC_TYPE
ETHEREUM_RPC_CONNECTION_METHOD
GAS_PRICE_SOURCE

RESTRICTED_TOKEN_PAIRS
API_TYPE*/
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

        default:
            throw new Error(`Unrecognised EnvVarType: ${expectedType} encountered for variable ${name}.`);
    }
}
