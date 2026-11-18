const EVENTS = ['accountsChanged', 'chainChanged'];
const OPTIONAL_METHODS = [
  'personal_sign',
  'personal_ecRecover',
  'eth_signTypedData',
  'eth_signTypedData_v3',
  'eth_signTypedData_v4',
  'eth_getEncryptionPublicKey',
  'eth_decrypt',
  'wallet_getPermissions',
  'wallet_requestPermissions',
  'wallet_revokePermissions',
  'wallet_switchEthereumChain',
  'wallet_addEthereumChain',
  'wallet_watchAsset',
  'wallet_prepareSmartAccount',
  'wallet_changeAccount',
  'wallet_getCapabilities',
  'wallet_sendCalls',
  'wallet_getCallsStatus',
  'wallet_showCallsStatus',
  'wallet_getSmartAccountModules',
  'wallet_requestSmartAccountModuleInstall',
  'wallet_requestSmartAccountModuleUninstall',
  'eth_blockNumber',
  'eth_gasPrice',
  'eth_maxPriorityFeePerGas',
  'eth_feeHistory',
  'eth_getBalance',
  'eth_getCode',
  'eth_getTransactionCount',
  'eth_call',
  'eth_estimateGas',
  'eth_getLogs',
  'eth_getBlockByNumber',
  'eth_getBlockByHash',
  'eth_getTransactionReceipt',
  'eth_getTransactionByHash',
];
const SENTRY_CAPABILITIES = 'sys_getSentryCapabilities';
export const SYSCOIN_METHODS = Object.freeze([
  'sys_requestAccounts',
  'sys_getNetwork',
  SENTRY_CAPABILITIES,
  'sys_linkSentryNode',
  'sys_signSentryOperation',
  'sys_signSentryVote',
  'sys_getAccount',
  'sys_isConnected',
  'sys_getPublicKey',
  'sys_getCurrentAddressPubkey',
  'sys_getBip32Path',
  'sys_getChangeAddress',
  'sys_getTransactions',
  'sys_transaction',
  'sys_isValidSYSAddress',
  'sys_sign',
  'sys_signAndSend',
]);
const EVM = {
  namespace: 'eip155',
  required: 'eth_sendTransaction',
  optional: OPTIONAL_METHODS,
  accountPattern: /^0x[\da-f]{40}$/iu,
};
const SYSCOIN = {
  namespace: 'bip122',
  required: SENTRY_CAPABILITIES,
  optional: SYSCOIN_METHODS.filter((method) => method !== SENTRY_CAPABILITIES),
  accountPattern: /^[A-Za-z0-9_-]{1,256}$/u,
};

const REASON = { code: 6000, message: 'User disconnected' };
const rpcError = (code, message) => Object.assign(new Error(message), { code });

function chainNumber(input) {
  if (
    typeof input !== 'number' &&
    (typeof input !== 'string' || !/^(?:0x[\da-f]+|\d+)$/iu.test(input))
  ) {
    throw rpcError(-32602, 'Invalid Ethereum chain ID');
  }
  const id = Number(input);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw rpcError(-32602, 'Invalid Ethereum chain ID');
  }
  return id;
}

async function initializeClient(options) {
  const { SignClient } = await import('@walletconnect/sign-client');
  return SignClient.init(options);
}

async function initializeModal(options) {
  const { WalletConnectModal } = await import('@walletconnect/modal');
  return new WalletConnectModal({
    ...options,
    mobileWallets: [{ id: 'pali', name: 'Pali', links: { native: 'pali://' } }],
  });
}

function chainGrant(namespaces, chain, { namespace, accountPattern }) {
  const scopes = [namespaces[namespace], namespaces[chain]].filter(Boolean);
  const accounts = new Set();
  const methods = new Set();
  for (const scope of scopes) {
    const matching = (scope.accounts || []).filter(
      (id) =>
        typeof id === 'string' &&
        id.startsWith(`${chain}:`) &&
        accountPattern.test(id.slice(chain.length + 1)),
    );
    if (!matching.length) {
      continue;
    }
    matching.forEach((id) => accounts.add(id.slice(chain.length + 1)));
    (scope.methods || []).forEach((method) => methods.add(method));
  }
  return { accounts: [...accounts], methods };
}

