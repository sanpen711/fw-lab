import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = path => readFileSync(resolve(root, path), 'utf8');

const config = JSON.parse(read('src-tauri/tauri.conf.json'));
assert.equal(config.productName, 'F.w 研究所');
assert.equal(config.identifier, 'com.fwyanjiusuo.desktop');
assert.equal(config.build.frontendDist, 'https://fwyanjiusuo.com/');
assert.deepEqual(config.bundle.targets, ['nsis']);
assert.equal(config.bundle.windows.nsis.installMode, 'currentUser');
assert.match(config.app.windows[0].userAgent, /FWYanjiusuoDesktop\/1\.0\.0/);

const cargo = read('src-tauri/Cargo.toml');
assert.match(cargo, /tauri-plugin-single-instance/);
assert.match(cargo, /tauri-plugin-window-state/);

const main = read('src-tauri/src/main.rs');
assert.match(main, /get_webview_window\("main"\)/);
assert.match(main, /window\.unminimize\(\)/);
assert.match(main, /window\.set_focus\(\)/);

const downloadClient = read('assets/fw-download-client.js');
assert.match(downloadClient, /FWYanjiusuoDesktop/);
assert.match(downloadClient, /download\/fw-lab-windows-latest\.exe/);

const workflow = read('.github/workflows/build-windows-app.yml');
assert.match(workflow, /windows-latest/);
assert.match(workflow, /npm run desktop:build/);
assert.match(workflow, /fw-lab-windows-latest\.exe/);

console.log('desktop app static checks passed');
