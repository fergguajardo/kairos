const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const OWNER='58c60587-9559-4747-a7bc-a90d36147caa';
const DOC='disociados-editable-fiel-v1';
const source=fs.readFileSync(path.join(__dirname,'../escritor/disociados-editable/index.html'),'utf8');
// Expose the history driver only inside the synthetic fixture, never in production.
const testSource=source.replace('refreshLayout();historyReady=true;resetDocumentHistory();','window.__historyForTest={save,navigateDocumentHistory,compactFormatting,state:()=>({length:documentHistory.length,bytes:historyBytes,full:historyValue.length*2})};refreshLayout();historyReady=true;resetDocumentHistory();');
// Synthetic text only. These tests never connect to a real account or database.
function fixture(){
 const titles=['BELA','PRINCIPITA','MANDALA','LATTE','ADORNI','SÁNDALO','BABA YAGA','ROBERTO','BARNIZ','PARBOIL','CLAUDE'];
 return {format:'kairos-disociados-document',version:2,title:'Editable',coverTitle:'Prueba',coverSynopsis:'',editorialRevision:2,publishedMigration:4,titleSpacing:7,chapterSpacing:3,textSpacing:0,publicationMode:'compatibility',creationDraft:null,html:'<section id="indice"></section>'+titles.map((title,i)=>`<section class="published-story" id="cuento-${i+1}"><article class="sheet story-start"><div class="page-content" data-layout-version="3"><h1 class="doc-heading" id="cuento-${i+1}-encabezado-0">${i+1}. ${title}</h1>${title==='BELA'?'<h2 class="doc-heading" id="cuento-1-encabezado-1">Capítulo 1</h2>':''}<p>Texto sintético de ${title} para verificar edición y recuperación.</p><p>Segundo párrafo de prueba con contenido independiente.</p><ul><li><span class="doc-marker">•</span>Una viñeta de prueba</li><li><span class="doc-marker">•</span>Otra viñeta de prueba</li></ul></div></article></section>`).join('')};
}
let browser;
before(async()=>{browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']})});
after(async()=>{await browser?.close()});
function server(initial=fixture()){
 const state={data:structuredClone(initial),stamp:'2026-11-02T12:00:00.000Z',writes:0,offline:false};
 state.api=async request=>{
  if(state.offline)return {data:null,error:{message:'Offline'}};
  if(request.mode==='update'||request.mode==='insert'){
   if(request.eq.updated_at&&request.eq.updated_at!==state.stamp)return {data:null};
   state.data=structuredClone(request.value.data);state.stamp=request.value.updated_at;state.writes++;return {data:{updated_at:state.stamp}};
  }
  return {data:{data:structuredClone(state.data),updated_at:state.stamp}};
 };
 return state;
}
async function open(state=server(),htmlSource=testSource){
 const page=await browser.newPage();page.setDefaultTimeout(5000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.exposeBinding('__guionApi',(_,request)=>state.api(request));
 await page.addInitScript(({OWNER})=>{
  const auth={onAuthStateChange(callback){window.__authCallback=callback},getSession:async()=>({data:{session:{user:{id:OWNER}}}}),getUser:async()=>({data:{user:{id:OWNER}}})};
  window.supabase={createClient:()=>({auth,from(table){const request={table,eq:{},mode:'read',fields:'',single:false};const q={select(fields){request.fields=fields;return q},eq(key,value){request.eq[key]=value;return q},order(){return q},limit(){return q},update(value){request.mode='update';request.value=value;return q},insert(value){request.mode='insert';request.value=value;return q},maybeSingle(){request.single=true;return window.__guionApi(request)},then(resolve,reject){return window.__guionApi(request).then(resolve,reject)}};return q}})};
 },{OWNER});
 await page.route('**/*',route=>route.request().url()==='https://guion.test/'?route.fulfill({contentType:'text/html',body:htmlSource}):route.fulfill({body:''}));
 await page.goto('https://guion.test/');await page.waitForFunction(()=>!document.querySelector('main').inert);await settled(page);
 return {page,state,errors,async close(){assert.deepEqual(errors,[]);await page.close()}};
}
async function settled(page){await page.waitForTimeout(850);await page.waitForFunction(()=>!/^Guardando/.test(document.querySelector('#status').textContent))}
const stories=page=>page.evaluate(()=>[...document.querySelectorAll('.published-story')].map(s=>({id:s.id,text:s.textContent.replace(/^\s*\d+\.\s*/,''),hidden:s.hidden})));
const genre=(page,name)=>page.getByRole('tab',{name,exact:true}).click();
async function selectAllRoot(page){await page.evaluate(()=>{document.querySelector('main').focus();const r=document.createRange();r.selectNodeContents(document.querySelector('main'));getSelection().removeAllRanges();getSelection().addRange(r)})}
async function typeAtEnd(page,text='X'){await page.locator('.published-story:not([hidden]) p').last().click();await page.keyboard.press('End');await page.keyboard.type(text);await settled(page)}

test('delete one genre only; toolbar and keyboard undo/redo preserve other genres',async()=>{
 const t=await open();const {page}=t;await genre(page,'Drama');const before=await stories(page);const protectedText=before.filter(s=>s.hidden).map(s=>s.text);await page.locator('.published-story:not([hidden]) p').first().click();await page.keyboard.press('Control+a');await page.keyboard.press('Backspace');
 assert.equal((await stories(page)).length,7);assert.deepEqual((await stories(page)).map(s=>s.text),protectedText);
 for(let i=0;i<4;i++){await page.getByRole('button',{name:'Deshacer',exact:true}).click();assert.equal((await stories(page)).length,11);await page.getByRole('button',{name:'Rehacer',exact:true}).click();assert.equal((await stories(page)).length,7)}
 await page.keyboard.press('Control+z');assert.equal((await stories(page)).length,11);await page.keyboard.press('Control+Shift+z');assert.equal((await stories(page)).length,7);await t.close();
});
test('cross-genre selection deletion and cut never remove hidden stories',async()=>{
 const t=await open();const {page}=t;await genre(page,'Drama');const protectedText=(await stories(page)).filter(s=>s.hidden).map(s=>s.text);
 for(const cut of [false,true]){await selectAllRoot(page);await page.evaluate(cut=>document.querySelector('main').dispatchEvent(cut?new ClipboardEvent('cut',{bubbles:true,cancelable:true,clipboardData:new DataTransfer()}):new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'deleteContentForward'})),cut);assert.deepEqual((await stories(page)).map(s=>s.text),protectedText);await page.keyboard.press('Control+z');await genre(page,'Drama')}
 await t.close();
});
test('replacement typing and pasted HTML across hidden genres are blocked',async()=>{
 const t=await open();const {page}=t;await genre(page,'Drama');const before=await stories(page);
 for(const paste of [false,true]){await selectAllRoot(page);await page.evaluate(paste=>{const main=document.querySelector('main');if(paste){const data=new DataTransfer();data.setData('text/html','<p>Replacement</p>');main.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}))}else main.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:'Replacement'}))},paste);assert.deepEqual(await stories(page),before)}await t.close();
});
test('backspace and delete cannot cross story boundaries',async()=>{
 const t=await open();const {page}=t;await genre(page,'Drama');const before=await stories(page);
 for(const backwards of [true,false]){await page.evaluate(backwards=>{const story=document.querySelector('.published-story:not([hidden])'),target=backwards?story.querySelector('h1'):story.querySelector('li:last-child');const w=document.createTreeWalker(target,NodeFilter.SHOW_TEXT);let node;while(w.nextNode())node=w.currentNode;const r=document.createRange();r.setStart(node,backwards?0:node.length);r.collapse(true);document.querySelector('main').focus();getSelection().removeAllRanges();getSelection().addRange(r)},backwards);await page.keyboard.press(backwards?'Backspace':'Delete');assert.deepEqual(await stories(page),before)}await t.close();
});
test('switching genre clears stale text and bullet selections',async()=>{
 const t=await open();const {page}=t;await page.locator('.published-story:not([hidden]) p').first().click();await page.keyboard.press('Control+a');await genre(page,'Drama');assert(await page.evaluate(()=>getSelection().isCollapsed));
 await page.locator('.published-story:not([hidden]) .doc-marker').first().click();await genre(page,'Comedia');const before=await stories(page);await page.keyboard.press('Delete');assert.deepEqual(await stories(page),before);assert.equal(await page.locator('.bullet-selected').count(),0);await t.close();
});
test('typing, native undo events and a new edit invalidate redo correctly',async()=>{
 const t=await open();const {page}=t;await typeAtEnd(page,'XYZ');const typed=await stories(page);
 await page.keyboard.press('Control+z');assert.notDeepEqual(await stories(page),typed);await page.keyboard.press('Control+y');assert.deepEqual(await stories(page),typed);
 await page.evaluate(()=>document.querySelector('main').dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'historyUndo'})));await typeAtEnd(page,'N');assert(await page.getByRole('button',{name:'Rehacer',exact:true}).isDisabled());await t.close();
});
test('partial selection deletion keeps the caret in the same paragraph',async()=>{
 const t=await open();const {page}=t;await genre(page,'Drama');await page.locator('.published-story:not([hidden]) p').last().click();
 await page.evaluate(()=>{const p=[...document.querySelectorAll('.published-story:not([hidden]) p')].pop();p.dataset.testCaret='yes';const n=p.firstChild,r=document.createRange();r.setStart(n,4);r.setEnd(n,9);getSelection().removeAllRanges();getSelection().addRange(r)});await page.keyboard.press('Backspace');
 assert(await page.evaluate(()=>getSelection().anchorNode?.parentElement?.closest('[data-test-caret]')!==null));await t.close();
});
test('an empty manuscript is not auto-saved over a nonempty confirmed document',async()=>{
 const t=await open();const {page,state}=t;const original=structuredClone(state.data);const writes=state.writes;
 await page.evaluate(()=>{document.querySelector('main').innerHTML='';document.querySelector('main').dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'deleteContentBackward'}))});await settled(page);
 assert.equal(state.writes,writes);assert.deepEqual(state.data,original);assert(await page.getByText('El documento quedó vacío.',{exact:false}).isVisible());await page.getByRole('button',{name:'Deshacer',exact:true}).click();assert.equal((await stories(page)).length,11);await t.close();
});
test('failed save retains edits and reconnect retries without replacing the confirmed copy',async()=>{
 const t=await open();const {page,state}=t;const old=structuredClone(state.data);state.offline=true;await typeAtEnd(page,'OFFLINE');assert.deepEqual(state.data,old);assert(await page.getByText('No se confirmó el guardado',{exact:false}).isVisible());assert((await stories(page)).some(s=>s.text.includes('OFFLINE')));
 state.offline=false;await page.evaluate(()=>dispatchEvent(new Event('online')));await settled(page);assert(state.data.html.includes('OFFLINE'));await t.close();
});
test('two tabs detect concurrent changes rather than silently overwrite',async()=>{
 const state=server(),a=await open(state),b=await open(state);await a.page.reload();await a.page.waitForFunction(()=>!document.querySelector('main').inert);await settled(a.page);await typeAtEnd(a.page,'FROM_A');await typeAtEnd(b.page,'FROM_B');assert(state.data.html.includes('FROM_A'));assert(!state.data.html.includes('FROM_B'));assert(await b.page.getByRole('button',{name:'Conservar mi edición',exact:true}).isVisible());
 b.page.once('dialog',dialog=>dialog.accept());await b.page.getByRole('button',{name:'Cargar copia de Supabase',exact:true}).click();await settled(b.page);assert((await stories(b.page)).some(s=>s.text.includes('FROM_A')));await a.close();await b.close();
});


