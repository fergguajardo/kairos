/* Kairos: authenticated storage. Only a publishable key belongs here. */
(() => {
  'use strict';
  const URL = 'https://etbtwbxdouedjpwwendg.supabase.co';
  const PUBLIC_KEY = 'sb_publishable_upAQWEUODK2TXIrERiGEWg_IXIgtJ9V';
  const OWNER = '58c60587-9559-4747-a7bc-a90d36147caa';
  const META = KEY + '-cloud-v1-' + OWNER;
  const RECOVERY = KEY + '-cloud-conflict-backup';
  const gate = $('auth-gate'), app = $('kairos-app');
  let client, user = null, ready = false, loading = false, applying = false;
  let stamp = null, dirty = false, pending = null, saving = false, timer;
  let baseline = '', conflict = false, remoteConflict = null;
  function signature(value) {
    // Object property order is not a workspace change.
    const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
    return JSON.stringify(canonical({boards:value.boards,redes:value.redes}));
  }
  const recovery=document.createElement('button');
  recovery.id='cloud-recovery';recovery.className='cloud-status';recovery.textContent='Descargar copia local';
  recovery.title='Descargar los cambios locales conservados antes de cargar la nube';recovery.hidden=true;
  document.querySelector('.backup-tools').append(recovery);
  try {recovery.hidden=!localStorage.getItem(RECOVERY);}catch{}
  recovery.onclick=()=>{
    try {const value=JSON.parse(localStorage.getItem(RECOVERY)||'null');if(value)download(value);}
    catch {toast('No se pudo descargar la copia local.');}
  };
  function preserveLocal(snapshot) {
    const value=JSON.stringify(snapshot);
    // Keep earlier recoveries as well as an accessible copy of the latest one.
    localStorage.setItem(RECOVERY+'-'+Date.now()+'-'+Math.random().toString(36).slice(2),value);
    localStorage.setItem(RECOVERY,value);recovery.hidden=false;
  }
  function status(text) { const node=$('cloud-status');node.textContent=text;node.hidden=text==='Guardado en Supabase';node.style.display=node.hidden?'none':''; }
  function message(text) { $('auth-message').textContent = text === 'Ingresá con tu cuenta de Kairos.' ? '' : text; }
  function lock(text) {
    try{sessionStorage.removeItem(KEY+'-resume-ui');}catch{}
    ready = false; app.hidden = true; app.inert = true; gate.hidden = false;
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
    $('auth-form').hidden=false;$('auth-conflict').hidden=true;
    if(text) message(text);
  }
  function unlock() { try{sessionStorage.setItem(KEY+'-resume-ui','1');}catch{} ready = true; app.hidden = false; app.inert = false; gate.hidden = true; }
  function persist() {
    localStorage.setItem(META,JSON.stringify({stamp,dirty,snapshot:dirty?pending:null}));
  }
  function download(value) {
    const url=window.URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='kairos-respaldo-pendiente-'+Date.now()+'.json';a.click();
    setTimeout(()=>window.URL.revokeObjectURL(url),1000);
  }
  function apply(value) {
    if(value?.format!=='kairos-backup') throw Error('Formato de nube inválido');
    const next=prepareKairosImport(value);
    applying=true;
    try { restoreKairosBackup(next,true); } finally { applying=false; }
    baseline=signature(kairosBackup());
  }
  function showConflict(remote) {
    conflict=true;remoteConflict=remote;
    lock('Hay otra versión guardada. Descargá tus cambios pendientes antes de cargar la versión de la nube.');
    $('auth-form').hidden=true;$('auth-conflict').hidden=false;
    status('Cambios pendientes: hay otra versión');
  }
  function changed() {
    if(!ready||applying||conflict) return;
    const snapshot=kairosBackup(),next=signature(snapshot);
    if(next===baseline&&!dirty&&!saving) return;
    pending=snapshot;dirty=true;
    try { persist();status('Guardado pendiente'); }
    catch { status('Sin respaldo local: descargá JSON'); }
    clearTimeout(timer);timer=setTimeout(flush,650);
  }
  async function readRemote() {
    const result=await client.from('kairos_state').select('data,updated_at').eq('user_id',OWNER).maybeSingle();
    if(result.error) throw result.error;
    return result.data;
  }
  async function flush() {
    clearTimeout(timer);
    if(!ready||!user||!dirty||saving||conflict) return false;
    saving=true;status('Guardando…');
    const snapshot=pending,expected=stamp;
    try {
      const nextStamp=new Date(Math.max(Date.now(),Date.parse(stamp||'')+1||0)).toISOString();
      let result;
      if(expected) result=await client.from('kairos_state').update({data:snapshot,updated_at:nextStamp})
        .eq('user_id',OWNER).eq('updated_at',expected).select('updated_at').maybeSingle();
      else result=await client.from('kairos_state').insert({user_id:OWNER,data:snapshot,updated_at:nextStamp})
        .select('updated_at').single();
      if(result.error) {
        if(result.error.code==='23505') {showConflict(await readRemote());return false;}
        throw result.error;
      }
      if(!result.data) {showConflict(await readRemote());return false;}
      stamp=result.data.updated_at;baseline=signature(snapshot);
      if(pending===snapshot) {dirty=false;pending=null;}
      try {persist();} catch {status('Guardado en la nube; respaldo local no disponible');}
      status(dirty?'Guardado pendiente':'Guardado en Supabase');
      return !dirty;
    } catch {
      status('Sin guardar en la nube · Reintentar');
      return false;
    } finally {
      saving=false;
      if(dirty&&ready&&!conflict) {clearTimeout(timer);timer=setTimeout(flush,5000);}
    }
  }
  async function connect(session) {
    if(loading||ready) return;
    if(!session) {lock('Ingresá con tu cuenta de Kairos.');return;}
    if(session.user.id!==OWNER) {lock('Esta cuenta no tiene acceso a Kairos.');return;}
    loading=true;user=session.user;message('Conectando tus datos…');
    try {
      const verified=await client.auth.getUser();
      if(verified.error||verified.data.user?.id!==OWNER) throw Error('Sesión no válida');
      let meta=null;try{meta=JSON.parse(localStorage.getItem(META)||'null');}catch{}
      const remote=await readRemote();
      if(meta?.dirty&&meta.snapshot) {
        pending=meta.snapshot;dirty=true;stamp=meta.stamp;
        if(remote&&(remote.updated_at!==stamp||signature(remote.data)===signature(pending))) {
          // On entry the cloud is authoritative. Never drop an unsent local copy.
          // If it is already on the server, a stale timestamp needs no recovery.
          const differs=signature(remote.data)!==signature(pending);
          if(differs) preserveLocal(pending);
          apply(remote.data);stamp=remote.updated_at;dirty=false;pending=null;persist();
          if(differs) toast('Se cargó la nube. Tus cambios locales quedaron en Descargar copia local.');
        } else apply(pending);
      } else if(remote) {
        apply(remote.data);stamp=remote.updated_at;dirty=false;pending=null;persist();
      } else {
        // First connection: preserve and upload this browser's existing workspace.
        pending=kairosBackup();dirty=true;stamp=null;
        localStorage.setItem(KEY+'-before-cloud',JSON.stringify(pending));persist();
      }
      conflict=false;unlock();status(dirty?'Guardado pendiente':'Guardado en Supabase');
      if(dirty) await flush();
    } catch {
      lock('No pudimos conectar tus datos. Se conservó la copia local. Probá ingresar nuevamente.');
    } finally {loading=false;}
  }
  window.KairosCloud={changed,flush,lock};
  window.REDES.onSave=changed;
  $('cloud-status').onclick=flush;
  $('auth-conflict-download').onclick=()=>{
    download(pending||kairosBackup());$('auth-conflict-load').disabled=false;
  };
  $('auth-conflict-load').onclick=async()=>{
    try {
      const remote=await readRemote();
      if(!remote) throw Error('No existe versión remota');
      preserveLocal(pending||kairosBackup());
      apply(remote.data);stamp=remote.updated_at;dirty=false;pending=null;conflict=false;remoteConflict=null;persist();
      $('auth-conflict').hidden=true;$('auth-form').hidden=false;unlock();status('Guardado en Supabase');
    } catch {message('No se pudo cargar la versión de la nube. Tu copia pendiente se conserva.');}
  };
  $('auth-logout').onclick=async()=>{
    document.activeElement?.blur();changed();
    await flush();
    if(dirty) {toast('Hay cambios pendientes. Descargá JSON o esperá a que se guarden antes de salir.');return;}
    lock('Cerrando sesión…');
    const result=await client.auth.signOut({scope:'local'});
    if(result.error) {message('No se pudo cerrar la sesión. Reintentá.');return;}
    user=null;message('Sesión cerrada. Tus datos están guardados en Supabase.');
  };
  $('auth-form').onsubmit=async event=>{
    event.preventDefault();if(!client) {message('No se cargó la conexión. Recargá la página.');return;}
    $('auth-submit').disabled=true;message('Ingresando…');
    try {
      const result=await client.auth.signInWithPassword({email:$('auth-email').value.trim(),password:$('auth-password').value});
      $('auth-password').value='';
      if(result.error) {message('No se pudo ingresar. Revisá tu correo, contraseña y conexión.');return;}
      await connect(result.data.session);
    } catch {message('No se pudo conectar. Probá nuevamente.');}
    finally {$('auth-submit').disabled=false;}
  };
  window.addEventListener('online',()=>{if(ready)flush();});
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&ready){changed();flush();}});
  async function start() {
    try {
      if(!window.supabase?.createClient) throw Error('SDK no disponible');
      client=window.supabase.createClient(URL,PUBLIC_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
      client.auth.onAuthStateChange((event,session)=>{
        if(event==='SIGNED_OUT'||!session&&event==='TOKEN_REFRESHED') {user=null;lock('Ingresá con tu cuenta de Kairos.');}
      });
      const result=await client.auth.getSession();
      if(result.error) throw result.error;
      await connect(result.data.session);
    } catch {lock('No se pudo iniciar la conexión. Recargá la página; tus datos locales se conservan.');}
  }
  start();
})();
