import {expect,test} from '@playwright/test';

for(const width of [320,360,390,430]){
  test(`首页和导航在 ${width}px 下排版完整且底部连续`,async({page})=>{
    await page.setViewportSize({width,height:844});
    await page.goto('/app/index.html',{waitUntil:'domcontentloaded'});
    await expect(page.locator('[data-app-view="home"].is-active')).toBeVisible();
    const hero=page.locator('.mobile-home-hero');
    await expect(hero.locator('h2')).toHaveText('放下个人素质，享受缺德人生');
    await expect(hero.getByRole('button',{name:'开始吐槽!'})).toBeVisible();
    const slogan=await hero.locator('h2 span').evaluateAll(elements=>elements.map(e=>{const style=getComputedStyle(e);return {color:style.color,margin:style.marginTop,fontSize:style.fontSize,parentSize:getComputedStyle(e.parentElement!).fontSize};}));
    for(const line of slogan){
      // The slogan must stay readable on the light hero, without legacy span spacing.
      const channels=line.color.match(/[\d.]+/g)!.map(Number).slice(0,3).map(c=>{const v=c/255;return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4);});
      const luminance=channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;
      expect(1.05/(luminance+0.05)).toBeGreaterThan(4.5);
      expect(line.fontSize).toBe(line.parentSize);expect(line.margin).toBe('0px');
    }
    const checkShell=async()=>{
      const metrics=await page.evaluate(()=>{
        const rect=(selector:string)=>document.querySelector(selector)!.getBoundingClientRect();
        const main=rect('.app-main'),bar=rect('.app-tabbar'),shell=rect('.app-shell');
        return {mainBottom:main.bottom,barTop:bar.top,barBottom:bar.bottom,shellBottom:shell.bottom,
          rootBackground:getComputedStyle(document.documentElement).backgroundColor,
          bodyBackground:getComputedStyle(document.body).backgroundColor,
          shellBackground:getComputedStyle(document.querySelector('.app-shell')!).backgroundColor,
          barBackground:getComputedStyle(document.querySelector('.app-tabbar')!).backgroundColor,
          theme:document.querySelector('meta[name="theme-color"]')!.getAttribute('content')};
      });
      for(const key of ['rootBackground','bodyBackground','shellBackground','barBackground'] as const)expect(metrics[key]).toBe('rgb(255, 255, 255)');
      expect(metrics.theme).toBe('#ffffff');
      expect(Math.abs(metrics.mainBottom-metrics.barTop)).toBeLessThan(2);
      expect(Math.abs(metrics.barBottom-metrics.shellBottom)).toBeLessThan(2);
      await expect(page.locator('.app-tabbar button')).toHaveCount(4);
    };
    await checkShell();
    // Emulate a 34px home-indicator inset: the clickable row must stay above it.
    await page.addStyleTag({content:':root{--app-safe-bottom:34px}'});
    await checkShell();
    const safeArea=await page.locator('.app-tabbar').evaluate(bar=>{const bounds=bar.getBoundingClientRect();return {height:bounds.height,gap:bounds.bottom-Math.max(...[...bar.querySelectorAll('button')].map(b=>b.getBoundingClientRect().bottom))};});
    expect(safeArea.height).toBeGreaterThanOrEqual(84);expect(safeArea.gap).toBeGreaterThanOrEqual(34);
    const headline=await hero.locator('h2').evaluate(element=>{
      const lineBounds=(start:number,end:number)=>{const range=document.createRange();const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);let cursor=0,node:Node|null;
        while(node=walker.nextNode()){const len=node.textContent!.length;if(start>=cursor&&start<cursor+len)range.setStart(node,start-cursor);if(end>cursor&&end<=cursor+len){range.setEnd(node,end-cursor);break;}cursor+=len;}return [...range.getClientRects()].map(r=>({top:r.top,left:r.left,right:r.right}));};
      return {first:lineBounds(0,7),second:lineBounds(7,13)};
    });
    expect(new Set(headline.first.map(r=>Math.round(r.top))).size).toBe(1);
    expect(new Set(headline.second.map(r=>Math.round(r.top))).size).toBe(1);
    const boundaries=await hero.evaluate(element=>{const bounds=element.getBoundingClientRect();return [...element.querySelectorAll('small,h1,h2,p,button')].map(e=>{const r=e.getBoundingClientRect();return {right:r.right,left:r.left,scroll:e.scrollWidth,client:e.clientWidth,heroLeft:bounds.left,heroRight:bounds.right};});});
    for(const r of boundaries){expect(r.left).toBeGreaterThanOrEqual(r.heroLeft);expect(r.right).toBeLessThanOrEqual(r.heroRight);expect(r.scroll).toBeLessThanOrEqual(r.client+1);}
    await page.locator('[data-app-nav="nav"]').click();
    await expect(page.locator('[data-app-view="nav"].is-active')).toBeVisible();
    const destinations=page.locator('.mobile-primary-grid [data-app-open]');
    await expect(destinations).toHaveCount(5);
    const cards=await destinations.evaluateAll(elements=>elements.map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,target:(e as HTMLElement).dataset.appOpen};}));
    expect(cards.map(r=>r.target)).toEqual(['square','rooms','bird','play','membership']);
    expect(cards[0].width).toBeGreaterThan(cards[1].width*1.8);
    expect(Math.abs(cards[1].top-cards[2].top)).toBeLessThan(1);
    expect(Math.abs(cards[3].top-cards[4].top)).toBeLessThan(1);
    for(const card of cards){expect(card.left).toBeGreaterThanOrEqual(0);expect(card.right).toBeLessThanOrEqual(width);expect(card.height).toBeGreaterThanOrEqual(44);}
    await checkShell();
    await page.locator('[data-app-nav="buddy"]').click();
    await expect(page.locator('[data-app-view="buddy"].is-active')).toBeVisible();await checkShell();
    // An orientation/viewport change must keep the bar attached and content clear.
    await page.setViewportSize({width:844,height:390});await checkShell();
    await page.setViewportSize({width,height:844});await checkShell();
  });
}