test('reload loads confirmed text, never a stale empty undo baseline',async()=>{
 const t=await open();await typeAtEnd(t.page,'RELOAD_TEXT');await t.page.reload();await t.page.waitForFunction(()=>!document.querySelector('main').inert);assert((await stories(t.page)).some(s=>s.text.includes('RELOAD_TEXT')));assert(await t.page.getByRole('button',{name:'Deshacer',exact:true}).isDisabled());await t.close();
});

test('edits entered during an in-flight save are saved afterwards',async()=>{
 const state=server(),baseApi=state.api;state.api=async request=>{if(request.mode==='update')await new Promise(r=>setTimeout(r,90));return baseApi(request)};
 const t=await open(state);await t.page.locator('.published-story:not([hidden]) p').last().click();await t.page.keyboard.press('End');await t.page.keyboard.type('FIRST');await t.page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Guardando'));
 await t.page.keyboard.type('SECOND');await settled(t.page);await t.page.waitForTimeout(350);assert(state.data.html.includes('FIRSTSECOND'));await t.close();
});
test('session loss disables editing and signing back in resumes pending changes',async()=>{
 const t=await open();await t.page.locator('.published-story:not([hidden]) p').last().click();await t.page.keyboard.press('End');await t.page.keyboard.type('SESSION_PENDING');await t.page.evaluate(()=>window.__authCallback('SIGNED_OUT'));assert(await t.page.locator('main').evaluate(m=>m.inert));
 await t.page.evaluate(()=>window.__authCallback('SIGNED_IN'));await t.page.waitForFunction(()=>!document.querySelector('main').inert);await settled(t.page);assert(t.state.data.html.includes('SESSION_PENDING'));await t.close();
});

