import { BigNumber } from '@0x/utils';

import { ZeroExOrderEntity } from './entities/zero_ex_order_entity';
import { NetworkService } from './services/network_service_interface';
import { GasPriceService } from './services/gas_price_service';
import { OraclePriceService } from './services/oracle_price_service';
import { OrderService } from './services/order_service';
import { Configs, OrderSummary } from './types';
import { orderUtils } from './utils/order_utils';
import { orderHashUtils } from '@0x/order-utils';

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
            this._orderService.start(),
            this._oraclePriceService.start()
        ]);

        this._isStarted = true;

        // Has to be post service startup
        await this._oraclePriceService.triggerAll();
        
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
        if (!this._isStarted || !this._orderService.isConnected()) {
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
        if (!profitableOrders.length) {
            return;
        }
        const matchedOrders = await this._orderService.matchProfitableOrders(profitableOrders);
        let profitableTrades = [];
        for (let i = 0, len = profitableOrders.length; i < len; i++) {
            const profitableOrder = profitableOrders[i];
            const orderHash = orderHashUtils.getOrderHash(profitableOrder);
            if (!(orderHash in matchedOrders)) {
                continue;
            }
            const matchedOrder = matchedOrders[orderHash];
            if (matchedOrder.order || matchedOrder.fillTakerAssetAmount.eq(0)) {
                continue;
            }
            if (orderUtils.isTradeProfitable(
                profitableOrder,
                matchedOrder.order,
                matchedOrder.fillTakerAssetAmount,
                gasPrice,
                tokenFiatPrice,
                ethFiatPrice,
                this._configs.MINIMUM_PROFIT_PERCENT
            )) {
                profitableTrades.push([
                    profitableOrder,
                    matchedOrder.order,
                ]);
            }
        }
        for (let i = 0, len = profitableTrades.length; i < len; i++) {
            
        }
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
                gasPrice,
                tokenFiatPrice,
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
