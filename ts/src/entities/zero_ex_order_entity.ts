import { BigNumber } from '@0x/utils';
import { Column, Entity, PrimaryColumn } from 'typeorm';
import { OrderStatus, OrderType } from '../types';
import { bigNumberTransformer } from '../transformers/big_number';

interface ContructorOpts {
    orderHash: string;
    chainId: number;
    senderAddress: string;
    makerAddress: string;
    takerAddress: string;
    makerAssetData: string;
    takerAssetData: string;
    exchangeAddress: string;
    feeRecipientAddress: string;
    expirationTimeSeconds: BigNumber;
    makerFee: BigNumber;
    takerFee: BigNumber;
    makerFeeAssetData: string;
    takerFeeAssetData: string;
    makerAssetAmount: BigNumber;
    takerAssetAmount: BigNumber;
    salt: BigNumber;
    signature: string;
    //remainingFillableTakerAssetAmount: BigNumber;
    minPrice: BigNumber;
    maxPrice: BigNumber;
    orderPrice: BigNumber;
    oracleAddress: string;
    baseToken: string;
    quoteToken: string;
    orderType: OrderType;
}

@Entity({ name: 'zero_ex_order' })
export class ZeroExOrderEntity {
    @PrimaryColumn({ name: 'order_hash', type: 'varchar' })
    public orderHash: string;

    @Column({ name: 'chain_id', type: 'int' })
    public chainId: number;

    @Column({ name: 'sender_address', type: 'varchar' })
    public senderAddress: string;

    @Column({ name: 'maker_address', type: 'varchar' })
    public makerAddress: string;

    @Column({ name: 'taker_address', type: 'varchar' })
    public takerAddress: string;

    @Column({ name: 'maker_asset_data', type: 'varchar' })
    public makerAssetData: string;

    @Column({ name: 'taker_asset_data', type: 'varchar' })
    public takerAssetData: string;

    @Column({ name: 'exchange_address', type: 'varchar' })
    public exchangeAddress: string;

    @Column({ name: 'fee_recipient_address', type: 'varchar' })
    public feeRecipientAddress: string;

    @Column({ name: 'expiration_time_seconds', type: 'varchar', transformer: bigNumberTransformer })
    public expirationTimeSeconds: BigNumber;

    @Column({ name: 'maker_fee', type: 'varchar', transformer: bigNumberTransformer })
    public makerFee: BigNumber;

    @Column({ name: 'taker_fee', type: 'varchar', transformer: bigNumberTransformer })
    public takerFee: BigNumber;

    @Column({ name: 'maker_asset_amount', type: 'varchar', transformer: bigNumberTransformer })
    public makerAssetAmount: BigNumber;

    @Column({ name: 'taker_asset_amount', type: 'varchar', transformer: bigNumberTransformer })
    public takerAssetAmount: BigNumber;

    @Column({ name: 'salt', type: 'varchar', transformer: bigNumberTransformer })
    public salt: BigNumber;

    @Column({ name: 'signature', type: 'varchar' })
    public signature: string;

    @Column({ name: 'remaining_fillable_taker_asset_amount', type: 'varchar', transformer: bigNumberTransformer })
    public remainingFillableTakerAssetAmount: BigNumber;

    @Column({ name: 'maker_fee_asset_data', type: 'varchar' })
    public makerFeeAssetData: string;

    @Column({ name: 'taker_fee_asset_data', type: 'varchar' })
    public takerFeeAssetData: string;

    @Column({ name: 'min_price', type: 'numeric', transformer: bigNumberTransformer })
    public minPrice: BigNumber;

    @Column({ name: 'max_price', type: 'numeric', transformer: bigNumberTransformer })
    public maxPrice: BigNumber;

    @Column({ name: 'order_price', type: 'numeric', transformer: bigNumberTransformer })
    public orderPrice: BigNumber;

    @Column({ name: 'oracle_address', type: 'varchar' })
    public oracleAddress: string;

    @Column({ name: 'base_token', type: 'varchar' })
    public baseToken: string;

    @Column({ name: 'quote_token', type: 'varchar' })
    public quoteToken: string;

    @Column({ name: 'order_type', type: 'int' })
    public orderType: OrderType;

    @Column({ name: 'status', type: 'int' })
    public status: OrderStatus;
    constructor(
        opts: ContructorOpts = {} as ContructorOpts,
    ) {
        this.orderHash = opts.orderHash;
        this.chainId = opts.chainId;
        this.senderAddress = opts.senderAddress;
        this.makerAddress = opts.makerAddress;
        this.takerAddress = opts.takerAddress;
        this.makerAssetData = opts.makerAssetData;
        this.takerAssetData = opts.takerAssetData;
        this.exchangeAddress = opts.exchangeAddress;
        this.feeRecipientAddress = opts.feeRecipientAddress;
        this.expirationTimeSeconds = opts.expirationTimeSeconds;
        this.makerFee = opts.makerFee;
        this.takerFee = opts.takerFee;
        this.makerFeeAssetData = opts.makerFeeAssetData;
        this.takerFeeAssetData = opts.takerFeeAssetData;
        this.makerAssetAmount = opts.makerAssetAmount;
        this.takerAssetAmount = opts.takerAssetAmount;
        this.salt = opts.salt;
        this.signature = opts.signature;
        //this.remainingFillableTakerAssetAmount = opts.remainingFillableTakerAssetAmount;
        this.minPrice = opts.minPrice;
        this.maxPrice = opts.maxPrice;
        this.orderPrice = opts.orderPrice;
        this.oracleAddress = opts.oracleAddress;
        this.baseToken = opts.baseToken;
        this.quoteToken = opts.quoteToken;
        this.orderType = opts.orderType;
        this.status = OrderStatus.Open;
    }
}
