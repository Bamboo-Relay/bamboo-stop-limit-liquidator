## Table of contents

-   [Introduction](#introduction)
-   [Getting started](#getting-started)
-   [Commands](#commands)
-   [Database](#database)
-   [Deployment](#deployment)
-   [Legal Disclaimer](#legal-disclaimer)

## Introduction

A client implementation for [0x stop limit order](https://github.com/0xProject/0x-protocol-specification/blob/master/order-types/stop-limit.md) liquidations on [Bamboo Relay](bamboorelay.com/). This initial release supports [Chainlink oracles](https://feeds.chain.link/) as the reference price data.

Clone this repository to get started.

## Warning

Please note this is alpha software. It is highly unlikely to turn a profit running liquidations and you will expose yourself to price movements having paid for the cost of a transaction in Ether.

## Getting started

#### Pre-requirements

-   [Node.js](https://nodejs.org/en/download/) > v8.x
-   [Yarn](https://yarnpkg.com/en/) > v1.x
-   [Docker](https://www.docker.com/products/docker-desktop) > 19.x
-   Ethereum RPC provider such as [Alchemy](https://alchemyapi.io/signup)
-   Ethereum Wallet with some Ether

To get a local development version of `bamboo-stop-limit-liquidator` running:

1. Clone the repo.

2. Create an `.env` file and copy the content from the `.env_example` file. Defaults are defined in `config.ts`/`config.js`. The bash environment takes precedence over the `.env` file. If you run `source .env`, changes to the `.env` file will have no effect until you unset the colliding variables.

| Environment Variable                   | Default                                                         | Description                                                                                                                                                                                               |
| -------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CHAIN_ID`                             | Required. No default.                                           | The chain id you'd like the liquidator to run on (e.g: `1` -> mainnet, `42` -> Kovan, `3` -> Ropsten, `1337` -> Ganache).                    |
| `ETHEREUM_RPC_HTTP_URL`                | Required. No default.                                           | The HTTP URL used to issue JSON RPC requests.                                                                                                     |
| `ETHEREUM_RPC_WS_URL`                  | Required. No default.                                           | The WebSocket URL used to issue JSON RPC requests.                                                                                                                    |
| `PRIVATE_KEY`                          | Required. No default                                            | Private key corresponding to the Ethereum address you would like to use for liquidations. This should NOT be 0x prefixed. Keep this value safe. |
| `PROFIT_ASSET`                         | Required. No default                                            | The profit asset that liquidations should be calculated against, valid values are: `USD`, `AUD`, `EUR`, `CHF`, `GBP`, `JPY`.                                                                                                     |
| `LOG_FILE`                             | Optional. Default to `stop-limit.log`                           | File to log the liquidator console output to.                                                                                                      |

3. Make sure you have [Yarn](https://yarnpkg.com/en/) installed.

4. Install the dependencies:

    ```sh
    yarn
    ```
7. Build the project

    ```sh
    yarn build
    ```

6. Start the Liquidator

    ```sh
    yarn start
    ```

7. Alternatively you can run the liquidator as a docker container.

8. Edit `docker-compose.yml` and set the `environment` variables

9. Start docker

    ```sh
    docker-compose up -d
    ```

## Commands

-   `yarn build` - Build the code
-   `yarn start` - Starts the liquidator

## Legal Disclaimer

The laws and regulations applicable to the use and exchange of digital assets and blockchain-native tokens, including through any software developed using the licensed work created by Bamboo Relay Australia Pty Ltd as described here (the “Work”), vary by jurisdiction. As set forth in the Apache License, Version 2.0 applicable to the Work, developers are “solely responsible for determining the appropriateness of using or redistributing the Work,” which includes responsibility for ensuring compliance with any such applicable laws and regulations.
See the Apache License, Version 2.0 for the specific language governing all applicable permissions and limitations: http://www.apache.org/licenses/LICENSE-2.0
