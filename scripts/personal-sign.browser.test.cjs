const assert = require('node:assert/strict');
const test = require('node:test');
const { Wallet, utils } = require('ethers');
const { chromium } = require('playwright');

const { loadDapp } = require('./fixtures/mock-dapp-browser.cjs');

test('Personal Sign keeps its label after rejection and verifies only the connected signer', async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const connected = new Wallet('0x' + '11'.repeat(32));
  const different = new Wallet('0x' + '22'.repeat(32));
  assert.notEqual(connected.address, connected.address.toLowerCase());
  let attempts = 0;
  const page = await loadDapp(context, async ({ method, params }) => {
    switch (method) {
      case 'eth_accounts':
        return { result: [connected.address] };
      case 'eth_chainId':
        return { result: '0x1' };
      case 'net_version':
        return { result: '1' };
      case 'eth_getBlockByNumber':
        return { result: { baseFeePerGas: '0x1' } };
      case 'personal_sign':
        attempts += 1;
        assert.equal(params[1], connected.address);
        if (attempts === 1) {
          return { error: { code: 4001, message: 'User rejected signing' } };
        }
        return {
          result: await (attempts < 4 ? connected : different).signMessage(
            utils.arrayify(params[0]),
          ),
        };
      case 'personal_ecRecover':
        if (attempts === 2) {
          return { error: { code: -32601, message: 'Method not found' } };
        }
        return {
          result: utils
            .verifyMessage(utils.arrayify(params[0]), params[1])
            .toLowerCase(),
        };
      default:
        return { result: null };
    }
  });
  const sign = page.locator('#personalSign');
  const verify = page.locator('#personalSignVerify');
  const result = page.locator('#personalSignResult');
  const error = page.locator('#personalSignError');
  const sigUtil = page.locator('#personalSignVerifySigUtilResult');
  const ecRecover = page.locator('#personalSignVerifyECRecoverResult');
  await sign.click();
  await error.getByText('Error: User rejected signing').waitFor();
  assert.equal(await sign.innerText(), 'Sign');
  assert.equal(await verify.isEnabled(), false);
  assert.equal(await result.innerText(), '');

  await sign.click();
  await verify.click();
  const matching = connected.address.toLowerCase();
  await ecRecover
    .getByText('Error: Method not found', { exact: true })
    .waitFor();
  assert.equal(await sigUtil.innerText(), matching);
  assert.equal(await sign.innerText(), 'Sign');

  await sign.click();
  await verify.click();
  await sigUtil.getByText(matching, { exact: true }).waitFor();
  await ecRecover.getByText(matching, { exact: true }).waitFor();
  assert.equal(await sign.innerText(), 'Sign');
  assert.equal(await error.innerText(), '');

  await sign.click();
  await verify.click();
  const mismatch = 'Signer does not match the connected account.';
  await sigUtil.getByText(mismatch, { exact: true }).waitFor();
  await ecRecover.getByText(mismatch, { exact: true }).waitFor();
  assert.equal(attempts, 4);
});
