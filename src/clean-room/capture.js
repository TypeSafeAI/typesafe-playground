/* Evaluated in the observed page. Reads rendered DOM only, never source scripts. */
(maxNodes) => {
  let count = 0;
  const properties = ['display','position','box-sizing','color','background-color','font-family','font-size','font-weight','line-height','letter-spacing','text-align','padding-top','padding-right','padding-bottom','padding-left','margin-top','margin-right','margin-bottom','margin-left','border-top','border-right','border-bottom','border-left','border-radius','max-width','min-width','width','gap','flex-direction','align-items','justify-content','grid-template-columns','box-shadow','list-style-type'];
  const roles={button:'button',a:'link',input:'textbox',textarea:'textbox',select:'combobox',ul:'list',ol:'list',li:'listitem',h1:'heading',h2:'heading',h3:'heading',form:'form',main:'main',nav:'navigation',img:'img'};
  function walk(el) {
    if (++count > maxNodes) throw Error('Observed screen exceeds maxNodes; increase the explicit capture limit.');
    const tag=el.tagName.toLowerCase();
    const style=getComputedStyle(el);
    if(['script','style','noscript','link','meta','iframe'].includes(tag)||style.display==='none'||style.visibility==='hidden')return null;
    const attrs={};
    for(const name of ['id','name','type','placeholder','href','src','alt','for','required','min','max','step','multiple','aria-label','aria-labelledby','aria-describedby','role','value','checked','selected']){
      if(el.hasAttribute(name))attrs[name]=el.getAttribute(name);
    }
    if(tag==='input'&&['password','hidden'].includes(el.type))attrs.value='';
    const label=el.getAttribute('aria-label')||(el.labels?.length?Array.from(el.labels).map(l=>l.innerText).join(' '):'')||el.getAttribute('alt')||el.getAttribute('placeholder')||(['button','a','h1','h2','h3','option'].includes(tag)?el.innerText:'')||'';
    let role=el.getAttribute('role')||roles[tag]||'generic';
    if(tag==='input'&&['checkbox','radio'].includes(el.type))role=el.type;
    if(tag==='input'&&['submit','button'].includes(el.type))role='button';
    const id='n'+count;
    const children=[];
    const elementChildren=Array.from(el.children).filter(c=>!['SCRIPT','STYLE','NOSCRIPT'].includes(c.tagName));
    if(elementChildren.length)for(const child of el.childNodes){
      if(child.nodeType===1){const n=walk(child);if(n)children.push(n);}
      else if(child.nodeType===3&&child.textContent.trim())children.push({id:'n'+(++count),tag:'span',role:'text',label:'',text:child.textContent,value:'',attrs:{},style:{},children:[]});
    }
    return {id,tag,role,label:label.trim(),text:elementChildren.length?'':(el.textContent||'').trim(),value:el.type==='password'?'':String(el.value??''),...(['checkbox','radio'].includes(el.type)?{checked:el.checked}:{}),attrs,style:Object.fromEntries(properties.map(p=>[p,style.getPropertyValue(p)])),children};
  }
  return {title:document.title,root:walk(document.body),text:document.body.innerText};
}
