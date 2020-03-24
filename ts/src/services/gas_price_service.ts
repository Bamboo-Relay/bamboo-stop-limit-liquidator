import { BigNumber } from '@0x/utils';
import fetch from 'node-fetch';

import { Configs, EthGasStationResponse } from '../types';
import { NetworkService } from './network_service_interface';

export class GasPriceService implements NetworkService {
    private readonly _configs: Configs;
    private _currentGasPrice: BigNumber = new BigNumber(10000000000);
    private _updateTimer?: NodeJS.Timeout;
    constructor(configs: Configs) {
       this._configs = configs;
    }

    public async start(): Promise<boolean> {
        if (this._updateTimer) {
            await this.stop();
        }

        await this._updateCurrentGasPriceAsync();
        return true;
    }

    public async stop(): Promise<boolean> {
        if (this._updateTimer) {
            clearTimeout(this._updateTimer);
        }

        return true;
    }

    public getCurrentGasPrice(): BigNumber {
        return this._currentGasPrice;
    }

    private _scheduleUpdateTimer(): void {
        this._updateTimer = setTimeout(
            () => this._updateCurrentGasPriceAsync(),
            this._configs.GAS_PRICE_POLL_RATE_MS
        );
    }

    private async _updateCurrentGasPriceAsync(): Promise<void> {
        try {
            const response: EthGasStationResponse = await (await fetch(this._configs.GAS_PRICE_SOURCE)).json();
            this._currentGasPrice = new BigNumber(response.fastest).shiftedBy(8);
        } catch (err) {}

        this._scheduleUpdateTimer();
    }
}
