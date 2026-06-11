import { ethers } from 'ethers';

import globalContext from '../..';

// ---------------------------------------------------------------------------
// Pali smart-account test card.
//
// Exercises the full dapp-facing ERC-4337 / ERC-7579 surface Pali exposes:
//   - wallet_prepareSmartAccount            (create + register, passkey or ECDSA)
//   - wallet_getCapabilities                (atomic batch support)
//   - wallet_sendCalls / wallet_getCallsStatus (atomic batch execution)
//   - wallet_getSmartAccountModules         (installed module inventory)
//   - wallet_requestSmartAccountModuleInstall / ...Uninstall (module mgmt)
//
// Authenticator ids accepted by wallet_prepareSmartAccount:
//   'p256-webauthn' (passkey)  - omit config to have the wallet mint a passkey
//   'ecdsa'                    - config.owners[] + config.threshold; omit to
//                                bootstrap from the connected wallet key
// ---------------------------------------------------------------------------

const SEND_CALLS_VERSION = '2.0.0';
// Reverts unconditionally (Solidity `assert(false)` / invalid opcode); used to
// prove that atomicRequired rolls the whole batch back.
const REVERTING_CALLDATA = '0xfe';
const ERC20_INTERFACE = new ethers.utils.Interface([
  'function approve(address spender,uint256 amount)',
  'function transferFrom(address from,address to,uint256 amount)',
]);

function getProvider() {
  return globalContext.provider || window.ethereum;
}

function getChainIdHex() {
  if (globalContext.chainIdInt) {
    return `0x${globalContext.chainIdInt.toString(16)}`;
  }
  return '0x1';
}

function getConnectedAddress() {
  return (globalContext.accounts && globalContext.accounts[0]) || '';
}

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

function requireAddress(value, fieldLabel) {
  const trimmed = (value || '').trim();
  if (!ethers.utils.isAddress(trimmed)) {
    throw new Error(`${fieldLabel} must be a valid address.`);
  }
  return ethers.utils.getAddress(trimmed);
}

function defaultSelfCalls(account) {
  const target = ethers.utils.isAddress(account)
    ? ethers.utils.getAddress(account)
    : '0x0000000000000000000000000000000000000000';
  // Two zero-value self-calls: a harmless batch that any deployed account can
  // execute, useful as an atomicity baseline.
  return [
    { to: target, value: '0x0', data: '0x' },
    { to: target, value: '0x0', data: '0x' },
  ];
}

