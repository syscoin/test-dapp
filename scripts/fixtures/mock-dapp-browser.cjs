const { readFile } = require('node:fs/promises');
const path = require('node:path');

const dist = path.resolve(
  process.env.TEST_DAPP_DIST || path.join(__dirname, '../../dist'),
);
const origin = 'http://127.0.0.1:18743';

async function loadDapp(context, rpc, { setup } = {}) {
  // Deliver the actual production assets without sending any network requests.
  const index = await readFile(path.join(dist, 'index.html'));
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    const file = path.resolve(dist, '.' + decodeURIComponent(url.pathname));
    if (file === dist)
      return route.fulfill({ contentType: 'text/html', body: index });
    if (!file.startsWith(dist + path.sep)) return route.abort();
    return route.fulfill({ path: file }).catch(() => route.abort());
  });
  await context.routeWebSocket('**/*', (socket) => socket.close());
  const page = await context.newPage();
  if (rpc) {
    await page.exposeFunction('mockDappRpc', rpc);
    await page.addInitScript(() => {
      const provider = {
        async request(input) {
          const reply = await window.mockDappRpc(input);
          if (reply.error)
            throw Object.assign(new Error(reply.error.message), reply.error);
          return reply.result;
        },
        on() {
          return this;
        },
        removeListener() {
          return this;
        },
      };
      window.ethereum = provider;
      window.addEventListener('eip6963:requestProvider', () => {
        window.dispatchEvent(
          new CustomEvent('eip6963:announceProvider', {
            detail: {
              provider,
              info: {
                name: 'Pali test provider',
                uuid: 'c0669206-c65e-4cc5-af11-c9bcc95f2067',
                rdns: 'test.pali.wallet',
                icon: 'data:image/svg+xml,%3Csvg/%3E',
              },
            },
          }),
        );
      });
    });
  }
  if (setup) await setup(page);
  await page.goto(origin);
  return page;
}

module.exports = { loadDapp };
