import * as ethUtil from 'ethereumjs-util';
import * as _ from 'lodash';

export const utils = {
    log: (...args: any[]) => {
        // tslint:disable-next-line:no-console
        console.log(...args);
    },
    getAddressFromPrivateKey(privateKey: string): string {
        const addressBuf = ethUtil.privateToAddress(Buffer.from(privateKey, 'hex'));
        const address = ethUtil.addHexPrefix(addressBuf.toString('hex'));
        return address;
    },
    getCurrentTimestampSeconds(): number {
        return Math.round(Date.now() / 1000);
    },
};
