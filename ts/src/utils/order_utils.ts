import { BigNumber } from '@0x/utils';
import { SignedOrder } from '@0x/types';
import { assetDataUtils, ERC20AssetData } from "@0x/order-utils";

import { Oracles, Tokens, OrderSummary, OrderType, TradeProfitResult, BambooSignedOrder } from '../types';
import { ZeroExOrderEntity } from '../entities/zero_ex_order_entity';
import oracles from '../addresses/oracles.json';
import tokens from '../addresses/tokens.json';

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
        minimumProfitPercentage: BigNumber,
        chainId: number,
        isInverse = false
    ): TradeProfitResult => {
        const checkPrice = isInverse
            ? new BigNumber(1).dividedBy(price.shiftedBy(-18)).shiftedBy(18)
            : price;

        // Need to check against the raw oracle value
        if (orderSummary.minPrice.gt(checkPrice) || orderSummary.maxPrice.lt(checkPrice)) {
            return {
                isProfitable: false,
                fiatProfit: new BigNumber(0),
                assetProfit: new BigNumber(0),
            };
        }

        const chainTokens = (tokens as Tokens)[chainId.toString()];

        const baseToken = chainTokens.find(el => el.symbol === orderSummary.baseToken);
        const quoteToken = chainTokens.find(el => el.symbol === orderSummary.quoteToken);

        if (!baseToken || !quoteToken) {
            return {
                isProfitable: false,
                fiatProfit: new BigNumber(0),
                assetProfit: new BigNumber(0),
            };
        }

        const shiftedPrice = price.shiftedBy(-18);

        // We need to fill the taker amount,maker amount minus - taker / divided by price,
        const tradeProfit = orderSummary.orderType === OrderType.Buy
            ? orderSummary.makerAssetAmount.minus(orderSummary.takerAssetAmount.times(shiftedPrice))
            : orderSummary.makerAssetAmount.minus(orderSummary.takerAssetAmount.dividedBy(shiftedPrice));

        const takerProfit = tradeProfit.minus(orderSummary.takerFee).shiftedBy(
            orderSummary.orderType === OrderType.Buy
                ? -quoteToken.decimals
                : -baseToken.decimals
        );

        // Decimals
        let takerFiatProfit;

        if (isInverse) {
            takerFiatProfit = orderSummary.orderType === OrderType.Buy
                ? takerProfit.dividedBy(ethFiatPrice).times(tokenFiatPrice)
                : takerProfit.times(ethFiatPrice);
        }
        else {
            takerFiatProfit = orderSummary.orderType === OrderType.Buy
                ? takerProfit.times(ethFiatPrice)
                : takerProfit.times(tokenFiatPrice);
        }

        // Asume atomic match, i.e. two ZeroExOrders
        const protocolFeeFiat = new BigNumber(150000).times(gasPrice).times(2).shiftedBy(-18).times(ethFiatPrice);
        const gasCostFiat = new BigNumber(360000).times(gasPrice).shiftedBy(-18).times(ethFiatPrice);
        const fiatProfit = takerFiatProfit.minus(protocolFeeFiat).minus(gasCostFiat);

        return {
            isProfitable: fiatProfit.gt(0) && fiatProfit.dividedBy(takerFiatProfit).times(100).gte(minimumProfitPercentage),
            fiatProfit: fiatProfit,
            assetProfit: takerProfit,
        };
    },
    async calculateTradeProfit(
        stopLimitOrder: SignedOrder,
        matchedOrder: SignedOrder,
        gasPrice: BigNumber,
        ethFiatPrice: BigNumber,
        tokenFiatPrice: BigNumber,
        minimumProfitPercentage: BigNumber,
        isInverse = false
        ): Promise<TradeProfitResult> {
        const chainTokens = (tokens as Tokens)[stopLimitOrder.chainId.toString()];
        const chainOracles = (oracles as Oracles)[stopLimitOrder.chainId.toString()];

        const tokenAAddress = (assetDataUtils.decodeAssetDataOrThrow(matchedOrder.takerAssetData) as ERC20AssetData).tokenAddress;
        const tokenBAddress = (assetDataUtils.decodeAssetDataOrThrow(matchedOrder.makerAssetData) as ERC20AssetData).tokenAddress;

        let tokenA = chainTokens.find(el => el.address === tokenAAddress);
        let tokenB = chainTokens.find(el => el.address === tokenBAddress);

        let baseToken;
        let quoteToken;

        if (!tokenA || !tokenB) {
            return {
                isProfitable: false,
                fiatProfit: new BigNumber(0),
                assetProfit: new BigNumber(0),
            };
        }

        let orderType: OrderType = OrderType.Buy;

        for (let i = 0, len = chainOracles.length; i < len; i++) {
            const oracle = chainOracles[i];

            if (oracle.baseToken === tokenA!.symbol && oracle.quoteToken === tokenB!.symbol) {
                baseToken = tokenA;
                quoteToken = tokenB;

                orderType = OrderType.Sell;
            }
            else if (oracle.baseToken === tokenB!.symbol && oracle.quoteToken === tokenA!.symbol) {
                baseToken = tokenB;
                quoteToken = tokenA;

                orderType = OrderType.Buy;
            }
        }
        
        if (!baseToken || !quoteToken) {
            return {
                isProfitable: false,
                fiatProfit: new BigNumber(0),
                assetProfit: new BigNumber(0),
            };
        }

        let matchedFilledAmount: BigNumber;

        if (stopLimitOrder.takerAssetAmount.gt(matchedOrder.makerAssetAmount)) {
            matchedFilledAmount = matchedOrder.takerAssetAmount;
        }
        else {
            matchedFilledAmount = matchedOrder.takerAssetAmount.multipliedBy(stopLimitOrder.takerAssetAmount)
                .plus(matchedOrder.makerAssetAmount.minus(1))
                .dividedBy(matchedOrder.makerAssetAmount);
        }

        const tradeProfit = stopLimitOrder.makerAssetAmount.minus(matchedFilledAmount);

        const takerProfit = tradeProfit.minus(stopLimitOrder.takerFee).minus(matchedOrder.takerFee).shiftedBy(
            orderType === OrderType.Buy
                ? -quoteToken.decimals
                : -baseToken.decimals
        );

        let takerFiatProfit;

        if (isInverse) {
            takerFiatProfit = orderType === OrderType.Buy
                ? takerProfit.dividedBy(ethFiatPrice).times(tokenFiatPrice)
                : takerProfit.times(ethFiatPrice);
        }
        else {
            takerFiatProfit = orderType === OrderType.Buy
                ? takerProfit.times(ethFiatPrice)
                : takerProfit.times(tokenFiatPrice);
        }

        // Asume atomic match, i.e. two ZeroExOrders
        const protocolFeeFiat = new BigNumber(150000).times(gasPrice).times(2).shiftedBy(-18).times(ethFiatPrice);
        const gasCostFiat = new BigNumber(360000).times(gasPrice).shiftedBy(-18).times(ethFiatPrice);
        const fiatProfit = takerFiatProfit.minus(protocolFeeFiat).minus(gasCostFiat);

        return {
            isProfitable: fiatProfit.gt(0) && fiatProfit.dividedBy(takerFiatProfit).times(100).gte(minimumProfitPercentage),
            fiatProfit: fiatProfit,
            assetProfit: takerProfit,
        };
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
    jsonToOrder: (json: any): SignedOrder => {
        return {
            signature: json.signature,
            senderAddress: json.senderAddress,
            makerAddress: json.makerAddress,
            takerAddress: json.takerAddress,
            makerFee: new BigNumber(json.makerFee),
            takerFee: new BigNumber(json.takerFee),
            makerAssetAmount: new BigNumber(json.makerAssetAmount),
            takerAssetAmount: new BigNumber(json.takerAssetAmount),
            makerAssetData: json.makerAssetData,
            takerAssetData: json.takerAssetData,
            salt: new BigNumber(json.salt),
            exchangeAddress: json.exchangeAddress,
            feeRecipientAddress: json.feeRecipientAddress,
            expirationTimeSeconds: new BigNumber(json.expirationTimeSeconds),
            makerFeeAssetData: json.makerFeeAssetData,
            takerFeeAssetData: json.takerFeeAssetData,
            chainId: json.chainId,
        };
    },
};
