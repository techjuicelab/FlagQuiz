/* 국기 퀴즈 - 화면 효과 (색종이) */
(function (global) {
  'use strict';
  var FQ = (global.FQ = global.FQ || {});
  var COLORS = ['#ff5f6d', '#ffc371', '#47cf73', '#4fc3f7', '#b388ff', '#ffd54f'];
  var canvas = null, ctx = null, pieces = [], raf = null;

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

  function burst(count) {
    if (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    ensure();
    resize();
    var n = count || 70;
    for (var i = 0; i < n; i++) {
      pieces.push({
        x: canvas.width / 2 + (Math.random() - 0.5) * canvas.width * 0.6,
        y: canvas.height * 0.32 + (Math.random() - 0.5) * 60,
        vx: (Math.random() - 0.5) * 9,
        vy: -6 - Math.random() * 7,
        size: 6 + Math.random() * 8,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        life: 80 + Math.random() * 50
      });
    }
    if (!raf) tick();
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

  FQ.effects = { burst: burst };
})(window);
