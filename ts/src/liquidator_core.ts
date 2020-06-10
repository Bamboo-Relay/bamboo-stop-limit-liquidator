import { BigNumber } from '@0x/utils';

import { ZeroExOrderEntity } from './entities/zero_ex_order_entity';
import { NetworkService } from './services/network_service_interface';
import { GasPriceService } from './services/gas_price_service';
import { OraclePriceService } from './services/oracle_price_service';
import { OrderService } from './services/order_service';
import { TradeService } from './services/trade_service';
import { Configs, OrderSummary, TradeProfitResult, OrderType } from './types';
import { orderUtils } from './utils/order_utils';
import { utils } from './utils/utils';
import { orderHashUtils } from '@0x/order-utils';
import { SignedOrder } from '@0x/types';

interface Liquidations {
    [transactionHash: string]: {
        baseToken: string,
        quoteToken: string,
        fiatProfit: BigNumber
    }
}

export class Liquidator implements NetworkService {
    private readonly _configs: Configs;
    private readonly _gasPriceService: GasPriceService;
    private readonly _oraclePriceService: OraclePriceService;
    private readonly _orderService: OrderService;
    private readonly _tradeService: TradeService;
    private _isStarted: boolean = false;
    private _isTriggered: boolean = false;
    private _pendingLiquidations: Liquidations = {};
    private _unprofitableOrders: { [orderHash: string]: boolean } = {};
    constructor(
        configs: Configs,
        gasPriceService: GasPriceService,
        oraclePriceService: OraclePriceService,
        orderService: OrderService,
        tradeService: TradeService
    ) {
        this._configs = configs;
        this._gasPriceService = gasPriceService;
        this._oraclePriceService = oraclePriceService;
        this._orderService = orderService;
        this._tradeService = tradeService;
        this._oraclePriceService.on(
            "priceUpdated",
            (baseToken: string, quoteToken: string, price: BigNumber) => 
                this._oraclePriceUpdated(baseToken, quoteToken, price)
        );
        this._orderService.on(
            "newOrder",
            (order: OrderSummary) => 
                this._newOrder(order)
        );
        this._orderService.on(
            "connected",
            (isConnected: boolean) => {
                if (isConnected && this._isStarted && !this._isTriggered) {
                    this._isTriggered = true;
                    this._oraclePriceService.triggerAll();
                }
            }
        );
        this._tradeService.on(
            "transactionComplete",
            (transactionHash: string, status: boolean) => 
                this._transactionComplete(transactionHash, status)
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
        if (!this._isTriggered) {
            await this._oraclePriceService.triggerAll();
        }
        
        return true;
    }

    public async stop(): Promise<boolean> {
        await Promise.all([
            this._gasPriceService.stop(),
            this._oraclePriceService.stop(),
            this._orderService.stop()
        ]);

        this._isStarted = false;
        this._isTriggered = false;

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
        await this._matchAndExecuteTrades(
            baseToken,
            quoteToken,
            profitableOrders,
            gasPrice,
            ethFiatPrice,
            tokenFiatPrice
        );
    }

    private async _newOrder(
        order: OrderSummary
    ): Promise<void> {
        if (!this._isStarted || !this._orderService.isConnected()) {
            return;
        }
        const price = this._oraclePriceService.getLastPrice(order.baseToken, order.quoteToken);
        const tokenFiatPrice = this._oraclePriceService.getTokenFiatPrice(order.baseToken, this._configs.PROFIT_ASSET);
        const ethFiatPrice = this._oraclePriceService.getTokenFiatPrice("WETH", this._configs.PROFIT_ASSET);
        if (!price || !tokenFiatPrice || !ethFiatPrice) {
            return;
        }
        const gasPrice = this._gasPriceService.getCurrentGasPrice();
        const profitableOrders = await this._findProfitableOrders(
            [ order, ],
            price,
            tokenFiatPrice,
            gasPrice,
            ethFiatPrice
        );
        if (!profitableOrders.length) {
            return;
        }
        await this._matchAndExecuteTrades(
            order.baseToken,
            order.quoteToken,
            profitableOrders,
            gasPrice,
            ethFiatPrice,
            tokenFiatPrice
        );
    }

    private async _transactionComplete(transactionHash: string, status: boolean) {
        const pendingLiquidation = this._pendingLiquidations[transactionHash];

        if (status) {
            utils.logColor([
                ["Trade successfully completed", "green"],
                [transactionHash, "cyan"],
                "on",
                [pendingLiquidation.baseToken + "/" + pendingLiquidation.quoteToken, "yellow"],
                "for",
                [pendingLiquidation.fiatProfit.toFixed(8) + " " + this._configs.PROFIT_ASSET, "green"],
                "profit",
            ]);
        }
        else {
            utils.logColor([
                ["Trade failed to complete", "red"],
                [transactionHash, "cyan"],
                "on",
                [pendingLiquidation.baseToken + "/" + pendingLiquidation.quoteToken, "yellow"],
                "for",
                [pendingLiquidation.fiatProfit.toFixed(8) + " " + this._configs.PROFIT_ASSET, "green"],
                "profit",
            ]);
        }

        delete this._pendingLiquidations[transactionHash];
    }

    private async _matchAndExecuteTrades(
        baseToken: string,
        quoteToken: string,
        orders: ZeroExOrderEntity[],
        gasPrice: BigNumber,
        ethFiatPrice: BigNumber,
        tokenFiatPrice: BigNumber
    ): Promise<void> {
        const matchedOrders = await this._orderService.matchProfitableOrders(orders);
        let profitableTrades: [SignedOrder, SignedOrder, TradeProfitResult][] = [];
        for (let i = 0, len = orders.length; i < len; i++) {
            const profitableOrder = orders[i];
            const orderHash = orderHashUtils.getOrderHash(profitableOrder);
            if (!(orderHash in matchedOrders)) {
                utils.logColor([
                    "An order for",
                    [profitableOrder.baseToken + "/" + profitableOrder.quoteToken, "yellow"],
                    [profitableOrder.orderType === OrderType.Buy ? "BUY" : "SELL", profitableOrder.orderType === OrderType.Buy ? "green" : "red"],
                    "is in liquidation range but could not be matched to another order by the REST API"
                ]);
                continue;
            }
            const matchedOrder = matchedOrders[orderHash];
            if (!matchedOrder.order || matchedOrder.fillTakerAssetAmount.eq(0)) {
                continue;
            }
            const tradeProfit = await orderUtils.calculateTradeProfit(
                profitableOrder,
                matchedOrder.order,
                gasPrice,
                ethFiatPrice,
                tokenFiatPrice,
                this._configs.MINIMUM_PROFIT_PERCENT,
                baseToken === "WETH"
            );

            if (tradeProfit.isProfitable) {
                profitableTrades.push([
                    profitableOrder,
                    matchedOrder.order,
                    tradeProfit,
                ]);
            }
            else {
                utils.logColor([
                    "An order for",
                    [profitableOrder.baseToken + "/" + profitableOrder.quoteToken, "yellow"],
                    [profitableOrder.orderType === OrderType.Buy ? "BUY" : "SELL", profitableOrder.orderType === OrderType.Buy ? "green" : "red"],
                    "is in liquidation range but would produce a loss of",
                    [tradeProfit.fiatProfit.toFixed(6) + " " + this._configs.PROFIT_ASSET, "red"]
                ]);
            }
        }
        for (let i = 0, len = profitableTrades.length; i < len; i++) {
            const profitableTrade = profitableTrades[i];
            try {
                const transactionHash = await this._tradeService.executeTrade(
                    profitableTrade[0], 
                    profitableTrade[1], 
                    gasPrice
                );

                this._pendingLiquidations[transactionHash] = {
                    baseToken: baseToken,
                    quoteToken: quoteToken,
                    fiatProfit: profitableTrade[2].fiatProfit
                };

                utils.logColor([
                    ["Executing trade", "yellow"],
                    [transactionHash, "cyan"],
                    "on",
                    [baseToken + "/" + quoteToken, "yellow"],
                    "for",
                    [profitableTrade[2].fiatProfit.toFixed(8) + " " + this._configs.PROFIT_ASSET, "green"],
                    "profit",
                ]);
            } catch (err) {
                console.log(err)
            }
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
            const orderProfitable = orderUtils.isOrderProfitable(
                order,
                tokenPrice,
                gasPrice,
                ethFiatPrice,
                tokenFiatPrice,
                this._configs.MINIMUM_PROFIT_PERCENT,
                this._configs.CHAIN_ID,
                order.baseToken === "WETH"
            );
            if (orderProfitable.isProfitable) {
                const zeroExOrder = await this._orderService.getZeroExOrder(order);
                if (zeroExOrder) {
                    profitableOrders.push(zeroExOrder);
                }
            }
            else if (!(order.orderHash in this._unprofitableOrders)) {
                this._unprofitableOrders[order.orderHash] = true;

                utils.logColor([
                    "An order for",
                    [order.baseToken + "/" + order.quoteToken, "yellow"],
                    [order.orderType === OrderType.Buy ? "BUY" : "SELL", order.orderType === OrderType.Buy ? "green" : "red"],
                    "is in liquidation range but would produce a loss of",
                    [orderProfitable.fiatProfit.toFixed(6) + " " + this._configs.PROFIT_ASSET, "red"]
                ]);
            }
        }
        return profitableOrders;
    }
}
