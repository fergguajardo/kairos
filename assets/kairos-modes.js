(() => {
  'use strict';
  const tracks = [
    ['ANGUISH','anguish'], ['CLARIFICATION','clarification'],
    ['COSMIC DUST','cosmic-dust'], ['DREAMER','dreamer'],
    ['DREAMY BOOT','dreamy-boot'], ['DREAMY MOON','dreamy-moon'],
    ['IN ORBIT','in-orbit'], ['MONO STORY','mono-story'],
    ['STRANGER','stranger'], ['SUBMARSE','submarse']
  ];
  const root = document.getElementById('music-modes');
  const audio = new Audio();
  audio.preload = 'none';
  const picker = root.querySelector('[data-track]');
  const play = root.querySelector('[data-play]');
  const volume = root.querySelector('[data-volume]');
  const status = root.querySelector('[data-status]');
  const blue = root.querySelector('[data-blue]');
  const silent = root.querySelector('[data-silent]');
  const storageKey = 'kairos-music-modes-v1';
  let index = 0, enabled = false, request = 0;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (Number.isInteger(saved?.track) && saved.track >= 0 && saved.track < tracks.length) index = saved.track;
    volume.value = Number.isFinite(saved?.volume) ? Math.min(100, Math.max(0, saved.volume)) : 30;
  } catch { volume.value = 30; }
  audio.volume = Number(volume.value) / 100;
  tracks.forEach(([title], i) => {
    const option = document.createElement('option');
    option.value = i; option.textContent = title; picker.append(option);
  });
  picker.value = index;
  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify({track:index,volume:Number(volume.value)})); } catch {}
  }
  function update() {
    blue.setAttribute('aria-pressed', String(enabled));
    silent.setAttribute('aria-pressed', String(!enabled));
    root.querySelector('[data-mode-label]').textContent = enabled ? 'BLUE' : 'Modos';
    play.setAttribute('aria-label', audio.paused ? 'Reproducir cortina' : 'Pausar cortina');
    play.title = audio.paused ? 'Reproducir' : 'Pausar';
    play.innerHTML = audio.paused
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';
    picker.value = index;
    volume.setAttribute('aria-valuetext', volume.value + ' %');
  }
  function load() { audio.src = 'assets/music/blue/' + tracks[index][1] + '.mp3'; }
  async function start() {
    const current = ++request;
    enabled = true;
    if (!audio.getAttribute('src')) load();
    status.textContent = 'Cargando…'; update();
    try {
      await audio.play();
      if (current !== request) return;
      status.textContent = 'Reproduciendo · ' + tracks[index][0]; update();
    } catch (error) {
      if (current !== request || error.name === 'AbortError') return;
      status.textContent = 'No se pudo reproducir. Pulsá reproducir para reintentar.'; update();
    }
  }
  function change(next) {
    const resume = enabled && !audio.paused;
    ++request; audio.pause(); index = (next + tracks.length) % tracks.length;
    load(); persist(); status.textContent = 'Lista · ' + tracks[index][0]; update();
    if (resume) start();
  }
  blue.onclick = start;
  silent.onclick = () => {
    ++request; enabled = false; audio.pause(); status.textContent = 'Silencio'; update();
  };
  play.onclick = () => {
    if (audio.paused) start();
    else { ++request; audio.pause(); status.textContent = 'En pausa · ' + tracks[index][0]; update(); }
  };
  root.querySelector('[data-previous]').onclick = () => change(index - 1);
  root.querySelector('[data-next]').onclick = () => change(index + 1);
  picker.onchange = () => change(Number(picker.value));
  volume.oninput = () => { audio.volume = Number(volume.value) / 100; persist(); update(); };
  audio.onended = () => { if (enabled) { change(index + 1); start(); } };
  audio.onerror = () => { status.textContent = 'No se pudo cargar esta cortina. Probá otra pista.'; update(); };
  audio.onpause = update;
  audio.onplay = update;
  root.addEventListener('keydown', e => { if(e.key === 'Escape'){root.open = false;root.querySelector('summary').focus();} });
  const app = document.getElementById('kairos-app');
  new MutationObserver(() => {
    if(app.hidden){++request;enabled=false;audio.pause();status.textContent='Silencio';update();}
  }).observe(app,{attributes:true,attributeFilter:['hidden']});
  status.textContent = 'Elegí BLUE para escuchar'; update();
})();
