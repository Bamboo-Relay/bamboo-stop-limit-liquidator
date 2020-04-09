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
        }, this._log);

        this._scheduleUpdateTimer();

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
                    const tokenPair = oracle.baseToken + "-" + oracle.quoteToken;

                    if (!(tokenPair in this._lastPrices) || !this._lastPrices[tokenPair].eq(price)) {
                        this._lastPrices[tokenPair] = price;
                        this._emitPriceUpdate(oracle, price);
                    }
                }
            } catch (err) {
                console.log(err);
            }
        }
    }

    public getLastPrice(baseToken: string, quoteToken: string): BigNumber | undefined {
        const tokenPair = baseToken + "-" + quoteToken;

        if (tokenPair in this._lastPrices) {
            return this._lastPrices[tokenPair];
        }
    }

    public getTokenFiatPrice(token: string, fiatAsset: string): BigNumber | undefined {
        const isUSD = fiatAsset === "USD";

        if ("WETH-USD" in this._lastPrices) {
            const wethUSD = this._lastPrices["WETH-USD"].shiftedBy(-8);
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

                return tokenWETH.dividedBy(wethFiat);
            }
        }
    }

    private _log(error: Error, log: Log): void {
        if (error) {
            return;
        }

        const decodedLog = AbiDecoder.decodeLogs([ log ])[0];
        const price = new BigNumber(decodedLog[0].value);
        const oracle = this._oracles.find((value: Oracle): any => {
            if (value.address === log.address.toLowerCase()) {
                return oracle;
            }
        });

        if (oracle) {
            this._lastPrices[oracle.baseToken + "-" + oracle.quoteToken] = price;

            this._emitPriceUpdate(oracle, price);
        }
    }

    private _emitPriceUpdate(oracle: Oracle, price: BigNumber): void {
        if (!oracle.isFiat) {
            this.emit("priceUpdated", oracle.baseToken, oracle.quoteToken, price);
        }
    }
}
