const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { createPaliWalletConnect } = require('../src/pali-walletconnect.js');

const address = '0x0000000000000000000000000000000000000001';
const updatedAddress = '0x0000000000000000000000000000000000000002';
const chain = 'eip155:31337';
const methods = [
  'eth_sendTransaction',
  'personal_sign',
  'wallet_getCapabilities',
  'wallet_sendCalls',
];
const namespace = (scope, account) => ({
  accounts: [`${scope}:${account}`],
  methods,
  events: ['chainChanged', 'accountsChanged'],
});

function fixture(options = {}) {
  const approval = Promise.withResolvers();
  const modalReady = Promise.withResolvers();
  const proposals = [],
    requests = [],
    disconnects = [];
  const client = new EventEmitter();
  client.connect = async (proposal) => {
    proposals.push(proposal);
    return { uri: 'wc:test@2', approval: () => approval.promise };
  };
  client.request = async (request) => {
    requests.push(request);
    return 'peer-result';
  };
  client.disconnect = async ({ topic }) => {
    disconnects.push(topic);
  };
  let notify;
  const modal = {
    subscribeModal(listener) {
      notify = listener;
      return () => {
        notify = undefined;
      };
    },
    async openModal({ uri }) {
      assert.equal(uri, 'wc:test@2');
      notify({ open: true });
      modalReady.resolve();
    },
    closeModal() {
      notify?.({ open: false });
    },
  };
  const connector = createPaliWalletConnect({
    projectId: 'test',
    metadata: { name: 'Test' },
    createClient: async () => client,
    createModal: async () => modal,
    ...options,
  });
  const session = {
    topic: 'test-topic',
    expiry: Math.floor(Date.now() / 1000) + 3600,
    namespaces: { eip155: namespace(chain, address) },
  };
  async function connect() {
    const pending = connector.connect([31337, '0x1']);
    await modalReady.promise;
    approval.resolve(session);
    return pending;
  }
  return {
    client,
    connector,
    modal,
    proposals,
    requests,
    disconnects,
    session,
    connect,
    approval,
    modalReady,
  };
}

test('proposes the selected chain and forwards a negotiated request with original expiry', async () => {
  const f = fixture();
  const provider = await f.connect();
  const [proposal] = f.proposals;
  assert.deepEqual(proposal.requiredNamespaces.eip155, {
    chains: [chain],
    methods: ['eth_sendTransaction'],
    events: ['accountsChanged', 'chainChanged'],
  });
  assert.deepEqual(proposal.optionalNamespaces.eip155.chains, [
    chain,
    'eip155:1',
  ]);
  for (const method of [
    'personal_sign',
    'eth_signTypedData_v4',
    'wallet_requestPermissions',
    'eth_getBlockByNumber',
    'wallet_prepareSmartAccount',
    'wallet_sendCalls',
    'wallet_showCallsStatus',
    'wallet_getSmartAccountModules',
  ]) {
    assert.ok(
      proposal.optionalNamespaces.eip155.methods.includes(method),
      method,
    );
  }
  assert.deepEqual(await provider.request({ method: 'eth_requestAccounts' }), [
    address,
  ]);
  assert.equal(await provider.request({ method: 'eth_chainId' }), '0x7a69');
  assert.equal(await provider.request({ method: 'net_version' }), '31337');
  const request = {
    method: 'eth_sendTransaction',
    params: [{ from: address, to: updatedAddress, value: '0x1' }],
  };
  assert.equal(await provider.request(request), 'peer-result');
  assert.deepEqual(f.requests, [
    { topic: f.session.topic, chainId: chain, request, expiry: 300 },
  ]);
  await assert.rejects(provider.request({ method: 'eth_sign' }), {
    code: 4200,
  });
  await assert.rejects(provider.request({ method: 'eth_signTypedData_v4' }), {
    code: 4200,
  });
  f.client.request = async () => {
    throw Object.assign(new Error('User rejected'), { code: 4001 });
  };
  await assert.rejects(
    provider.request({ method: 'personal_sign', params: ['0x12', address] }),
    { code: 4001, message: 'User rejected' },
  );
  await f.connector.disconnect();
  assert.deepEqual(f.disconnects, [f.session.topic]);
  await assert.rejects(provider.request({ method: 'eth_chainId' }), {
    code: 4900,
  });
});

test('updates only the active topic and exposes only accounts granted for the selected chain', async () => {
  const f = fixture();
  const provider = await f.connect();
  const events = [];
  const changed = (accounts) => events.push(accounts);
  provider.on('accountsChanged', changed);
  f.client.emit('session_update', {
    topic: 'another-topic',
    params: { namespaces: {} },
  });
  const next = {
    [chain]: namespace(chain, updatedAddress),
    'eip155:1': namespace('eip155:1', address),
  };
  f.client.emit('session_update', {
    topic: f.session.topic,
    params: { namespaces: next },
  });
  assert.deepEqual(events, [[updatedAddress]]);
  const event = (name, data) => ({
    topic: f.session.topic,
    params: { chainId: chain, event: { name, data } },
  });
  f.client.emit(
    'session_event',
    event('accountsChanged', [address, updatedAddress]),
  );
  assert.deepEqual(await provider.request({ method: 'eth_accounts' }), [
    updatedAddress,
  ]);
  f.client.emit('session_event', event('chainChanged', '0x2'));
  assert.equal(await provider.request({ method: 'eth_chainId' }), '0x7a69');
  provider.removeListener('accountsChanged', changed);
  f.client.emit('session_event', event('chainChanged', '0x1'));
  assert.equal(await provider.request({ method: 'eth_chainId' }), '0x1');
  assert.deepEqual(await provider.request({ method: 'eth_accounts' }), [
    address,
  ]);
  assert.deepEqual(events, [[updatedAddress]]);
  await f.connector.disconnect();
});

