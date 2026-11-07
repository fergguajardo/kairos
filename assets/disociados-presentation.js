(()=>{
'use strict';
const nav=document.querySelector('.anthology-genres'),main=document.querySelector('main');
if(!nav||!main)return;
const groups=[['Thriller',['Bela','Principita','Mandala','Sándalo']],['Drama',['Latte','Adorni']],['Comedia',['Baba Yaga','Roberto','Barniz']]];
const normalize=text=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/^\s*(?:✦\s*)?\d+[.)]?\s*/,'').trim().toLowerCase();
let selected=0,stories=[];
const icons=["<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2\"/></svg>", "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M6 16c5 0 7-8 12-8a4 4 0 0 1 0 8c-5 0-7-8-12-8a4 4 0 1 0 0 8\"/></svg>", "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M18 14l4 4-4 4M18 2l4 4-4 4M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22M2 6h1.972a4 4 0 0 1 3.6 2.2M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45\"/></svg>"];
nav.replaceChildren();nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Géneros de la antología');main.id='anthology-stories';main.setAttribute('role','tabpanel');
const buttons=groups.map(([name],index)=>{const button=document.createElement('button');button.type='button';button.id='genre-tab-'+index;button.setAttribute('role','tab');button.setAttribute('aria-controls',main.id);button.dataset.genre=name;button.setAttribute('aria-label',name);button.innerHTML=icons[index];button.append(document.createTextNode(name));button.onclick=()=>select(index);button.onkeydown=event=>{const available=Array.from(nav.querySelectorAll('button')).filter(button=>!button.hidden).map(button=>buttons.indexOf(button)),position=available.indexOf(index);if(typeof window.KairosGenreOrder?.change==='function'&&event.altKey&&(event.key==='ArrowRight'||event.key==='ArrowLeft')){event.preventDefault();moveGenre(button,event.key==='ArrowRight'?1:-1);return;}let next;if(event.key==='ArrowRight')next=available[(position+1)%available.length];else if(event.key==='ArrowLeft')next=available[(position+available.length-1)%available.length];else if(event.key==='Home')next=available[0];else if(event.key==='End')next=available[available.length-1];else return;event.preventDefault();select(next);buttons[next].focus()};nav.append(button);return button});

