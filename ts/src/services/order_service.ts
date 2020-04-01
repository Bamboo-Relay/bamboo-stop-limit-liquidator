import { BigNumber, NULL_ADDRESS } from '@0x/utils';
import WebSocket from 'ws';

import { ZeroExOrderEntity } from '../entities/zero_ex_order_entity';
import { 
    BambooOrderbook, 
    BambooOrderType, 
    Configs, 
    Oracle, 
    Oracles, 
    OrderType, 
    OrderSummary, 
    OrderHashOrderSummary, 
    TokenPairOrderSummary 
} from '../types';
import { NetworkService } from './network_service_interface';
import { zeroExOrderModel } from '../models/zero_ex_order_model';
import oracles from '../addresses/oracles.json';
import { utils } from '../utils/utils';
import { orderUtils } from '../utils/order_utils';

export class OrderService implements NetworkService {
    private readonly _configs: Configs;
    private readonly _oracles: Oracle[];
    private readonly _apiUrl: string;
    private _ws: WebSocket;
    private _updateTimer?: NodeJS.Timeout;
    private _ordersByPair: TokenPairOrderSummary = {};
    private _ordersByHash: OrderHashOrderSummary = {};
    constructor(configs: Configs) {
        this._configs = configs;
        switch (configs.CHAIN_ID) {
            default:
                this._apiUrl = "https://rest.bamboorelay.com/main/0x/";
            break;

            case 3:
                this._apiUrl = "https://rest.bamboorelay.com/ropsten/0x/";
            break;

            case 4:
                this._apiUrl = "https://rest.bamboorelay.com/rinkeby/0x/";
            break;

            case 42:
                this._apiUrl = "https://rest.bamboorelay.com/kovan/0x/";
            break;

            case 1337:
                this._apiUrl = "https://localhost.bamboorelay.com/";
        }
        this._oracles = (oracles as Oracles)[configs.CHAIN_ID.toString()];
    }

    public async start(): Promise<boolean> {
        if (this._updateTimer || this._ws) {
            await this.stop();
        }

        await this._loadCachedOrders();
        this._listenWebSocket();
        await this._syncOrdersAsync();
        return true;
    }

    public async stop(): Promise<boolean> {
        if (this._updateTimer) {
            clearTimeout(this._updateTimer);
        }
        if (this._ws) {
            this._ws.close();
        }

        return true;
    }

    public getOrders(baseToken: string, quoteToken: string): OrderSummary[] {
        const tokenPair = baseToken + "-" + quoteToken;

        if (tokenPair in this._ordersByPair) {
            return this._ordersByPair[tokenPair];
        }

        return [];
    }

    public async getZeroExOrder(order: OrderSummary): Promise<ZeroExOrderEntity | undefined> {
        return await zeroExOrderModel.findByOrderHashAsync(order.orderHash);
    }

    private _scheduleUpdateTimer(): void {
        this._updateTimer = setTimeout(
            () => this._syncOrdersAsync(),
            this._configs.API_POLL_RATE
        );
    }

    private async _loadCachedOrders(): Promise<void> {
        // Pull from database
        let ordersByPair: TokenPairOrderSummary = {};
        let ordersByHash: OrderHashOrderSummary = {};

        const currentTimestamp = utils.getCurrentTimestampSeconds();

        for (let i = 0, len = this._oracles.length; i < len; i++) {
            const oracle = this._oracles[i];

            const ordersForPair = await zeroExOrderModel.getOrdersForPairAsync(oracle.baseToken, oracle.quoteToken);

            if (ordersForPair) {
                const tokenPair = oracle.baseToken + "-" + oracle.quoteToken;
                for (let j = 0, len2 = ordersForPair.length; j < len2; j++) {
                    const order = ordersForPair[j];

                    // Cull expired orders
                    if (order.expirationTimeSeconds.lt(currentTimestamp)) {
                        await zeroExOrderModel.deleteAsync(order);
                        continue;
                    }

                    if (!(tokenPair in ordersByPair)) {
                        ordersByPair[tokenPair] = [];
                    }

                    const orderSummary: OrderSummary = {
                        baseToken: oracle.baseToken,
                        quoteToken: oracle.quoteToken,
                        minPrice: order.minPrice,
                        maxPrice: order.maxPrice,
                        orderPrice: order.orderPrice,
                        makerAssetAmount: order.makerAssetAmount,
                        takerAssetAmount: order.takerAssetAmount,
                        takerFee: order.takerFee,
                        isCoordinated: order.senderAddress !== NULL_ADDRESS && order.senderAddress !== "0x",
                        orderHash: order.orderHash,
                        orderType: order.orderType
                    }

                    ordersByPair[tokenPair].push(orderSummary);
                    ordersByHash[order.orderHash] = orderSummary;
                }
            }
        }

        this._ordersByPair = ordersByPair;
        this._ordersByHash = ordersByHash;
    }

