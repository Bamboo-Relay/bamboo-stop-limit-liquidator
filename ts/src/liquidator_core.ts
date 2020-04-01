import { BigNumber } from '@0x/utils';

import { ZeroExOrderEntity } from './entities/zero_ex_order_entity';
import { NetworkService } from './services/network_service_interface';
import { GasPriceService } from './services/gas_price_service';
import { OraclePriceService } from './services/oracle_price_service';
import { OrderService } from './services/order_service';
import { Configs, OrderSummary } from './types';
import { orderUtils } from './utils/order_utils';

export class Liquidator implements NetworkService {
    private readonly _configs: Configs;
    private readonly _gasPriceService: GasPriceService;
    private readonly _oraclePriceService: OraclePriceService;
    private readonly _orderService: OrderService;
    private _isStarted: boolean = false;
    constructor(
        configs: Configs,
        gasPriceService: GasPriceService,
        oraclePriceService: OraclePriceService,
        orderService: OrderService
    ) {
        this._configs = configs;
        this._gasPriceService = gasPriceService;
        this._oraclePriceService = oraclePriceService;
        this._orderService = orderService;
        this._oraclePriceService.on(
            "priceUpdated",
            (baseToken: string, quoteToken: string, price: BigNumber) => 
                this._oraclePriceUpdated(baseToken, quoteToken, price)
        );
    }

    public async start(): Promise<boolean> {
        if (this._isStarted) {
            await this.stop();
        }

        await Promise.all([
            this._gasPriceService.start(),
            this._oraclePriceService.start(),
            this._orderService.start()
        ]);

        this._isStarted = true;
        
        return true;
    }

    public async stop(): Promise<boolean> {
        await Promise.all([
            this._gasPriceService.stop(),
            this._oraclePriceService.stop(),
            this._orderService.stop()
        ]);

        this._isStarted = false;

        return true;
    }

    private async _oraclePriceUpdated(
        baseToken: string, 
        quoteToken: string, 
        price: BigNumber
    ): Promise<void> {
        if (!this._isStarted) {
            return;
        }
        const tokenFiatPrice = this._oraclePriceService.getTokenFiatPrice(baseToken, this._configs.PROFIT_ASSET);
        const ethFiatPrice = this._oraclePriceService.getTokenFiatPrice("WETH", this._configs.PROFIT_ASSET);
        if (!tokenFiatPrice || !ethFiatPrice) {
            return;
        }
        const gasPrice = this._gasPriceService.getCurrentGasPrice();
        const ordersAvailable = this._orderService.getOrders(baseToken, quoteToken);
        const profitableOrders = await this._findProfitableOrders(
            ordersAvailable,
            price,
            tokenFiatPrice,
            gasPrice,
            ethFiatPrice
       );
    }

    private async _findProfitableOrders(
        potentialOrders: OrderSummary[],
        tokenPrice: BigNumber,
        tokenFiatPrice: BigNumber,
        gasPrice: BigNumber,
        ethFiatPrice: BigNumber    
    ): Promise<ZeroExOrderEntity[]> {
        let profitableOrders: ZeroExOrderEntity[] = [];

        for (let i = 0, len = potentialOrders.length; i < len; i++) {
            const order = potentialOrders[i];
            if (orderUtils.isOrderProfitable(
                order,
                tokenPrice,
                tokenFiatPrice,
                gasPrice,
                ethFiatPrice,
                this._configs.MINIMUM_PROFIT_PERCENT
            )) {
                const zeroExOrder = await this._orderService.getZeroExOrder(order);
                if (zeroExOrder) {
                    profitableOrders.push(zeroExOrder);
                }
            }
        }

        return profitableOrders;
    }
}