let draggedGenre=null,touchDrag=null,suppressClick=false;
function orderedGenreButtons(){return Array.from(nav.querySelectorAll('button[data-genre]'))}
function restoreGenreOrder(order){if(!Array.isArray(order))return;for(const name of order){const button=buttons.find(button=>button.dataset.genre===name);if(button)nav.append(button)}}
function persistGenreOrder(){window.KairosGenreOrder?.change?.(orderedGenreButtons().map(button=>button.dataset.genre))}
function moveGenre(button,direction){const order=orderedGenreButtons(),index=order.indexOf(button),target=order[index+direction];if(!target)return;if(direction>0)target.after(button);else target.before(button);persistGenreOrder();button.focus()}
function placeGenre(button,target,x){if(!target||target===button)return;const box=target.getBoundingClientRect();if(x<box.left+box.width/2)target.before(button);else target.after(button)}
for(const button of buttons){
 if(typeof window.KairosGenreOrder?.change!=='function')continue;
 button.draggable=true;button.title='Arrastrá para reordenar. Alt + flechas para mover.';button.setAttribute('aria-keyshortcuts','Alt+ArrowLeft Alt+ArrowRight');
 button.addEventListener('dragstart',event=>{draggedGenre=button;button.classList.add('genre-dragging');event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',button.dataset.genre)});
 button.addEventListener('dragover',event=>{if(!draggedGenre)return;event.preventDefault();event.dataTransfer.dropEffect='move';placeGenre(draggedGenre,button,event.clientX)});
 button.addEventListener('drop',event=>{if(!draggedGenre)return;event.preventDefault();persistGenreOrder()});
 button.addEventListener('dragend',()=>{button.classList.remove('genre-dragging');if(draggedGenre)persistGenreOrder();draggedGenre=null});
 button.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'||!event.isPrimary)return;touchDrag={button,id:event.pointerId,x:event.clientX,y:event.clientY,active:false,order:orderedGenreButtons().map(button=>button.dataset.genre)}});
 button.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopImmediatePropagation();suppressClick=false}},true);
}
nav.addEventListener('pointermove',event=>{
 if(!touchDrag||event.pointerId!==touchDrag.id)return;
 const dx=event.clientX-touchDrag.x,dy=event.clientY-touchDrag.y;
 if(!touchDrag.active){if(Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>8){touchDrag=null;return}if(Math.abs(dx)<10)return;touchDrag.active=true;touchDrag.button.classList.add('genre-dragging');nav.setPointerCapture(event.pointerId)}
 event.preventDefault();const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('button[data-genre]');if(target&&nav.contains(target))placeGenre(touchDrag.button,target,event.clientX);
});
function finishTouch(event){if(!touchDrag||event.pointerId!==touchDrag.id)return;const drag=touchDrag;touchDrag=null;drag.button.classList.remove('genre-dragging');if(drag.active){if(event.type==='pointercancel')restoreGenreOrder(drag.order);else persistGenreOrder();suppressClick=true;setTimeout(()=>suppressClick=false,0)}if(nav.hasPointerCapture(event.pointerId))nav.releasePointerCapture(event.pointerId)}
nav.addEventListener('dragover',event=>{if(draggedGenre){event.preventDefault();event.dataTransfer.dropEffect='move'}});
nav.addEventListener('drop',event=>{if(draggedGenre){event.preventDefault();persistGenreOrder()}});
nav.addEventListener('pointerup',finishTouch);nav.addEventListener('pointercancel',finishTouch);
document.addEventListener('kairos:genre-order-loaded',event=>restoreGenreOrder(event.detail));restoreGenreOrder(window.KairosGenreOrder?.get()||window.KairosPublishedGenreOrder);
function select(index){
 if(index!==selected)document.dispatchEvent(new Event('kairos:genre-selected'));
 selected=index;buttons.forEach((button,i)=>{button.setAttribute('aria-selected',String(i===index));button.tabIndex=i===index?0:-1});main.setAttribute('aria-labelledby',buttons[index].id);
 stories.forEach(entry=>{entry.story.hidden=entry.group!==index;if(entry.item)entry.item.hidden=entry.group!==index});
}
function followHash(){
 const id=decodeURIComponent(location.hash.slice(1));if(!id||id==='indice')return;
 const target=document.getElementById(id),entry=stories.find(entry=>entry.story===target||entry.story.contains(target));
 if(entry){select(entry.group);requestAnimationFrame(()=>target.scrollIntoView({block:'start'}))}
}
function organize(event){
 const items=Array.from(main.querySelectorAll('#indice > .toc > li, #indice > .published-index > li'));
 stories=Array.from(main.querySelectorAll('.published-story'),(story,position)=>{const name=normalize(story.querySelector('h1')?.textContent||story.getAttribute('aria-label')||'');const explicit=groups.findIndex(([label])=>label===story.dataset.kairosGenre);const group=explicit>=0?explicit:groups.findIndex(([,names])=>names.some(title=>normalize(title)===name));const item=items.find(item=>{const href=item.querySelector('a')?.getAttribute('href');if(!href?.startsWith('#'))return false;const target=document.getElementById(href.slice(1));return target&&(target===story||story.contains(target))});return {story,item,name,group:group<0?1:group,position}});
 stories.sort((a,b)=>a.group-b.group||(groups[a.group][0]==='Prosa'?a.position-b.position:(groups[a.group][1].findIndex(name=>normalize(name)===a.name)<0?100000+a.position:groups[a.group][1].findIndex(name=>normalize(name)===a.name))-(groups[b.group][1].findIndex(name=>normalize(name)===b.name)<0?100000+b.position:groups[b.group][1].findIndex(name=>normalize(name)===b.name))));
 const currentOrder=Array.from(main.querySelectorAll('.published-story'));
 const needsReorder=stories.some((entry,index)=>entry.story!==currentOrder[index]);
 for(const [index,entry] of stories.entries()){
  const heading=entry.story.querySelector('h1'),prefix=(index+1)+'. ';
  if(heading){
   const match=heading.textContent.match(/^\s*(?:✦\s*)?\d+[.)]\s*/);
   if(!match)heading.prepend(document.createTextNode(prefix));
   else if(match[0]!==prefix){let remaining=match[0].length,first=true;const walker=document.createTreeWalker(heading,NodeFilter.SHOW_TEXT),nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);for(const node of nodes){if(!remaining)break;const length=Math.min(remaining,node.textContent.length);node.textContent=(first?prefix:'')+node.textContent.slice(length);remaining-=length;first=false}}
   entry.story.setAttribute('aria-label',heading.textContent.trim());
  }
  const number=entry.item?.querySelector('.toc-num');if(number)number.textContent=String(index+1);
  if(needsReorder)entry.story.parentElement.append(entry.story);if(entry.item)entry.item.parentElement.append(entry.item)
 }
 if(!stories.some(entry=>entry.group===selected)&&stories.length)selected=stories[0].group;select(selected);if(event?.type!=='kairos:document-refreshed')followHash();
}
document.addEventListener('kairos:select-genre',event=>{const index=groups.findIndex(([name])=>name===event.detail);if(index>=0)select(index)});document.addEventListener('disociados:published',organize);document.addEventListener('kairos:document-refreshed',organize);window.addEventListener('hashchange',followHash);organize();
})();

