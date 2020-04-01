import '@babel/polyfill';
import * as _ from 'lodash';
import 'reflect-metadata';

import { Liquidator } from './liquidator_core';
import { assertConfigsAreValid } from './assertions';
import { configs } from './production_configs';
import { GasPriceService } from './services/gas_price_service';
import { OraclePriceService } from './services/oracle_price_service';
import { OrderService } from './services/order_service';

(async () => {
    assertConfigsAreValid(configs);

    const gasPriceService = new GasPriceService(configs);
    const oraclePriceService = new OraclePriceService(configs);
    const orderService = new OrderService(configs);
    
    const liquidator = new Liquidator(configs, gasPriceService, oraclePriceService, orderService);
    await liquidator.start();
})().catch(utils.log);
