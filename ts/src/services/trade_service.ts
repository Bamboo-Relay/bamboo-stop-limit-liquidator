import { EventEmitter } from 'events';
import { TxData } from 'ethereum-types';
import { getContractAddressesForChainOrThrow, ContractAddresses } from '@0x/contract-addresses';
import { CoordinatorClient } from '@0x/contracts-coordinator';
import { ContractWrappers, ExchangeContract, DevUtilsContract, ERC20TokenContract } from '@0x/contract-wrappers';
import { PrivateKeyWalletSubprovider, RPCSubprovider, Web3ProviderEngine } from '@0x/subproviders';
import { BigNumber, NULL_ADDRESS } from '@0x/utils';
import { assetDataUtils, ERC20AssetData } from "@0x/order-utils";
import { orderHashUtils } from '@0x/order-utils';
import { SignedOrder } from '@0x/types';
import { createAlchemyWeb3, AlchemyWeb3 } from "@alch/alchemy-web3";

import { 
    Configs,
    Tokens
} from '../types';
import { NetworkService } from './network_service_interface';
import { utils } from '../utils/utils';
import tokens from '../addresses/tokens.json';

interface Allowances {
    [address: string]: BigNumber
}

export declare interface TradeService {
    on(event: 'transactionComplete', listener: (transactionHash: string, status: boolean) => void): this;
    on(event: string, listener: Function): this;
}

export class TradeService extends EventEmitter implements NetworkService {
    private readonly _providerEngine: Web3ProviderEngine;
    private readonly _web3: AlchemyWeb3;
    private readonly _addresses: ContractAddresses;
    private readonly _coordinatorClient: CoordinatorClient;
    private readonly _exchangeContract: ExchangeContract;
    private readonly _devUtilsContract: DevUtilsContract;
    private readonly _privateKeyAddress: string;
    private readonly _chainId: number;
    private _allowances: Allowances;
    private _isStarted = false;
    private _completedOrderHashes: { [orderHash: string]: boolean } = {};
    private _transactionPollTask: NodeJS.Timeout;
    private _pendingTransactions: string[] = [];
    constructor(configs: Configs) {
        super();
        const providerEngine = new Web3ProviderEngine();
        const privateKeyWalletSubprovider = new PrivateKeyWalletSubprovider(configs.PRIVATE_KEY);
        const rpcSubprovider = new RPCSubprovider(configs.ETHEREUM_RPC_HTTP_URL);
        providerEngine.addProvider(privateKeyWalletSubprovider);
        providerEngine.addProvider(rpcSubprovider);
        (providerEngine as any)._ready.go();
        this._providerEngine = providerEngine;
        const addresses = getContractAddressesForChainOrThrow(configs.CHAIN_ID);
        this._addresses = addresses;
        this._coordinatorClient = new CoordinatorClient(addresses.coordinator, providerEngine, configs.CHAIN_ID);
        const contractWrapper = new ContractWrappers(providerEngine, {
            chainId: configs.CHAIN_ID
        });
        this._exchangeContract = contractWrapper.exchange;
        this._devUtilsContract = contractWrapper.devUtils;
        this._privateKeyAddress = utils.getAddressFromPrivateKey(configs.PRIVATE_KEY);
        this._chainId = configs.CHAIN_ID;
        this._web3 = createAlchemyWeb3(configs.ETHEREUM_RPC_HTTP_URL);

        utils.logColor([
            "Using wallet address",
            [this._privateKeyAddress, "cyan"]
        ]);
    }

    public async start(): Promise<boolean> {
        if (this._isStarted) {
            await this.stop();
        }

        if (!Object.keys(this._allowances).length) {
            await this._getAllowances();
        }

        this._isStarted = true;
        return true;
    }

    public async stop(): Promise<boolean> {
        this._isStarted = false;
        return true;
    }

