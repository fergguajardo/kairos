const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const OWNER='58c60587-9559-4747-a7bc-a90d36147caa';
const DOC='disociados-editable-fiel-v1';
const source=fs.readFileSync(path.join(__dirname,'../escritor/disociados-editable/index.html'),'utf8');
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
async function open(state=server()){
 const page=await browser.newPage();page.setDefaultTimeout(5000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.exposeBinding('__guionApi',(_,request)=>state.api(request));
 await page.addInitScript(({OWNER})=>{
  const auth={onAuthStateChange(callback){window.__authCallback=callback},getSession:async()=>({data:{session:{user:{id:OWNER}}}}),getUser:async()=>({data:{user:{id:OWNER}}})};
  window.supabase={createClient:()=>({auth,from(table){const request={table,eq:{},mode:'read',fields:'',single:false};const q={select(fields){request.fields=fields;return q},eq(key,value){request.eq[key]=value;return q},order(){return q},limit(){return q},update(value){request.mode='update';request.value=value;return q},insert(value){request.mode='insert';request.value=value;return q},maybeSingle(){request.single=true;return window.__guionApi(request)},then(resolve,reject){return window.__guionApi(request).then(resolve,reject)}};return q}})};
 },{OWNER});
 await page.route('**/*',route=>route.request().url()==='https://guion.test/'?route.fulfill({contentType:'text/html',body:source}):route.fulfill({body:''}));
 await page.goto('https://guion.test/');await page.waitForFunction(()=>!document.querySelector('main').inert);await settled(page);
 return {page,state,errors,async close(){assert.deepEqual(errors,[]);await page.close()}};
}
async function settled(page){await page.waitForFunction(()=>!/^Guardando/.test(document.querySelector('#status').textContent));await page.waitForTimeout(320)}
const stories=page=>page.evaluate(()=>[...document.querySelectorAll('.published-story')].map(s=>({id:s.id,text:s.textContent.replace(/^\s*\d+\.\s*/,''),hidden:s.hidden})));
const genre=(page,name)=>page.getByRole('tab',{name,exact:true}).click();
async function selectAllRoot(page){await page.evaluate(()=>{document.querySelector('main').focus();const r=document.createRange();r.selectNodeContents(document.querySelector('main'));getSelection().removeAllRanges();getSelection().addRange(r)})}
async function typeAtEnd(page,text='X'){await page.locator('.published-story:not([hidden]) p').last().click();await page.keyboard.press('End');await page.keyboard.type(text);await settled(page)}

test('delete unclassified only; toolbar and keyboard undo/redo preserve the other nine',async()=>{
 const t=await open();const {page}=t;const before=await stories(page);await genre(page,'Sin clasificar');await page.locator('.published-story:not([hidden]) p').first().click();await page.keyboard.press('Control+a');await page.keyboard.press('Backspace');
 assert.equal((await stories(page)).length,9);assert.deepEqual((await stories(page)).map(s=>s.text),before.slice(0,9).map(s=>s.text));
 for(let i=0;i<4;i++){await page.getByRole('button',{name:'Deshacer',exact:true}).click();assert.equal((await stories(page)).length,11);await page.getByRole('button',{name:'Rehacer',exact:true}).click();assert.equal((await stories(page)).length,9)}
 await page.keyboard.press('Control+z');assert.equal((await stories(page)).length,11);await page.keyboard.press('Control+Shift+z');assert.equal((await stories(page)).length,9);await t.close();
});
test('cross-genre selection deletion and cut never remove hidden stories',async()=>{
 const t=await open();const {page}=t;await genre(page,'Sin clasificar');const protectedText=(await stories(page)).filter(s=>s.hidden).map(s=>s.text);
 for(const cut of [false,true]){await selectAllRoot(page);await page.evaluate(cut=>document.querySelector('main').dispatchEvent(cut?new ClipboardEvent('cut',{bubbles:true,cancelable:true,clipboardData:new DataTransfer()}):new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'deleteContentForward'})),cut);assert.deepEqual((await stories(page)).map(s=>s.text),protectedText);await page.keyboard.press('Control+z');await genre(page,'Sin clasificar')}
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
 const t=await open();await genre(t.page,'Sin clasificar');const before=(await stories(t.page)).filter(s=>s.hidden).map(s=>s.text);
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
