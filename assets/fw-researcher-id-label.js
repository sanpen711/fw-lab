// F.w 研究所：显示层文案统一
// 仅把页面可见的“实验品编号”替换为“研究员ID”，不修改数据库字段 lab_code。
(function(){
  if(window.__FW_RESEARCHER_ID_LABEL__) return;
  window.__FW_RESEARCHER_ID_LABEL__ = true;

  var FROM = '实验品编号';
  var TO = '研究员ID';
  var attrs = ['placeholder', 'title', 'aria-label', 'alt'];
  var busy = false;

  function replaceString(value){
    return typeof value === 'string' && value.indexOf(FROM) >= 0 ? value.split(FROM).join(TO) : value;
  }

  function replaceTextNodes(root){
    if(!root) return;
    if(root.nodeType === 3){
      root.nodeValue = replaceString(root.nodeValue);
      return;
    }
    if(root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if(root.nodeType === 1 && /^(script|style|textarea)$/i.test(root.tagName || '')) return;

    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode:function(node){
        var p = node.parentNode;
        if(p && /^(script|style|textarea)$/i.test(p.tagName || '')) return NodeFilter.FILTER_REJECT;
        return node.nodeValue && node.nodeValue.indexOf(FROM) >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    var node;
    while((node = walker.nextNode())){
      node.nodeValue = replaceString(node.nodeValue);
    }
  }

  function replaceAttrs(root){
    if(!root || (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11)) return;
    var elements = root.nodeType === 1 ? [root].concat(Array.from(root.querySelectorAll('*'))) : Array.from(root.querySelectorAll('*'));
    elements.forEach(function(el){
      attrs.forEach(function(name){
        var value = el.getAttribute && el.getAttribute(name);
        if(value && value.indexOf(FROM) >= 0){
          el.setAttribute(name, replaceString(value));
        }
      });
    });
  }

  function normalize(root){
    if(busy) return;
    busy = true;
    try{
      replaceTextNodes(root || document.body || document.documentElement);
      replaceAttrs(root || document.body || document.documentElement);
    }finally{
      busy = false;
    }
  }

  function boot(){
    normalize(document.body || document.documentElement);
    var observer = new MutationObserver(function(records){
      records.forEach(function(record){
        if(record.type === 'characterData'){
          normalize(record.target);
        }else{
          Array.from(record.addedNodes || []).forEach(normalize);
          if(record.target) replaceAttrs(record.target);
        }
      });
    });
    observer.observe(document.documentElement, {
      childList:true,
      subtree:true,
      characterData:true,
      attributes:true,
      attributeFilter:attrs
    });
    setInterval(function(){ normalize(document.body || document.documentElement); }, 1800);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
