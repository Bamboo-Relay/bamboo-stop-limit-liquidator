import '@babel/polyfill';
import * as _ from 'lodash';
import 'reflect-metadata';

import { Liquidator } from './liquidator_core';
import { assertConfigsAreValid } from './assertions';
import { configs } from './production_configs';
import { GasPriceService } from './services/gas_price_service';
import { OraclePriceService } from './services/oracle_price_service';
import { OrderService } from './services/order_service';
import { TradeService } from './services/trade_service';
import { utils } from './utils/utils';
import { hasDBConnection, initDBConnectionAsync } from './db_connection';

(async () => {
    assertConfigsAreValid(configs);
    utils.logToFile(configs.LOG_FILE);
    if (!hasDBConnection()) {
        await initDBConnectionAsync();
    }

    await utils.showBanner();

    utils.logColor([
        "Starting",
        ["Bamboo", "green"],
        ["Relay", "red"],
        "Stop Limit Liquidator on Chain",
        [configs.CHAIN_ID.toString(), "green"]
    ]);

    utils.logColor([
        ["WARNING This is alpha software, your funds may be at risk", "red_bg"]
    ]);

    const gasPriceService = new GasPriceService(configs);
    const oraclePriceService = new OraclePriceService(configs);
    const orderService = new OrderService(configs);
    const tradeService = new TradeService(configs);
    
    const liquidator = new Liquidator(
        configs, 
        gasPriceService, 
        oraclePriceService, 
        orderService,
        tradeService
    );

    await liquidator.start();
})().catch(utils.log);