function makeProvider(client, session, firstChain, scope, onRetire) {
  const evm = scope === EVM;
  const grantFor = (scopes, id) => chainGrant(scopes, id, scope);
  let { namespaces } = session;
  let chain = firstChain;
  let { accounts } = grantFor(namespaces, chain);
  let active = true;
  let accountRevision = 0;
  let chainRevision = 0;
  const revokedMethods = new Map();
  const listeners = new Map();
  const hexId = () => `0x${Number(chain.split(':')[1]).toString(16)}`;
  const emit = (name, value) => {
    for (const fn of [...(listeners.get(name) || [])]) {
      fn(value);
    }
  };
  const setAccounts = (next) => {
    if (accounts.join(',') !== next.join(',')) {
      accounts = next;
      accountRevision += 1;
      emit('accountsChanged', [...accounts]);
    }
  };
  const check = () => {
    if (!active || session.expiry <= Date.now() / 1000) {
      throw rpcError(4900, 'WalletConnect session ended');
    }
  };
  check();
  if (
    !accounts.length ||
    !grantFor(namespaces, chain).methods.has(scope.required)
  ) {
    throw rpcError(4100, 'Wallet did not approve the selected chain');
  }
  function event({ topic, params }) {
    if (!active || topic !== session.topic) {
      return;
    }
    const { name, data } = params.event;
    if (
      name === 'accountsChanged' &&
      params.chainId === chain &&
      Array.isArray(data)
    ) {
      const allowed = grantFor(namespaces, chain).accounts;
      setAccounts(
        allowed.filter((a) =>
          data.some(
            (item) =>
              typeof item === 'string' &&
              (evm ? item.toLowerCase() === a.toLowerCase() : item === a),
          ),
        ),
      );
    }
    if (name === 'chainChanged' && evm) {
      let id;
      try {
        id = chainNumber(data);
      } catch {
        return;
      }
      const next = `eip155:${id}`;
      const nextGrant = grantFor(namespaces, next);
      if (
        (params.chainId === chain || params.chainId === next) &&
        chain !== next &&
        nextGrant.accounts.length
      ) {
        chain = next;
        chainRevision += 1;
        emit('chainChanged', hexId());
        emit('networkChanged', String(id));
        setAccounts(nextGrant.accounts);
      }
    }
  }
  function update({ topic, params }) {
    if (active && topic === session.topic) {
      const previous = grantFor(namespaces, chain);
      namespaces = params.namespaces;
      const grant = grantFor(namespaces, chain);
      for (const method of previous.methods) {
        if (!grant.methods.has(method)) {
          revokedMethods.set(method, (revokedMethods.get(method) || 0) + 1);
        }
      }
      setAccounts(grant.accounts);
    }
  }
  function retire({ topic }) {
    if (topic !== session.topic || !active) {
      return;
    }
    active = false;
    client.off('session_update', update);
    client.off('session_event', event);
    client.off('session_delete', retire);
    client.off('session_expire', retire);
    try {
      setAccounts([]);
      emit('disconnect', rpcError(4900, 'WalletConnect session ended'));
    } finally {
      listeners.clear();
      onRetire();
    }
  }
  const provider = {
    async request({ method, params }) {
      check();
      if (evm && method === 'eth_requestAccounts' && !accounts.length) {
        throw rpcError(
          4100,
          'WalletConnect session has no approved account on this chain',
        );
      }
      if (
        evm &&
        (method === 'eth_accounts' || method === 'eth_requestAccounts')
      ) {
        return [...accounts];
      }
      if (evm && method === 'eth_chainId') {
        return hexId();
      }
      if (evm && method === 'net_version') {
        return chain.split(':')[1];
      }
      if (
        !(method === scope.required || scope.optional.includes(method)) ||
        !grantFor(namespaces, chain).methods.has(method)
      ) {
        throw rpcError(
          4200,
          `WalletConnect method was not approved: ${method}`,
        );
      }
      if (!accounts.length) {
        throw rpcError(
          4100,
          'WalletConnect session has no approved account on this chain',
        );
      }
      const sentAccountRevision = accountRevision;
      const sentChainRevision = chainRevision;
      const sentMethodRevision = revokedMethods.get(method);
      const args = { method, params: params === undefined ? [] : params };
      const result = await client.request({
        topic: session.topic,
        chainId: chain,
        request: args,
        expiry: 300,
      });
      check();
      if (revokedMethods.get(method) !== sentMethodRevision) {
        throw rpcError(
          4100,
          'WalletConnect method was revoked during the request',
        );
      }
      if (chainRevision !== sentChainRevision) {
        // A successful explicit switch changes the context before the peer replies.
        if (
          method === 'wallet_switchEthereumChain' &&
          result === null &&
          chainRevision === sentChainRevision + 1 &&
          chainNumber(params?.[0]?.chainId) === Number(chain.split(':')[1])
        ) {
          return result;
        }
        throw rpcError(4901, 'WalletConnect chain changed during the request');
      }
      if (accountRevision !== sentAccountRevision) {
        // Pali commits a requested account transition before replying on the same topic.
        const changedAccount =
          method === 'wallet_changeAccount' &&
          result === null &&
          accounts.length > 0;
        const preparedAccount =
          method === 'wallet_prepareSmartAccount' &&
          result?.chainId === hexId() &&
          typeof result.address === 'string' &&
          accounts.some(
            (account) => account.toLowerCase() === result.address.toLowerCase(),
          );
        if (!changedAccount && !preparedAccount) {
          throw rpcError(
            4100,
            'WalletConnect accounts changed during the request',
          );
        }
      }
      return result;
    },
    on(name, listener) {
      if (typeof listener !== 'function') {
        throw new TypeError('Event listener must be a function');
      }
      listeners.set(name, [...(listeners.get(name) || []), listener]);
      return provider;
    },
    removeListener(name, listener) {
      const handlers = listeners.get(name) || [];
      const i = handlers.lastIndexOf(listener);
      if (i !== -1) {
        handlers.splice(i, 1);
      }
      return provider;
    },
  };
  client.on('session_update', update);
  client.on('session_event', event);
  client.on('session_delete', retire);
  client.on('session_expire', retire);
  return { provider, retire: () => retire(session), topic: session.topic };
}