test('a selection extending outside the editor still cannot delete hidden stories',async()=>{
 const t=await open();await genre(t.page,'Drama');const before=(await stories(t.page)).filter(s=>s.hidden).map(s=>s.text);
 await t.page.evaluate(()=>{const main=document.querySelector('main'),r=document.createRange();r.setStartBefore(main.previousElementSibling);r.setEndAfter(main);main.focus();getSelection().removeAllRanges();getSelection().addRange(r);main.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'deleteContentBackward'}))});
 assert.deepEqual((await stories(t.page)).map(s=>s.text),before);await t.close();
});

test('no recovery controls or recovery-table requests remain',async()=>{
 const state=server(),original=state.api;state.api=request=>{assert.equal(request.table,'kairos_documents');return original(request)};const t=await open(state);assert.equal(await t.page.getByRole('button',{name:'Versiones guardadas',exact:true}).count(),0);await typeAtEnd(t.page,'AUTOSAVE_ONLY');assert(state.data.html.includes('AUTOSAVE_ONLY'));await t.close();
});

test('rich paste preserves font size, weight and color through save and reload',async()=>{
 const t=await open();await t.page.locator('.published-story:not([hidden]) p').last().click();await t.page.keyboard.press('End');
 await t.page.evaluate(()=>{const data=new DataTransfer();data.setData('text/html','<p><span style="font-family:Georgia;font-size:23px;font-weight:600;color:rgb(210, 80, 40)">RICH_STYLE</span><span style="font-size:14px;font-weight:400;color:rgb(40, 150, 190)">SECOND_STYLE</span></p>');document.querySelector('main').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}))});
 async function check(){return t.page.getByText('RICH_STYLE',{exact:true}).evaluate(n=>{const c=getComputedStyle(n);return [c.fontSize,c.fontWeight,c.color]})}
 assert.deepEqual(await check(),['23px','600','rgb(210, 80, 40)']);await settled(t.page);await t.page.reload();await t.page.waitForFunction(()=>!document.querySelector('main').inert);assert.deepEqual(await check(),['23px','600','rgb(210, 80, 40)']);await t.close();
});
test('copy and paste of mixed styled runs preserves each run and supports undo',async()=>{
 const t=await open();await t.page.locator('.published-story:not([hidden]) p').last().click();
 await t.page.evaluate(()=>{const p=[...document.querySelectorAll('.published-story:not([hidden]) p')].pop();p.innerHTML='<span style="font-size:21px!important;font-weight:500!important;color:rgb(180, 90, 20)!important">MIX_A</span><span style="font-size:13px!important;font-weight:300!important;color:rgb(30, 150, 180)!important">MIX_B</span>';const range=document.createRange();range.selectNodeContents(p);getSelection().removeAllRanges();getSelection().addRange(range);const data=new DataTransfer();p.dispatchEvent(new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:data}));window.__clipboard=data;range.collapse(false);getSelection().removeAllRanges();getSelection().addRange(range);p.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}))});
 const styles=await t.page.getByText('MIX_A',{exact:true}).all();assert.equal(styles.length,2);for(const n of styles)assert.deepEqual(await n.evaluate(n=>{const c=getComputedStyle(n);return [c.fontSize,c.fontWeight,c.color]}),['21px','500','rgb(180, 90, 20)']);
 await t.page.keyboard.press('Control+z');assert.equal(await t.page.getByText('MIX_A',{exact:true}).count(),1);await t.page.keyboard.press('Control+y');assert.equal(await t.page.getByText('MIX_A',{exact:true}).count(),2);await t.close();
});
test('external rich paste strips active content and unsafe link schemes',async()=>{
 const t=await open();await t.page.locator('.published-story:not([hidden]) p').last().click();await t.page.keyboard.press('End');await t.page.evaluate(()=>{const d=new DataTransfer();d.setData('text/html','<script>window.__unsafe=true</script><p onclick="window.__unsafe=true"><b>SAFE_BOLD</b><a href="javascript:alert(1)">SAFE_LINK</a></p>');document.querySelector('main').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:d}))});assert.equal(await t.page.evaluate(()=>!!window.__unsafe),false);assert.equal(await t.page.locator('main [onclick],main a[href^="javascript:"]').count(),0);assert.equal(await t.page.getByText('SAFE_BOLD',{exact:true}).evaluate(n=>getComputedStyle(n).fontWeight),'700');await t.close();
});
test('plain-text paste still accepts multiline text',async()=>{const t=await open();await t.page.locator('.published-story:not([hidden]) p').last().click();await t.page.keyboard.press('End');await t.page.evaluate(()=>{const d=new DataTransfer();d.setData('text/plain','PLAIN_ONE\nPLAIN_TWO');document.querySelector('main').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:d}))});assert(await t.page.getByText('PLAIN_ONE',{exact:true}).isVisible());assert(await t.page.getByText('PLAIN_TWO',{exact:true}).isVisible());await t.close()});

