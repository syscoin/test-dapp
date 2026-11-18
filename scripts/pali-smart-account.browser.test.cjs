const assert = require('node:assert/strict');
const test = require('node:test');
const { chromium } = require('playwright');
const { utils } = require('ethers');

const { loadDapp } = require('./fixtures/mock-dapp-browser.cjs');

const address = (i) => '0x1' + String(i).padStart(39, '0');
const [owner, smart, secondOwner, token, spender, recipient, moduleAddress] = [
  1, 2, 3, 4, 5, 6, 7,
].map(address);
const failingContract = address(8);
const chain = '0x7a69';
const bundleId = '0x' + 'ab'.repeat(32);
const revertedId = '0x' + 'cd'.repeat(32);

test(
  'built Pali Smart Account card prepares accounts, sends batches, queries status and manages modules',
  { timeout: 60000 },
  async (t) => {
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const requests = [];
    const batches = new Map();
    let connected = owner;
    let installed;
    const page = await loadDapp(context, async (input) => {
      const { method, params = [] } = input;
      requests.push(input);
      switch (method) {
        case 'eth_accounts':
        case 'eth_requestAccounts':
          return { result: [connected] };
        case 'eth_chainId':
          return { result: chain };
        case 'net_version':
          return { result: '31337' };
        case 'eth_getBlockByNumber':
          return { result: { baseFeePerGas: '0x1' } };
        case 'wallet_prepareSmartAccount':
          connected = smart;
          return { result: { address: smart, chainId: chain } };
        case 'wallet_getCapabilities':
          return { result: { [chain]: { atomic: { status: 'supported' } } } };
        case 'wallet_sendCalls': {
          const envelope = params[0];
          const id = envelope.id || bundleId;
          if (batches.has(id))
            return {
              error: { code: 5720, message: 'Duplicate bundle ID (5720)' },
            };
          batches.set(
            id,
            envelope.calls.some(
              (call) =>
                call.to === failingContract &&
                call.value === '0x0' &&
                call.data === '0x',
            )
              ? 500
              : 200,
          );
          return { result: { id } };
        }
        case 'wallet_getCallsStatus':
          return batches.has(params[0])
            ? { result: { id: params[0], status: batches.get(params[0]) } }
            : { error: { code: 5730, message: 'Unknown bundle ID (5730)' } };
        case 'wallet_showCallsStatus':
          return { result: null };
        case 'wallet_getSmartAccountModules':
          return { result: { modules: installed ? [installed] : [] } };
        case 'wallet_requestSmartAccountModuleInstall':
          installed = params[0];
          return { result: { installed: installed.address } };
        case 'wallet_requestSmartAccountModuleUninstall':
          installed = undefined;
          return { result: { uninstalled: params[0].address } };
        default:
          return {
            error: {
              code: 4200,
              message: 'Unsupported fixture method: ' + method,
            },
          };
      }
    });
    const field = (suffix) => page.locator('#paliSa' + suffix);
    const last = (method) =>
      requests.findLast((request) => request.method === method)?.params;
    async function click(suffix, expected) {
      await field(suffix).click();
      await page.waitForFunction(
        (text) =>
          document.querySelector('#paliSaResult')?.innerText.includes(text),
        expected,
      );
    }
    await click('UseConnected', owner);
    assert.equal(await field('Address').inputValue(), owner);
    await field('Label').fill('Browser fixture');
    await click('Create', smart);
    assert.deepEqual(last('wallet_prepareSmartAccount'), [
      { label: 'Browser fixture', authenticator: { id: 'p256-webauthn' } },
    ]);
    assert.equal(await field('Address').inputValue(), smart);
    await field('Authenticator').selectOption('ecdsa');
    await click('UseConnected', 'Using connected account');
    await click('Create', smart);
    assert.deepEqual(last('wallet_prepareSmartAccount')[0].authenticator, {
      id: 'ecdsa',
    });
    await field('EcdsaOwners').fill(owner + ',' + secondOwner);
    await field('EcdsaThreshold').fill('3');
    await click('Create', 'threshold cannot exceed');
    await field('EcdsaThreshold').fill('2');
    await click('Create', smart);
    assert.deepEqual(last('wallet_prepareSmartAccount')[0].authenticator, {
      id: 'ecdsa',
      config: { owners: [owner, secondOwner], threshold: 2 },
    });
    await click('Capabilities', 'supported');
    assert.deepEqual(last('wallet_getCapabilities'), [smart, [chain]]);

    await field('Erc20Token').fill(token);
    await field('Erc20Spender').fill(spender);
    await field('Erc20Recipient').fill(recipient);
    await field('Erc20Amount').fill('37');
    await click('BuildErc20', 'Loaded ERC20');
    const abi = new utils.Interface([
      'function approve(address,uint256)',
      'function transferFrom(address,address,uint256)',
    ]);
    const calls = [
      {
        to: token,
        value: '0x0',
        data: abi.encodeFunctionData('approve', [spender, 37]),
      },
      {
        to: spender,
        value: '0x0',
        data: abi.encodeFunctionData('transferFrom', [smart, recipient, 37]),
      },
    ];
    assert.deepEqual(JSON.parse(await field('Calls').inputValue()), calls);
    await click('SendCalls', bundleId);
    assert.deepEqual(last('wallet_sendCalls'), [
      {
        version: '2.0.0',
        from: smart,
        chainId: chain,
        atomicRequired: true,
        calls,
      },
    ]);
    await click('CallsStatus', '200 (confirmed)');
    assert.deepEqual(last('wallet_getCallsStatus'), [bundleId]);
    await click('ShowCallsStatus', 'resolved (null)');
    assert.deepEqual(last('wallet_showCallsStatus'), [bundleId]);

    await click('AppendRevert', 'Failing contract must be a valid address');
    assert.deepEqual(JSON.parse(await field('Calls').inputValue()), calls);
    await field('FailingContract').fill(failingContract);
    await click('AppendRevert', 'Appended a zero-value call');
    await field('CustomBatchId').fill(revertedId);
    await click('SendCalls', revertedId);
    assert.deepEqual(last('wallet_sendCalls')[0], {
      version: '2.0.0',
      from: smart,
      chainId: chain,
      atomicRequired: true,
      id: revertedId,
      calls: [...calls, { to: failingContract, value: '0x0', data: '0x' }],
    });
    await click('CallsStatus', '500 (reverted)');
    await click('SendCalls', '5720');
    await field('CustomBatchId').fill('0x' + 'ef'.repeat(32));
    await click('CallsStatus', '5730');

    await click('LoadModules', '"modules": []');
    assert.deepEqual(last('wallet_getSmartAccountModules'), []);
    await field('ModuleAddress').fill(moduleAddress);
    await field('ModuleInitData').fill('0x0102');
    await field('ModuleName').fill('Browser validator');
    await click('InstallModule', 'installed');
    assert.deepEqual(last('wallet_requestSmartAccountModuleInstall'), [
      { address: moduleAddress, initData: '0x0102', name: 'Browser validator' },
    ]);
    await click('LoadModules', 'Browser validator');
    await click('UninstallModule', 'uninstalled');
    assert.deepEqual(last('wallet_requestSmartAccountModuleUninstall'), [
      { address: moduleAddress },
    ]);
    await click('LoadModules', '"modules": []');
  },
);
