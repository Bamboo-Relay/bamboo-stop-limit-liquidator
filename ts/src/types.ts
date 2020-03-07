import { ContractAddresses, ContractWrappers } from '@0x/contract-wrappers';
import { Web3ProviderEngine } from '@0x/subproviders';
import { Order, ZeroExTransaction } from '@0x/types';
import { BigNumber } from '@0x/utils';
import * as WebSocket from 'websocket';

export interface Configs {
    CHAIN_ID: number;
    ETHEREUM_RPC_URL: string;
    ETHEREUM_RPC_TYPE: EthereumRpcType;
    ETHEREUM_RPC_CONNECTION_METHOD: EthereumRpcConnectionMethod;
    GAS_PRICE_SOURCE: string;
    GAS_PRICE_POLL_RATE_MS: number;
    RESTRICTED_TOKEN_PAIRS: string[];
    API_TYPE: ApiType;
    API_POLL_RATE: number;
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

export class WebSocketConnection extends WebSocket.connection {
    isAlive: boolean = true;
}

export enum ServerMode {
    HttpPort = "HttpPort",
    UnixSocket = "UnixSocket"
}

export interface RequestTransactionResponse {
    signatures: string[];
    expirationTimeSeconds: number;
}

export interface CoordinatorApproval {
    txOrigin: string;
    transactionHash: string;
    transactionSignature: string;
    approvalExpirationTimeSeconds: number;
}

export interface Response {
    status: number;
    body?: any;
}

export enum EventTypes {
    FillRequestAccepted = 'FILL_REQUEST_ACCEPTED',
    FillRequestReceived = 'FILL_REQUEST_RECEIVED',
    CancelRequestAccepted = 'CANCEL_REQUEST_ACCEPTED',
}

export interface FillRequestReceivedEvent {
    type: EventTypes;
    data: {
        transactionHash: string;
    };
}

export interface FillRequestAcceptedEvent {
    type: EventTypes;
    data: {
        functionName: string;
        orders: Order[];
        txOrigin: string;
        signedTransaction: ZeroExTransaction;
        approvalSignatures: string[];
        approvalExpirationTimeSeconds: number;
    };
}

export interface CancelRequestAccepted {
    type: EventTypes;
    data: {
        orders: Order[];
        transaction: ZeroExTransaction;
    };
}

export interface OrderHashToFillAmount {
    [orderHash: string]: BigNumber;
}

export type BroadcastMessage = FillRequestReceivedEvent | FillRequestAcceptedEvent | CancelRequestAccepted;

export type BroadcastCallback = (message: BroadcastMessage, chainId: number) => void;

export interface OutstandingFillSignatures {
    approvalSignatures: string[];
    expirationTimeSeconds: number;
    orderHash: string;
    takerAssetFillAmount: BigNumber;
}

export interface FeeRecipient {
    ADDRESS: string;
    PRIVATE_KEY: string;
}

export interface NetworkSpecificSettings {
    FEE_RECIPIENTS: FeeRecipient[];
    RPC_URL: string;
}

export interface ChainIdToContractAddresses {
    [chainId: number]: ContractAddresses;
}
export interface ChainIdToNetworkSpecificSettings {
    [chainId: number]: NetworkSpecificSettings;
}

export interface ChainIdToProvider {
    [chainId: number]: Web3ProviderEngine;
}

export interface ChainIdToContractWrappers {
    [chainId: number]: ContractWrappers;
}

export interface ChainIdToConnectionStore {
    [chainId: number]: Set<WebSocketConnection>;
}

export interface OrderInfo {
    orderStatus: number;
    orderHash: string;
    orderTakerAssetFilledAmount: BigNumber;
}

export interface TraderInfo {
    makerBalance: BigNumber;
    makerAllowance: BigNumber;
    takerBalance: BigNumber;
    takerAllowance: BigNumber;
    makerFeeBalance: BigNumber;
    makerFeeAllowance: BigNumber;
    takerFeeBalance: BigNumber;
    takerFeeAllowance: BigNumber;
}

export interface OrderAndTraderInfo {
    orderInfo: OrderInfo;
    traderInfo: TraderInfo;
}

export enum ExchangeMethods {
    FillOrder = 'fillOrder',
    FillOrKillOrder = 'fillOrKillOrder',
    BatchFillOrders = 'batchFillOrders',
    BatchFillOrKillOrders = 'batchFillOrKillOrders',
    BatchFillOrdersNoThrow = 'batchFillOrdersNoThrow',
    MarketSellOrdersFillOrKill = 'marketSellOrdersFillOrKill',
    MarketSellOrdersNoThrow = 'marketSellOrdersNoThrow',
    MarketBuyOrdersFillOrKill = 'marketBuyOrdersFillOrKill',
    MarketBuyOrdersNoThrow = 'marketBuyOrdersNoThrow',

    CancelOrder = 'cancelOrder',
    BatchCancelOrders = 'batchCancelOrders',
}

export enum OrderStatus {
    Open = 0,
    Filled = 1,
    Failed = 2
}
