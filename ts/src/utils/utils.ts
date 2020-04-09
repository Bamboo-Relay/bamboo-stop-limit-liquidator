import * as ethUtil from 'ethereumjs-util';
import * as _ from 'lodash';
import * as asciiArt from 'ascii-art';

export const utils = {
    log: (...args: any[]) => {
        // tslint:disable-next-line:no-console
        console.log(...args);
    },
    logColor: (toLog: (string|string[])[]) => {
        let text = "";
        for (let i = 0, len = toLog.length; i < len; i++) {
            let result;
            if (Array.isArray(toLog[i])) {
                result = asciiArt.style(toLog[i][0], toLog[i][1]);
            }
            else {
                result = asciiArt.style(toLog[i] as string, "off");
            }
            if (text) {
                text += " ";
            }
            text += result;
        }
        utils.log(text + asciiArt.style("", "off"));
    },
    showBanner: async (): Promise<string> => {
        return new Promise((resolve, reject) => {
            new asciiArt.Image({
                filepath: __dirname + '/../images/banner.png',
                alphabet: 'variant1',
                width: 40,
                height: 43
            }).write(function(err: Error, rendered: string) {
                if (!err) {
                    console.log(rendered);
                    resolve();
                }
                else {
                    reject(err);
                }
            })
        });
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
