/* 국기 퀴즈 - 화면 효과 (색종이) */
(function (global) {
  'use strict';
  var FQ = (global.FQ = global.FQ || {});
  var COLORS = ['#ff5f6d', '#ffc371', '#47cf73', '#4fc3f7', '#b388ff', '#ffd54f'];
  var canvas = null, ctx = null, pieces = [], raf = null;

  function reducedMotion() {
    return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function ensure() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.className = 'confetti-canvas';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    global.addEventListener('resize', resize);
  }

  function resize() {
    if (!canvas) return;
    canvas.width = global.innerWidth;
    canvas.height = global.innerHeight;
  }

  function burst(count, opts) {
    if (reducedMotion()) return;
    ensure();
    resize();
    opts = opts || {};
    var n = count || 70;
    var cx = opts.x === undefined ? canvas.width / 2 : opts.x;
    var cy = opts.y === undefined ? canvas.height * 0.32 : opts.y;
    var power = opts.power || 1;
    var spread = opts.spread === undefined ? canvas.width * 0.6 : opts.spread;
    for (var i = 0; i < n; i++) {
      pieces.push({
        x: cx + (Math.random() - 0.5) * spread,
        y: cy + (Math.random() - 0.5) * 60,
        vx: (Math.random() - 0.5) * 9 * power + (opts.vx || 0),
        vy: (-6 - Math.random() * 7) * power,
        size: 6 + Math.random() * 8,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        life: 80 + Math.random() * 50
      });
    }
    if (!raf) tick();
  }

  /* ---------------- 정답 축하 ---------------- */
  var CHEERS = ['정답!', '잘했어!', '멋져!', '최고야!', '맞았어!', '대단해!'];

  /**
   * 정답을 맞혔을 때 화면 한가운데에 커다랗게 축하해 준다.
   * level 0~3 (연속 정답이 쌓일수록 커진다), streak 을 주면 연속 배지도 함께 띄운다.
   */
  function celebrate(opts) {
    opts = opts || {};
    var level = Math.max(0, Math.min(3, opts.level || 0));
    var text = opts.text || CHEERS[Math.floor(Math.random() * CHEERS.length)];

    // 색종이는 양쪽에서 한 번씩 더 터뜨려 화면을 가득 채운다
    burst(50 + level * 35);
    if (level >= 1) {
      var w = global.innerWidth, h = global.innerHeight;
      burst(24 + level * 10, { x: w * 0.08, y: h * 0.55, spread: 40, vx: 4, power: 1.15 });
      burst(24 + level * 10, { x: w * 0.92, y: h * 0.55, spread: 40, vx: -4, power: 1.15 });
    }

    if (reducedMotion()) return;

    var old = document.querySelector('.celebrate');
    if (old) old.remove();

    var el = document.createElement('div');
    el.className = 'celebrate lv' + level;
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<div class="celebrate-rays"></div>' +
      '<div class="celebrate-stamp">' +
        '<span class="celebrate-text">' + text + '</span>' +
        (opts.streak >= 3 ? '<span class="celebrate-streak">🔥 ' + opts.streak + '연속</span>' : '') +
      '</div>';
    document.body.appendChild(el);
    global.setTimeout(function () { el.remove(); }, 1500);
  }

  function tick() {
    raf = global.requestAnimationFrame(tick);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (var i = pieces.length - 1; i >= 0; i--) {
      var p = pieces[i];
      p.vy += 0.28;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life -= 1;
      if (p.life <= 0 || p.y > canvas.height + 40) { pieces.splice(i, 1); continue; }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.min(1, p.life / 40);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.65);
      ctx.restore();
    }
    if (!pieces.length) {
      global.cancelAnimationFrame(raf);
      raf = null;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  FQ.effects = { burst: burst, celebrate: celebrate };
})(window);