test('undo/redo traverses rich paste and subsequent typing in order without losing formatting',async()=>{
 const t=await open();const {page}=t;await page.locator('.published-story:not([hidden]) p').last().click();await page.keyboard.press('End');
 await page.evaluate(()=>{const d=new DataTransfer();d.setData('text/html','<span style="font-size:22px;font-weight:600;color:rgb(170, 90, 30)">PASTE_HISTORY</span>');document.querySelector('main').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:d}))});
 const pasted=await stories(page);await page.keyboard.type('Z');const edited=await stories(page);assert.notDeepEqual(edited,pasted);
 await page.getByRole('button',{name:'Deshacer',exact:true}).click();assert.deepEqual(await stories(page),pasted);
 await page.keyboard.press('Control+z');assert.equal(await page.getByText('PASTE_HISTORY',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Rehacer',exact:true}).click();assert.deepEqual(await stories(page),pasted);
 assert.deepEqual(await page.getByText('PASTE_HISTORY',{exact:true}).evaluate(n=>{const s=getComputedStyle(n);return [s.fontSize,s.fontWeight,s.color]}),['22px','600','rgb(170, 90, 30)']);
 await page.keyboard.press('Control+Shift+z');assert.deepEqual(await stories(page),edited);
 await page.keyboard.press('Control+z');await typeAtEnd(page,'Q');assert(await page.getByRole('button',{name:'Rehacer',exact:true}).isDisabled());await t.close();
});