    private async _syncOrdersAsync(): Promise<void> {
        let ordersByPair: TokenPairOrderSummary = this._ordersByPair;
        let ordersByHash: OrderHashOrderSummary = this._ordersByHash;

        for (let i = 0, len = this._oracles.length; i < len; i++) {
            const oracle = this._oracles[i];

            try {
                const tokenPair = oracle.baseToken + "-" + oracle.quoteToken;
                const orderBook: BambooOrderbook = await (
                    await fetch(
                        this._apiUrl + "markets/" + tokenPair + "/stopLimitBook"
                    )
                ).json();

                let foundHashes: { [hash: string]: boolean } = {};
                let sides = [orderBook.bids, orderBook.asks];

                for (let j = 0, len2 = 2; j < len2; j++) {
                    for (let k = 0, len3 = sides[j].length; k < len3; k++) {
                        const order = sides[j][k];
                        foundHashes[order.orderHash] = true;

                        if (!(tokenPair in ordersByPair)) {
                            ordersByPair[tokenPair] = [];
                        }

                        const exists = ordersByPair[tokenPair].find(el => el.orderHash === order.orderHash);

                        if (!exists && orderUtils.isValidOrder(order)) {
                            const orderPrice = new BigNumber(order.price);
                            const zeroExOrder = await zeroExOrderModel.createAsync(
                                order.signedOrder,
                                oracle.baseToken,
                                oracle.quoteToken,
                                OrderType.Buy,
                                orderPrice
                            );

                            const orderSummary: OrderSummary = {
                                baseToken: oracle.baseToken,
                                quoteToken: oracle.quoteToken,
                                minPrice: zeroExOrder.minPrice,
                                maxPrice: zeroExOrder.maxPrice,
                                makerAssetAmount: new BigNumber(order.signedOrder.makerAssetAmount),
                                takerAssetAmount: new BigNumber(order.signedOrder.takerAssetAmount),
                                takerFee: new BigNumber(order.signedOrder.takerFee),
                                isCoordinated: order.signedOrder.senderAddress !== NULL_ADDRESS && order.signedOrder.senderAddress !== "0x",
                                orderPrice: orderPrice,
                                orderHash: order.orderHash,
                                orderType: order.type === BambooOrderType.BID ? OrderType.Buy : OrderType.Sell
                            }

                            ordersByPair[tokenPair].push(orderSummary);
                            ordersByHash[order.orderHash] = orderSummary;
                        }
                    }
                }

                for (let j = 0, len2 = ordersByPair[tokenPair].length; j < len2; j++) {
                    const order = ordersByPair[tokenPair][j];

                    if (!(order.orderHash in foundHashes)) {
                        const zeroExOrder = await zeroExOrderModel.findByOrderHashAsync(order.orderHash);
                        if (zeroExOrder) {
                            await zeroExOrderModel.deleteAsync(zeroExOrder);
                        }
                        delete ordersByPair[tokenPair][j];
                        delete ordersByHash[order.orderHash];
                    }
                }
            } catch (err) {

            }
        }

        this._scheduleUpdateTimer();
    }

    private _listenWebSocket(): void {
        this._ws = new WebSocket(this._apiUrl + "ws");

        this._ws.on("message", async (data: string) => {
            const message = JSON.parse(data);

            if ('actions' in message) {
                for (let i = 0, len = message.actions.length; i < len; i++) {
                    const action = message.actions[i];
                    let orderHash: string;
                    const tokenPair: string = action.market;
                    const [baseToken, quoteToken] = tokenPair.split("-");

                    switch (action.action) {
                        case "REMOVE":
                            orderHash = action.event.orderHash;
                            if (orderHash in this._ordersByHash) {
                                const zeroExOrder = await zeroExOrderModel.findByOrderHashAsync(orderHash);
                                if (zeroExOrder) {
                                    await zeroExOrderModel.deleteAsync(zeroExOrder);
                                }
                                const index = this._ordersByPair[tokenPair].findIndex(el => el.orderHash === orderHash);
                                if (index) {
                                    delete this._ordersByPair[tokenPair][index];
                                }
                                delete this._ordersByHash[orderHash];
                            }
                        break;

                        case "NEW":
                            const order = action.event.order;
                            orderHash = order.orderHash;
                            // Stop limit orders and no double-ups
                            if (order.executionType === "STOP-LIMIT" && !(orderHash in this._ordersByHash) && orderUtils.isValidOrder(order)) {
                                const oracle = this._oracles.find(el => el.baseToken === baseToken && el.quoteToken === quoteToken);
                                if (oracle) {
                                    const orderPrice = new BigNumber(order.price);
                                    const zeroExOrder = await zeroExOrderModel.createAsync(
                                        order.signedOrder,
                                        oracle.baseToken,
                                        oracle.quoteToken,
                                        OrderType.Buy,
                                        orderPrice
                                    );

                                    const orderSummary: OrderSummary = {
                                        baseToken: oracle.baseToken,
                                        quoteToken: oracle.quoteToken,
                                        minPrice: zeroExOrder.minPrice,
                                        maxPrice: zeroExOrder.maxPrice,
                                        orderPrice: orderPrice,
                                        makerAssetAmount: new BigNumber(order.signedOrder.makerAssetAmount),
                                        takerAssetAmount: new BigNumber(order.signedOrder.takerAssetAmount),
                                        takerFee: new BigNumber(order.signedOrder.takerFee),
                                        isCoordinated: order.signedOrder.senderAddress !== NULL_ADDRESS && order.signedOrder.senderAddress !== "0x",
                                        orderHash: order.orderHash,
                                        orderType: order.type === BambooOrderType.BID ? OrderType.Buy : OrderType.Sell
                                    }

                                    this._ordersByPair[tokenPair].push(orderSummary);
                                    this._ordersByHash[order.orderHash] = orderSummary;
                                }
                            }
                        break;
                    }
                }
            }
        });

        this._ws.on("open", () => {
            this._ws.send(JSON.stringify({
                type: "SUBSCRIBE", 
                topic: "BOOK",
                market: "ALL",
                requestId: "bamboo-liquidator-" + Math.floor(new Date().getTime()),
                chainId: this._configs.CHAIN_ID
            }));
        });
    }
}
