# Syscoin Test Dapp

This is a Syscoin-maintained fork of the MetaMask test dapp for manual QA and wallet integration testing.

Currently hosted [here](https://syscoin-test-dapp.vercel.app/).

## Usage

If you wish to use this dapp in your e2e tests, install this package and set up a script of e.g. the following form:

```shell
static-server node_modules/@metamask/test-dapp/dist --port 9011
```

The main page of the test dapp includes a simple UI featuring buttons for common dapp interactions.

There is a second page (`request.html`) that allows making requests directly to the provider using query parameters. This provides a simple way of testing RPC methods using an in-page provider.

It can be used by navigating to `/request.html?method=${METHOD}&params=${PARAMS}` (e.g. `/request.html?method=eth_getLogs&params=[{ "address": "0x0000000000000000000000000000000000000000" }]`). The page will make a request with the given RPC method and parameters using `ethereum.request`, and report the result as plain text.

## Pali Smart Account Testing

The Syscoin fork adds a **Pali Smart Account** card to the main page. Use it with the Pali extension to exercise the full dapp-facing ERC-4337 / ERC-7579 surface:

- `wallet_prepareSmartAccount` — create and register an account with either a passkey (P-256 WebAuthn) or an ECDSA authenticator (connected-key bootstrap or explicit owners + threshold).
- `wallet_getCapabilities` — confirm atomic batch support for the account.
- `wallet_sendCalls` / `wallet_getCallsStatus` / `wallet_showCallsStatus` — run an editable atomic batch, poll its EIP-5792 status (`100` pending, `200` confirmed, `500` reverted, `600` partially reverted) with on-chain receipts, or open the wallet's own status popup. An optional custom batch id exercises dapp-provided ids (resubmitting the same id must fail with `5720`). Helpers load a canonical ERC20 `approve` + spender `transferFrom` batch (one signature, two effects) or append a reverting call to verify that `atomicRequired` rolls the whole batch back.
- `wallet_getSmartAccountModules` — list installed ERC-7579 modules and the active validator.
- `wallet_requestSmartAccountModuleInstall` / `wallet_requestSmartAccountModuleUninstall` — request module install/uninstall (with optional init data and label).

Existing transaction cards can also be used once the smart account is connected as the active account.

## Contributing

### Setup

- Install [Node.js](https://nodejs.org) version 16
  - If you are using [nvm](https://github.com/creationix/nvm#installation) (recommended) running `nvm use` will automatically choose the right node version for you.
- Install [Yarn v1](https://yarnpkg.com/en/docs/install)
- Run `yarn setup` to install dependencies and run any required post-install scripts
  - **Warning:** Do not use the `yarn` / `yarn install` command directly. Use `yarn setup` instead. The normal install command will skip required post-install scripts, leaving your development environment in an invalid state.

### Testing and Linting

Run `yarn lint` to run the linter, or run `yarn lint:fix` to run the linter and fix any automatically fixable issues.

This package has no tests.

### Deploying

The Syscoin fork is deployed by Vercel. Merges to `main` publish to the hosted test dapp, and pull requests receive preview deployments.

Vercel project settings:

- Install command: `yarn install --frozen-lockfile`
- Build command: `yarn build`
- Output directory: `dist`

### Development

#### Elements Must Be Selectable by XPath

All HTML elements should be easily selectable by XPath.
This means that appearances can be misleading.
For example, consider this old bug:

```html
<button
  class="btn btn-primary btn-lg btn-block mb-3"
  id="approveTokensWithoutGas"
  disabled
>
  Approve Tokens Without Gas
</button>
```

This appears on the page as `Approve Tokens Without Gas`. In reality, the value included the whitespace on the second line, and caused XPath queries for the intended value to fail.
