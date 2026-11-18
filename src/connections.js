import dappMetadata, { WALLET_CONNECT_PROJECT_ID } from './dapp-metadata';
import { createPaliWalletConnect } from './pali-walletconnect';
import {
  handleNewProviderDetail,
  removeProviderDetail,
  setActiveProviderDetail,
  updateFormElements,
  updateSdkConnectionState,
  updateWalletConnectState,
} from '.';

let sdkPromise;
function getSdk() {
  if (!sdkPromise) {
    sdkPromise = import('@metamask/sdk')
      .then(({ MetaMaskSDK }) => new MetaMaskSDK({ dappMetadata }))
      .catch((error) => {
        sdkPromise = undefined;
        throw error;
      });
  }
  return sdkPromise;
}

const walletConnect = createPaliWalletConnect({
  metadata: dappMetadata,
  projectId: WALLET_CONNECT_PROJECT_ID,
});
const WALLET_CONNECT_NAME = 'WalletConnect';

function _setProviderDetail(provider, name, uuid) {
  const providerDetail = {
    info: {
      uuid,
      name,
      icon: `./${name}.svg`,
      rdns: 'io.metamask',
    },
    provider,
  };
  return providerDetail;
}

export async function handleSdkConnect(name, button, isConnected) {
  const sdk = await getSdk();
  if (isConnected) {
    updateSdkConnectionState(false);
    const activeProviderRemoved = removeProviderDetail(name);
    await sdk.terminate();
    button.innerText = 'Sdk Connect';
    button.classList.add('btn-primary');
    button.classList.remove('btn-danger');
    if (activeProviderRemoved) {
      updateFormElements();
    }
  } else {
    await sdk.connect();
    const provider = sdk.getProvider();
    const uuid = sdk.getChannelId() || name;
    const providerDetail = _setProviderDetail(provider, name, uuid);
    await setActiveProviderDetail(providerDetail);
    handleNewProviderDetail(providerDetail);
    updateSdkConnectionState(true);
    button.innerText = 'Sdk Connect - Disconnect';
    button.classList.remove('btn-primary');
    button.classList.add('btn-danger');
  }
}

function setWalletConnectControls(button, chains, connected) {
  updateWalletConnectState(connected);
  button.innerText = connected
    ? 'Disconnect WalletConnect'
    : WALLET_CONNECT_NAME;
  button.classList.toggle('btn-primary', !connected);
  button.classList.toggle('btn-danger', connected);
  chains.disabled = connected;
}

let unsubscribeWalletDisconnect;

export async function handleWalletConnect(button, isConnected) {
  const chains = document.getElementById('walletConnectChains');
  const error = document.getElementById('walletConnectError');
  error.textContent = '';
  button.disabled = true;
  const clearConnection = () => {
    unsubscribeWalletDisconnect?.();
    unsubscribeWalletDisconnect = undefined;
    setWalletConnectControls(button, chains, false);
    if (removeProviderDetail(WALLET_CONNECT_NAME)) {
      updateFormElements();
    }
  };
  try {
    if (isConnected) {
      await walletConnect.disconnect();
      return;
    }
    const provider = await walletConnect.connect(
      chains.value.split(',').map((chain) => chain.trim()),
    );
    const providerDetail = {
      info: {
        uuid: 'wallet-connect',
        name: WALLET_CONNECT_NAME,
        icon: './wallet-connect.svg',
        rdns: 'org.walletconnect',
      },
      provider,
    };
    handleNewProviderDetail(providerDetail);
    unsubscribeWalletDisconnect = walletConnect.onDisconnect(clearConnection);
    await setActiveProviderDetail(providerDetail);
    if (unsubscribeWalletDisconnect) {
      setWalletConnectControls(button, chains, true);
    }
    updateFormElements();
  } catch (err) {
    error.textContent = err.message || 'WalletConnect failed.';
  } finally {
    button.disabled = false;
  }
}
