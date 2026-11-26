/* eslint-disable import/no-mutable-exports */
import { recoverPersonalSignature } from '@metamask/eth-sig-util';
import globalContext from '../..';

function isConnectedSigner(recovered, connected) {
  const ethereumAddress = /^0x[0-9a-f]{40}$/iu;
  return (
    typeof recovered === 'string' &&
    typeof connected === 'string' &&
    ethereumAddress.test(recovered) &&
    ethereumAddress.test(connected) &&
    recovered.toLowerCase() === connected.toLowerCase()
  );
}

export function personalSignComponent(parentContainer) {
  parentContainer.insertAdjacentHTML(
    'beforeend',
    `<div class="col-xl-4 col-lg-6 col-md-12 col-sm-12 col-12 d-flex align-items-stretch">
      <div class="card full-width">
        <div class="card-body">
          <h4>
            Personal Sign
          </h4>

          <button
            class="btn btn-primary btn-lg btn-block mb-3"
            id="personalSign"
            disabled
          >
            Sign
          </button>

          <p class="info-text alert alert-warning">
            Result: <span id="personalSignResult"></span>
            <span id="personalSignError" role="status"></span>
          </p>

          <button
            class="btn btn-primary btn-lg btn-block mb-3"
            id="personalSignVerify"
            disabled
          >
            Verify
          </button>

          <p class="info-text alert alert-warning">
            eth-sig-util recovery result:
            <span id="personalSignVerifySigUtilResult"></span>
          </p>
          <p class="info-text alert alert-warning">
            personal_ecRecover result:
            <span id="personalSignVerifyECRecoverResult"></span>
          </p>
        </div>
      </div>
    </div>`,
  );

  const personalSign = document.getElementById('personalSign');
  const personalSignResult = document.getElementById('personalSignResult');
  const personalSignError = document.getElementById('personalSignError');
  const personalSignVerify = document.getElementById('personalSignVerify');
  const personalSignVerifySigUtilResult = document.getElementById(
    'personalSignVerifySigUtilResult',
  );
  const personalSignVerifyECRecoverResult = document.getElementById(
    'personalSignVerifyECRecoverResult',
  );

  let signingRevision = 0;
  const clearResults = () => {
    signingRevision += 1;
    personalSignResult.textContent = '';
    personalSignError.textContent = '';
    personalSignVerifySigUtilResult.textContent = '';
    personalSignVerifyECRecoverResult.textContent = '';
    personalSignVerify.disabled = true;
  };

  document.addEventListener('globalConnectionChange', function (e) {
    if (e.detail.connected) {
      // MetaMask is connected, enable the button
      personalSign.disabled = false;
    }
  });

  document.addEventListener('disableAndClear', function () {
    personalSign.disabled = true;
    clearResults();
  });

  /**
   * Personal Sign
   */
  personalSign.onclick = async () => {
    clearResults();
    const revision = signingRevision;
    const exampleMessage = 'Example `personal_sign` message';
    try {
      const from = globalContext.accounts[0];
      const msg = `0x${Buffer.from(exampleMessage, 'utf8').toString('hex')}`;
      const sign = await globalContext.provider.request({
        method: 'personal_sign',
        params: [msg, from, 'Example password'],
      });
      if (revision !== signingRevision) {
        return;
      }
      personalSignResult.textContent = sign;
      personalSignVerify.disabled = false;
    } catch (err) {
      console.error(err);
      if (revision === signingRevision) {
        personalSignError.textContent = `Error: ${err.message}`;
      }
    }
  };

  /**
   * Personal Sign Verify
   */
  personalSignVerify.onclick = async () => {
    const revision = signingRevision;
    const exampleMessage = 'Example `personal_sign` message';
    const from = globalContext.accounts[0];
    const msg = `0x${Buffer.from(exampleMessage, 'utf8').toString('hex')}`;
    const sign = personalSignResult.textContent;
    const mismatch = 'Signer does not match the connected account.';
    personalSignVerifySigUtilResult.textContent = '';
    personalSignVerifyECRecoverResult.textContent = '';
    try {
      const recoveredAddr = recoverPersonalSignature({
        data: msg,
        signature: sign,
      });
      personalSignVerifySigUtilResult.textContent = isConnectedSigner(
        recoveredAddr,
        from,
      )
        ? recoveredAddr
        : mismatch;
    } catch (err) {
      personalSignVerifySigUtilResult.textContent = `Error: ${err.message}`;
    }

    try {
      const ecRecoverAddr = await globalContext.provider.request({
        method: 'personal_ecRecover',
        params: [msg, sign],
      });
      if (revision !== signingRevision) {
        return;
      }
      personalSignVerifyECRecoverResult.textContent = isConnectedSigner(
        ecRecoverAddr,
        from,
      )
        ? ecRecoverAddr
        : mismatch;
    } catch (err) {
      if (revision === signingRevision) {
        personalSignVerifyECRecoverResult.textContent = `Error: ${err.message}`;
      }
    }
  };
}
