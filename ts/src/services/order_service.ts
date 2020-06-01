import { EventEmitter } from 'events';
import { BigNumber, NULL_ADDRESS } from '@0x/utils';
import WebSocket from 'ws';

import { ZeroExOrderEntity } from '../entities/zero_ex_order_entity';
import { 
    BambooOrderbook, 
    BambooOrderType,
    BambooMatchOrders,
    BambooMatchOrdersResponse,
    Configs, 
    Oracle, 
    Oracles, 
    OrderType, 
    OrderSummary, 
    OrderHashOrderSummary,
    Token,
    Tokens,
    TokenPairOrderSummary 
} from '../types';
import { NetworkService } from './network_service_interface';
import { zeroExOrderModel } from '../models/zero_ex_order_model';
import oracles from '../addresses/oracles.json';
import tokens from '../addresses/tokens.json';
import { utils } from '../utils/utils';
import { orderUtils } from '../utils/order_utils';

export declare interface OrderService {
    on(event: 'newOrder', listener: (order: OrderSummary) => void): this;
    on(event: string, listener: Function): this;
}

export class OrderService extends EventEmitter implements NetworkService {
    private readonly _configs: Configs;
    private readonly _oracles: Oracle[];
    private readonly _tokens: Token[];
    private readonly _apiUrl: string;
    private readonly _wsUrl: string;
    private _ws: WebSocket;
    private _updateTimer?: NodeJS.Timeout;
    private _ordersByPair: TokenPairOrderSummary = {};
    private _ordersByHash: OrderHashOrderSummary = {};
    private _isStarted = false;
    private _isSynced = false;
    private _isWsConnected = false;
    private _lastSyncCount = 0;
    constructor(configs: Configs) {
        super();
        this._configs = configs;
        switch (configs.CHAIN_ID) {
            default:
                this._apiUrl = "https://rest.bamboorelay.com/main/0x/";
                this._wsUrl = "wss://rest.bamboorelay.com/0x/ws";
            break;

            case 3:
                this._apiUrl = "https://rest.bamboorelay.com/ropsten/0x/";
                this._wsUrl = "wss://rest.bamboorelay.com/0x/ws";
            break;

            case 4:
                this._apiUrl = "https://rest.bamboorelay.com/rinkeby/0x/";
                this._wsUrl = "wss://rest.bamboorelay.com/0x/ws";
            break;

            case 42:
                this._apiUrl = "https://rest.bamboorelay.com/kovan/0x/";
                this._wsUrl = "wss://rest.bamboorelay.com/0x/ws";
            break;

            case 1337:
                this._apiUrl = "https://localhost.bamboorelay.com/rest/testrpc/0x/";
                this._wsUrl = "http://localhost:5054/0x/ws";
        }
        this._oracles = (oracles as Oracles)[configs.CHAIN_ID.toString()];
        this._tokens = (tokens as Tokens)[configs.CHAIN_ID.toString()];
    }

    public async start(): Promise<boolean> {
        if (this._isStarted) {
            await this.stop();
        }

        await this._loadCachedOrders();
        this._listenWebSocket();
        this._isSynced = await this._syncOrdersAsync();
        this._isStarted = true;
        return true;
    }

    public async stop(): Promise<boolean> {
        this._isStarted = false;
        if (this._updateTimer) {
            clearTimeout(this._updateTimer);
        }
        if (this._ws) {
            this._ws.close();
        }

        return true;
    }

    public isConnected(): boolean {
        return this._isSynced && this._isWsConnected;
    }

    public getOrders(baseToken: string, quoteToken: string): OrderSummary[] {
        const tokenPair = baseToken + "-" + quoteToken;

        if (tokenPair in this._ordersByPair) {
            return this._ordersByPair[tokenPair].filter(el => el !== null);
        }

        return [];
    }

    public async getZeroExOrder(order: OrderSummary): Promise<ZeroExOrderEntity | undefined> {
        return await zeroExOrderModel.findByOrderHashAsync(order.orderHash);
    }

    public async matchProfitableOrders(orders: ZeroExOrderEntity[]): Promise<BambooMatchOrders> {
        try {
            const response: BambooMatchOrdersResponse = await(
                await fetch(
                    this._apiUrl + "orders/match",
                    {
                        method: 'post',
                        body: JSON.stringify(orders),
                        headers: {'Content-Type': 'application/json'},
                    }
                )
            ).json();

            const result: BambooMatchOrders = {};

            Object.keys(response).forEach(orderHash => 
                result[orderHash] = {
                    order: orderUtils.jsonToOrder(response[orderHash].order),
                    fillTakerAssetAmount: new BigNumber(response[orderHash].fillTakerAssetAmount),
                }
            );

            return result;
        } catch (err) {
            return {};
        }
    }

