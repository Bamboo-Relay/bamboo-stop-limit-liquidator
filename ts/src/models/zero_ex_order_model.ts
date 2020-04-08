import { BigNumber } from '@0x/utils';
import { orderHashUtils } from '@0x/contracts-test-utils';
import { SignedOrder } from '@0x/types';
import { assetDataUtils, MultiAssetData } from "@0x/order-utils";
import { decodeStopLimitStaticCallData, StopLimitParameters } from '@0x/contracts-integrations';
import * as _ from 'lodash';
import { DeleteResult } from 'typeorm';

import { getDBConnection } from '../db_connection';
import { ZeroExOrderEntity } from '../entities/zero_ex_order_entity';
import { OrderStatus, OrderType } from '../types';

export const zeroExOrderModel = {
    async createAsync(
        order: SignedOrder,
        baseToken: string,
        quoteToken: string,
        orderType: OrderType,
        orderPrice: BigNumber
    ): Promise<ZeroExOrderEntity> {
        const orderHash = zeroExOrderModel.getHash(order);
        let decodedStopLimitData: StopLimitParameters;

        try {
            const decodedMultiData: MultiAssetData = assetDataUtils.decodeAssetDataOrThrow(order.makerAssetData) as MultiAssetData;
            decodedStopLimitData = decodeStopLimitStaticCallData(decodedMultiData.nestedAssetData[1]);
        } catch (err) {
            const decodedMultiData: MultiAssetData = assetDataUtils.decodeAssetDataOrThrow(order.makerFeeAssetData) as MultiAssetData;
            decodedStopLimitData = decodeStopLimitStaticCallData(decodedMultiData.nestedAssetData[1]);
        }

        let orderEntity = new ZeroExOrderEntity({
            orderHash,
            chainId: order.chainId,
            senderAddress: order.senderAddress,
            makerAddress: order.makerAddress,
            takerAddress: order.takerAddress,
            makerAssetData: order.makerAssetData,
            takerAssetData: order.takerAssetData,
            exchangeAddress: order.exchangeAddress,
            feeRecipientAddress: order.feeRecipientAddress,
            expirationTimeSeconds: new BigNumber(order.expirationTimeSeconds),
            makerFee: new BigNumber(order.makerFee),
            takerFee: new BigNumber(order.takerFee),
            makerFeeAssetData: order.makerFeeAssetData,
            takerFeeAssetData: order.takerFeeAssetData,
            makerAssetAmount: new BigNumber(order.makerAssetAmount),
            takerAssetAmount: new BigNumber(order.takerAssetAmount),
            salt: new BigNumber(order.salt),
            signature: order.signature,
            //remainingFillableTakerAssetAmount: order.senderAddress,
            minPrice: decodedStopLimitData.minPrice,
            maxPrice: decodedStopLimitData.maxPrice,
            orderPrice: orderPrice,
            oracleAddress: decodedStopLimitData.oracle,
            baseToken: baseToken,
            quoteToken: quoteToken,
            orderType: orderType
        });
        const connection = getDBConnection();
        orderEntity = await connection.manager.save(ZeroExOrderEntity, orderEntity);
        return orderEntity;
    },
    async findAsync(order: SignedOrder): Promise<ZeroExOrderEntity | undefined> {
        const orderHash = zeroExOrderModel.getHash(order);
        return await zeroExOrderModel.findByOrderHashAsync(orderHash);
    },
    async findByOrderHashAsync(orderHash: string): Promise<ZeroExOrderEntity | undefined> {
        const connection = getDBConnection();
        const orderIfExists = await connection.manager.findOne(ZeroExOrderEntity, orderHash);
        return orderIfExists;
    },
    async updateAsync(order: ZeroExOrderEntity): Promise<ZeroExOrderEntity> {
        const connection = getDBConnection();
        const orderEntity = await connection.manager.save(ZeroExOrderEntity, order);
        return orderEntity;
    },
    async deleteAsync(order: ZeroExOrderEntity): Promise<DeleteResult> {
        const connection = getDBConnection();
        const orderEntity = await connection.manager.delete(ZeroExOrderEntity, order);
        return orderEntity;
    },
    async getOrdersForPairAsync(
        baseToken: string,
        quoteToken: string,
        orderStatus: OrderStatus = OrderStatus.Open
    ): Promise<ZeroExOrderEntity[] | undefined> {
        const connection = getDBConnection();
        const ordersIfExists = await connection.manager.find(ZeroExOrderEntity, {
            where: {
                baseToken,
                quoteToken,
                orderStatus
            }
        });
        return ordersIfExists;
    },
    getHash(order: SignedOrder): string {
        const orderHash = orderHashUtils.getOrderHashHex(order);
        return orderHash;
    },
};
