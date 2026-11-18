import { ethers } from 'ethers';
import globalContext from '../..';
import {
  sponsorshipProbeAbi,
  sponsorshipProbeBytecode,
} from './sponsorship-probe';

// A zero-to-nonzero SSTORE costs 20,000 gas plus 2,100 for cold slot access.
const STORAGE_GAS_PER_ITERATION = 22100;
const MAX_ITERATIONS = 500;

const probeInterface = new ethers.utils.Interface(sponsorshipProbeAbi);

export function sponsorshipComponent(parentContainer) {
  parentContainer.insertAdjacentHTML(
    'beforeend',
    `<div class="col-xl-4 col-lg-6 col-md-12 col-sm-12 col-12 d-flex align-items-stretch">
        <div class="card full-width">
            <div class="card-body">
            <h4 class="card-title">
                Paid by MetaMask
            </h4>
            <p class="info-text alert alert-secondary">
                Use on Monad with an upgraded account to test Gas Sponsorship.
            </p>

            <button
                class="btn btn-primary btn-lg btn-block mb-3"
                id="deploySponsorshipProbeButton"
                disabled
            >
                Deploy gas burner
            </button>

            <p class="info-text alert alert-secondary">
                Contract: <span id="sponsorshipAddress" style="word-break: break-all;">Not deployed</span>
            </p>

            <div class="form-group">
                <label for="sponsorshipIterations">
                    Fresh storage writes (~22.1k gas each)
                </label>
                <input
                    class="form-control"
                    type="number"
                    id="sponsorshipIterations"
                    value="100"
                    min="1"
                    max="${MAX_ITERATIONS}"
                />
            </div>

            <button
                class="btn btn-primary btn-lg btn-block mb-3"
                id="burnGasButton"
                disabled
            >
                Burn gas
            </button>

            <p class="info-text alert alert-secondary">
                Status: <span id="sponsorshipStatus">Not clicked</span>
            </p>
            </div>
        </div>
    </div>`,
  );

  const deployButton = document.getElementById('deploySponsorshipProbeButton');
  const burnGasButton = document.getElementById('burnGasButton');
  const iterationsInput = document.getElementById('sponsorshipIterations');
  const contractAddress = document.getElementById('sponsorshipAddress');
  const status = document.getElementById('sponsorshipStatus');

  let probeContract;
  let chainId = globalContext.chainIdInt;
  let probeRevision = 0;

  const clearProbe = () => {
    probeRevision += 1;
    probeContract = undefined;
    burnGasButton.disabled = true;
    contractAddress.textContent = 'Not deployed';
    status.textContent = 'Not clicked';
  };

  document.addEventListener('globalConnectionChange', (event) => {
    if (event.detail.connected) {
      deployButton.disabled = false;
    }
  });

  document.addEventListener('disableAndClear', () => {
    deployButton.disabled = true;
    clearProbe();
  });

  document.addEventListener('newChainIdInt', ({ detail }) => {
    if (chainId === detail.chainIdInt) {
      return;
    }
    const wasOnNetwork = chainId !== undefined;
    chainId = detail.chainIdInt;
    clearProbe();
    if (wasOnNetwork && chainId !== undefined) {
      status.textContent = 'Network changed. Deploy the gas burner again.';
    }
  });

  const readIterations = () => {
    const iterations = Number.parseInt(iterationsInput.value, 10);
    if (
      !Number.isInteger(iterations) ||
      iterations < 1 ||
      iterations > MAX_ITERATIONS
    ) {
      throw new Error(
        `Iterations must be an integer from 1 to ${MAX_ITERATIONS}.`,
      );
    }
    return iterations;
  };

  deployButton.onclick = async () => {
    probeRevision += 1;
    const revision = probeRevision;
    status.textContent = 'Deploying';
    burnGasButton.disabled = true;
    try {
      const factory = new ethers.ContractFactory(
        sponsorshipProbeAbi,
        sponsorshipProbeBytecode,
        globalContext.ethersProvider.getSigner(),
      );
      const deployed = await factory.deploy();
      if (revision !== probeRevision) {
        return;
      }
      await deployed.deployTransaction.wait();
      if (revision !== probeRevision) {
        return;
      }
      if (!deployed.address) {
        status.textContent = 'Deployment failed';
        burnGasButton.disabled = !probeContract;
        return;
      }

      probeContract = deployed;
      burnGasButton.disabled = false;
      contractAddress.textContent = deployed.address;
      status.textContent = 'Deployed';
      console.log(
        `Sponsorship probe mined at ${deployed.address} tx ${deployed.deployTransaction.hash}`,
      );
    } catch (error) {
      if (revision !== probeRevision) {
        return;
      }
      status.textContent = error.message || 'Deployment failed';
      burnGasButton.disabled = !probeContract;
      console.log('error', error);
      throw error;
    }
  };

  burnGasButton.onclick = async () => {
    const revision = probeRevision;
    try {
      if (!probeContract) {
        throw new Error('Deploy the gas burner first.');
      }
      const iterations = readIterations();
      const storageGas = iterations * STORAGE_GAS_PER_ITERATION;
      status.textContent = `Waiting for wallet approval. About ${storageGas} gas for storage writes plus overhead.`;
      const txHash = await globalContext.provider.request({
        method: 'eth_sendTransaction',
        params: [
          {
            from: globalContext.accounts[0],
            to: probeContract.address,
            data: probeInterface.encodeFunctionData('burn', [iterations]),
          },
        ],
      });
      if (revision !== probeRevision) {
        return;
      }
      status.textContent = `Submitted ${txHash}. Check gasUsed on the explorer after confirmation.`;
      console.log('burn gas', txHash);
    } catch (error) {
      if (revision !== probeRevision) {
        return;
      }
      status.textContent = error.message || 'Burn failed';
      console.log('error', error);
      throw error;
    }
  };
}
