import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditReleaseDist} from './release-package.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const report=await auditReleaseDist(resolve(root,'dist'),{sourceDir:root});
const release=JSON.parse(await readFile(resolve(root,'release.json'),'utf8'));
report.displayVersion=release.version;report.buildVersion=release.buildVersion;
await mkdir(resolve(root,'.cache'),{recursive:true});
await writeFile(resolve(root,'.cache/release-package-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({displayVersion:report.displayVersion,buildVersion:report.buildVersion,fileCount:report.fileCount,totalBytes:report.totalBytes,activeGames:report.activeGames,archivedSourceRomSha256:report.archivedSourceRomSha256,excluded:report.excludedSourcePrefixes},null,2));
