import { ethers } from 'ethers';

import globalContext from '../..';
import Constants from '../../constants.json';

const DEFAULT_SPONSOR_MODE = 'disabled';
const DEFAULT_SPONSOR_POLICY =
  'Sponsor co-authorization is required for this passkey smart account.';
const ERC20_INTERFACE = new ethers.utils.Interface([
  'function approve(address spender,uint256 amount)',
]);
const TOKEN_SPENDER_INTERFACE = new ethers.utils.Interface(
  Constants.tokenSpenderAbi,
);

function getActiveProvider() {
  if (globalContext.provider) {
    return globalContext.provider;
  }
  return window.ethereum;
}

function getCurrentChainId() {
  if (globalContext.chainIdInt) {
    return `0x${globalContext.chainIdInt.toString(16)}`;
  }
  return '0x1';
}

function formatResult(value) {
  return JSON.stringify(value, null, 2);
}

function parseCalls(value) {
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new Error('Calls JSON must be an array.');
  }
  return parsed;
}

function getDefaultCalls(from) {
  const target = from || '0x0000000000000000000000000000000000000000';
  return [
    {
      to: target,
      value: '0x0',
      data: '0x',
    },
    {
      to: target,
      value: '0x0',
      data: '0x',
    },
  ];
}

let lastPasskeyAccountAddress = '';