export function paliPasskeysComponent(parentContainer) {
  parentContainer.insertAdjacentHTML(
    'beforeend',
    `<div class="col-xl-4 col-lg-6 col-md-12 col-sm-12 col-12 d-flex align-items-stretch">
      <div class="card full-width">
        <div class="card-body">
          <h4 class="card-title">Pali Smart Account</h4>

          <p class="info-text alert alert-secondary">
            Create a passkey or ECDSA smart account, run an atomic batch, and
            manage ERC-7579 modules end to end with the Pali extension.
          </p>

          <h5>1 &middot; Create / Register Account</h5>

          <div class="form-group">
            <label for="paliSaLabel">Account label</label>
            <input class="form-control" id="paliSaLabel" value="Pali Test Smart Account" />
          </div>

          <div class="form-group">
            <label for="paliSaAuthenticator">Authenticator</label>
            <select class="form-control" id="paliSaAuthenticator">
              <option value="p256-webauthn" selected>Passkey (P-256 WebAuthn)</option>
              <option value="ecdsa">Wallet key (ECDSA)</option>
            </select>
          </div>

          <div class="form-group" id="paliSaEcdsaOwnersGroup" style="display:none;">
            <label for="paliSaEcdsaOwners">ECDSA owners (comma separated, optional)</label>
            <input class="form-control" id="paliSaEcdsaOwners" placeholder="0xowner1,0xowner2" />
            <small class="form-text text-muted">
              Leave blank to bootstrap from the connected wallet key.
            </small>
          </div>

          <div class="form-group" id="paliSaEcdsaThresholdGroup" style="display:none;">
            <label for="paliSaEcdsaThreshold">ECDSA threshold</label>
            <input class="form-control" id="paliSaEcdsaThreshold" value="1" />
          </div>

          <button class="btn btn-primary btn-lg btn-block mb-3" id="paliSaCreate" disabled>
            Create / Register Smart Account
          </button>

          <div class="form-group">
            <label for="paliSaAddress">Smart account address</label>
            <input class="form-control" id="paliSaAddress" placeholder="0x... (created or connected)" />
            <small class="form-text text-muted">
              Auto-filled after creation; paste an existing account to reuse it.
            </small>
          </div>

          <button class="btn btn-secondary btn-lg btn-block mb-3" id="paliSaUseConnected" disabled>
            Use Connected Account
          </button>

          <hr />

          <h5>2 &middot; Atomic Batch</h5>

          <button class="btn btn-secondary btn-lg btn-block mb-2" id="paliSaCapabilities" disabled>
            Check Atomic Capability
          </button>

          <div class="form-group">
            <label for="paliSaCalls">Batch calls JSON</label>
            <textarea class="form-control" id="paliSaCalls" rows="7"></textarea>
          </div>

          <div class="form-group">
            <label for="paliSaErc20Token">ERC20 token (optional, for batch builder)</label>
            <input class="form-control" id="paliSaErc20Token" placeholder="0x token" />
          </div>
          <div class="form-group">
            <label for="paliSaErc20Spender">Spender (transferFrom caller)</label>
            <input class="form-control" id="paliSaErc20Spender" placeholder="0x spender" />
          </div>
          <div class="form-group">
            <label for="paliSaErc20Recipient">Transfer recipient</label>
            <input class="form-control" id="paliSaErc20Recipient" placeholder="0x recipient" />
          </div>
          <div class="form-group">
            <label for="paliSaErc20Amount">Amount (base units)</label>
            <input class="form-control" id="paliSaErc20Amount" value="1" />
          </div>

          <div class="d-flex" style="gap:0.5rem;">
            <button class="btn btn-outline-secondary btn-block mb-2" id="paliSaBuildErc20">
              Load ERC20 approve + transferFrom
            </button>
            <button class="btn btn-outline-warning btn-block mb-2" id="paliSaAppendRevert">
              Append Reverting Call
            </button>
          </div>

          <div class="form-check mb-2">
            <input class="form-check-input" type="checkbox" id="paliSaAtomicRequired" checked />
            <label class="form-check-label" for="paliSaAtomicRequired">
              atomicRequired (roll back the whole batch on any revert)
            </label>
          </div>

          <div class="form-group">
            <label for="paliSaCustomBatchId">
              Custom batch id (optional, hex; resubmitting the same id must fail
              with 5720; status buttons query this id when filled, so an unknown
              id must fail with 5730)
            </label>
            <input class="form-control" id="paliSaCustomBatchId" placeholder="0x..." />
          </div>

          <button class="btn btn-primary btn-lg btn-block mb-2" id="paliSaSendCalls" disabled>
            Send Batch (wallet_sendCalls)
          </button>

          <div class="d-flex" style="gap:0.5rem;">
            <button class="btn btn-secondary btn-block mb-3" id="paliSaCallsStatus" disabled>
              Get Calls Status
            </button>
            <button class="btn btn-secondary btn-block mb-3" id="paliSaShowCallsStatus" disabled>
              Show Status (wallet UI)
            </button>
          </div>

          <hr />

          <h5>3 &middot; ERC-7579 Modules</h5>

          <button class="btn btn-secondary btn-lg btn-block mb-3" id="paliSaLoadModules" disabled>
            Load Installed Modules
          </button>

          <div class="form-group">
            <label for="paliSaModuleAddress">Module address</label>
            <input class="form-control" id="paliSaModuleAddress" placeholder="0x..." />
          </div>

          <div class="form-group">
            <label for="paliSaModuleInitData">Install init data (optional)</label>
            <input class="form-control" id="paliSaModuleInitData" placeholder="0x" />
          </div>

          <div class="form-group">
            <label for="paliSaModuleName">Module label (optional)</label>
            <input class="form-control" id="paliSaModuleName" placeholder="My validator" />
          </div>

          <div class="d-flex" style="gap:0.5rem;">
            <button class="btn btn-primary btn-block mb-3" id="paliSaInstallModule" disabled>
              Request Install
            </button>
            <button class="btn btn-danger btn-block mb-3" id="paliSaUninstallModule" disabled>
              Request Uninstall
            </button>
          </div>

          <p class="info-text alert alert-secondary">
            Result: <span class="wrap" id="paliSaResult"></span>
          </p>
        </div>
      </div>
    </div>`,
  );

  const els = {
    label: document.getElementById('paliSaLabel'),
    authenticator: document.getElementById('paliSaAuthenticator'),
    ecdsaOwnersGroup: document.getElementById('paliSaEcdsaOwnersGroup'),
    ecdsaOwners: document.getElementById('paliSaEcdsaOwners'),
    ecdsaThresholdGroup: document.getElementById('paliSaEcdsaThresholdGroup'),
    ecdsaThreshold: document.getElementById('paliSaEcdsaThreshold'),
    create: document.getElementById('paliSaCreate'),
    address: document.getElementById('paliSaAddress'),
    useConnected: document.getElementById('paliSaUseConnected'),
    capabilities: document.getElementById('paliSaCapabilities'),
    calls: document.getElementById('paliSaCalls'),
    erc20Token: document.getElementById('paliSaErc20Token'),
    erc20Spender: document.getElementById('paliSaErc20Spender'),
    erc20Recipient: document.getElementById('paliSaErc20Recipient'),
    erc20Amount: document.getElementById('paliSaErc20Amount'),
    buildErc20: document.getElementById('paliSaBuildErc20'),
    appendRevert: document.getElementById('paliSaAppendRevert'),
    atomicRequired: document.getElementById('paliSaAtomicRequired'),
    customBatchId: document.getElementById('paliSaCustomBatchId'),
    sendCalls: document.getElementById('paliSaSendCalls'),
    callsStatus: document.getElementById('paliSaCallsStatus'),
    showCallsStatus: document.getElementById('paliSaShowCallsStatus'),
    loadModules: document.getElementById('paliSaLoadModules'),
    moduleAddress: document.getElementById('paliSaModuleAddress'),
    moduleInitData: document.getElementById('paliSaModuleInitData'),
    moduleName: document.getElementById('paliSaModuleName'),
    installModule: document.getElementById('paliSaInstallModule'),
    uninstallModule: document.getElementById('paliSaUninstallModule'),
    result: document.getElementById('paliSaResult'),
  };

  let isConnected = false;
  let lastBatchId = '';

  const showResult = (value) => {
    els.result.innerText = typeof value === 'string' ? value : pretty(value);
  };

  const showError = (error) => {
    console.error(error);
    els.result.innerText = `Error: ${error.message || error}`;
  };

  const getSmartAccountAddress = () => els.address.value.trim();

  const setSmartAccountAddress = (address) => {
    if (ethers.utils.isAddress(address)) {
      els.address.value = ethers.utils.getAddress(address);
    }
  };

  const syncButtons = () => {
    const hasAccount = ethers.utils.isAddress(getSmartAccountAddress());
    els.create.disabled = !isConnected;
    els.useConnected.disabled =
      !isConnected || !ethers.utils.isAddress(getConnectedAddress());
    els.capabilities.disabled = !isConnected;
    const hasStatusId = Boolean(lastBatchId || els.customBatchId.value.trim());
    els.sendCalls.disabled = !isConnected || !hasAccount;
    els.callsStatus.disabled = !isConnected || !hasStatusId;
    els.showCallsStatus.disabled = !isConnected || !hasStatusId;
    els.loadModules.disabled = !isConnected || !hasAccount;
    els.installModule.disabled = !isConnected || !hasAccount;
    els.uninstallModule.disabled = !isConnected || !hasAccount;
  };

  const syncAuthenticatorFields = () => {
    const isEcdsa = els.authenticator.value === 'ecdsa';
    els.ecdsaOwnersGroup.style.display = isEcdsa ? '' : 'none';
    els.ecdsaThresholdGroup.style.display = isEcdsa ? '' : 'none';
  };

  els.calls.value = pretty(defaultSelfCalls(''));
  syncAuthenticatorFields();
  syncButtons();

  els.authenticator.onchange = syncAuthenticatorFields;
  els.address.oninput = syncButtons;
  els.customBatchId.oninput = syncButtons;

  document.addEventListener('globalConnectionChange', (event) => {
    isConnected = event.detail.connected;
    syncButtons();
  });

  document.addEventListener('disableAndClear', () => {
    isConnected = false;
    lastBatchId = '';
    els.address.value = '';
    els.calls.value = pretty(defaultSelfCalls(''));
    els.result.innerText = '';
    syncButtons();
  });

  const buildAuthenticator = () => {
    const id = els.authenticator.value;
    if (id !== 'ecdsa') {
      // Passkey: no config => the wallet mints a passkey credential.
      return { id };
    }
    const ownersRaw = els.ecdsaOwners.value.trim();
    if (!ownersRaw) {
      // No owners => wallet bootstraps from the connected key.
      return { id };
    }
    const owners = ownersRaw
      .split(',')
      .map((owner) => requireAddress(owner, 'ECDSA owner'));
    const threshold = Number(els.ecdsaThreshold.value || '1');
    if (!Number.isInteger(threshold) || threshold < 1) {
      throw new Error('ECDSA threshold must be a positive integer.');
    }
    if (threshold > owners.length) {
      throw new Error('ECDSA threshold cannot exceed the number of owners.');
    }
    return { id, config: { owners, threshold } };
  };

  els.create.onclick = async () => {
    try {
      const provider = getProvider();
      const result = await provider.request({
        method: 'wallet_prepareSmartAccount',
        params: [
          {
            label: els.label.value || 'Pali Test Smart Account',
            authenticator: buildAuthenticator(),
          },
        ],
      });
      setSmartAccountAddress((result && result.address) || '');
      // The created account becomes the connected account.
      globalContext.accounts =
        (await provider.request({ method: 'eth_accounts' })) ||
        globalContext.accounts;
      syncButtons();
      showResult(result);
    } catch (error) {
      showError(error);
    }
  };

  els.useConnected.onclick = () => {
    try {
      const connected = requireAddress(
        getConnectedAddress(),
        'Connected account',
      );
      els.address.value = connected;
      els.calls.value = pretty(defaultSelfCalls(connected));
      syncButtons();
      showResult(`Using connected account: ${connected}`);
    } catch (error) {
      showError(error);
    }
  };

  els.capabilities.onclick = async () => {
    try {
      const account =
        getSmartAccountAddress() ||
        requireAddress(getConnectedAddress(), 'Account');
      const result = await getProvider().request({
        method: 'wallet_getCapabilities',
        params: [account, [getChainIdHex()]],
      });
      showResult(result);
    } catch (error) {
      showError(error);
    }
  };

  els.buildErc20.onclick = () => {
    try {
      const account = requireAddress(getSmartAccountAddress(), 'Smart account');
      const token = requireAddress(els.erc20Token.value, 'Token');
      const spender = requireAddress(els.erc20Spender.value, 'Spender');
      const recipient = requireAddress(els.erc20Recipient.value, 'Recipient');
      const amount = ethers.BigNumber.from(els.erc20Amount.value || '0');
      // approve(spender) then spender.transferFrom(account -> recipient) in a
      // single atomic op: the canonical "one signature, two effects" demo.
      els.calls.value = pretty([
        {
          to: token,
          value: '0x0',
          data: ERC20_INTERFACE.encodeFunctionData('approve', [
            spender,
            amount,
          ]),
        },
        {
          to: spender,
          value: '0x0',
          data: ERC20_INTERFACE.encodeFunctionData('transferFrom', [
            account,
            recipient,
            amount,
          ]),
        },
      ]);
      showResult('Loaded ERC20 approve + transferFrom batch.');
    } catch (error) {
      showError(error);
    }
  };

  els.appendRevert.onclick = () => {
    try {
      const account = requireAddress(getSmartAccountAddress(), 'Smart account');
      const calls = JSON.parse(els.calls.value);
      if (!Array.isArray(calls)) {
        throw new Error('Calls JSON must be an array.');
      }
      calls.push({ to: account, value: '0x0', data: REVERTING_CALLDATA });
      els.calls.value = pretty(calls);
      showResult(
        'Appended a reverting call. With atomicRequired set, the entire ' +
          'batch must roll back.',
      );
    } catch (error) {
      showError(error);
    }
  };

  els.sendCalls.onclick = async () => {
    try {
      const from = requireAddress(getSmartAccountAddress(), 'Smart account');
      const calls = JSON.parse(els.calls.value);
      if (!Array.isArray(calls) || calls.length === 0) {
        throw new Error('Calls JSON must be a non-empty array.');
      }
      const customBatchId = els.customBatchId.value.trim();
      const result = await getProvider().request({
        method: 'wallet_sendCalls',
        params: [
          {
            version: SEND_CALLS_VERSION,
            from,
            chainId: getChainIdHex(),
            atomicRequired: els.atomicRequired.checked,
            ...(customBatchId ? { id: customBatchId } : {}),
            calls,
          },
        ],
      });
      lastBatchId = (result && result.id) || '';
      syncButtons();
      showResult(result);
    } catch (error) {
      showError(error);
    }
  };

  // Status methods query the custom batch id field when filled (so unknown
  // ids can be exercised against the 5730 path) and otherwise fall back to
  // the id returned by the last successful wallet_sendCalls.
  const getStatusBatchId = () => {
    const id = els.customBatchId.value.trim() || lastBatchId;
    if (!id) {
      throw new Error(
        'Send a batch first or enter a custom batch id to query.',
      );
    }
    return id;
  };

  els.callsStatus.onclick = async () => {
    try {
      const result = await getProvider().request({
        method: 'wallet_getCallsStatus',
        params: [getStatusBatchId()],
      });
      const labels = {
        100: 'pending',
        200: 'confirmed',
        400: 'failed offchain',
        500: 'reverted',
        600: 'partially reverted',
      };
      const label = labels[result && result.status] || 'unknown';
      showResult(
        `status ${result && result.status} (${label})\n${pretty(result)}`,
      );
    } catch (error) {
      showError(error);
    }
  };

  els.showCallsStatus.onclick = async () => {
    try {
      const result = await getProvider().request({
        method: 'wallet_showCallsStatus',
        params: [getStatusBatchId()],
      });
      showResult(
        `wallet_showCallsStatus resolved (${pretty(
          result,
        )}); the wallet popup shows the batch status.`,
      );
    } catch (error) {
      showError(error);
    }
  };

  els.loadModules.onclick = async () => {
    try {
      const result = await getProvider().request({
        method: 'wallet_getSmartAccountModules',
        params: [],
      });
      showResult(result);
    } catch (error) {
      showError(error);
    }
  };

  els.installModule.onclick = async () => {
    try {
      const address = requireAddress(els.moduleAddress.value, 'Module address');
      const initData = els.moduleInitData.value.trim();
      if (initData && !ethers.utils.isHexString(initData)) {
        throw new Error('Install init data must be 0x-prefixed hex.');
      }
      const module = { address };
      if (initData) {
        module.initData = initData;
      }
      const name = els.moduleName.value.trim();
      if (name) {
        module.name = name;
      }
      const result = await getProvider().request({
        method: 'wallet_requestSmartAccountModuleInstall',
        params: [module],
      });
      showResult(result);
    } catch (error) {
      showError(error);
    }
  };

  els.uninstallModule.onclick = async () => {
    try {
      const address = requireAddress(els.moduleAddress.value, 'Module address');
      const result = await getProvider().request({
        method: 'wallet_requestSmartAccountModuleUninstall',
        params: [{ address }],
      });
      showResult(result);
    } catch (error) {
      showError(error);
    }
  };
}
