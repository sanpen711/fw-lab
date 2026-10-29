import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root=fileURLToPath(new URL('../../',import.meta.url));
const xml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));

export function storeVersion(version){
  if(!/^[1-9]\d*\.\d+\.\d+$/.test(version))throw new Error('Expected a three-part nonzero-major release version');
  const parts=version.split('.').map(Number);
  if(parts.some(part=>part>65535))throw new Error('MSIX version parts must fit uint16');
  return [...parts,0].join('.');
}

export function renderManifest(identity,version,architecture='x64'){
  if(!/^[A-Za-z0-9.-]{3,50}$/.test(identity.name))throw new Error('Invalid Store package name');
  if(!/^CN=[A-Fa-f0-9-]{36}$/.test(identity.publisher))throw new Error('Invalid Store publisher');
  if(!identity.displayName||!identity.publisherDisplayName)throw new Error('Missing display name');
  if(!['x64','arm64'].includes(architecture))throw new Error('Unsupported architecture');
  return `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
 xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
 xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
 IgnorableNamespaces="uap rescap">
 <Identity Name="${xml(identity.name)}" Publisher="${xml(identity.publisher)}" Version="${storeVersion(version)}" ProcessorArchitecture="${architecture}" />
 <Properties>
  <DisplayName>${xml(identity.displayName)}</DisplayName>
  <PublisherDisplayName>${xml(identity.publisherDisplayName)}</PublisherDisplayName>
  <Description>FW研究所 Windows 客户端</Description>
  <Logo>Assets\\StoreLogo.png</Logo>
 </Properties>
 <Resources><Resource Language="zh-CN" /></Resources>
 <Dependencies><TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.19041.0" MaxVersionTested="10.0.26100.0" /></Dependencies>
 <Applications>
  <Application Id="App" Executable="fw-lab-desktop.exe" EntryPoint="Windows.FullTrustApplication">
   <uap:VisualElements DisplayName="${xml(identity.displayName)}" Description="FW研究所 Windows 客户端"
    Square150x150Logo="Assets\\Square150x150Logo.png" Square44x44Logo="Assets\\Square44x44Logo.png" BackgroundColor="transparent" />
  </Application>
 </Applications>
 <Capabilities><rescap:Capability Name="runFullTrust" /></Capabilities>
</Package>
`;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(!process.argv[2])throw new Error('Usage: node manifest.mjs <output.xml>');
  const identity=JSON.parse(await readFile(resolve(root,'packaging/microsoft-store/identity.json'),'utf8'));
  const config=JSON.parse(await readFile(resolve(root,'src-tauri/tauri.v11.conf.json'),'utf8'));
  await writeFile(process.argv[2],renderManifest(identity,config.version),'utf8');
}
