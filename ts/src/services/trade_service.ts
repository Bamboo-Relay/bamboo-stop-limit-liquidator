import { getContractAddressesForChainOrThrow } from '@0x/contract-addresses';
import { CoordinatorClient } from '@0x/contracts-coordinator';
import { ContractWrappers, ExchangeContract } from '@0x/contract-wrappers';
import { PrivateKeyWalletSubprovider, RPCSubprovider, Web3ProviderEngine } from '@0x/subproviders';
import { BigNumber, NULL_ADDRESS } from '@0x/utils';
import { SignedOrder } from '@0x/types';

import { 
    Configs
} from '../types';
import { NetworkService } from './network_service_interface';
import { utils } from '../utils/utils';

export class TradeService implements NetworkService {
    private readonly _coordinatorClient: CoordinatorClient;
    private readonly _exchangeContract: ExchangeContract;
    private readonly _privateKeyAddress: string;
    private _isStarted = false;
    constructor(configs: Configs) {
        const providerEngine = new Web3ProviderEngine();
        const privateKeyWalletSubprovider = new PrivateKeyWalletSubprovider(configs.PRIVATE_KEY);
        const rpcSubprovider = new RPCSubprovider(configs.ETHEREUM_RPC_HTTP_URL);
        providerEngine.addProvider(privateKeyWalletSubprovider);
        providerEngine.addProvider(rpcSubprovider);
        (providerEngine as any)._ready.go();
        const addresses = getContractAddressesForChainOrThrow(configs.CHAIN_ID);
        this._coordinatorClient = new CoordinatorClient(addresses.coordinator, providerEngine, configs.CHAIN_ID);
        this._exchangeContract = new ContractWrappers(providerEngine, {
            chainId: configs.CHAIN_ID
        }).exchange;
        this._privateKeyAddress = utils.getAddressFromPrivateKey(configs.PRIVATE_KEY);
    }

    public async start(): Promise<boolean> {
        if (this._isStarted) {
            await this.stop();
        }
        this._isStarted = true;
        return true;
    }

    public async stop(): Promise<boolean> {
        this._isStarted = false;
        return true;
    }

    public async executeTrade(leftOrder: SignedOrder, rightOrder: SignedOrder, gasPrice: BigNumber): Promise<string> {
        const isCoordinator = leftOrder.senderAddress !== NULL_ADDRESS || rightOrder.senderAddress !== NULL_ADDRESS;
        const protocolFee = gasPrice.times(2).times(150000);
        let transactionHash: string;

        if (isCoordinator) {
            transactionHash = await this._coordinatorClient.matchOrdersAsync(
                leftOrder,
                rightOrder,
                leftOrder.signature,
                rightOrder.signature,
                () => {},
                utils.getCurrentTimestampSeconds(),
                {
                    gasPrice,
                    from: this._privateKeyAddress,
                    value: protocolFee
                }
            );
        }
        else {
            transactionHash = await this._exchangeContract.matchOrders(
                leftOrder,
                rightOrder,
                leftOrder.signature,
                rightOrder.signature
            ).sendTransactionAsync({
                gasPrice,
                from: this._privateKeyAddress,
                value: protocolFee
            });
        }

        return transactionHash;
    }
}
