// The DOM HUD: crosshair that widens with spread, health and armor bars, ammo, money,
// round timer, team score, kill feed, round banners, the buy menu and the minimap.
// It never touches the simulation; main.js pushes numbers in and reads callbacks out.
const COPY = {
  start: {
    title: 'RUSTLINE DEPOT',
    copy: 'Vanguard defends two bomb sites against the Rustjackals. Hold the sites, defuse the bomb, win 5 rounds.',
    action: 'Click to play',
  },
  paused: {
    title: 'RUSTLINE DEPOT',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  roundWin: {
    title: 'ROUND WON',
    copy: 'Site held. The Rustjackals fall back.',
    action: 'Next round',
  },
  roundLose: {
    title: 'ROUND LOST',
    copy: 'The Rustjackals take the round.',
    action: 'Next round',
  },
  matchWin: {
    title: 'VICTORY',
    copy: 'Vanguard takes the depot. 5 rounds won.',
    action: 'Play again',
  },
  matchLose: {
    title: 'DEFEAT',
    copy: 'The Rustjackals take the depot.',
    action: 'Play again',
  },
  dead: {
    title: 'YOU ARE DOWN',
    copy: 'Your team fights on without you.',
    action: 'Watch',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const buyMenu = $('buy-menu');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const damageFlash = $('damage-flash');
  const banner = $('banner');
  const bannerText = $('banner-text');
  const killfeed = $('killfeed');
  const minimap = $('minimap');
  const mapCtx = minimap.getContext('2d');
  let hitTimer = 0;
  let bannerTimer = 0;
  let last = {};

  function setText(el, key, value) {
    if (last[key] !== value) {
      last[key] = value;
      el.textContent = value;
    }
  }

  return {
    setHealth(hp, armor) {
      setText($('health-value'), 'hp', String(Math.max(0, Math.ceil(hp))));
      $('health-fill').style.width = `${Math.max(0, Math.min(100, hp))}%`;
      $('health-fill').classList.toggle('low', hp <= 30);
      $('armor-row').style.display = armor > 0 ? 'flex' : 'none';
      $('armor-fill').style.width = `${Math.max(0, Math.min(100, armor))}%`;
      setText($('armor-value'), 'armor', String(Math.max(0, Math.ceil(armor))));
    },
    setAmmo(mag, reserve, name) {
      setText($('ammo-mag'), 'mag', String(mag));
      setText($('ammo-reserve'), 'res', `/ ${reserve}`);
      setText($('weapon-name'), 'wname', name);
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setMoney(value) { setText($('money-value'), 'money', `$${value}`); },
    setGrenades(n) { setText($('grenade-count'), 'nade', n > 0 ? `◉ ${n}` : '○ 0'); },
    setTimer(seconds, label) {
      const s = Math.max(0, Math.ceil(seconds));
      setText($('timer-value'), 'timer', `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
      setText($('timer-label'), 'tlabel', label);
      $('timer').classList.toggle('urgent', s <= 10 && label !== 'BUY PHASE');
    },
    setScore(vanguard, rustjack, round) {
      setText($('score-vanguard'), 'sv', String(vanguard));
      setText($('score-rustjack'), 'sr', String(rustjack));
      setText($('round-label'), 'round', `ROUND ${round}`);
    },
    setBomb(status) {
      setText($('bomb-status'), 'bomb', status);
      $('bomb-status').style.display = status ? 'block' : 'none';
    },
    setSpread(gapPx) {
      crosshair.style.setProperty('--gap', `${gapPx}px`);
    },
    hitMarker(killed, holdMs = 120) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    hurt() {
      damageFlash.classList.add('on');
      setTimeout(() => damageFlash.classList.remove('on'), 180);
    },
    showBanner(text, ms = 2500) {
      bannerText.textContent = text;
      banner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.remove('on'), ms);
    },
    killFeed(text, good) {
      const line = document.createElement('div');
      line.className = `feed-line${good ? ' good' : ' bad'}`;
      line.textContent = text;
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    showOverlay(mode, score) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === 'roundWin' || mode === 'roundLose'
        ? `${text.copy} Score ${score}.`
        : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() { overlay.hidden = true; },
    onPlay(handler) { play.addEventListener('click', handler); },
    showBuy(show) { buyMenu.hidden = !show; },
    setBuyState(money, owned) {
      setText($('buy-money'), 'bmoney', `$${money}`);
      for (const button of buyMenu.querySelectorAll('[data-buy]')) {
        const id = button.dataset.buy;
        const price = Number(button.dataset.price);
        button.disabled = owned.includes(id) || money < price;
        button.classList.toggle('owned', owned.includes(id));
      }
    },
    onBuy(handler) {
      buyMenu.addEventListener('click', (event) => {
        const button = event.target.closest('[data-buy]');
        if (button && !button.disabled) handler(button.dataset.buy);
      });
    },
    drawMinimap(world, playerPos, playerYaw, friendlies, enemies, bombPos, bombPlanted) {
      const W = minimap.width;
      const H = minimap.height;
      const toX = (x) => ((x + 22.2) / 44.4) * W;
      const toY = (z) => ((z + 16.2) / 32.4) * H;
      mapCtx.clearRect(0, 0, W, H);
      mapCtx.fillStyle = 'rgba(23, 26, 31, 0.85)';
      mapCtx.fillRect(0, 0, W, H);
      mapCtx.fillStyle = '#313842';
      // Static cover: containers and crates read as grey blocks.
      for (const c of world.colliders) {
        if (c.max.y < 0.5) continue;
        mapCtx.fillRect(toX(c.min.x), toY(c.min.z), Math.max(1, toX(c.max.x) - toX(c.min.x)), Math.max(1, toY(c.max.z) - toY(c.min.z)));
      }
      // Sites.
      for (const [name, site] of Object.entries(world.sites)) {
        mapCtx.fillStyle = bombPlanted && bombPos ? '#e5484d' : '#f5a623';
        mapCtx.font = 'bold 11px system-ui, sans-serif';
        mapCtx.textAlign = 'center';
        mapCtx.fillText(name, toX(site.center.x), toY(site.center.z) + 4);
      }
      // Bomb.
      if (bombPlanted && bombPos) {
        mapCtx.fillStyle = '#e5484d';
        mapCtx.beginPath();
        mapCtx.arc(toX(bombPos.x), toY(bombPos.z), 4, 0, Math.PI * 2);
        mapCtx.fill();
      }
      const dot = (x, z, color, r = 3) => {
        mapCtx.fillStyle = color;
        mapCtx.beginPath();
        mapCtx.arc(toX(x), toY(z), r, 0, Math.PI * 2);
        mapCtx.fill();
      };
      for (const f of friendlies) if (f.alive) dot(f.pos.x, f.pos.z, '#2ec4a6');
      for (const e of enemies) if (e.alive && e.seen) dot(e.pos.x, e.pos.z, '#d95f2b');
      // Player arrow, rotated to the facing yaw.
      mapCtx.save();
      mapCtx.translate(toX(playerPos.x), toY(playerPos.z));
      mapCtx.rotate(Math.atan2(-Math.sin(playerYaw), -Math.cos(playerYaw)) + Math.PI / 2);
      mapCtx.fillStyle = '#ece7db';
      mapCtx.beginPath();
      mapCtx.moveTo(0, -6);
      mapCtx.lineTo(4, 5);
      mapCtx.lineTo(-4, 5);
      mapCtx.closePath();
      mapCtx.fill();
      mapCtx.restore();
    },
  };
}