export function paliPasskeysComponent(parentContainer) {
  parentContainer.insertAdjacentHTML(
    'beforeend',
    `<div class="col-xl-4 col-lg-6 col-md-12 col-sm-12 col-12 d-flex align-items-stretch">
      <div class="card full-width">
        <div class="card-body">
          <h4 class="card-title">
            Pali Passkeys
          </h4>

          <p class="info-text alert alert-secondary">
            Use this section with Pali to test dapp-driven passkey smart account creation/registration, policy setup, and batched execution.
          </p>

          <div class="form-group">
            <label>Passkey Account Label</label>
            <input
              class="form-control"
              id="paliPasskeyLabel"
              value="Institution Test Passkey"
            />
          </div>

          <div class="form-group">
            <label>Sponsor Mode</label>
            <select class="form-control" id="paliPasskeySponsorMode">
              <option value="disabled" selected>disabled</option>
              <option value="gasOnly">gasOnly</option>
              <option value="required">required</option>
            </select>
          </div>

          <div class="form-group">
            <label>Sponsor Service URL</label>
            <input
              class="form-control"
              id="paliPasskeySponsorUrl"
              placeholder="https://institution.example/sponsor/user-123"
            />
          </div>

          <div class="form-group">
            <label>Sponsor Signer Address</label>
            <input
              class="form-control"
              id="paliPasskeySponsorSigner"
              placeholder="0x..."
            />
          </div>

          <div class="form-group">
            <label>Policy Text</label>
            <input
              class="form-control"
              id="paliPasskeyPolicyText"
              value="${DEFAULT_SPONSOR_POLICY}"
            />
          </div>

          <button
            class="btn btn-primary btn-lg btn-block mb-3"
            id="paliCreatePasskeyAccount"
            disabled
          >
            Create / Register Passkey Account
          </button>

          <div class="form-group">
            <label>Existing Passkey Account</label>
            <input
              class="form-control"
              id="paliExistingPasskeyAccount"
              placeholder="0x..."
            />
            <small class="form-text text-muted">
              Paste an already-created passkey smart account address to reuse it
              for the batch below.
            </small>
          </div>

          <button
            class="btn btn-secondary btn-lg btn-block mb-3"
            id="paliUseExistingPasskeyAccount"
            disabled
          >
            Use Existing Passkey Account
          </button>

          <p class="info-text alert alert-success">
            Passkey account: <span id="paliPasskeyAccountAddress"></span>
          </p>

          <hr />

          <h5>ERC20 Allowance Batch Builder</h5>

          <p class="info-text alert alert-secondary">
            Deploy a test ERC20 and spender with the remembered gas payer, then
            send approve + transferFrom as the selected passkey account.
          </p>

          <p class="info-text alert alert-success">
            Gas payer: <span id="paliPasskeyGasPayerAddress"></span>
          </p>

          <div class="form-group">
            <label>Token Decimals</label>
            <input
              class="form-control"
              id="paliPasskeyErc20Decimals"
              value="18"
            />
          </div>

          <button
            class="btn btn-secondary btn-lg btn-block mb-3"
            id="paliDeployTestErc20"
            disabled
          >
            Deploy + Fund Test ERC20 With Gas Payer
          </button>

          <div class="form-group">
            <label>ERC20 Contract</label>
            <input
              class="form-control"
              id="paliPasskeyErc20Token"
              placeholder="0x..."
            />
            <small class="form-text text-muted">
              Paste an existing ERC20 or deploy a test token above.
            </small>
          </div>

          <button
            class="btn btn-secondary btn-lg btn-block mb-3"
            id="paliDeployTokenSpender"
            disabled
          >
            Deploy Test Token Spender For ERC20
          </button>

          <p class="info-text alert alert-success">
            Token spender: <span id="paliTokenSpenderAddress"></span>
          </p>

          <div class="form-group">
            <label>Token Spender Contract</label>
            <input
              class="form-control"
              id="paliPasskeyErc20Spender"
              placeholder="0x..."
            />
          </div>

          <div class="form-group">
            <label>Transfer Recipient</label>
            <input
              class="form-control"
              id="paliPasskeySpendRecipient"
              placeholder="0x..."
            />
          </div>

          <div class="form-group">
            <label>Token Amount To Approve And Spend</label>
            <input
              class="form-control"
              id="paliPasskeyErc20Amount"
              value="1"
            />
          </div>

          <button
            class="btn btn-secondary btn-lg btn-block mb-3"
            id="paliBuildErc20AllowanceBatch"
            disabled
          >
            Build ERC20 Approve + TransferFrom Batch JSON
          </button>

          <div class="form-group">
            <label>Batch Calls JSON</label>
            <textarea
              class="form-control"
              id="paliPasskeyBatchCalls"
              rows="8"
            ></textarea>
          </div>

          <button
            class="btn btn-primary btn-lg btn-block mb-3"
            id="paliPasskeyBatchSend"
            disabled
          >
            Send Passkey Batch with wallet_sendCalls
          </button>

          <p class="info-text alert alert-secondary">
            Result: <span class="wrap" id="paliPasskeyResult"></span>
          </p>
        </div>
      </div>
    </div>`,
  );

  const createButton = document.getElementById('paliCreatePasskeyAccount');
  const useExistingPasskeyButton = document.getElementById(
    'paliUseExistingPasskeyAccount',
  );
  const deployTestErc20Button = document.getElementById(
    'paliDeployTestErc20',
  );
  const deployTokenSpenderButton = document.getElementById(
    'paliDeployTokenSpender',
  );
  const buildErc20BatchButton = document.getElementById(
    'paliBuildErc20AllowanceBatch',
  );
  const batchButton = document.getElementById('paliPasskeyBatchSend');
  const labelInput = document.getElementById('paliPasskeyLabel');
  const sponsorModeInput = document.getElementById('paliPasskeySponsorMode');
  const sponsorUrlInput = document.getElementById('paliPasskeySponsorUrl');
  const sponsorSignerInput = document.getElementById(
    'paliPasskeySponsorSigner',
  );
  const policyTextInput = document.getElementById('paliPasskeyPolicyText');
  const existingPasskeyAccountInput = document.getElementById(
    'paliExistingPasskeyAccount',
  );
  const passkeyAddressOutput = document.getElementById(
    'paliPasskeyAccountAddress',
  );
  const gasPayerAddressOutput = document.getElementById(
    'paliPasskeyGasPayerAddress',
  );
  const tokenSpenderAddressOutput = document.getElementById(
    'paliTokenSpenderAddress',
  );
  const callsInput = document.getElementById('paliPasskeyBatchCalls');
  const erc20TokenInput = document.getElementById('paliPasskeyErc20Token');
  const erc20SpenderInput = document.getElementById('paliPasskeyErc20Spender');
  const spendRecipientInput = document.getElementById(
    'paliPasskeySpendRecipient',
  );
  const erc20DecimalsInput = document.getElementById(
    'paliPasskeyErc20Decimals',
  );
  const erc20AmountInput = document.getElementById('paliPasskeyErc20Amount');
  const resultOutput = document.getElementById('paliPasskeyResult');
  let gasPayerAddress = '';

  function syncSponsorFields() {
    const sponsorDisabled = sponsorModeInput.value === 'disabled';
    sponsorUrlInput.disabled = sponsorDisabled;
    sponsorSignerInput.disabled = sponsorDisabled;
    policyTextInput.disabled = sponsorDisabled;
  }

  function getPasskeyAccountAddress() {
    return passkeyAddressOutput.innerText || lastPasskeyAccountAddress || '';
  }

  function getConnectedAccountAddress() {
    return (globalContext.accounts && globalContext.accounts[0]) || '';
  }

  function isSameAddress(addressA, addressB) {
    return (
      ethers.utils.isAddress(addressA) &&
      ethers.utils.isAddress(addressB) &&
      addressA.toLowerCase() === addressB.toLowerCase()
    );
  }

  function syncGasPayerOutput() {
    gasPayerAddressOutput.innerText = gasPayerAddress || '';
  }

  function rememberConnectedGasPayer() {
    const connectedAccount = getConnectedAccountAddress();
    if (
      ethers.utils.isAddress(connectedAccount) &&
      !isSameAddress(connectedAccount, getPasskeyAccountAddress())
    ) {
      gasPayerAddress = connectedAccount;
      syncGasPayerOutput();
    }
  }

  function getGasPayerAddress() {
    rememberConnectedGasPayer();
    if (!ethers.utils.isAddress(gasPayerAddress)) {
      throw new Error(
        'Connect a gas-paying non-passkey account before deploying contracts.',
      );
    }
    if (isSameAddress(gasPayerAddress, getPasskeyAccountAddress())) {
      throw new Error(
        'Gas payer cannot be the selected passkey account. Connect an EOA first.',
      );
    }
    return gasPayerAddress;
  }

  function syncConnectedAccountFallback() {
    rememberConnectedGasPayer();
    passkeyAddressOutput.innerText = lastPasskeyAccountAddress;
  }

  let isConnected = false;

  function syncUseExistingPasskeyButton() {
    useExistingPasskeyButton.disabled =
      !isConnected ||
      !ethers.utils.isAddress(existingPasskeyAccountInput.value.trim());
  }

  function syncDeployTokenSpenderButton() {
    deployTokenSpenderButton.disabled =
      !isConnected ||
      !ethers.utils.isAddress(gasPayerAddress) ||
      !ethers.utils.isAddress(erc20TokenInput.value.trim());
  }

  function syncDeployTestErc20Button() {
    deployTestErc20Button.disabled =
      !isConnected || !ethers.utils.isAddress(gasPayerAddress);
  }

  function syncDeployButtons() {
    rememberConnectedGasPayer();
    syncDeployTestErc20Button();
    syncDeployTokenSpenderButton();
  }

  callsInput.value = formatResult(getDefaultCalls(''));
  syncSponsorFields();
  syncUseExistingPasskeyButton();
  syncGasPayerOutput();
  syncDeployButtons();

  sponsorModeInput.onchange = syncSponsorFields;
  existingPasskeyAccountInput.oninput = syncUseExistingPasskeyButton;
  erc20TokenInput.oninput = syncDeployButtons;

  document.addEventListener('globalConnectionChange', function (event) {
    isConnected = event.detail.connected;
    createButton.disabled = !event.detail.connected;
    syncConnectedAccountFallback();
    syncUseExistingPasskeyButton();
    syncDeployButtons();
    buildErc20BatchButton.disabled = !event.detail.connected;
    batchButton.disabled = !event.detail.connected;
  });

  document.addEventListener('disableAndClear', function () {
    isConnected = false;
    createButton.disabled = true;
    useExistingPasskeyButton.disabled = true;
    deployTestErc20Button.disabled = true;
    deployTokenSpenderButton.disabled = true;
    buildErc20BatchButton.disabled = true;
    batchButton.disabled = true;
    lastPasskeyAccountAddress = '';
    gasPayerAddress = '';
    existingPasskeyAccountInput.value = '';
    passkeyAddressOutput.innerText = '';
    gasPayerAddressOutput.innerText = '';
    tokenSpenderAddressOutput.innerText = '';
    resultOutput.innerText = '';
    callsInput.value = formatResult(getDefaultCalls(''));
  });

  createButton.onclick = async () => {
    try {
      const provider = getActiveProvider();
      rememberConnectedGasPayer();
      const sponsor = getSponsor();
      const result = await provider.request({
        method: 'wallet_createPasskeyAccount',
        params: [
          {
            label: labelInput.value || 'Institution Test Passkey',
            sponsor,
          },
        ],
      });

      const address = (result && result.address) || '';
      lastPasskeyAccountAddress = address;
      passkeyAddressOutput.innerText = address;
      resultOutput.innerText = formatResult(result);
      callsInput.value = formatResult(getDefaultCalls(address));

      const accounts = await provider.request({ method: 'eth_accounts' });
      globalContext.accounts = accounts || globalContext.accounts;
      syncDeployButtons();
    } catch (error) {
      console.error(error);
      resultOutput.innerText = `Error: ${error.message}`;
    }
  };

  useExistingPasskeyButton.onclick = () => {
    try {
      const address = existingPasskeyAccountInput.value.trim();
      if (!ethers.utils.isAddress(address)) {
        throw new Error('Enter a valid existing passkey account address.');
      }
      lastPasskeyAccountAddress = address;
      passkeyAddressOutput.innerText = address;
      callsInput.value = formatResult(getDefaultCalls(address));
      syncDeployButtons();
      resultOutput.innerText = `Using existing passkey account: ${address}`;
    } catch (error) {
      console.error(error);
      resultOutput.innerText = `Error: ${error.message}`;
    }
  };

  deployTestErc20Button.onclick = async () => {
    try {
      const provider = getActiveProvider();
      const gasPayer = getGasPayerAddress();
      const decimals = Number(erc20DecimalsInput.value || '18');
      if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
        throw new Error('Enter valid token decimals.');
      }

      const ethersProvider = new ethers.providers.Web3Provider(provider);
      const signer = ethersProvider.getSigner(gasPayer);
      const factory = new ethers.ContractFactory(
        Constants.hstAbi,
        Constants.hstBytecode,
        signer,
      );
      const contract = await factory.deploy(10, 'TST', decimals, 'TST');
      await contract.deployTransaction.wait();

      const passkeyAddress = getPasskeyAccountAddress();
      if (ethers.utils.isAddress(passkeyAddress)) {
        const amount = erc20AmountInput.value || '1';
        const tokenAmount = ethers.utils.parseUnits(amount, decimals);
        const transfer = await contract.transfer(passkeyAddress, tokenAmount);
        await transfer.wait();
      }

      globalContext.hstContract = contract;
      globalContext.deployedContractAddress = contract.address;
      globalContext.tokenDecimals = String(decimals);
      erc20TokenInput.value = contract.address;
      syncDeployButtons();
      resultOutput.innerText = ethers.utils.isAddress(passkeyAddress)
        ? `Test ERC20 deployed and passkey funded: ${contract.address}`
        : `Test ERC20 deployed: ${contract.address}`;
    } catch (error) {
      console.error(error);
      resultOutput.innerText = `Error: ${error.message}`;
    }
  };

  deployTokenSpenderButton.onclick = async () => {
    try {
      const provider = getActiveProvider();
      const token = erc20TokenInput.value.trim();
      if (!ethers.utils.isAddress(token)) {
        throw new Error('Enter a valid ERC20 contract address first.');
      }
      const gasPayer = getGasPayerAddress();
      const ethersProvider = new ethers.providers.Web3Provider(provider);
      const signer = ethersProvider.getSigner(gasPayer);
      const factory = new ethers.ContractFactory(
        Constants.tokenSpenderAbi,
        Constants.tokenSpenderBytecode,
        signer,
      );
      const contract = await factory.deploy(token);
      await contract.deployTransaction.wait();
      tokenSpenderAddressOutput.innerText = contract.address;
      erc20SpenderInput.value = contract.address;
      resultOutput.innerText = `Token spender deployed: ${contract.address}`;
    } catch (error) {
      console.error(error);
      resultOutput.innerText = `Error: ${error.message}`;
    }
  };

  buildErc20BatchButton.onclick = () => {
    try {
      const token = erc20TokenInput.value.trim();
      const spender =
        erc20SpenderInput.value.trim() || tokenSpenderAddressOutput.innerText;
      const recipient = spendRecipientInput.value.trim();
      const decimals = Number(erc20DecimalsInput.value || '18');
      const amount = erc20AmountInput.value || '0';

      if (!ethers.utils.isAddress(token)) {
        throw new Error('Enter a valid ERC20 contract address.');
      }
      if (!ethers.utils.isAddress(spender)) {
        throw new Error('Deploy or enter a valid token spender address.');
      }
      if (!ethers.utils.isAddress(recipient)) {
        throw new Error('Enter a valid transfer recipient address.');
      }
      if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
        throw new Error('Enter valid token decimals.');
      }

      const tokenAmount = ethers.utils.parseUnits(amount, decimals);
      const passkeyAddress = getPasskeyAccountAddress();
      if (!ethers.utils.isAddress(passkeyAddress)) {
        throw new Error('Create / register a passkey account first.');
      }
      callsInput.value = formatResult([
        {
          to: token,
          value: '0x0',
          data: ERC20_INTERFACE.encodeFunctionData('approve', [
            spender,
            tokenAmount,
          ]),
        },
        {
          to: spender,
          value: '0x0',
          data: TOKEN_SPENDER_INTERFACE.encodeFunctionData('transferFrom', [
            passkeyAddress,
            recipient,
            tokenAmount,
          ]),
        },
      ]);
      resultOutput.innerText =
        'Built ERC20 approve + test spender transferFrom batch JSON.';
    } catch (error) {
      console.error(error);
      resultOutput.innerText = `Error: ${error.message}`;
    }
  };

  batchButton.onclick = async () => {
    try {
      const provider = getActiveProvider();
      const from = getPasskeyAccountAddress();
      if (!from) {
        throw new Error('Create / register a passkey account first.');
      }

      const result = await provider.request({
        method: 'wallet_sendCalls',
        params: [
          {
            version: '2.0.0',
            from,
            chainId: getCurrentChainId(),
            atomicRequired: true,
            calls: parseCalls(callsInput.value),
          },
        ],
      });

      resultOutput.innerText = formatResult(result);
    } catch (error) {
      console.error(error);
      resultOutput.innerText = `Error: ${error.message}`;
    }
  };

  function getSponsor() {
    const mode = sponsorModeInput.value || DEFAULT_SPONSOR_MODE;
    const sponsor = {
      mode,
    };

    if (mode === 'disabled') {
      return sponsor;
    }

    const url = sponsorUrlInput.value.trim();
    const signer = sponsorSignerInput.value.trim();
    const policyText = policyTextInput.value.trim();

    if (url) {
      sponsor.url = url;
    }
    if (signer) {
      sponsor.signer = signer;
    }
    if (policyText) {
      sponsor.policyText = policyText;
    }

    return sponsor;
  }
}