    private _scheduleUpdateTimer(): void {
        this._updateTimer = setTimeout(
            async () => this._isSynced = await this._syncOrdersAsync(),
            this._configs.API_POLL_RATE
        );
    }

    private async _loadCachedOrders(): Promise<void> {
        // Pull from database
        let ordersByPair: TokenPairOrderSummary = {};
        let ordersByHash: OrderHashOrderSummary = {};
        let cachedOrderCount = 0;
        let validPairs = 0;

        const currentTimestamp = utils.getCurrentTimestampSeconds();

        for (let i = 0, len = this._oracles.length; i < len; i++) {
            const oracle = this._oracles[i];

            if (oracle.isFiat) {
                continue;
            }

            validPairs++;

            const ordersForPair = await zeroExOrderModel.getOrdersForPairAsync(oracle.baseToken, oracle.quoteToken);

            if (ordersForPair) {
                const tokenPair = oracle.baseToken + "-" + oracle.quoteToken;
                const nicePair = oracle.baseToken + "/" + oracle.quoteToken;
                const baseToken = this._tokens.find(el => el.symbol === oracle.baseToken);
                const quoteToken = this._tokens.find(el => el.symbol === oracle.quoteToken);

                if (!baseToken || !quoteToken) {
                    continue;
                }

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
                    cachedOrderCount++;

                    let minPrice: BigNumber;
                    let maxPrice: BigNumber;

                    if (oracle.isInverse) {
                        minPrice = new BigNumber(1).dividedBy(new BigNumber(
                            order.minPrice
                        ).shiftedBy(-18));
                        maxPrice = new BigNumber(1).dividedBy(new BigNumber(
                            order.maxPrice
                        ).shiftedBy(-18));
                    }
                    else {
                        minPrice = new BigNumber(order.minPrice).shiftedBy(-18);
                        maxPrice = new BigNumber(order.maxPrice).shiftedBy(-18);
                    }

                    utils.logColor([
                        "Loaded",
                        [nicePair, "yellow"],
                        [order.orderType === OrderType.Buy ? "BUY" : "SELL", order.orderType === OrderType.Buy ? "green" : "red"],
                        [new BigNumber(
                            order.orderType === OrderType.Buy
                                ? order.takerAssetAmount
                                : order.makerAssetAmount
                        )
                        .shiftedBy(-baseToken.decimals).toFixed(6), "cyan", true],
                        ["@", "yellow", true],
                        [new BigNumber(order.orderPrice).toFixed(6), "cyan"],
                        "(Trigger",
                        [minPrice.toFixed(6), "cyan"],
                        "-",
                        [maxPrice.toFixed(6), "cyan", true],
                        ")"
                    ]);
                }
            }
        }

        this._ordersByPair = ordersByPair;
        this._ordersByHash = ordersByHash;

