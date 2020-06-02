import { SignedOrder } from '@0x/types';
import { BigNumber } from '@0x/utils';
import * as WebSocket from 'websocket';

export interface Configs {
    CHAIN_ID: number;
    ETHEREUM_RPC_HTTP_URL: string;
    ETHEREUM_RPC_WS_URL: string;
    ETHEREUM_RPC_TYPE: EthereumRpcType;
    ETHEREUM_RPC_CONNECTION_METHOD: EthereumRpcConnectionMethod;
    PRIVATE_KEY: string,
    GAS_PRICE_SOURCE: string;
    GAS_PRICE_POLL_RATE_MS: number;
    RESTRICTED_TOKEN_PAIRS: string[];
    API_TYPE: ApiType;
    API_POLL_RATE: number;
    MINIMUM_PROFIT_PERCENT: BigNumber;
    PROFIT_ASSET: string;
    LOG_FILE: string
}

export enum EthereumRpcType {
    Default = "",
    Infura = "infura",
    Alchemy = "alchemy"
}

export enum EthereumRpcConnectionMethod {
    Polling = "polling",
    WebSocket = "websocket"
}

export enum ApiType {
    Bamboo = "bamboo_relay"
}

export interface Oracle {
    name: string;
    address: string;
    baseToken: string;
    quoteToken: string;
    isFiat: boolean;
    isInverse: boolean;
}

export interface Oracles {
    [chainId: string]: Oracle[]
}

export interface Token {
    symbol: string;
    address: string;
    decimals: number;
}

export interface Tokens {
    [chainId: string]: Token[]
}

export class WebSocketConnection extends WebSocket.connection {
    isAlive: boolean = true;
}

export enum ServerMode {
    HttpPort = "HttpPort",
    UnixSocket = "UnixSocket"
}

export interface EthGasStationResponse {
    fast: number;
    fastest: number;
    safeLow: number;
    average: number;
    safeLowWait: number;
    avgWait: number;
    fastWait: number;
    fastestWait: number;
}

export enum OrderStatus {
    Open = 0,
    Filled = 1,
    Failed = 2
}

export enum OrderType {
    Buy = 0,
    Sell = 1
}

export interface OrderSummary {
    baseToken: string;
    quoteToken: string;
    minPrice: BigNumber;
    maxPrice: BigNumber;
    makerAssetAmount: BigNumber;
    takerAssetAmount: BigNumber;
    takerFee: BigNumber;
    isCoordinated: boolean;
    orderPrice: BigNumber;
    orderHash: string;
    orderType: OrderType;
}

export interface TokenPairOrderSummary {
    [tokenPair: string]: OrderSummary[]
}

export interface OrderHashOrderSummary {
    [orderHash: string]: OrderSummary
}

export enum BambooOrderType {
    BID = 'BID',
    ASK = 'ASK'
}

export enum BambooOrderState {
    OPEN = 'OPEN',
    FILLED = 'FILLED',
    CANCELLED = 'CANCELLED',
    EXPIRED = 'EXPIRED',
    UNFUNDED = 'UNFUNDED'
}

export enum BambooExecutionType {
    LIMIT = "LIMIT",
    STOP_LIMIT = "STOP-LIMIT"
}

/**
 * ZRX Signed Order with included order state.
 */
export interface BambooSignedOrder {
    orderHash: string;
    type: BambooOrderType;
    state: BambooOrderState;
    baseTokenAddress: string;
    quoteTokenAddress: string;
    remainingBaseTokenAmount: string; // Converted amount
    remainingQuoteTokenAmount: string; // Converted amount
    price: string;
    createdDate: string; // Unix timestamp
    createdTimestamp: number;
    signedOrder: SignedOrder;
    isCoordinated: boolean;
    bridgedMarket?: string;
    executionType: BambooExecutionType,
    minPrice?: string,
    maxPrice?: string,
    oracleAddress?: string
}

export interface BambooOrderbook {
    baseTokenAddress: string;
    quoteTokenAddress: string;
    bids: BambooSignedOrder[];
    asks: BambooSignedOrder[];
}

export interface BambooMatchOrdersResponse {
    [orderHash: string]: {
        order: SignedOrder,
        fillTakerAssetAmount: string
    }
}

export interface BambooMatchOrders {
    [orderHash: string]: {
        order: SignedOrder,
        fillTakerAssetAmount: BigNumber
    }
}

export interface TradeProfitResult {
    isProfitable: boolean;
    assetProfit: BigNumber;
    fiatProfit: BigNumber;
}
