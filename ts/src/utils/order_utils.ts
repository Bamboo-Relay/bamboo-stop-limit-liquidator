import { BigNumber } from '@0x/utils';
import { SignedOrder } from '@0x/types';
import { assetDataUtils, ERC20AssetData, orderCalculationUtils, orderHashUtils } from "@0x/order-utils";

import { Oracles, Tokens, OrderSummary, OrderType, BambooSignedOrder } from '../types';
import { ZeroExOrderEntity } from '../entities/zero_ex_order_entity';
import oracles from '../addresses/oracles.json';
import tokens from '../addresses/tokens.json';
import { utils } from './utils';

export const orderUtils = {
    isValidOrder: (order: BambooSignedOrder): boolean => {
        if (order.executionType !== "STOP-LIMIT") {
            return false;
        }
        const chainOracles = (oracles as Oracles)[order.signedOrder.chainId.toString()];
        const chainTokens = (tokens as Tokens)[order.signedOrder.chainId.toString()];

        const baseToken = chainTokens.find(el => el.address === order.baseTokenAddress);
        const quoteToken = chainTokens.find(el => el.address === order.quoteTokenAddress);

        if (!baseToken || !quoteToken) {
            return false;
        }

        const oracle = chainOracles.find(el => el.baseToken === baseToken.symbol && el.quoteToken === quoteToken.symbol);
        if (oracle) {
            return true;
        }
        return false;
    },
    isOrderProfitable: (
        orderSummary: OrderSummary,
        price: BigNumber,
        gasPrice: BigNumber,
        ethFiatPrice: BigNumber,
        tokenFiatPrice: BigNumber,
        minimumProfitPercentage: BigNumber
    ): boolean => {
        if (orderSummary.minPrice.lt(price) || orderSummary.maxPrice.gt(price)) {
            return false;
        }

        const priceDifference = orderSummary.orderType === OrderType.Buy
            ? orderSummary.orderPrice.minus(price)
            : price.minus(orderSummary.orderPrice);

        const tradeProfit = orderSummary.orderType === OrderType.Buy
            ? orderSummary.makerAssetAmount.times(priceDifference)
            : orderSummary.takerAssetAmount.times(priceDifference);

        const takerAmountProfit = orderSummary.orderType === OrderType.Buy
            ? tradeProfit.times(orderSummary.makerAssetAmount.dividedBy(orderSummary.takerAssetAmount).integerValue(BigNumber.ROUND_FLOOR))
            : tradeProfit;

        const takerProfit = takerAmountProfit.minus(orderSummary.takerFee);

        // Decimals
        const takerFiatProfit = orderSummary.orderType === OrderType.Buy
            ? takerProfit.dividedBy(tokenFiatPrice)
            : takerProfit.times(tokenFiatPrice);

        // Asume atomic match, i.e. two ZeroExOrders
        const protocolFeeFiat = new BigNumber(150000).times(gasPrice).times(2).shiftedBy(-18).times(ethFiatPrice);

        // Estimate
        const gasCostFiat = new BigNumber(300000).times(gasPrice).times(2).shiftedBy(-18).times(ethFiatPrice);

        const fiatProfit = takerFiatProfit.minus(protocolFeeFiat).minus(gasCostFiat);

        return fiatProfit.gt(0) && fiatProfit.dividedBy(takerFiatProfit).times(100).gte(minimumProfitPercentage);
    },
    async isTradeProfitable(
        stopLimitOrder: SignedOrder,
        matchedOrder: SignedOrder,
        fillTakerAssetAmount: BigNumber,
        gasPrice: BigNumber,
        ethFiatPrice: BigNumber,
        tokenFiatPrice: BigNumber,
        minimumProfitPercentage: BigNumber
        ): Promise<boolean> {
        const chainTokens = (tokens as Tokens)[stopLimitOrder.chainId.toString()];

        const tokenA = (assetDataUtils.decodeAssetDataOrThrow(matchedOrder.takerAssetData) as ERC20AssetData).tokenAddress;
        const tokenB = (assetDataUtils.decodeAssetDataOrThrow(matchedOrder.makerAssetData) as ERC20AssetData).tokenAddress;

        let baseToken = chainTokens.find(el => el.address === tokenA);
        let quoteToken = chainTokens.find(el => el.address === tokenB);
        let orderType = OrderType.Sell;

        if (!baseToken || !quoteToken) {
            baseToken = chainTokens.find(el => el.address === tokenB);
            quoteToken = chainTokens.find(el => el.address === tokenA);
            orderType = OrderType.Buy;
        }

        const fillMakerAssetAmount = orderCalculationUtils.getMakerFillAmount(
            matchedOrder,
            fillTakerAssetAmount
        );

        let makerAssetFilledAmount: BigNumber;

        if (stopLimitOrder.takerAssetAmount.gt(fillMakerAssetAmount)) {
            makerAssetFilledAmount = stopLimitOrder.makerAssetAmount.times(fillMakerAssetAmount).dividedBy(stopLimitOrder.takerAssetAmount).integerValue(BigNumber.ROUND_FLOOR);
        } else {
            makerAssetFilledAmount = stopLimitOrder.makerAssetAmount;
        }

        const profitMakerAsset = makerAssetFilledAmount.minus(fillTakerAssetAmount);

        const profitMakerFiat = orderType === OrderType.Buy
            ? profitMakerAsset.dividedBy(tokenFiatPrice)
            : profitMakerAsset.times(tokenFiatPrice);

        // Asume atomic match, i.e. two ZeroExOrders
        const protocolFeeFiat = new BigNumber(150000).times(gasPrice).times(2).shiftedBy(-18).times(ethFiatPrice);

        // Estimate
        const gasCostFiat = new BigNumber(300000).times(gasPrice).times(2).shiftedBy(-18).times(ethFiatPrice);

        const fiatProfit = profitMakerFiat.minus(protocolFeeFiat).minus(gasCostFiat);

        if (fiatProfit.gt(0) && fiatProfit.dividedBy(profitMakerFiat).times(100).gte(minimumProfitPercentage)) {
            utils.log("Order " + orderHashUtils.getOrderHash(stopLimitOrder) + " is profitable for " + fiatProfit.toFixed(4));

            return true;
        }

        return false;
    },
    deserializeOrder: (signedOrderEntity: ZeroExOrderEntity): SignedOrder => {
        return {
            signature: signedOrderEntity.signature,
            senderAddress: signedOrderEntity.senderAddress,
            makerAddress: signedOrderEntity.makerAddress,
            takerAddress: signedOrderEntity.takerAddress,
            makerFee: new BigNumber(signedOrderEntity.makerFee),
            takerFee: new BigNumber(signedOrderEntity.takerFee),
            makerAssetAmount: new BigNumber(signedOrderEntity.makerAssetAmount),
            takerAssetAmount: new BigNumber(signedOrderEntity.takerAssetAmount),
            makerAssetData: signedOrderEntity.makerAssetData,
            takerAssetData: signedOrderEntity.takerAssetData,
            salt: new BigNumber(signedOrderEntity.salt),
            exchangeAddress: signedOrderEntity.exchangeAddress,
            feeRecipientAddress: signedOrderEntity.feeRecipientAddress,
            expirationTimeSeconds: new BigNumber(signedOrderEntity.expirationTimeSeconds),
            makerFeeAssetData: signedOrderEntity.makerFeeAssetData,
            takerFeeAssetData: signedOrderEntity.takerFeeAssetData,
            chainId: signedOrderEntity.chainId,
        };
    },
};
