import globalContext from '../..';

const DEFAULT_SPONSOR_MODE = 'required';
const DEFAULT_SPONSOR_POLICY =
  'Sponsor co-authorization is required for this passkey smart account.';

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
            Use this section with Pali on localhost to test dapp-driven passkey smart account create/recovery.
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
              <option value="disabled">disabled</option>
              <option value="gasOnly">gasOnly</option>
              <option value="required" selected>required</option>
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
            Login / Create or Recover Passkey Account
          </button>

          <p class="info-text alert alert-success">
            Passkey account: <span id="paliPasskeyAccountAddress"></span>
          </p>

          <hr />

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
  const batchButton = document.getElementById('paliPasskeyBatchSend');
  const labelInput = document.getElementById('paliPasskeyLabel');
  const sponsorModeInput = document.getElementById('paliPasskeySponsorMode');
  const sponsorUrlInput = document.getElementById('paliPasskeySponsorUrl');
  const sponsorSignerInput = document.getElementById(
    'paliPasskeySponsorSigner',
  );
  const policyTextInput = document.getElementById('paliPasskeyPolicyText');
  const passkeyAddressOutput = document.getElementById(
    'paliPasskeyAccountAddress',
  );
  const callsInput = document.getElementById('paliPasskeyBatchCalls');
  const resultOutput = document.getElementById('paliPasskeyResult');

  callsInput.value = formatResult(getDefaultCalls(''));

  document.addEventListener('globalConnectionChange', function (event) {
    createButton.disabled = !event.detail.connected;
    batchButton.disabled = !event.detail.connected;
  });

  document.addEventListener('disableAndClear', function () {
    createButton.disabled = true;
    batchButton.disabled = true;
    passkeyAddressOutput.innerText = '';
    resultOutput.innerText = '';
    callsInput.value = formatResult(getDefaultCalls(''));
  });

  createButton.onclick = async () => {
    try {
      const provider = getActiveProvider();
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
      passkeyAddressOutput.innerText = address;
      resultOutput.innerText = formatResult(result);
      callsInput.value = formatResult(getDefaultCalls(address));

      const accounts = await provider.request({ method: 'eth_accounts' });
      globalContext.accounts = accounts || globalContext.accounts;
    } catch (error) {
      console.error(error);
      resultOutput.innerText = `Error: ${error.message}`;
    }
  };

  batchButton.onclick = async () => {
    try {
      const provider = getActiveProvider();
      const from =
        passkeyAddressOutput.innerText ||
        (globalContext.accounts && globalContext.accounts[0]) ||
        '';
      if (!from) {
        throw new Error('Create/recover or connect a passkey account first.');
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
