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
assert.equal(config.version, '1.0.1');
assert.equal(config.app.windows[0].url, 'https://fwyanjiusuo.com/square.html');
assert.match(config.app.windows[0].userAgent, /FWYanjiusuoDesktop\/1\.0\.1/);

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

const appLoader = read('assets/app.js');
assert.match(appLoader, /isWindowsDesktopApp = \/FWYanjiusuoDesktop/);
assert.match(appLoader, /assets\/fw-desktop-client\.css/);
assert.match(appLoader, /assets\/fw-desktop-client\.js/);

const desktopClient = read('assets/fw-desktop-client.js');
assert.match(desktopClient, /fw-desktop-sidebar/);
assert.match(desktopClient, /square\.html\?compose=1/);
assert.match(desktopClient, /fwOpenStableEcho/);
assert.match(desktopClient, /FWMobileActions\.openBuddy/);
assert.match(desktopClient, /location\.replace\('square\.html'\)/);

const desktopCss = read('assets/fw-desktop-client.css');
assert.match(desktopCss, /--fw-desktop-rail/);
assert.match(desktopCss, /fw-route-echo \.fw-stable-echo-modal/);
assert.match(desktopCss, /fw-route-buddy \.fw-wx-shell/);
assert.match(desktopCss, /grid-template-columns:330px minmax\(0,1fr\)/);

const workflow = read('.github/workflows/build-windows-app.yml');
assert.match(workflow, /windows-latest/);
assert.match(workflow, /npm run desktop:build/);
assert.match(workflow, /fw-lab-windows-latest\.exe/);
assert.match(workflow, /fw-lab-windows-1\.0\.1/);

console.log('desktop app static checks passed');
