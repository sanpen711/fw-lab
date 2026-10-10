const stickers=[
  ['01','默认微笑'],['04','点赞好耶'],['05','比心感谢'],
  ['08','无语摊手'],['11','咖啡续命'],['12','笔记本办公'],
  ['13','趴桌没电'],['14','偷偷摸鱼'],['17','吃瓜围观']
];

export function membershipShopContent(){
  return `<section class="membership-shop" aria-label="周边商城">
    <header class="membership-shop-heading"><div><small>伏伏周边</small><h3>把伏伏带回日常</h3><p>一点小表情，一点摸鱼的快乐。</p></div><span>首款周边展示</span></header>
    <article class="membership-shop-product" data-shop-product="fufu-stickers">
      <figure class="membership-shop-art">
        <div class="membership-sticker-sheet"><b>伏伏的小日常</b><div class="membership-sticker-grid">${stickers.map(([id,label])=>`<img src="/emoji/fufu1/${id}.webp" alt="${label}" width="80" height="80">`).join('')}</div><span>今天也要偷偷摸鱼</span></div>
        <figcaption>贴纸款式示意</figcaption>
      </figure>
      <div class="membership-shop-info"><span class="membership-shop-status">展示商品 · 暂未开售</span><h3>伏伏表情包贴纸</h3><p>把伏伏的日常小表情贴进手账和桌面，给普通的一天添点乐趣。</p><dl><div><dt>主题</dt><dd>伏伏日常表情</dd></div><div><dt>适用</dt><dd>手账 · 桌面装饰</dd></div></dl><div class="membership-shop-price"><small>售价</small><strong>¥10<span> / 份</span></strong></div><button type="button" class="primary" data-shop-purchase disabled>即将开售</button><p class="membership-shop-note">贴纸正在准备中，开售后可购买。</p></div>
    </article>
    <p class="membership-shop-more">更多伏伏周边，敬请期待。</p>
  </section>`;
}
