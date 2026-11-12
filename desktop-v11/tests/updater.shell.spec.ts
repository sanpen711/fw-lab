import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';

const updateUi=readFileSync(new URL('../../src-tauri/src/update_ui.js',import.meta.url),'utf8');

async function showFailure(page:any){
  await page.setContent('<main>客户端首页</main>');
  await page.addScriptTag({content:updateUi});
  await page.evaluate(()=>{(window as any).__FW_UPDATE_RENDER__({phase:'error',title:'自动更新没有完成',detail:'更新暂时未能完成，请稍后重试。当前版本可继续使用。'});});
}

test('更新重试失败只显示中文，错误状态可关闭且不显示连接动画',async({page})=>{
  await showFailure(page);
  await page.evaluate(()=>{(window as any).__TAURI__={core:{invoke:async()=>{throw new Error('TLS handshake error: private implementation detail');}}};});
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.locator('#fw-update-track')).toBeHidden();
  await expect(page.locator('#fw-update-meta')).toBeHidden();
  await page.getByRole('button',{name:'重新尝试'}).click();
  await expect(page.locator('#fw-update-title')).toHaveText('暂时无法检查更新');
  await expect(page.locator('#fw-update-card')).not.toContainText('TLS');
  await expect(page.locator('#fw-update-card')).toContainText('当前版本可以继续使用');
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await expect(page.locator('#fw-update-overlay')).toBeHidden();
});

test('更新重试防重复，确认已是最新版后关闭错误卡片',async({page})=>{
  await showFailure(page);
  await page.evaluate(()=>{
    const w=window as any;w.updateCalls=[];
    w.__TAURI__={core:{invoke:(command:string)=>{w.updateCalls.push(command);return new Promise(resolve=>{w.finishUpdateCheck=resolve;});}}};
    const retry=document.querySelector('#fw-update-retry') as HTMLButtonElement;
    retry.click();retry.click();
  });
  await expect(page.getByRole('button',{name:'重新尝试'})).toBeDisabled();
  expect(await page.evaluate(()=>(window as any).updateCalls)).toEqual(['desktop_check_for_updates']);
  await page.evaluate(()=>(window as any).finishUpdateCheck({status:'latest'}));
  await expect(page.locator('#fw-update-overlay')).toBeHidden();
});

test('草稿保存失败时终止自动安装并恢复页面操作',async({page})=>{
  await page.setContent('<main id="app"><button>原有操作</button></main>');
  await page.addScriptTag({content:updateUi});
  await page.evaluate(()=>{
    const w=window as any;
    w.updateCalls=[];
    w.__FW_FLUSH_DRAFTS__=async()=>{throw new Error('draft storage error');};
    w.__TAURI__={core:{invoke:async(command,args)=>{
      w.updateCalls.push([command,args]);
      w.__FW_UPDATE_RENDER__({phase:'error',title:'自动更新没有完成'});
    }}};
    w.__FW_UPDATE_RENDER__({phase:'installing',title:'正在安装更新'});
  });
  await expect(page.locator('#fw-update-title')).toHaveText('自动更新没有完成');
  await expect(page.locator('#app')).not.toHaveAttribute('inert');
  expect(await page.evaluate(()=>(window as any).updateCalls)).toEqual([
    ['desktop_install_ready_update',{draftsSaved:false}]
  ]);
});
