import { BigNumber } from '@0x/utils';
import * as _ from 'lodash';

import { 
    Configs,
    EthereumRpcType,
    EthereumRpcConnectionMethod,
    ApiType 
} from './types';

export const configs: Configs = {
    // Chain Id to connect to
    CHAIN_ID: process.env.CHAIN_ID === undefined ? 1 : _.parseInt(process.env.CHAIN_ID),

    ETHEREUM_RPC_HTTP_URL: process.env.ETHEREUM_RPC_HTTP_URL || "",
    
    ETHEREUM_RPC_WS_URL: process.env.ETHEREUM_RPC_WS_URL || "",
    
    ETHEREUM_RPC_TYPE: process.env.ETHEREUM_RPC_TYPE === undefined ? EthereumRpcType.Default : process.env.ETHEREUM_RPC_TYPE as EthereumRpcType,
    
    ETHEREUM_RPC_CONNECTION_METHOD:
        process.env.ETHEREUM_RPC_TYPE === undefined
            ? EthereumRpcConnectionMethod.Polling
            : process.env.ETHEREUM_RPC_CONNECTION_METHOD as EthereumRpcConnectionMethod,

    PRIVATE_KEY: process.env.PRIVATE_KEY || "", 
    
    GAS_PRICE_SOURCE: process.env.GAS_PRICE_SOURCE || "ethgasstation",
    
    GAS_PRICE_POLL_RATE_MS:
        process.env.GAS_PRICE_POLL_RATE_MS === undefined ? 60000 : _.parseInt(process.env.GAS_PRICE_POLL_RATE_MS),
    
    RESTRICTED_TOKEN_PAIRS:
        process.env.RESTRICTED_TOKEN_PAIRS === undefined
        ? []
        : process.env.RESTRICTED_TOKEN_PAIRS.split(",").map(val => val.trim()),

    API_TYPE: ApiType.Bamboo,
    
    API_POLL_RATE: 60000,

    MINIMUM_PROFIT_PERCENT: process.env.MINIMUM_PROFIT_PERCENT === undefined ? new BigNumber(1) : new BigNumber(process.env.MINIMUM_PROFIT_PERCENT),

    PROFIT_ASSET: process.env.PROFIT_ASSET === undefined ? "USD" : process.env.PROFIT_ASSET,

    LOG_FILE: process.env.LOG_FILE === undefined ? "stop-limit.log" : process.env.LOG_FILE,
    
};
