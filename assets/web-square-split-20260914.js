(function(){
  'use strict';
  var feed=document.querySelector('[data-feed]');
  var list=document.querySelector('[data-web-square-list]');
  var detail=document.querySelector('[data-web-square-detail-body]');
  var empty=document.querySelector('[data-web-square-empty]');
  if(!feed||!list||!detail)return;

  if(/FWYanjiusuoDesktop\//i.test(navigator.userAgent||'')){
    detail.appendChild(feed);
    var legacyMain=detail.closest('.web-square-detail');
    if(legacyMain) legacyMain.classList.add('square-main');
    return;
  }

  var selected='';
  var scheduled=0;
  var syncing=false;
  var openingComments=false;

  try{selected=new URLSearchParams(location.search).get('post')||'';}catch(e){}

  function cards(){return Array.from(feed.querySelectorAll('.post-card'))}
  function cardById(rows,id){
    return (rows||cards()).find(function(card){return String(card.dataset.id||'')===String(id||'')})||null;
  }
  function reveal(id){
    if(!id||typeof window.__FW_SQUARE_SHOW_POST__!=='function')return false;
    try{return window.__FW_SQUARE_SHOW_POST__(String(id))!==false}catch(e){return false}
  }
  function persistSelection(id){
    try{
      var url=new URL(location.href);
      if(String(url.searchParams.get('post')||'')===String(id||''))return;
      url.searchParams.set('post',String(id||''));
      history.replaceState(history.state,'',url.pathname+url.search+url.hash);
    }catch(e){}
  }
  function cleanLegacyActions(root){
    root.querySelectorAll('[data-sq="same"],[data-sq="tissue"],[data-action="same"],[data-action="tissue"]').forEach(function(node){node.style.display='none'});
  }
  function ensureCommentOpen(card){
    var box=card&&card.querySelector('.comment-box');
    if(!box||box.classList.contains('show')||openingComments)return;
    var toggle=card.querySelector('[data-sq="comment-toggle"],[data-action="comment-toggle"]');
    if(!toggle)return;
    openingComments=true;
    setTimeout(function(){
      try{toggle.click();}catch(e){}
      setTimeout(function(){openingComments=false;},80);
    },0);
  }
  function renderDetail(){
    var row=cards().find(function(card){return String(card.dataset.id||'')===String(selected)});
    if(!row){
      detail.innerHTML='';
      if(empty){empty.hidden=false;detail.appendChild(empty)}
      return;
    }
    if(empty)empty.hidden=true;
    cleanLegacyActions(row);
    detail.innerHTML='';
    var clone=row.cloneNode(true);
    clone.hidden=false;
    clone.classList.remove('web-square-selected');
    clone.classList.add('web-square-detail-card');
    clone.removeAttribute('tabindex');
    clone.querySelectorAll('[id]').forEach(function(node){node.removeAttribute('id')});
    cleanLegacyActions(clone);
    detail.appendChild(clone);
    ensureCommentOpen(row);
  }
  function select(id,scroll,persist){
    var rows=cards();
    if(!rows.length){
      if(empty)empty.hidden=false;
      detail.innerHTML='';
      if(empty)detail.appendChild(empty);
      return false;
    }
    if(id&&!cardById(rows,id)&&reveal(id))rows=cards();
    if(!id||!cardById(rows,id))id=String(rows[0].dataset.id||'');
    selected=String(id);
    rows.forEach(function(card){
      var active=String(card.dataset.id||'')===selected;
      card.hidden=false;
      card.classList.remove('fw-dual-post-focus','fw-target-post');
      card.classList.toggle('web-square-selected',active);
      card.setAttribute('aria-current',active?'true':'false');
      card.setAttribute('aria-selected',active?'true':'false');
    });
    renderDetail();
    if(persist)persistSelection(selected);
    if(scroll){
      var active=cardById(rows,selected);
      active&&active.scrollIntoView({behavior:'smooth',block:'nearest'});
    }
    return true;
  }
  function rebuild(){
    scheduled=0;
    if(syncing)return;
    syncing=true;
    try{
      var rows=cards();
      if(!rows.length){
        if(empty)empty.hidden=false;
        detail.innerHTML='';
        if(empty)detail.appendChild(empty);
        return;
      }
      rows.forEach(function(card){
        cleanLegacyActions(card);
        card.hidden=false;
        card.classList.add('web-square-feed-card');
        card.tabIndex=0;
      });
      select(selected||String(rows[0].dataset.id||''),false,false);
    }finally{syncing=false;}
  }
  function schedule(){clearTimeout(scheduled);scheduled=setTimeout(rebuild,50)}

  feed.addEventListener('click',function(e){
    var card=e.target.closest('.post-card[data-id]');
    if(card&&feed.contains(card))select(card.dataset.id,false,true);
  },true);
  feed.addEventListener('keydown',function(e){
    if(e.key!=='Enter'&&e.key!==' ')return;
    if(e.target.closest('button,input,textarea,a,select'))return;
    var card=e.target.closest('.post-card[data-id]');
    if(!card)return;
    e.preventDefault();
    select(card.dataset.id,false,true);
  });
  detail.addEventListener('click',function(e){
    var clone=e.target.closest('.post-card[data-id]');
    if(clone)selected=String(clone.dataset.id||selected);
  },true);
  document.addEventListener('fw:square-select',function(e){
    var detail=e&&e.detail||{};
    if(detail.id)select(detail.id,detail.scroll!==false,detail.persist!==false);
  });

  window.__FW_WEB_SQUARE_SELECT__=function(id,options){
    options=options||{};
    return select(id,options.scroll!==false,options.persist!==false);
  };
  window.__FW_WEB_SQUARE_SELECTED__=function(){return selected;};

  var observer=new MutationObserver(schedule);
  observer.observe(feed,{childList:true,subtree:true,characterData:true});
  document.addEventListener('click',function(e){
    if(e.target.closest('[data-square-refresh]'))setTimeout(schedule,250);
  });
  schedule();
})();