export function createPaliWalletConnect({
  projectId,
  metadata,
  namespace = 'eip155',
  createClient = initializeClient,
  createModal = initializeModal,
}) {
  const scope = namespace === 'bip122' ? SYSCOIN : EVM;
  let clientPromise;
  let modalPromise;
  let connection;
  let pending;
  const disconnectListeners = new Set();
  const disconnectTopic = async (client, topic) => {
    await client.disconnect({ topic, reason: REASON });
  };
  function connect(chainIds) {
    if (connection) {
      return Promise.resolve(connection.provider);
    }
    if (pending) {
      return pending.promise;
    }
    const chains = [
      ...new Set(
        scope === EVM
          ? chainIds.map((id) => `eip155:${chainNumber(id)}`)
          : chainIds,
      ),
    ];
    if (
      !chains.length ||
      (scope === SYSCOIN &&
        chains.some((id) => !/^bip122:[\da-f]{32}$/u.test(id)))
    ) {
      return Promise.reject(rpcError(-32602, 'Select a valid wallet chain'));
    }
    const abort = new AbortController();
    const promise = (async () => {
      if (!clientPromise) {
        clientPromise = Promise.resolve()
          .then(() =>
            createClient({
              projectId,
              customStoragePrefix: `syscoin-test-dapp-${scope.namespace}`,
              metadata:
                typeof location === 'undefined'
                  ? metadata
                  : { ...metadata, url: location.origin },
            }),
          )
          .catch((err) => {
            clientPromise = undefined;
            throw err;
          });
      }
      if (!modalPromise) {
        modalPromise = Promise.resolve()
          .then(() => createModal({ projectId, chains }))
          .catch((err) => {
            modalPromise = undefined;
            throw err;
          });
      }
      const [client, modal] = await Promise.all([clientPromise, modalPromise]);
      const check = () => {
        if (abort.signal.aborted) {
          throw rpcError(4001, 'WalletConnect pairing was cancelled');
        }
      };
      check();
      const { uri, approval } = await client.connect({
        requiredNamespaces: {
          [scope.namespace]: {
            chains: [chains[0]],
            methods: [scope.required],
            events: EVENTS,
          },
        },
        optionalNamespaces: {
          [scope.namespace]: {
            chains,
            methods: scope.optional,
            events: EVENTS,
          },
        },
      });
      let accepted = false;
      const approvalPromise = approval();
      // Observe peer rejection even while the modal is opening.
      approvalPromise.catch(() => undefined);
      let stopWatching;
      try {
        check();
        if (!uri) {
          throw rpcError(-32603, 'WalletConnect did not return a pairing URI');
        }
        let seenOpen = false;
        stopWatching = modal.subscribeModal(({ open }) => {
          if (open) {
            seenOpen = true;
          } else if (seenOpen) {
            abort.abort();
          }
        });
        await modal.openModal({ uri, chains });
        check();
        const cancelled = new Promise((_, reject) => {
          abort.signal.addEventListener(
            'abort',
            () => reject(rpcError(4001, 'WalletConnect pairing was cancelled')),
            { once: true },
          );
        });
        const session = await Promise.race([approvalPromise, cancelled]);
        check();
        connection = makeProvider(client, session, chains[0], scope, () => {
          connection = undefined;
          disconnectListeners.forEach((listener) => listener());
        });
        accepted = true;
        return connection.provider;
      } finally {
        if (!accepted) {
          abort.abort();
          // Approval may arrive after dismissal or before opening the QR fails.
          approvalPromise
            .then((session) => disconnectTopic(client, session.topic))
            .catch(() => undefined);
        }
        stopWatching?.();
        modal.closeModal();
      }
    })().finally(() => {
      pending = undefined;
    });
    pending = { promise, abort };
    return promise;
  }
  return {
    connect,
    async disconnect() {
      pending?.abort.abort();
      if (connection) {
        const current = connection;
        current.retire();
        const client = await clientPromise;
        await disconnectTopic(client, current.topic);
      }
    },
    onDisconnect(listener) {
      disconnectListeners.add(listener);
      return () => disconnectListeners.delete(listener);
    },
  };
}