    public async executeTrade(leftOrder: SignedOrder, rightOrder: SignedOrder, gasPrice: BigNumber): Promise<string> {
        const leftOrderHash = orderHashUtils.getOrderHash(leftOrder);
        const rightOrderHash = orderHashUtils.getOrderHash(rightOrder);

        if (leftOrderHash in this._completedOrderHashes ||
            rightOrderHash in this._completedOrderHashes) {
            throw false;
        }

        await this._setAllowances([ leftOrder, rightOrder, ], gasPrice);

        const isCoordinator = leftOrder.senderAddress !== NULL_ADDRESS || rightOrder.senderAddress !== NULL_ADDRESS;
        const protocolFee = gasPrice.times(2).times(150000);
        let transactionHash: string;

        let transactionParams: TxData = {
            gasPrice,
            from: this._privateKeyAddress,
            value: protocolFee,
        };

        if (this._chainId === 1337) {
            transactionParams.gas = 6121975;
        }

        if (isCoordinator) {
            transactionHash = await this._coordinatorClient.matchOrdersAsync(
                leftOrder,
                rightOrder,
                leftOrder.signature,
                rightOrder.signature,
                () => {},
                utils.getCurrentTimestampSeconds(),
                transactionParams
            );
        }
        else {
            transactionHash = await this._exchangeContract.matchOrders(
                leftOrder,
                rightOrder,
                leftOrder.signature,
                rightOrder.signature
            ).sendTransactionAsync(transactionParams);
        }

        this._pendingTransactions.push(transactionHash);

        if (!this._transactionPollTask) {
            this._transactionPollTask = setTimeout(() => this._checkPendingTransactions(), 10000);
        }

        // Mark
        this._completedOrderHashes[leftOrderHash] = true;
        this._completedOrderHashes[rightOrderHash] = true;
        return transactionHash;
    }

    private async _checkPendingTransactions(): Promise<void> {
        let pendingTransactions: string[] = [];
        let count = this._pendingTransactions.length;
        let done = 0;

        for (let i = 0; i < count; i++) {
            const transactionHash = this._pendingTransactions[i];
            if (!transactionHash) {
                continue;
            }
            let isDone = false;

            try {
                const transaction = await this._web3.eth.getTransaction(transactionHash);
                if (transaction.blockNumber) {
                    const receipt = await this._web3.eth.getTransactionReceipt(transactionHash);
                    if (receipt) {
                        isDone = true;
                        this.emit("transactionComplete", transactionHash, receipt.status);
                    }
                }
            }
            catch (err) {
            }

            if (!isDone) {
                pendingTransactions.push(transactionHash);
            }
            else {
                done++;
            }
        }

        this._pendingTransactions = pendingTransactions;

        if (count !== done && pendingTransactions.length) {
            this._transactionPollTask = setTimeout(() => this._checkPendingTransactions(), 10000);
        }
    }

    private async _setAllowances(orders: SignedOrder[], gasPrice: BigNumber): Promise<void> {
        const UNLIMITED = new BigNumber(2).pow(256).minus(1);

        for (let i = 0, len = orders.length; i < len; i++) {
            const order = orders[i];
            const orderTakerToken = (assetDataUtils.decodeAssetDataOrThrow(order.takerAssetData) as ERC20AssetData).tokenAddress;
        
            if (order.takerFee.gt(0) && this._allowances[orderTakerToken].lt(order.takerFee)) {
                await new ERC20TokenContract(orderTakerToken, this._providerEngine).approve(this._addresses.erc20Proxy, UNLIMITED).sendTransactionAsync({
                    gasPrice,
                });
            }
        }
    }

    private async _getAllowances(): Promise<void> {
        const allTokens = (tokens as Tokens)[this._chainId.toString()];
        const assetData = allTokens.map(token => assetDataUtils.encodeERC20AssetData(token.address));
        const proxyAddress = this._addresses.erc20Proxy;
        const allowances = await this._devUtilsContract.getBatchAssetProxyAllowances(proxyAddress, assetData).callAsync();
        for (let i = 0, len = allowances.length; i < len; i++) {
            this._allowances[allTokens[i].address] = allowances[i];
        }
    }
}