(()=>{
 const main=document.querySelector('main');if(!main)return;
 function decorateActs(){
  for(const story of main.querySelectorAll('.published-story')){
   let acts=0;
   for(const heading of story.querySelectorAll('h2')){
    const isAct=/^(?:Acto|Cap[ií]tulo|Escena)\s+(?:\d+|[IVXLCDM]+)\b/i.test(heading.textContent.trim());
    const separate=isAct&&acts++>0;
    heading.toggleAttribute('data-act-divider',separate);
   }
  }
 }
 let pending=false;
 function schedule(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;decorateActs()})}
 document.addEventListener('disociados:published',decorateActs);
 document.addEventListener('kairos:document-refreshed',decorateActs);
 main.addEventListener('input',schedule);
 decorateActs();
})();

(()=>{
 const main=document.querySelector('main');if(!main)return;
 function compactBoundary(){
  main.querySelectorAll('[data-trailing-story-space]').forEach(node=>node.removeAttribute('data-trailing-story-space'));
  const gluten=main.querySelector('#cuento-17'),soneto=main.querySelector('#cuento-2');
  if(!gluten||!soneto)return;
  gluten.setAttribute('data-compact-soneto-boundary','');soneto.setAttribute('data-compact-gluten-boundary','');
  function trimEnd(parent){
   for(const node of Array.from(parent.childNodes).reverse()){
    if(node.nodeType===3){if(node.textContent.replace(/[\s\u200b\uFEFF]/g,''))return false;continue}
    if(node.nodeType!==1)continue;
    if(node.matches('[data-editor-only],.back-to-index'))continue;
    if(node.matches('img,svg,video,audio,hr,h1,h2,h3,h4,h5,h6'))return false;
    if(!trimEnd(node))return false;
    node.setAttribute('data-trailing-story-space','');
   }
   return true;
  }
  trimEnd(gluten);
 }
 document.addEventListener('kairos:document-refreshed',compactBoundary);
 document.addEventListener('disociados:published',compactBoundary);
 compactBoundary();
})();
