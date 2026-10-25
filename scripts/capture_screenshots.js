// Autonomous Screenshot Generator using Chrome DevTools Protocol
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9266;
const tempUserData = path.join(os.tmpdir(), 'chrome_cdp_' + Date.now());

async function run() {
  console.log(`Launching headless Chrome on port ${port}...`);
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${tempUserData}`,
    '--disable-gpu',
    '--no-first-run',
    '--window-size=1536,1024',
    'about:blank'
  ]);

  // Wait for endpoint
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 250));
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) break;
    } catch (e) {}
  }

  const tasks = [
    {
      name: 'hero-preview',
      action: async (send) => {
        await new Promise(r => setTimeout(r, 2200));
      }
    },
    {
      name: 'feature-interaction',
      action: async (send) => {
        await new Promise(r => setTimeout(r, 1800));
        await send('Runtime.evaluate', {
          expression: `
            if (window.allOpportunities && window.allOpportunities.length > 0) {
              openDetailsModal(window.allOpportunities[0].id);
            } else {
              openProfileModal('applicant');
            }
          `
        });
        await new Promise(r => setTimeout(r, 800));
      }
    },
    {
      name: 'profile-modal',
      action: async (send) => {
        await new Promise(r => setTimeout(r, 1800));
        await send('Runtime.evaluate', {
          expression: `openProfileModal('applicant');`
        });
        await new Promise(r => setTimeout(r, 800));
      }
    }
  ];

  for (const t of tasks) {
    console.log(`Navigating to http://localhost:5050/ for ${t.name}...`);
    const pageRes = await fetch(`http://127.0.0.1:${port}/json/new?http://localhost:5050/`, { method: 'PUT' });
    const pageData = await pageRes.json();
    const wsUrl = pageData.webSocketDebuggerUrl;

    await new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      let idGen = 1;
      const pending = new Map();

      function send(method, params = {}) {
        return new Promise((res, rej) => {
          const id = idGen++;
          pending.set(id, { res, rej });
          ws.send(JSON.stringify({ id, method, params }));
        });
      }

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.id && pending.has(msg.id)) {
          const { res } = pending.get(msg.id);
          pending.delete(msg.id);
          res(msg.result);
        }
      };

      ws.onopen = async () => {
        try {
          await send('Page.enable');
          await send('Runtime.enable');
          await send('Emulation.setDeviceMetricsOverride', {
            width: 1536,
            height: 1024,
            deviceScaleFactor: 1,
            mobile: false
          });
          await t.action(send);
          const snap = await send('Page.captureScreenshot', { format: 'png' });
          const buf = Buffer.from(snap.data, 'base64');
          const outPath = path.join(__dirname, '..', 'assets', 'screenshots', `${t.name}.png`);
          fs.writeFileSync(outPath, buf);
          console.log(`Successfully saved: ${t.name}.png (${buf.length} bytes)`);
          ws.close();
          resolve();
        } catch (err) {
          console.error(`Error on ${t.name}:`, err);
          ws.close();
          reject(err);
        }
      };
    });

    try {
      await fetch(`http://127.0.0.1:${port}/json/close/${pageData.id}`, { method: 'PUT' });
    } catch (e) {}
  }

  chromeProc.kill();
  console.log('All screenshots completed successfully!');
}

run().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