        utils.log("Loaded " + utils.pluralize(cachedOrderCount, "cached order") + " for " + utils.pluralize(validPairs, "pair"));
    }

    private async _syncOrdersAsync(): Promise<boolean> {
        let ordersByPair: TokenPairOrderSummary = this._ordersByPair;
        let ordersByHash: OrderHashOrderSummary = this._ordersByHash;
        let success = true;
        let foundOrderCount = 0;
        let validPairs = 0;
        let didChange = false;

        for (let i = 0, len = this._oracles.length; i < len; i++) {
            const oracle = this._oracles[i];

            if (oracle.isFiat) {
                continue;
            }

            validPairs++;

            try {
                const tokenPair = oracle.baseToken + "-" + oracle.quoteToken;
                const nicePair = oracle.baseToken + "/" + oracle.quoteToken;
                const baseToken = this._tokens.find(el => el.symbol === oracle.baseToken);
                const quoteToken = this._tokens.find(el => el.symbol === oracle.quoteToken);

                if (!baseToken || !quoteToken) {
                    continue;
                }

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

                        foundOrderCount++;
                        const exists = ordersByPair[tokenPair].find(el => el && el.orderHash === order.orderHash);

                        if (!exists && orderUtils.isValidOrder(order)) {
                            const orderPrice = new BigNumber(order.price);
                            const zeroExOrder = await zeroExOrderModel.createAsync(
                                order.signedOrder,
                                oracle.baseToken,
                                oracle.quoteToken,
                                order.type === BambooOrderType.BID ? OrderType.Buy : OrderType.Sell,
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

                            let minPrice: BigNumber;
                            let maxPrice: BigNumber;

                            if (oracle.isInverse) {
                                minPrice = new BigNumber(1).dividedBy(new BigNumber(
                                    zeroExOrder.minPrice
                                ).shiftedBy(-18));
                                maxPrice = new BigNumber(1).dividedBy(new BigNumber(
                                    zeroExOrder.maxPrice
                                ).shiftedBy(-18));
                            }
                            else {
                                minPrice = new BigNumber(zeroExOrder.minPrice).shiftedBy(-18);
                                maxPrice = new BigNumber(zeroExOrder.maxPrice).shiftedBy(-18);
                            }

                            utils.logColor([
                                "Order added for",
                                [nicePair, "yellow"],
                                [order.type === BambooOrderType.BID ? "BUY" : "SELL", order.type === BambooOrderType.BID ? "green" : "red"],
                                [new BigNumber(order.remainingBaseTokenAmount).toFixed(6), "cyan", true],
                                ["@", "yellow", true],
                                [new BigNumber(zeroExOrder.orderPrice).toFixed(6), "cyan"],
                                "(Trigger",
                                [minPrice.toFixed(6), "cyan"],
                                "-",
                                [maxPrice.toFixed(6), "cyan", true],
                                ")"
                            ]);

                            didChange = true;
                        }
                    }
                }

                if (tokenPair in ordersByPair) {
                    for (let j = 0, len2 = ordersByPair[tokenPair].length; j < len2; j++) {
                        const order = ordersByPair[tokenPair][j];

                        if (order && !(order.orderHash in foundHashes)) {
                            const zeroExOrder = await zeroExOrderModel.findByOrderHashAsync(order.orderHash);
                            if (zeroExOrder) {
                                await zeroExOrderModel.deleteAsync(zeroExOrder);
                            }
                            delete ordersByPair[tokenPair][j];
                            delete ordersByHash[order.orderHash];

                            didChange = true;
                        }
                    }
                }
            } catch (err) {
                success = false;

                // Orderbook likely empty / does not exist
                if (!('type' in err) || err.type !== "invalid-json") {
                    utils.log(err);
                }
            }
        }

        if (this._lastSyncCount !== foundOrderCount || didChange) {
            this._lastSyncCount = foundOrderCount;
            utils.log("Synced " + utils.pluralize(foundOrderCount, "order") + " for " + utils.pluralize(validPairs, "pair"));
        }

        this._scheduleUpdateTimer();
        return success;
    }

    private _listenWebSocket(): void {
        let isAlive = true;
        this._ws = new WebSocket(this._wsUrl);

        this._ws.on('pong', () => isAlive = true);

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
                                if (tokenPair in this._ordersByPair) {
                                    const index = this._ordersByPair[tokenPair].findIndex(el => el && el.orderHash === orderHash);
                                    if (index) {
                                        delete this._ordersByPair[tokenPair][index];
                                    }
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
                                        order.type === BambooOrderType.BID ? OrderType.Buy : OrderType.Sell,
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

                                    if (!(tokenPair in this._ordersByPair)) {
                                        this._ordersByPair[tokenPair] = [];
                                    }

                                    this._ordersByPair[tokenPair].push(orderSummary);
                                    this._ordersByHash[order.orderHash] = orderSummary;

                                    let minPrice: BigNumber;
                                    let maxPrice: BigNumber;

                                    if (oracle.isInverse) {
                                        minPrice = new BigNumber(1).dividedBy(new BigNumber(
                                            zeroExOrder.minPrice
                                        ).shiftedBy(-18));
                                        maxPrice = new BigNumber(1).dividedBy(new BigNumber(
                                            zeroExOrder.maxPrice
                                        ).shiftedBy(-18));
                                    }
                                    else {
                                        minPrice = new BigNumber(zeroExOrder.minPrice).shiftedBy(-18);
                                        maxPrice = new BigNumber(zeroExOrder.maxPrice).shiftedBy(-18);
                                    }

                                    utils.logColor([
                                        "Order added for",
                                        [oracle.baseToken + "/" + oracle.quoteToken, "yellow"],
                                        [order.type === BambooOrderType.BID ? "BUY" : "SELL", order.type === BambooOrderType.BID ? "green" : "red"],
                                        [new BigNumber(order.remainingBaseTokenAmount).toFixed(6), "cyan", true],
                                        ["@", "yellow", true],
                                        [new BigNumber(zeroExOrder.orderPrice).toFixed(6), "cyan"],
                                        "(Trigger",
                                        [minPrice.toFixed(6), "cyan"],
                                        "-",
                                        [maxPrice.toFixed(6), "cyan", true],
                                        ")"
                                    ]);

                                    this.emit("newOrder", orderSummary);
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
            this._isWsConnected = true;
        });

        this._ws.on("close", () => {
            this._isWsConnected = false;
            // Reconnect
            if (!this._isStarted) {
                setTimeout(() => this._listenWebSocket(), 5000);
            }
        });

        this._ws.on("error", (err) => {
            console.log(err)
        });

        const heartBeat = () => {
            if (!isAlive) {
                this._ws.close();
            }
            else {
                isAlive = false;
                this._ws.ping();
                setTimeout(() => heartBeat, 30000);
            }
        };

        setTimeout(() => heartBeat, 30000);
    }
}