test('small plus adds golden regular 13pt acts without a tooltip; undo and redo work',async()=>{
 const t=await open();const {page}=t;const button=page.getByRole('toolbar',{name:'Herramientas de BELA',exact:true}).getByRole('button',{name:'Crear acto 2 a BELA',exact:true});assert.equal(await button.getAttribute('title'),null);assert.equal(await button.evaluate(n=>getComputedStyle(n).width),'30px');await button.click();
 const heading=page.getByRole('heading',{name:'Acto 2',exact:true});assert.deepEqual(await heading.evaluate(n=>{const s=getComputedStyle(n);return [s.fontSize,s.fontWeight,s.fontStyle,s.color]}),['17.3333px','300','normal','rgb(229, 185, 92)']);
 await page.getByRole('button',{name:'Deshacer',exact:true}).click();assert.equal(await heading.count(),0);await page.getByRole('button',{name:'Rehacer',exact:true}).click();assert.equal(await heading.count(),1);await settled(page);await page.reload();await page.waitForFunction(()=>!document.querySelector('main').inert);assert.equal(await heading.count(),1);assert.equal(await heading.evaluate(n=>getComputedStyle(n).fontWeight),'300');await t.close();
});


test('direct creation in the active genre persists and supports undo/redo',async()=>{const t=await open();const {page,state}=t;for(const name of ['Thriller','Drama','Comedia']){await genre(page,name);await page.getByRole('button',{name:'Agregar entrada al índice',exact:true}).click();assert.equal(await page.locator('dialog').count(),0);const input=page.getByLabel('Título de la entrada',{exact:true});assert(await input.evaluate(n=>n===document.activeElement));await input.fill('Nueva '+name);await input.press('Enter');assert(await page.locator('#indice .toc-title').filter({hasText:'Nueva '+name}).isVisible());await page.getByRole('button',{name:'Deshacer',exact:true}).click();await page.getByRole('button',{name:'Rehacer',exact:true}).click();await settled(page);assert(state.data.html.includes('data-kairos-genre="'+name+'"'));}await page.reload();await page.waitForFunction(()=>!document.querySelector('main').inert);for(const name of ['Thriller','Drama','Comedia']){await genre(page,name);assert(await page.locator('#indice .toc-title').filter({hasText:'Nueva '+name}).isVisible())}await t.close()});

test('four genre tabs and icon-only entry control above the index',async()=>{const t=await open();assert.equal(await t.page.getByRole('tab').count(),4);assert.equal(await t.page.getByRole('tab',{name:'Sin clasificar',exact:true}).count(),0);const b=t.page.getByRole('button',{name:'Agregar entrada al índice',exact:true});assert.equal(await b.textContent(),'');assert.equal(await b.getAttribute('title'),null);assert(await b.evaluate(n=>n.parentElement.nextElementSibling.id==='indice'));await t.close()});
test('new Drama Mandala is number 5 after four Thriller stories and before one comedy',async()=>{
 const initial=fixture();const section=initial.html.match(/<section class="published-story"[\s\S]*?<\/section>/g);initial.html='<section id="indice"></section>'+section.filter(s=>['BELA','PRINCIPITA','MANDALA','SÁNDALO','ROBERTO'].some(name=>s.includes('. '+name+'</h1>'))).join('');
 const t=await open(server(initial));await genre(t.page,'Drama');await t.page.getByRole('button',{name:'Agregar entrada al índice',exact:true}).click();await t.page.getByLabel('Título de la entrada',{exact:true}).fill('Mandala');await t.page.getByLabel('Título de la entrada',{exact:true}).press('Enter');assert.equal(await t.page.locator('.published-story:not([hidden]) h1').innerText(),'5. Mandala');assert.equal(await t.page.locator('#indice > .toc > li:not([hidden]) .toc-num').innerText(),'5');await settled(t.page);await t.page.reload();await t.page.waitForFunction(()=>!document.querySelector('main').inert);await genre(t.page,'Drama');assert.equal(await t.page.locator('.published-story:not([hidden]) h1').innerText(),'5. Mandala');await genre(t.page,'Comedia');assert.match(await t.page.locator('.published-story:not([hidden]) h1').innerText(),/^6\. ROBERTO/);await t.close();
});

test('older entries with duplicate anchors are repaired without losing their text',async()=>{const data=fixture();data.html+='<section class="published-story" id="cuento-1" data-kairos-genre="Drama"><article class="sheet story-start"><div class="page-content" data-layout-version="3"><h1 class="doc-heading" id="cuento-1-encabezado-0">Nueva conservada</h1><p>CONTENIDO_PRESERVADO</p></div></article></section>';const t=await open(server(data));await genre(t.page,'Drama');assert(await t.page.getByText('CONTENIDO_PRESERVADO',{exact:true}).isVisible());const ids=await t.page.locator('.published-story').evaluateAll(nodes=>nodes.map(n=>n.id));assert.equal(new Set(ids).size,ids.length);assert.equal(await t.page.locator('#cuento-1 h1').innerText(),'1. BELA');await t.close()});

