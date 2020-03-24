import { RPCSubprovider, Web3ProviderEngine } from '@0x/subproviders';
import '@babel/polyfill';
import * as _ from 'lodash';
import 'reflect-metadata';

import { getAppAsync } from './app';
import { assertConfigsAreValid } from './assertions';
import { configs } from './production_configs';
import { utils } from './utils';
import { GasPriceService } from './services/gas_price_service';

(async () => {
    assertConfigsAreValid(configs);

    let providerEngine: Web3ProviderEngine;

    providerEngine = new Web3ProviderEngine();
    const rpcSubprovider = new RPCSubprovider(configs.ETHEREUM_RPC_URL);
    providerEngine.addProvider(rpcSubprovider);
    (providerEngine as any)._ready.go();

    const gasPriceService = new GasPriceService(configs);
    
    await getAppAsync(providerEngine, configs);
})().catch(utils.log);
