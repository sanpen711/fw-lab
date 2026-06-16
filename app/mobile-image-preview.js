(function(){
  if(window.__FW_MOBILE_IMAGE_PREVIEW__) return;
  window.__FW_MOBILE_IMAGE_PREVIEW__ = true;

  var overlay = null;
  var image = null;
  var caption = null;
  var openUrl = '';
  var fallbackUrl = '';

  function isMobileLike(){
    try{
      return window.innerWidth <= 900 || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || /Android|iPhone|iPad|iPod|Mobile|MicroMessenger|MQQBrowser|baiduboxapp|baidubrowser|Quark|UCBrowser/i.test(navigator.userAgent || '');
    }catch(e){
      return true;
    }
  }

  function injectStyle(){
    if(document.getElementById('fwMobileImagePreviewStyle')) return;
    var style = document.createElement('style');
    style.id = 'fwMobileImagePreviewStyle';
    style.textContent = [
      '.fw-mobile-image-preview{position:fixed;inset:0;z-index:99998;display:none;align-items:center;justify-content:center;background:rgba(8,12,20,.94);padding:calc(env(safe-area-inset-top,0px) + 44px) 14px calc(env(safe-area-inset-bottom,0px) + 32px);box-sizing:border-box;touch-action:none}',
      '.fw-mobile-image-preview.show{display:flex}',
      '.fw-mobile-image-preview img{display:block;max-width:100%;max-height:100%;object-fit:contain;border-radius:12px;box-shadow:0 18px 48px rgba(0,0,0,.35);background:rgba(255,255,255,.04)}',
      '.fw-mobile-image-preview-close{position:fixed;right:calc(env(safe-area-inset-right,0px) + 12px);top:calc(env(safe-area-inset-top,0px) + 10px);z-index:1;width:38px;height:38px;border:1px solid rgba(255,255,255,.28);border-radius:999px;background:rgba(255,255,255,.14);color:#fff;font:24px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:flex;align-items:center;justify-content:center}',
      '.fw-mobile-image-preview-open{position:fixed;left:calc(env(safe-area-inset-left,0px) + 12px);top:calc(env(safe-area-inset-top,0px) + 13px);z-index:1;border:1px solid rgba(255,255,255,.24);border-radius:999px;background:rgba(255,255,255,.12);color:#fff;font:13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:10px 13px;text-decoration:none}',
      '.fw-mobile-image-preview-note{position:fixed;left:14px;right:14px;bottom:calc(env(safe-area-inset-bottom,0px) + 10px);color:rgba(255,255,255,.62);font:12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center;pointer-events:none}'
    ].join('');
    document.head.appendChild(style);
  }

  function ensureOverlay(){
    if(overlay) return overlay;
    injectStyle();
    overlay = document.createElement('div');
    overlay.className = 'fw-mobile-image-preview';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '图片预览');
    overlay.innerHTML = '<a class="fw-mobile-image-preview-open" data-preview-open target="_blank" rel="noopener">打开原图</a><button class="fw-mobile-image-preview-close" type="button" aria-label="关闭图片预览">×</button><img alt="图片预览"><div class="fw-mobile-image-preview-note">轻点空白处关闭</div>';
    document.body.appendChild(overlay);
    image = overlay.querySelector('img');
    caption = overlay.querySelector('[data-preview-open]');

    overlay.addEventListener('click', function(event){
      if(event.target === overlay || event.target.classList.contains('fw-mobile-image-preview-close')){
        closePreview();
      }
    });

    overlay.addEventListener('touchmove', function(event){
      event.preventDefault();
    }, {passive:false});

    image.addEventListener('error', function(){
      if(fallbackUrl && image && image.src !== fallbackUrl){
        image.src = fallbackUrl;
      }
    });

    document.addEventListener('keydown', function(event){
      if(event.key === 'Escape' && overlay && overlay.classList.contains('show')) closePreview();
    });

    return overlay;
  }

  function normalizedUrl(url){
    try{
      var text = String(url || '').trim();
      if(!text) return '';
      if(text.indexOf('data:image/') === 0) return text;
      var u = new URL(text, window.location.href);
      if(u.protocol !== 'http:' && u.protocol !== 'https:' && u.protocol !== 'blob:') return '';
      return u.href;
    }catch(e){
      return '';
    }
  }

  function imageUrlFromTarget(target){
    var link = target && target.closest && target.closest('a.fw-inline-media, a[data-fw-image], a[data-preview-image]');
    var img = target && target.closest && target.closest('.fw-inline-media img, img[data-fw-image], .post-card img, .detail-comments-card img, .bird-feed-mobile img, .mobile-bird-detail-view img');
    if(!link && img && img.closest && !img.closest('.post-card,.detail-comments-card,.bird-feed-mobile,.mobile-bird-detail-view')) return null;
    if(link){
      var linkedImg = link.querySelector && link.querySelector('img');
      var href = normalizedUrl(link.getAttribute('href') || '');
      var current = normalizedUrl((linkedImg && (linkedImg.dataset.fwMediaOriginalSrc || linkedImg.currentSrc || linkedImg.src)) || '');
      return {original:href || current, display:href || current, fallback:current && current !== href ? current : ''};
    }
    if(img){
      var original = normalizedUrl(img.dataset.fwMediaOriginalSrc || '');
      var currentSrc = normalizedUrl(img.currentSrc || img.src || '');
      return {original:original || currentSrc, display:original || currentSrc, fallback:currentSrc && currentSrc !== original ? currentSrc : ''};
    }
    return null;
  }

  function openPreview(item){
    if(!item) return false;
    var display = item.display || item.original || item.fallback;
    var original = item.original || item.display || item.fallback;
    if(!display && !original) return false;
    ensureOverlay();
    openUrl = original || display;
    fallbackUrl = item.fallback || '';
    image.src = display || original;
    if(caption) caption.href = openUrl;
    overlay.classList.add('show');
    document.documentElement.classList.add('fw-image-preview-open');
    if(document.body) document.body.classList.add('fw-image-preview-open');
    return true;
  }

  function closePreview(){
    if(!overlay || !overlay.classList.contains('show')) return;
    overlay.classList.remove('show');
    document.documentElement.classList.remove('fw-image-preview-open');
    if(document.body) document.body.classList.remove('fw-image-preview-open');
    if(image) image.removeAttribute('src');
    openUrl = '';
    fallbackUrl = '';
  }

  function bindClicks(){
    document.addEventListener('click', function(event){
      if(!isMobileLike()) return;
      var item = imageUrlFromTarget(event.target);
      if(!item) return;
      if(openPreview(item)){
        event.preventDefault();
        event.stopPropagation();
        if(event.stopImmediatePropagation) event.stopImmediatePropagation();
      }
    }, true);
  }

  function start(){
    injectStyle();
    bindClicks();
    window.FWMobileImagePreview = {
      open:openPreview,
      close:closePreview,
      isOpen:function(){ return !!(overlay && overlay.classList.contains('show')); }
    };
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
