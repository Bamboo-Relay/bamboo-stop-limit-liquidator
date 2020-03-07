import { RPCSubprovider, Web3ProviderEngine } from '@0x/subproviders';
import '@babel/polyfill';
import * as _ from 'lodash';
import * as fs from 'fs';
import 'reflect-metadata';

import { getAppAsync } from './app';
import { assertConfigsAreValid } from './assertions';
import { configs } from './production_configs';
import { ChainIdToProvider, NetworkSpecificSettings, ServerMode } from './types';
import { utils } from './utils';

(async () => {
    assertConfigsAreValid(configs);

    const chainIdToProvider: ChainIdToProvider = {};
    _.each(configs.CHAIN_ID_TO_SETTINGS, (settings: NetworkSpecificSettings, chainIdStr: string) => {
        const providerEngine = new Web3ProviderEngine();
        const rpcSubprovider = new RPCSubprovider(settings.RPC_URL);
        providerEngine.addProvider(rpcSubprovider);
        // HACK(fabio): Starting the provider this way avoids it's unused block poller from running
        (providerEngine as any)._ready.go();
        const chainId = _.parseInt(chainIdStr);
        chainIdToProvider[chainId] = providerEngine;
    });

    const app = await getAppAsync(chainIdToProvider, configs);

    if (configs.SERVER_MODE === ServerMode.HttpPort) {
        app.listen(configs.HTTP_PORT, () => {
            utils.log(`Coordinator SERVER API (HTTP) listening on port ${configs.HTTP_PORT}!`);
        });
    }
    else if (configs.SERVER_MODE === ServerMode.UnixSocket) {
        try {
            fs.unlinkSync(configs.SOCKET_FILE);
        } catch (err) {}

        app.listen(configs.SOCKET_FILE, () => {
            utils.log(`Coordinator SERVER API (HTTP) listening on socket ${configs.SOCKET_FILE}!`);

            try {
                fs.chmodSync(configs.SOCKET_FILE, '777');
            } catch (err) {}
        });
    }
})().catch(utils.log);
