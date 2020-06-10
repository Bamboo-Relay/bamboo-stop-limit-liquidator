import { BigNumber } from '@0x/utils';
import { EventEmitter } from 'events';
import { createAlchemyWeb3, AlchemyWeb3 } from "@alch/alchemy-web3";
import { Log } from "web3-core";
import { Subscription } from "web3-eth";
import * as AbiDecoder from 'abi-decoder';

import { Configs, Oracle, Oracles } from '../types';
import { NetworkService } from './network_service_interface';
import oracles from '../addresses/oracles.json';
import AnswerUpdatedABI from '../abi/AnswerUpdated.json';
import latestAnswerABI from '../abi/latestAnswer.json';
import { utils } from '../utils/utils';

const ANSWER_UPDATED_LOG_TOPIC = "0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f";

AbiDecoder.addABI(AnswerUpdatedABI);

export declare interface OraclePriceService {
    on(event: 'priceUpdated', listener: (baseToken: string, quoteToken: string, price: BigNumber) => void): this;
    on(event: string, listener: Function): this;
}

export class OraclePriceService extends EventEmitter implements NetworkService {
    private readonly _configs: Configs;
    private readonly _oracles: Oracle[];
    private readonly _web3: AlchemyWeb3;
    private _subscription?: Subscription<Log>;
    private _lastPrices: { [tokenPair: string]: BigNumber } = {};
    private _updateTimer?: NodeJS.Timeout;
    constructor(configs: Configs) {
        super();
        this._configs = configs;
        this._oracles = (oracles as Oracles)[configs.CHAIN_ID.toString()];
        this._web3 = createAlchemyWeb3(
            configs.ETHEREUM_RPC_WS_URL
        );
    }

    public async start(): Promise<boolean> {
        if (this._subscription) {
            await this.stop();
        }

        this._subscription = this._web3.eth.subscribe("logs", {
            address: this._oracles.map(oracle => oracle.address),
            topics: [ ANSWER_UPDATED_LOG_TOPIC ]
        }, (error: Error, log: Log) => this._log(error, log));

        await this._updateAllAsync();

        return true;
    }

    public async stop(): Promise<boolean> {
        if (this._updateTimer) {
            clearTimeout(this._updateTimer);
        }

        if (this._subscription) {
            await this._subscription.unsubscribe();
        }

        return true;
    }

    public async triggerAll(): Promise<void> {
        for (let i = 0, len = this._oracles.length; i < len; i++) {
            const oracle = this._oracles[i];
            const tokenPair = oracle.baseToken + "-" + oracle.quoteToken;

            if (tokenPair in this._lastPrices) {
                this._emitPriceUpdate(oracle, this._lastPrices[tokenPair]);
            }
        }
    }

    private _scheduleUpdateTimer(): void {
        this._updateTimer = setTimeout(
            () => this._updateAllAsync(),
            this._configs.GAS_PRICE_POLL_RATE_MS
        );
    }

    public async _updateAllAsync(): Promise<void> {
        const oracleContract = new this._web3.eth.Contract(latestAnswerABI as any);
        for (let i = 0, len = this._oracles.length; i < len; i++) {
            const oracle = this._oracles[i];
            oracleContract.address = oracle.address;
            try {
                const price = new BigNumber(await oracleContract.methods.latestAnswer().call());
                if (price.gt(0)) {
                    this._updatePrice(oracle, price);
                }
                else {
                    utils.logColor([
                        "Oracle for",
                        [oracle.baseToken + "/" + oracle.quoteToken, "yellow"],
                        "value is returning a",
                        ["zero value", "red"]
                    ]);
                }
            } catch (err) {
                console.log(err);
            }
        }

        this._scheduleUpdateTimer();
    }

    public getLastPrice(baseToken: string, quoteToken: string): BigNumber | undefined {
        const tokenPair = baseToken + "-" + quoteToken;

        if (tokenPair in this._lastPrices) {
            return this._lastPrices[tokenPair];
        }
    }

    public getTokenFiatPrice(token: string, fiatAsset: string): BigNumber | undefined {
        const isUSD = fiatAsset === "USD";

        const wethUSD = (
            "WETH-USD" in this._lastPrices 
                ? this._lastPrices["WETH-USD"].shiftedBy(-8)
                : (
                    "USD-WETH" in this._lastPrices
                    ? new BigNumber(1).dividedBy(this._lastPrices["USD-WETH"].shiftedBy(-8))
                    : new BigNumber(0)
                )
        );

        if (wethUSD.gt(0)) {
            let wethFiat!: BigNumber;

            if (isUSD) {
                wethFiat = wethUSD;
            }
            else if (fiatAsset + "-USD" in this._lastPrices) {
                const fiatToUSD = this._lastPrices[fiatAsset + "-USD"].shiftedBy(-8);

                wethFiat = wethUSD.times(fiatToUSD);
            }
            else {
                return;
            }

            if (token === "WETH") {
                return wethFiat;
            }

            if (token + "-WETH" in this._lastPrices) {
                const tokenWETH = this._lastPrices[token + "-WETH"].shiftedBy(-18);

                return tokenWETH.times(wethFiat);
            }
        }
    }

    private _log(error: Error, log: Log): void {
        if (error) {
            return;
        }

        try {
            const decodedLog = AbiDecoder.decodeLogs([ log ])[0];
            const price = new BigNumber(decodedLog.events[0].value);
            const oracle = this._oracles.find((value: Oracle): any => {
                if (value.address === log.address.toLowerCase()) {
                    return oracle;
                }
            });

            if (oracle) {
                this._updatePrice(oracle, price);
            }
        } catch (err) {
            console.log(err)
        }
    }

    private _updatePrice(oracle: Oracle, price: BigNumber): void {
        const pair = oracle.baseToken + "-" + oracle.quoteToken;
        const adjustedPrice = oracle.isInverse 
            ? new BigNumber(1).dividedBy(price.shiftedBy(-(oracle.isFiat ? 8 : 18))).shiftedBy((oracle.isFiat ? 8 : 18))
            : price;

        if (!(pair in this._lastPrices) || !this._lastPrices[pair].eq(adjustedPrice)) {
            // Inverse for some pairs WETH/DAI - DAI/WETH
            this._lastPrices[pair] = adjustedPrice;
            utils.logColor([
                "Updated oracle for",
                [oracle.baseToken + "/" + oracle.quoteToken, "yellow"],
                "value is",
                [adjustedPrice.shiftedBy(-(oracle.isFiat ? 8 : 18)).toFixed(8), "cyan"]
            ]);
            this._emitPriceUpdate(oracle, adjustedPrice);            
        }
    }

    private _emitPriceUpdate(oracle: Oracle, price: BigNumber): void {
        if (!oracle.isFiat) {
            this.emit("priceUpdated", oracle.baseToken, oracle.quoteToken, price);
        }
    }
}
