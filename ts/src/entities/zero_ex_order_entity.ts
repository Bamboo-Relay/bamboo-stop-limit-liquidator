import { BigNumber } from '@0x/utils';
import { Column, Entity, PrimaryColumn } from 'typeorm';
import { OrderStatus } from '../types';

@Entity({ name: 'zero_ex_order' })
export class ZeroExOrderEntity {
    @PrimaryColumn({ name: 'orderHash', type: 'varchar' })
    public orderHash?: string;

    @Column({ name: 'sender_address', type: 'varchar' })
    public senderAddress?: string;

    @Column({ name: 'maker_address', type: 'varchar' })
    public makerAddress?: string;

    @Column({ name: 'taker_address', type: 'varchar' })
    public takerAddress?: string;

    @Column({ name: 'maker_asset_data', type: 'varchar' })
    public makerAssetData?: string;

    @Column({ name: 'taker_asset_data', type: 'varchar' })
    public takerAssetData?: string;

    @Column({ name: 'exchange_address', type: 'varchar' })
    public exchangeAddress?: string;

    @Column({ name: 'fee_recipient_address', type: 'varchar' })
    public feeRecipientAddress?: string;

    @Column({ name: 'expiration_time_seconds', type: 'varchar' })
    public expirationTimeSeconds?: string;

    @Column({ name: 'maker_fee', type: 'varchar' })
    public makerFee?: string;

    @Column({ name: 'taker_fee', type: 'varchar' })
    public takerFee?: string;

    @Column({ name: 'maker_asset_amount', type: 'varchar' })
    public makerAssetAmount?: string;

    @Column({ name: 'taker_asset_amount', type: 'varchar' })
    public takerAssetAmount?: string;

    @Column({ name: 'salt', type: 'varchar' })
    public salt?: string;

    @Column({ name: 'signature', type: 'varchar' })
    public signature?: string;

    @Column({ name: 'remaining_fillable_taker_asset_amount', type: 'varchar' })
    public remainingFillableTakerAssetAmount?: string;

    @Column({ name: 'maker_fee_asset_data', type: 'varchar' })
    public makerFeeAssetData?: string;

    @Column({ name: 'taker_fee_asset_data', type: 'varchar' })
    public takerFeeAssetData?: string;

    @Column({ name: 'min_price', type: 'numeric', transformer: bigNumberTransformer })
    public minPrice?: BigNumber;

    @Column({ name: 'max_price', type: 'numeric', transformer: bigNumberTransformer })
    public maxPrice?: BigNumber;

    @Column({ name: 'order_price', type: 'numeric', transformer: bigNumberTransformer })
    public orderPrice?: BigNumber;

    @Column({ name: 'oracle_address', type: 'varchar' })
    public oracleAddress?: string;

    @Column({ name: 'asset_pair', type: 'varchar' })
    public assetPair?: string;

    @Column({ name: 'status', type: 'int' })
    public status?: OrderStatus;
    constructor(
        opts: {
            orderHash?: string;
            senderAddress?: string;
            makerAddress?: string;
            takerAddress?: string;
            makerAssetData?: string;
            takerAssetData?: string;
            exchangeAddress?: string;
            feeRecipientAddress?: string;
            expirationTimeSeconds?: string;
            makerFee?: string;
            takerFee?: string;
            makerFeeAssetData?: string;
            takerFeeAssetData?: string;
            makerAssetAmount?: string;
            takerAssetAmount?: string;
            salt?: string;
            signature?: string;
            remainingFillableTakerAssetAmount?: string;
            minPrice?: BigNumber;
            maxPrice?: BigNumber;
            orderPrice?: BigNumber;
            oracleAddress?: string;
            assetPair?: string;
        } = {},
    ) {
        this.orderHash = opts.orderHash;
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
        this.remainingFillableTakerAssetAmount = opts.remainingFillableTakerAssetAmount;
        this.minPrice = opts.minPrice;
        this.maxPrice = opts.maxPrice;
        this.orderPrice = opts.orderPrice;
        this.oracleAddress = opts.oracleAddress;
        this.assetPair = opts.assetPair;
        this.status = OrderStatus.Open;
    }
}
