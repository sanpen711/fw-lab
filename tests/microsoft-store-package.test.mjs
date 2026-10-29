import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderManifest,storeVersion} from '../packaging/microsoft-store/manifest.mjs';

const identity=JSON.parse(readFileSync(new URL('../packaging/microsoft-store/identity.json',import.meta.url)));

test('manifest escapes display names without changing exact Store identity',()=>{
  const manifest=renderManifest({...identity,displayName:'FW & <研究所> "测试"'},'1.3.33');
  assert.ok(manifest.includes('Name="11B39B1D.FW"'));
  assert.ok(manifest.includes('Publisher="CN=159E8468-5454-478F-ABB5-9DC20D77E52D"'));
  assert.ok(manifest.includes('FW &amp; &lt;研究所&gt; &quot;测试&quot;'));
  assert.ok(manifest.includes('Version="1.3.33.0"'));
});

test('rejects invalid or Store-incompatible version numbers',()=>{
  assert.equal(storeVersion('1.3.33'),'1.3.33.0');
  for(const version of ['0.1.0','1.2.3.4','1.65536.0','1.2.-1','1.2.3-beta','1.2.3"'])assert.throws(()=>storeVersion(version));
});

test('rejects malformed package identities and unsupported architecture',()=>{
  assert.throws(()=>renderManifest({...identity,name:'bad/name'},'1.0.0'));
  assert.throws(()=>renderManifest({...identity,publisher:'" injected="yes'},'1.0.0'));
  assert.throws(()=>renderManifest(identity,'1.0.0','neutral'));
});
