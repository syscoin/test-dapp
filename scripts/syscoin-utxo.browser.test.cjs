const assert = require('node:assert/strict');
const test = require('node:test');
const { chromium } = require('playwright');
const { loadDapp } = require('./fixtures/mock-dapp-browser.cjs');

test(
  'built Syscoin card forwards UTXO and Sentry methods through Pali and renders refusals',
  { timeout: 30000 },
  async (t) => {
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const genesisHash =
      '0000066e1a6b9cfeac8295dce0cc8d9170690a74bc4878cf8a0b412554f5c222';
    const proTxHash = '51'.repeat(32);
    const chain = { genesisHash, era: 'legacy-v3' };
    const collateralOutpoint = { txid: '31'.repeat(32), vout: 0 };
    const operations = [
      'register',
      'updateService',
      'updateRegistrar',
      'revoke',
    ];
    const address = 'tsys1qfixture';
    const testCases = {
      sys_requestAccounts: [[], [address]],
      sys_getNetwork: [[], 'testnet'],
      sys_getSentryCapabilities: [[], { operations }],
      sys_linkSentryNode: [
        [{ version: 1, proTxHash, genesisHash }],
        { proTxHash },
      ],
      sys_signSentryOperation: [
        [
          {
            version: 1,
            operation: 'updateService',
            chain,
            transactionHex: '02000000',
          },
        ],
        { signedAuthorization: 'synthetic-authorization' },
      ],
      sys_signSentryVote: [
        [
          {
            version: 1,
            chain,
            proposalHash: '73'.repeat(32),
            signal: 'funding',
            outcome: 'yes',
            timestamp: 1792252800,
            nodes: [{ proTxHash, collateralOutpoint }],
          },
        ],
        { votes: ['synthetic-approval'] },
      ],
      sys_getAccount: [[], { address }],
      sys_isConnected: [[], true],
      sys_getPublicKey: [[], 'synthetic-public-key'],
      sys_getCurrentAddressPubkey: [
        [{ isChangeAddress: false }],
        'synthetic-public-key',
      ],
      sys_getBip32Path: [[{ isChangeAddress: true }], "m/84'/1'/0'/1/0"],
      sys_getChangeAddress: [[], address],
      sys_getTransactions: [[], [{ txid: collateralOutpoint.txid }]],
      sys_transaction: [
        [collateralOutpoint.txid],
        { txid: collateralOutpoint.txid },
      ],
      sys_isValidSYSAddress: [[address], true],
      sys_sign: [
        [{ psbt: 'synthetic-psbt' }],
        { psbt: 'synthetic-signed-psbt' },
      ],
      sys_signAndSend: [[{ psbt: 'synthetic-psbt' }], collateralOutpoint.txid],
    };
    const actual = [];
    const page = await loadDapp(
      context,
      ({ method, params }) => {
        if (!method.startsWith('sys_'))
          return { result: method === 'eth_accounts' ? [] : '0x1' };
        actual.push({ method, params });
        if (params[0]?.genesisHash === 'ff'.repeat(32)) {
          return { error: { code: 4100, message: 'Wrong Syscoin network' } };
        }
        return { result: testCases[method][1] };
      },
      {
        setup: (page) =>
          page.addInitScript(() => {
            window.pali = {
              request: async (input) => window.ethereum.request(input),
            };
          }),
      },
    );
    const dropdown = page.locator('#syscoinMethod');
    const params = page.locator('#syscoinParams');
    const request = page.locator('#syscoinRequest');
    const result = page.locator('#syscoinResult');
    assert.deepEqual(
      (await dropdown.locator('option').allTextContents()).sort(),
      Object.keys(testCases).sort(),
    );
    for (const [method, [args, expected]] of Object.entries(testCases)) {
      await dropdown.selectOption(method);
      await params.fill(JSON.stringify(args));
      await request.click();
      await page.waitForFunction(
        (id) => !document.getElementById(id).disabled,
        'syscoinRequest',
      );
      assert.deepEqual(JSON.parse(await result.textContent()), expected);
      assert.deepEqual(actual.at(-1), { method, params: args });
    }
    await dropdown.selectOption('sys_linkSentryNode');
    await params.fill(
      JSON.stringify([{ version: 1, proTxHash, genesisHash: 'ff'.repeat(32) }]),
    );
    await request.click();
    await result.getByText('4100: Wrong Syscoin network').waitFor();
    const done = actual.length;
    await params.fill('{}');
    await request.click();
    await result.getByText('Parameters must be a JSON array.').waitFor();
    assert.equal(actual.length, done);
  },
);
