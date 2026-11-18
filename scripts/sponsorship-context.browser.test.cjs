const assert = require('node:assert/strict');
const test = require('node:test');
const { ethers } = require('ethers');
const { chromium } = require('playwright');
const { loadDapp } = require('./fixtures/mock-dapp-browser.cjs');

test(
  'a gas burner deployment cannot survive switching away from its network and back',
  { timeout: 20000 },
  async (t) => {
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const context = await browser.newContext({ serviceWorkers: 'block' });

    const initialChain = '0x7a69';
    const otherChain = '0x7a6a';
    const account = '0x' + '11'.repeat(20);
    const blockHash = '0x' + '22'.repeat(32);
    const receiptRequested = Promise.withResolvers();
    const releaseReceipt = Promise.withResolvers();
    const deployments = [];
    const burns = [];
    let chain = initialChain;

    const rpc = async ({ method, params }) => {
      switch (method) {
        case 'eth_chainId':
          return chain;
        case 'net_version':
          return String(Number(chain));
        case 'eth_accounts':
          return [account];
        case 'eth_blockNumber':
          return '0x1';
        case 'eth_getBlockByNumber':
          return {};
        case 'eth_estimateGas':
          return '0x100000';
        case 'eth_sendTransaction': {
          const [request] = params;
          if (request.to) {
            burns.push(request);
            return '0x' + '33'.repeat(32);
          }
          const nonce = deployments.length;
          const hash = '0x' + (nonce + 1).toString(16).padStart(64, '0');
          deployments.push({
            hash,
            from: account,
            to: null,
            nonce,
            blockHash,
            blockNumber: '0x1',
            transactionIndex: '0x0',
            gas: '0x100000',
            gasPrice: '0x1',
            value: '0x0',
            input: request.data,
            chainId: chain,
            type: '0x0',
          });
          return hash;
        }
        case 'eth_getTransactionByHash':
          return deployments.find(({ hash }) => hash === params[0]);
        case 'eth_getTransactionReceipt': {
          const transaction = deployments.find(
            ({ hash }) => hash === params[0],
          );
          if (transaction.nonce === 0) {
            receiptRequested.resolve();
            await releaseReceipt.promise;
          }
          return {
            from: account,
            to: null,
            contractAddress: ethers.utils.getContractAddress(transaction),
            transactionIndex: '0x0',
            gasUsed: '0x10000',
            cumulativeGasUsed: '0x10000',
            blockHash,
            transactionHash: transaction.hash,
            blockNumber: '0x1',
            logs: [],
            status: '0x1',
            type: '0x0',
          };
        }
        default:
          throw new Error('Unexpected sponsorship RPC method ' + method);
      }
    };

    const page = await loadDapp(context, undefined, {
      setup: async (page) => {
        await page.exposeFunction('sponsorshipRpc', rpc);
        await page.addInitScript(() => {
          const chainListeners = new Set();
          window.ethereum = {
            request: (request) => window.sponsorshipRpc(request),
            on(event, listener) {
              if (event === 'chainChanged') chainListeners.add(listener);
              return this;
            },
            removeListener(event, listener) {
              if (event === 'chainChanged') chainListeners.delete(listener);
              return this;
            },
          };
          window.setSponsorshipChain = (chainId) => {
            for (const listener of chainListeners) listener(chainId);
          };
        });
      },
    });

    await page.evaluate(() => {
      const button = document.getElementById('deploySponsorshipProbeButton');
      const deploy = button.onclick;
      // Observe the async handler through the real button click so assertions
      // run after either acceptance or rejection of the completed deployment.
      button.onclick = (event) => {
        window.sponsorshipDeployment = deploy.call(button, event);
      };
    });

    const deploy = page.locator('#deploySponsorshipProbeButton');
    const burn = page.locator('#burnGasButton');
    const address = page.locator('#sponsorshipAddress');

    await deploy.click();
    await receiptRequested.promise;
    assert.equal(await burn.isDisabled(), true);

    for (const chainId of [otherChain, initialChain]) {
      chain = chainId;
      await page.evaluate((id) => window.setSponsorshipChain(id), chainId);
      assert.equal(await page.locator('#chainId').innerText(), chainId);
    }

    releaseReceipt.resolve();
    await page.evaluate(() => window.sponsorshipDeployment);
    assert.equal(await address.innerText(), 'Not deployed');
    assert.equal(await burn.isDisabled(), true);

    await deploy.click();
    await page.evaluate(() => window.sponsorshipDeployment);
    const freshAddress = ethers.utils.getContractAddress(deployments[1]);
    assert.equal(await address.innerText(), freshAddress);
    assert.equal(await burn.isEnabled(), true);

    await burn.click();
    await page.waitForFunction(() =>
      document
        .getElementById('sponsorshipStatus')
        .textContent.startsWith('Submitted '),
    );
    assert.equal(burns.length, 1);
    assert.equal(burns[0].to, freshAddress);
  },
);
