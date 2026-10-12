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
  const progress = document.createElement('div');
  progress.className = 'music-progress';
  progress.innerHTML = '<label for="blue-progress">Progreso</label><input id="blue-progress" type="range" min="0" max="0" step="1" value="0" disabled aria-label="Posición de la canción"><div class="music-times"><span data-elapsed>0:00</span><span data-duration>0:00</span></div>';
  root.querySelector('.music-controls').after(progress);
  const seek = progress.querySelector('input');
  const elapsed = progress.querySelector('[data-elapsed]');
  const duration = progress.querySelector('[data-duration]');
  function clock(seconds) {
    const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
  }
  function updateProgress() {
    const valid = Number.isFinite(audio.duration) && audio.duration > 0;
    seek.disabled = !valid;
    seek.max = valid ? audio.duration : 0;
    seek.value = valid ? Math.min(audio.currentTime || 0, audio.duration) : 0;
    elapsed.textContent = clock(valid ? audio.currentTime : 0);
    duration.textContent = clock(valid ? audio.duration : 0);
    seek.setAttribute('aria-valuetext', elapsed.textContent + ' de ' + duration.textContent);
  }
  seek.oninput = () => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    audio.currentTime = Math.min(audio.duration, Math.max(0, Number(seek.value)));
    updateProgress();
  };
  audio.ontimeupdate = updateProgress;
  audio.onloadedmetadata = updateProgress;
  audio.ondurationchange = updateProgress;
  audio.onseeked = updateProgress;
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
  function load() { seek.disabled = true; seek.value = 0; seek.max = 0; elapsed.textContent = duration.textContent = '0:00'; audio.src = 'assets/music/blue/' + tracks[index][1] + '.mp3'; }
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
  status.textContent = 'Elegí BLUE para escuchar'; update(); updateProgress();
})();
