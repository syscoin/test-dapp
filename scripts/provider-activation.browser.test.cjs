const assert = require('node:assert/strict');
const test = require('node:test');
const { chromium } = require('playwright');
const { loadDapp } = require('./fixtures/mock-dapp-browser.cjs');

test('a superseded provider cannot apply its late chain, accounts or display name', async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await loadDapp(context, ({ method }) => ({
    result: {
      eth_chainId: '0x1',
      net_version: '1',
      eth_accounts: [],
      eth_getBlockByNumber: {},
    }[method],
  }));
  await page.waitForFunction(
    () =>
      document.querySelector('#activeProviderName').innerText ===
      'Pali test provider',
  );
  for (const delayedMethod of ['eth_chainId', 'eth_accounts']) {
    const expected = await page.evaluate(async (delayed) => {
      const held = Promise.withResolvers();
      const started = Promise.withResolvers();
      const newerName = 'Pali new ' + delayed;
      const newerAccount = '0x' + '22'.repeat(20);
      const announce = (name, chain, account, slow) => {
        const provider = {
          async request({ method }) {
            if (slow && method === delayed) {
              started.resolve();
              await held.promise;
            }
            return {
              eth_chainId: chain,
              net_version: String(Number(chain)),
              eth_accounts: [account],
              eth_getBlockByNumber: {},
            }[method];
          },
        };
        window.dispatchEvent(
          new CustomEvent('eip6963:announceProvider', {
            detail: {
              provider,
              info: {
                uuid: crypto.randomUUID(),
                name,
                rdns: 'test.pali.activation',
                icon: '',
              },
            },
          }),
        );
      };
      announce('Pali old ' + delayed, '0x1', '0x' + '11'.repeat(20), true);
      await started.promise;
      announce(newerName, '0x2', newerAccount, false);
      window.releaseOldProvider = held.resolve;
      return { name: newerName, account: newerAccount };
    }, delayedMethod);
    await page.waitForFunction(
      (name) =>
        document.querySelector('#activeProviderName').innerText === name,
      expected.name,
    );
    const shown = await page.evaluate(async () => {
      window.releaseOldProvider();
      await new Promise((resolve) => setTimeout(resolve, 0));
      return ['activeProviderName', 'chainId', 'accounts'].map(
        (id) => document.getElementById(id).innerText,
      );
    });
    assert.deepEqual(shown, [expected.name, '0x2', expected.account]);
  }
});

test('the install action is available without an injected wallet', async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await loadDapp(context);
  const connect = page.locator('#connectButton');
  assert.equal(await connect.isEnabled(), true);
  assert.equal(await connect.innerText(), 'Click here to install MetaMask!');
  await connect.click();
  assert.equal(await connect.innerText(), 'Onboarding in progress');
});
