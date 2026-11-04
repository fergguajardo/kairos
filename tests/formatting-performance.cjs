const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../escritor/disociados-editable/index.html'),'utf8');
const code=html.slice(html.indexOf('function compactFormatting(root){'),html.indexOf('// Editor controls never belong'));
test('format compaction does not scan text in nested containers',()=>{
 let reads=0;
 const style=[];style.cssText='';
 const spans=Array.from({length:10000},()=>({nodeType:1,tagName:'SPAN',attributes:[],style,childNodes:[{nodeType:1,tagName:'B'}],nextSibling:null,get textContent(){reads++;return 'document text'}}));
 const root={querySelectorAll:()=>spans};
 const compact=vm.runInNewContext(code+';compactFormatting');
 assert.equal(compact(root),false);
 assert.equal(reads,0,'nested text must not be traversed just to detect an empty leaf');
 const baseline=vm.runInNewContext(code.replace('if([...span.childNodes].every(node=>node.nodeType===3)&&!span.textContent)','if(!span.textContent&&[...span.childNodes].every(node=>node.nodeType===3))')+';compactFormatting');
 baseline(root);assert.equal(reads,10000);
});