test('trash immediately deletes only its own story without dialogs and supports undo/redo',async()=>{const t=await open();const {page}=t;let dialogs=0;page.on('dialog',dialog=>{dialogs++;dialog.dismiss()});const before=await stories(page);const button=page.getByRole('button',{name:'Eliminar entrada 1. BELA',exact:true});assert.equal(await button.getAttribute('title'),null);assert.equal(await button.textContent(),'');await button.click();assert.equal((await stories(page)).length,before.length-1);assert(!(await stories(page)).some(s=>s.text.includes('Texto sintético de BELA')));assert.equal(dialogs,0);await page.getByRole('button',{name:'Deshacer',exact:true}).click();assert.equal((await stories(page)).length,before.length);await page.getByRole('button',{name:'Rehacer',exact:true}).click();assert.equal((await stories(page)).length,before.length-1);await settled(page);await page.reload();await page.waitForFunction(()=>!document.querySelector('main').inert);assert.equal((await stories(page)).length,before.length-1);await t.close()});
test('explicit trash deletion of the final entry can save the empty index',async()=>{const data=fixture();data.html='<section id="indice"></section>'+data.html.match(/<section class="published-story"[\s\S]*?<\/section>/)[0];const t=await open(server(data));await t.page.getByRole('button',{name:/^Eliminar entrada/}).click();await settled(t.page);assert.equal((await stories(t.page)).length,0);assert(!t.state.data.html.includes('class="published-story"'));assert(!t.state.data.html.includes('index-delete-entry'));await t.close()});

test('every story and chapter has the Brote create/edit/category/delete controls without labels or tooltips',async()=>{const t=await open();const panels=t.page.locator('.story-tool-panel');assert.equal(await panels.count(),12);assert(await panels.evaluateAll(nodes=>nodes.every(n=>[...n.querySelectorAll('button')].map(b=>b.dataset.action).join(',')==='create,edit,genre,remove,copyDialogue'&&[...n.querySelectorAll('button')].every(b=>!b.title&&!b.textContent.trim()))));await t.close()});
test('edit a story title without changing its genre; edit and remove an act independently',async()=>{const t=await open();const {page}=t;const original=page.getByRole('toolbar',{name:'Herramientas de BELA',exact:true});await original.getByRole('button',{name:'Editar BELA',exact:true}).click();await page.getByLabel('Editar título',{exact:true}).fill('Bela revisada');await page.getByLabel('Editar título',{exact:true}).press('Enter');assert(await page.locator('.published-story:not([hidden]) h1').filter({hasText:'Bela revisada'}).isVisible());const tools=page.getByRole('toolbar',{name:'Herramientas de Bela revisada',exact:true});await tools.getByRole('button',{name:'Crear acto 2 a Bela revisada',exact:true}).click();await typeAtEnd(page,'ACT_BODY');const act=page.getByRole('toolbar',{name:'Herramientas de Acto 2',exact:true});await act.getByRole('button',{name:'Editar Acto 2',exact:true}).click();await page.getByLabel('Editar título',{exact:true}).fill('Acto 2. Giro');await page.getByLabel('Editar título',{exact:true}).press('Enter');const updated=page.getByRole('toolbar',{name:'Herramientas de Acto 2. Giro',exact:true});await updated.getByRole('button',{name:'Eliminar Acto 2. Giro',exact:true}).click();assert.equal(await page.getByRole('heading',{name:'Acto 2. Giro',exact:true}).count(),0);await page.getByRole('button',{name:'Deshacer',exact:true}).click();assert(await page.getByRole('heading',{name:'Acto 2. Giro',exact:true}).isVisible());await t.close()});
test('theatrical templates match Roberto typography, remain editable, and do not repeat on reload',async()=>{const t=await open();const {page}=t;const story=page.locator('#cuento-1');const person=story.getByText('PERSONAJE.',{exact:true});assert.deepEqual(await person.evaluate(n=>{const s=getComputedStyle(n);return [n.isContentEditable,s.fontSize,s.fontWeight,s.color]}),[true,'16px','300','rgb(229, 185, 92)']);assert.equal(await page.locator('#cuento-17').getByText('PERSONAJE.',{exact:true}).count(),0);await person.click();await person.evaluate(n=>{const r=document.createRange();r.selectNodeContents(n);getSelection().removeAllRanges();getSelection().addRange(r)});await page.keyboard.insertText('LUX.');await settled(page);await page.reload();await page.waitForFunction(()=>!document.querySelector('main').inert);assert.equal(await story.getByText('LUX.',{exact:true}).count(),1);assert.equal(await story.getByText('(Acotación).',{exact:true}).count(),1);assert.equal(await story.getByText('PERSONAJE.',{exact:true}).count(),0);await t.close()});

