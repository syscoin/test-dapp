import globalContext from '..';
import metadata, { WALLET_CONNECT_PROJECT_ID } from '../dapp-metadata';
import {
  createPaliWalletConnect,
  SYSCOIN_METHODS,
} from '../pali-walletconnect';

const CHAINS = {
  mainnet: 'bip122:0000022642db0346b6e01c2a397471f4',
  testnet: 'bip122:0000066e1a6b9cfeac8295dce0cc8d91',
};
export function syscoinOperationsComponent(container) {
  container.insertAdjacentHTML(
    'beforeend',
    `<div class="col-xl-4 col-lg-6 col-md-12 col-sm-12 col-12 d-flex align-items-stretch">
      <div class="card full-width">
        <div class="card-body">
          <h4 class="card-title">Syscoin UTXO and Sentry Nodes</h4>
          <p>Use Pali in a Syscoin UTXO network. Use test wallets and synthetic transactions for QA.</p>
          <label for="syscoinWalletConnectChain">Mobile WalletConnect network</label>
          <select class="form-control mb-2" id="syscoinWalletConnectChain">
            <option value="testnet">Syscoin Tanenbaum UTXO</option>
            <option value="mainnet">Syscoin Mainnet UTXO</option>
          </select>
          <button class="btn btn-outline-primary btn-block mb-3" id="syscoinWalletConnect">
            Connect Pali Mobile
          </button>
          <label for="syscoinMethod">Method</label>
          <select class="form-control mb-2" id="syscoinMethod">
            ${SYSCOIN_METHODS.map(
              (method) => `<option>${method}</option>`,
            ).join('')}
          </select>
          <label for="syscoinParams">Parameters (JSON array)</label>
          <textarea class="form-control mb-2" id="syscoinParams" rows="4">[]</textarea>
          <button class="btn btn-primary btn-block" id="syscoinRequest">Request</button>
          <pre class="mt-2 text-wrap" id="syscoinResult" aria-live="polite"></pre>
        </div>
      </div>
    </div>`,
  );

  const network = document.getElementById('syscoinWalletConnectChain');
  const connect = document.getElementById('syscoinWalletConnect');
  const method = document.getElementById('syscoinMethod');
  const params = document.getElementById('syscoinParams');
  const request = document.getElementById('syscoinRequest');
  const result = document.getElementById('syscoinResult');
  const walletConnect = createPaliWalletConnect({
    metadata,
    projectId: WALLET_CONNECT_PROJECT_ID,
    namespace: 'bip122',
  });
  let mobileProvider;
  const showError = (error) => {
    result.textContent = error.code
      ? `${error.code}: ${error.message}`
      : error.message;
  };
  const setMobileProvider = (provider) => {
    mobileProvider = provider;
    connect.textContent = provider
      ? 'Disconnect Pali Mobile'
      : 'Connect Pali Mobile';
    network.disabled = Boolean(provider);
  };
  walletConnect.onDisconnect(() => setMobileProvider(undefined));
  connect.onclick = async () => {
    connect.disabled = true;
    result.textContent = '';
    try {
      if (mobileProvider) {
        await walletConnect.disconnect();
      } else {
        setMobileProvider(await walletConnect.connect([CHAINS[network.value]]));
      }
    } catch (error) {
      showError(error);
    } finally {
      connect.disabled = false;
    }
  };
  request.onclick = async () => {
    request.disabled = true;
    result.textContent = '';
    try {
      const injected = [window.pali, window.paliCanary];
      const selected = injected.find(
        (provider) => provider && provider === globalContext.provider,
      );
      const provider =
        mobileProvider || selected || window.pali || window.paliCanary;
      if (!provider || typeof provider.request !== 'function') {
        throw new Error('Open the Pali extension or connect Pali Mobile.');
      }
      const args = JSON.parse(params.value);
      if (!Array.isArray(args)) {
        throw new Error('Parameters must be a JSON array.');
      }
      result.textContent = JSON.stringify(
        await provider.request({ method: method.value, params: args }),
        null,
        2,
      );
    } catch (error) {
      showError(error);
    } finally {
      request.disabled = false;
    }
  };
}