test('peer deletion retires an in-flight response and releases event listeners', async () => {
  const f = fixture();
  const provider = await f.connect();
  const ack = Promise.withResolvers();
  f.client.request = () => ack.promise;
  const pending = provider.request({
    method: 'personal_sign',
    params: ['0x12', address],
  });
  let disconnected = 0;
  const stop = f.connector.onDisconnect(() => {
    disconnected++;
  });
  f.client.emit('session_delete', { topic: 'other' });
  assert.equal(disconnected, 0);
  f.client.emit('session_delete', { topic: f.session.topic });
  ack.resolve('old signature');
  await assert.rejects(pending, { code: 4900 });
  assert.equal(disconnected, 1);
  assert.deepEqual(f.client.eventNames(), []);
  stop();
});

test('dismissing the QR cancels the attempt and retires a late peer approval', async () => {
  const f = fixture();
  const pending = f.connector.connect([31337]);
  assert.equal(pending, f.connector.connect([31337]));
  await f.modalReady.promise;
  f.modal.closeModal();
  await assert.rejects(pending, { code: 4001 });
  f.approval.resolve(f.session);
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(f.disconnects, [f.session.topic]);
  assert.deepEqual(f.client.eventNames(), []);
});

test('disposes a grant missing the required chain', async () => {
  const f = fixture();
  f.session.namespaces = { eip155: namespace('eip155:1', address) };
  await assert.rejects(f.connect(), { code: 4100 });
  assert.deepEqual(f.disconnects, [f.session.topic]);
});

test('rejects late ordinary results after method revocation or an account or chain change', async () => {
  for (const change of ['revoked', 'account', 'chain']) {
    const f = fixture();
    const provider = await f.connect();
    const reply = Promise.withResolvers();
    f.client.request = () => reply.promise;
    const pending = provider.request({
      method: 'personal_sign',
      params: ['0x12', address],
    });
    const before = namespace(chain, address);
    const updated = {
      ...before,
      accounts:
        change === 'account' ? [`${chain}:${updatedAddress}`] : before.accounts,
      methods: change === 'revoked' ? ['eth_sendTransaction'] : before.methods,
    };
    const update = (namespaces) =>
      f.client.emit('session_update', {
        topic: f.session.topic,
        params: { namespaces },
      });
    update({
      [chain]: updated,
      'eip155:1': namespace('eip155:1', updatedAddress),
    });
    if (change === 'revoked') update({ [chain]: before });
    if (change === 'chain')
      f.client.emit('session_event', {
        topic: f.session.topic,
        params: {
          chainId: 'eip155:1',
          event: { name: 'chainChanged', data: '0x1' },
        },
      });
    reply.resolve('stale signature');
    await assert.rejects(pending, { code: change === 'chain' ? 4901 : 4100 });
    await f.connector.disconnect();
  }
});

test('smart account preparation can return the newly authorized account after the namespace update', async () => {
  const f = fixture();
  f.session.namespaces.eip155.methods = [
    ...methods,
    'wallet_prepareSmartAccount',
  ];
  const provider = await f.connect();
  const reply = Promise.withResolvers();
  f.client.request = () => reply.promise;
  const pending = provider.request({
    method: 'wallet_prepareSmartAccount',
    params: [{ authenticator: { id: 'ecdsa' } }],
  });
  f.client.emit('session_update', {
    topic: f.session.topic,
    params: {
      namespaces: {
        eip155: {
          ...f.session.namespaces.eip155,
          accounts: [`${chain}:${updatedAddress}`],
        },
      },
    },
  });
  const result = { chainId: '0x7a69', address: updatedAddress };
  reply.resolve(result);
  assert.deepEqual(await pending, result);
  await f.connector.disconnect();
});

test('uses the Syscoin CAIP-2 scope for Sentry and PSBT requests', async () => {
  const f = fixture({ namespace: 'bip122' });
  const testnet = 'bip122:0000066e1a6b9cfeac8295dce0cc8d91';
  await assert.rejects(f.connector.connect([chain]), { code: -32602 });
  const pending = f.connector.connect([testnet]);
  await f.modalReady.promise;
  const granted = [
    'sys_getSentryCapabilities',
    'sys_signSentryVote',
    'sys_sign',
  ];
  f.approval.resolve({
    ...f.session,
    namespaces: {
      bip122: { accounts: [`${testnet}:tsys1qfixture`], methods: granted },
    },
  });
  const provider = await pending;
  const [proposal] = f.proposals;
  assert.deepEqual(proposal.requiredNamespaces.bip122.chains, [testnet]);
  assert.deepEqual(proposal.requiredNamespaces.bip122.methods, [
    'sys_getSentryCapabilities',
  ]);
  for (const method of [
    'sys_sign',
    'sys_signAndSend',
    'sys_signSentryVote',
    'sys_signSentryOperation',
    'sys_linkSentryNode',
  ]) {
    assert.ok(proposal.optionalNamespaces.bip122.methods.includes(method));
  }
  const request = {
    method: 'sys_signSentryVote',
    params: [{ version: 1, outcome: 'yes' }],
  };
  assert.equal(await provider.request(request), 'peer-result');
  assert.deepEqual(f.requests[0], {
    topic: f.session.topic,
    chainId: testnet,
    request,
    expiry: 300,
  });
  await assert.rejects(provider.request({ method: 'sys_signAndSend' }), {
    code: 4200,
  });
  await assert.rejects(provider.request({ method: 'eth_sendTransaction' }), {
    code: 4200,
  });
});