test('move a story to labeled Romance and retain the genre after reload',async()=>{
 const t=await open(),{page}=t;const tab=page.getByRole('tab',{name:'Romance',exact:true});
 assert.equal(await tab.textContent(),'Romance');assert.equal(await tab.evaluate(n=>n.nextElementSibling.dataset.genre),'Thriller');
 await page.getByRole('toolbar',{name:'Herramientas de BELA',exact:true}).getByRole('button',{name:'Cambiar categoría de BELA',exact:true}).click();
 await page.getByLabel('Categoría de la historia',{exact:true}).selectOption('Prosa');
 assert.equal(await tab.getAttribute('aria-selected'),'true');
 await settled(page);await page.reload();await page.waitForFunction(()=>!document.querySelector('main').inert);
 await tab.click();assert(await page.locator('#cuento-1').isVisible());await t.close();
});

test('a typing burst defers full manuscript copies and shares the capture with autosave',async()=>{
 const t=await open();const {page,state}=t;
 await page.evaluate(()=>{
  const main=document.querySelector('main'),p=main.querySelector('.published-story:not([hidden]) p');
  const story=p.closest('.published-story');window.__copies=0;const clone=story.cloneNode;story.cloneNode=function(...args){window.__copies++;return clone.apply(this,args)};
  for(let i=0;i<200;i++){p.append('x');p.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:'x'}))}
 });
 assert.equal(await page.evaluate(()=>window.__copies),0);
 await settled(page);assert.equal(await page.evaluate(()=>window.__copies),1);
 assert(state.data.html.includes('x'.repeat(200)));await t.close();
});

test('immediate undo commits the pending typing group and preserves redo',async()=>{
 const t=await open();const {page}=t;const before=await stories(page);
 await page.locator('.published-story:not([hidden]) p').last().click();await page.keyboard.press('End');await page.keyboard.type('FAST_GROUP');
 const after=await stories(page);await page.keyboard.press('Control+z');assert.deepEqual(await stories(page),before);
 await page.keyboard.press('Control+y');assert.deepEqual(await stories(page),after);await t.close();
});

test('history deltas retain Unicode, survive trimming and discard redo branches',async()=>{
 const t=await open();const {page}=t;
 const result=await page.evaluate(()=>{
  const p=document.querySelector('.published-story:not([hidden]) p'),main=document.querySelector('main');
  // Explicit commands create separate undo steps; ordinary typing is grouped.
  const values=[];
  const {save,navigateDocumentHistory,state}=window.__historyForTest;
  for(let i=0;i<110;i++){p.textContent='Paso '+i+' — café 🐢';save();values.push(main.textContent)}
  const retained=state().length;
  for(let i=0;i<20;i++)navigateDocumentHistory('undo');
  const previous=main.textContent;
  for(let i=0;i<20;i++)navigateDocumentHistory('redo');
  return {retained,previous,expected:values[89],final:main.textContent,latest:values[109],bytes:state().bytes,full:state().full};
 });
 assert.equal(result.retained,100);assert.equal(result.previous,result.expected);assert.equal(result.final,result.latest);
 assert(result.bytes<result.full*3,'history should store small edits rather than 100 complete copies');
 await page.evaluate(()=>window.__historyForTest.navigateDocumentHistory('undo'));await typeAtEnd(page,'NEW_BRANCH');assert(await page.getByRole('button',{name:'Rehacer',exact:true}).isDisabled());await t.close();
});

test('hiding the page flushes a pending typing burst before its debounce expires',async()=>{
 const t=await open();const {page,state}=t;
 await page.evaluate(()=>{
  const p=document.querySelector('.published-story:not([hidden]) p');p.append('HIDDEN_FLUSH');p.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText'}));
  Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));
 });
 await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Guardado confirmado'));
 assert(state.data.html.includes('HIDDEN_FLUSH'));await t.close();
});

test('IME composition stays pending until completion and survives an in-flight save',async()=>{
 const state=server(),t=await open(state),api=state.api;let release,entered;
 const saving=new Promise(resolve=>entered=resolve);
 state.api=async request=>{if(request.mode==='update'&&!release){entered();await new Promise(resolve=>release=resolve)}return api(request)};
 const {page}=t;
 await page.locator('.published-story:not([hidden]) p').last().click();await page.keyboard.press('End');await page.keyboard.type('BEFORE_IME');await saving;
 await page.evaluate(()=>{const p=document.querySelector('.published-story:not([hidden]) p');p.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));p.append('漢字');p.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,inputType:'insertCompositionText'}))});
 release();await page.waitForTimeout(300);assert(!state.data.html.includes('漢字'));
 await page.evaluate(()=>document.querySelector('main').dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));
 await settled(page);assert(state.data.html.includes('漢字'));assert(state.data.html.includes('BEFORE_IME'));await t.close();
});

function tangledFixture(){
 const initial=fixture();
 const style='font-family:Outfit, sans-serif !important;font-size:16px !important;font-weight:300 !important;font-style:normal !important;color:rgb(229, 185, 92) !important';
 const paragraphs=Array.from({length:50},(_,i)=>'<p>'+('<span style="'+style+'">').repeat(200)+'PERSONAJE. — Texto sintético '+i+'.'+'</span>'.repeat(200)+'</p>').join('');
 initial.html='<section id="indice"></section><section class="published-story" id="cuento-1" data-kairos-genre="Drama" data-theatre-ready="true"><h1>1. PRUEBA</h1>'+paragraphs+'</section>';
 return initial;
}

