// 喇叭開關 + 音樂播放器(首頁、About 頁共用):
//   喇叭 = 所有聲音的開關;播放器 = 封面 + 歌名 + 播放 / 下一首,點封面或歌名打開歌單(Cat Street 3D 房間電台同一份)。
//   電腦在左下角,手機在右上的選單按鈕下面。首頁要等飛到戰艦才顯示(main.mjs 呼叫 player.show),About 頁一直顯示。
import { sfx } from '/assets/starship/sfx.mjs?v=7';
const sfxBtn = Object.assign(document.createElement('button'), { id: 'sfxBtn', title: 'Sound' });
sfxBtn.setAttribute('aria-label', 'Toggle sound');
const drawSfx = () => { sfxBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/>${sfx.muted ? '<path d="M17 9l5 6M22 9l-5 6"/>' : '<path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'}</svg>`; sfxBtn.classList.toggle('muted', sfx.muted); };
drawSfx(); sfxBtn.addEventListener('click', () => { sfx.toggle(); drawSfx(); }); document.body.appendChild(sfxBtn);
// 播放器(左下角喇叭旁邊;手機在喇叭下面):封面色塊 + 歌名 + 播放 / 下一首;點封面或歌名打開歌單(跟 Cat Street 房間的電台同一份)
const musicBox = Object.assign(document.createElement('div'), { id: 'musicBox' });
const cov = (t) => `linear-gradient(135deg, ${t.cover.join(', ')})`;
const ICON = { play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>', pause: '<path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor" stroke="none"/>', next: '<path d="M6 6l9 6-9 6z" fill="currentColor" stroke="none"/><path d="M17 6v12"/>' };
const svg = (k) => `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">${ICON[k]}</svg>`;
musicBox.innerHTML = `<button class="mb-cover" aria-label="Playlist"><i></i><span class="eq"><b></b><b></b><b></b></span></button>
  <button class="mb-info" aria-label="Playlist"><b></b><span></span></button>
  <button class="mb-play" aria-label="Play / pause"></button><button class="mb-next" aria-label="Next song">${svg('next')}</button>
  <div class="mb-list" role="dialog" aria-label="Playlist"><div class="mb-head">PLAYLIST<small>Music · Mixkit</small><span class="mb-ctl"><button class="mb-play2" aria-label="Play / pause"></button><button class="mb-next2" aria-label="Next song">${svg('next')}</button></span></div>${sfx.music.list.map((t, i) => `<button class="mb-row" data-i="${i}"><i style="background:${cov(t)}"></i><span><b>${t.title}</b><em>${t.artist} · ${t.mood}</em></span><span class="eq"><b></b><b></b><b></b></span></button>`).join('')}</div>`;
document.body.appendChild(musicBox);
const drawMusic = () => {
  const m = sfx.music, t = m.list[m.index];
  musicBox.querySelector('.mb-cover i').style.background = cov(t);
  musicBox.querySelector('.mb-info b').textContent = t.title; musicBox.querySelector('.mb-info span').textContent = t.artist;
  musicBox.querySelector('.mb-play').innerHTML = musicBox.querySelector('.mb-play2').innerHTML = svg(m.playing ? 'pause' : 'play');
  musicBox.classList.toggle('playing', m.playing);
  musicBox.querySelectorAll('.mb-row').forEach((r, i) => r.classList.toggle('cur', i === m.index));
  drawSfx();
};
sfx.music.on(drawMusic); drawMusic();
for (const q of ['.mb-play', '.mb-play2']) musicBox.querySelector(q).addEventListener('click', () => sfx.music.toggle());
for (const q of ['.mb-next', '.mb-next2']) musicBox.querySelector(q).addEventListener('click', () => sfx.music.next());   // 2 = 手機歌單上面那組
for (const b of musicBox.querySelectorAll('.mb-cover, .mb-info')) b.addEventListener('click', (e) => { e.stopPropagation(); musicBox.classList.toggle('open'); });
musicBox.querySelectorAll('.mb-row').forEach((r) => r.addEventListener('click', () => { sfx.music.play(+r.dataset.i); musicBox.classList.remove('open'); }));
addEventListener('pointerdown', (e) => { if (!musicBox.contains(e.target)) musicBox.classList.remove('open'); });
sfx.enableMusic();                                                     // 有喇叭開關的頁面才放背景音樂(第一次點擊 / 按鍵 / 觸控後淡入)
export const player = { show(on) { sfxBtn.classList.toggle('on', on); musicBox.classList.toggle('on', on); } };
player.show(document.body.dataset.ns !== 'home');