test('deeply nested formatting is compacted on load without losing text, typography or saved content',async()=>{
 const initial=tangledFixture(),t=await open(server(initial)),{page,state}=t;
 assert(await page.locator('main span').count()<150);
 const text=await page.locator('.published-story p').allTextContents();
 assert.deepEqual(text,Array.from({length:50},(_,i)=>'PERSONAJE. — Texto sintético '+i+'.'));
 const style=await page.locator('.published-story p span').first().evaluate(n=>{const s=getComputedStyle(n);return [s.color,s.fontSize,s.fontWeight,s.fontStyle]});
 assert.deepEqual(style,['rgb(229, 185, 92)','16px','300','normal']);
 assert(state.data.html.length<initial.html.length/20);
 await page.locator('.published-story p').first().click();await page.keyboard.press('End');await page.keyboard.type('FLUJO');await settled(page);
 assert(state.data.html.includes('FLUJO'));await page.keyboard.press('Control+z');assert(!(await page.locator('main').textContent()).includes('FLUJO'));
 await page.keyboard.press('Control+y');assert((await page.locator('main').textContent()).includes('FLUJO'));await t.close();
});

test('compaction preserves mixed formatting, whitespace, links and structural spans',async()=>{
 const t=await open();const result=await t.page.evaluate(()=>{
  const root=document.createElement('div');document.body.append(root);
  root.innerHTML='<p><span style="font-size:16px!important;color:red!important;font-weight:300"><span style="font-size:21px;color:blue;font-style:italic"> A </span></span><span style="font-size:12px">B</span><span style="font-size:12px"> C</span><a href="https://example.com"><span style="color:green"> link </span></a><span class="doc-marker">•</span><span style="margin-left:20px"></span><span style="font-size:20px"><span style="font-size:1.5em">RELATIVE</span></span><span style="text-decoration:underline"><span style="color:red">UNDERLINE</span></span></p>';
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  const signature=()=>nodes.map(node=>{const s=getComputedStyle(node.parentElement);return [node.data,s.fontSize,s.fontWeight,s.fontStyle,s.color]});
  const before=signature(),text=root.textContent;
  window.__historyForTest.compactFormatting(root);
  const after=signature(),sameText=text===root.textContent;
  const protectedNodes=root.querySelectorAll('a,.doc-marker,[style*="margin-left"],[style*="1.5em"],[style*="text-decoration"]').length;
  root.remove();return {before,after,sameText,protectedNodes};
 });
 assert.deepEqual(result.after,result.before);assert(result.sameText);assert.equal(result.protectedNodes,5);await t.close();
});

test('repeated rich copying and pasting does not rebuild deep format chains',async()=>{
 const t=await open(),{page}=t;
 await page.locator('.published-story:not([hidden]) p').last().click();
 await page.evaluate(()=>{
  const p=[...document.querySelectorAll('.published-story:not([hidden]) p')].pop();p.innerHTML='<span style="font-size:16px;color:rgb(229,185,92)">CADENA</span>';
  for(let i=0;i<15;i++){
   const r=document.createRange();r.selectNodeContents(p);const selection=getSelection();selection.removeAllRanges();selection.addRange(r);
   const data=new DataTransfer();p.dispatchEvent(new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:data}));p.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));
  }
 });
 const depth=await page.getByText('CADENA',{exact:true}).last().evaluate(n=>{let depth=0;while(n&&n.tagName!=='P'){if(n.tagName==='SPAN')depth++;n=n.parentElement}return depth});
 assert(depth<=3);await settled(page);assert(t.state.data.html.includes('CADENA'));await t.close();
});

test('profile native typing and deferred save on a synthetic 10000-span document',{skip:!process.env.GUION_PROFILE},async context=>{
 for(const variant of ['before','after']){
  const html=variant==='before'?testSource.replace(/compactFormatting\((?:template\.content|copy|fragment|replica)\);/g,''):testSource;
  const t=await open(server(tangledFixture()),html),{page}=t;
  await page.locator('.published-story p').first().click();await page.keyboard.press('End');
  const session=await page.context().newCDPSession(page);await session.send('Performance.enable');
  const get=async()=>Object.fromEntries((await session.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
  const spans=await page.locator('main span').count(),start=await get(),time=Date.now();
  await page.keyboard.type('Un flujo de palabras con pausas naturales.',{delay:25});const typed=await get();
  await settled(page);const saved=await get();
  context.diagnostic(JSON.stringify({variant,spans,elapsedMs:Date.now()-time,typingScriptMs:(typed.ScriptDuration-start.ScriptDuration)*1000,typingLayoutMs:(typed.LayoutDuration-start.LayoutDuration)*1000,typingStyleMs:(typed.RecalcStyleDuration-start.RecalcStyleDuration)*1000,saveScriptMs:(saved.ScriptDuration-typed.ScriptDuration)*1000}));
  await session.detach();await t.close();
 }
});

