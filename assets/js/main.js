/* ============================================================
   中野三玖 · 应援展示页  main.js
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 录制专用：彩蛋状态重置 ---------- */
  try {
    const demoParams = new URLSearchParams(location.search || '');
    const resetMode = demoParams.get('reset');
    if (resetMode === 'confession' || resetMode === 'all') {
      localStorage.removeItem('miku_confession_v1');
    }
    if (resetMode === 'all') {
      localStorage.removeItem('miku_tip_secret_v1');
      sessionStorage.removeItem('miku_loader_seen_at');
    }
  } catch (e) {}

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 进入动画：百分比读条 ---------- */
  var mikuLoader = document.getElementById('mikuLoader');
  if (mikuLoader) {
    var loaderForced = typeof location !== 'undefined' && location.search.indexOf('loader=1') > -1;
    var loaderSeenAt = 0;
    try { loaderSeenAt = Number(sessionStorage.getItem('miku_loader_seen_at')) || 0; } catch (e) {}
    var loaderAlreadySeen = !loaderForced && loaderSeenAt > 0 && (Date.now() - loaderSeenAt < 30 * 60 * 1000);
    if (loaderAlreadySeen) {
      document.documentElement.classList.remove('miku-loading');
      document.documentElement.classList.add('miku-page-ready');
      if (mikuLoader.parentNode) mikuLoader.parentNode.removeChild(mikuLoader);
    } else {
      (function runMikuLoader() {
        var bar = document.getElementById('mikuLoaderBar');
        var percent = document.getElementById('mikuLoaderPercent');
        var firstLine = document.getElementById('mikuLoaderFirst');
        var secondLine = document.getElementById('mikuLoaderSecond');
        function splitLoaderText(el) {
          if (!el || el.getAttribute('data-split') === '1') return;
          var text = el.textContent || '';
          el.textContent = '';
          for (var i = 0; i < text.length; i++) {
            var ch = document.createElement('span');
            ch.className = 'miku-loader-char';
            ch.textContent = text.charAt(i);
            if (ch.style && ch.style.setProperty) ch.style.setProperty('--i', String(i));
            el.appendChild(ch);
          }
          el.setAttribute('data-split', '1');
        }
        splitLoaderText(firstLine);
        splitLoaderText(secondLine);
        var duration = reduceMotion ? 520 : 1800;
        var started = Date.now();
        document.documentElement.classList.add('miku-loading');
        setTimeout(function () { if (firstLine) firstLine.classList.add('is-revealed'); }, reduceMotion ? 40 : 150);
        function paint(value) {
          var n = Math.max(0, Math.min(100, Math.round(value)));
          if (bar) bar.style.width = n + '%';
          if (percent) percent.textContent = n + '%';
        }
        function finishLoader() {
          paint(100);
          try { sessionStorage.setItem('miku_loader_seen_at', String(Date.now())); } catch (e) {}
          setTimeout(function () {
            mikuLoader.classList.add('show-second');
            if (firstLine) firstLine.classList.remove('is-revealed');
            setTimeout(function () { if (secondLine) secondLine.classList.add('is-revealed'); }, reduceMotion ? 40 : 180);
          }, reduceMotion ? 80 : 150);
          setTimeout(function () {
            mikuLoader.classList.add('is-done');
            setTimeout(function () {
              document.documentElement.classList.remove('miku-loading');
              document.documentElement.classList.add('miku-page-ready');
              document.dispatchEvent(new Event('miku:page-ready'));
              if (mikuLoader.parentNode) mikuLoader.parentNode.removeChild(mikuLoader);
            }, reduceMotion ? 140 : 860);
          }, reduceMotion ? 900 : 2050);
        }
        var timer = setInterval(function () {
          var p = Math.min(1, (Date.now() - started) / duration);
          var eased = 1 - Math.pow(1 - p, 3);
          paint(eased * 100);
          if (p >= 1) { clearInterval(timer); finishLoader(); }
        }, 32);
      })();
    }
  } else {
    document.documentElement.classList.add('miku-page-ready');
  }

  /* ---------- 星空画布 ---------- */
  var canvas = document.getElementById('sky');
  var ctx = canvas.getContext('2d');
  var stars = [];
  var shooters = [];
  var nextShoot = 2600 + Math.random() * 3600;

  function resizeSky() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var count = Math.min(230, Math.floor((window.innerWidth * window.innerHeight) / 5200));
    stars = [];
    for (var i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: Math.random() * 1.3 + 0.35,
        base: Math.random() * 0.55 + 0.35,
        spd: Math.random() * 1.6 + 0.4,
        ph: Math.random() * Math.PI * 2
      });
    }
  }

  function drawStars(t) {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var a = s.base * (0.55 + 0.45 * Math.sin(t * s.spd * 0.001 + s.ph));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(200,224,255,' + a.toFixed(3) + ')';
      ctx.fill();
    }
    if (reduceMotion) return;
    /* 流星 */
    nextShoot -= 16.6;
    if (nextShoot <= 0 && shooters.length < 2) {
      nextShoot = 4200 + Math.random() * 5200;
      var sx = window.innerWidth * (0.3 + Math.random() * 0.7);
      var sy = Math.random() * window.innerHeight * 0.32;
      shooters.push({ x: sx, y: sy, vx: -(3 + Math.random() * 3), vy: 2.2 + Math.random() * 1.6, life: 0, ttl: 46 });
    }
    for (var k = shooters.length - 1; k >= 0; k--) {
      var m = shooters[k];
      m.life++;
      m.x += m.vx;
      m.y += m.vy;
      var fade = 1 - m.life / m.ttl;
      if (m.life >= m.ttl) { shooters.splice(k, 1); continue; }
      var tail = 13;
      var g = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * tail, m.y - m.vy * tail);
      g.addColorStop(0, 'rgba(190,225,255,' + (0.9 * fade).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(190,225,255,0)');
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x - m.vx * tail, m.y - m.vy * tail);
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
  }

  var raf = null;
  function tick() {
    drawStars(performance.now());
    raf = requestAnimationFrame(tick);
  }

  resizeSky();
  if (reduceMotion) {
    drawStars(0);
  } else {
    tick();
  }
  window.addEventListener('resize', function () { resizeSky(); if (reduceMotion) drawStars(0); });

  /* ---------- 顶部导航 ---------- */
  var topbar = document.getElementById('topbar');
  var navToggle = document.getElementById('navToggle');
  var nav = document.getElementById('nav');

  function onScroll() {
    var y = window.scrollY || document.documentElement.scrollTop;
    topbar.classList.toggle('scrolled', y > 24);
    document.getElementById('toTop').classList.toggle('show', y > 640);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (navToggle) {
    navToggle.addEventListener('click', function () {
      var open = document.body.classList.toggle('nav-open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }
  nav.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () {
      document.body.classList.remove('nav-open');
      if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
    });
  });

  /* ---------- 滚动高亮当前板块 ---------- */
  var spyLinks = Array.prototype.slice.call(nav.querySelectorAll('a.nav-link'));
  var spy = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      var id = en.target.id;
      spyLinks.forEach(function (a) {
        a.classList.toggle('active', a.getAttribute('href') === '#' + id);
      });
    });
  }, { rootMargin: '-42% 0px -52% 0px' });
  ['home', 'assistant', 'profile', 'charm', 'gallery', 'albums', 'quotes', 'about'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) spy.observe(el);
  });

  /* ---------- 入场动画：等待加载层结束后开始 ---------- */
  var revealEls = document.querySelectorAll('.reveal');
  var revealStarted = false;
  function startReveal() {
    if (revealStarted) return;
    revealStarted = true;
    function forceRevealInView() {
      var vh = window.innerHeight || document.documentElement.clientHeight;
      for (var i = 0; i < revealEls.length; i++) {
        var el = revealEls[i];
        if (el.classList.contains('in')) continue;
        var r = el.getBoundingClientRect();
        if (r.top < vh - 30 && r.bottom > 0) el.classList.add('in');
      }
    }
    if (!('IntersectionObserver' in window) || reduceMotion) {
      revealEls.forEach(function (el) { el.classList.add('in'); });
    } else {
      var rev = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          var delay = 0;
          var parent = en.target.parentElement;
          if (parent) {
            var idx = Array.prototype.indexOf.call(parent.children, en.target);
            delay = (idx % 8) * 70;
          }
          en.target.style.transitionDelay = delay + 'ms';
          en.target.classList.add('in');
          rev.unobserve(en.target);
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
      revealEls.forEach(function (el) { rev.observe(el); });
    }
    if (window.requestAnimationFrame) requestAnimationFrame(forceRevealInView); else forceRevealInView();
    window.addEventListener('load', function () { setTimeout(forceRevealInView, 350); });
    window.addEventListener('scroll', forceRevealInView, { passive: true });
    setTimeout(forceRevealInView, 260);
  }
  if (document.documentElement.classList.contains('miku-page-ready')) startReveal();
  else document.addEventListener('miku:page-ready', startReveal, { once: true });

/* ---------- 三玖小知识 ---------- */
  var facts = [
    '三玖是五胞胎中学力最强的一位，常常辅导姐妹们学习。',
    '她的代表色是蓝色；在五姐妹里，她是最安静的那一抹蓝。',
    '三玖是战国武将爱好者，最崇拜织田信长，聊起历史会滔滔不绝。',
    '她喜欢喝抹茶苏打水（抹茶ソーダ）。',
    '三玖运动神经有点苦手，体能测验常常让她很头疼。',
    '在原作中，三玖向风太郎告白的次数多达三次以上，是五姐妹中最勇敢的那一个。',
    '害羞的三玖其实很细心，会用自己笨拙的方式默默关心喜欢的人。',
    '她曾认真考虑过毕业后去料理学校进修，为了梦想悄悄努力着。',
    '京都修学旅行中，她差一点就说出了真心话，又慌忙用「骗你的」藏了回去。',
    '粉丝们常用「三玖天下第一！」来表达对三玖的爱与应援。',
    '三玖的血型是 A 型，身高 159cm，体重约 50kg。',
    '她喜欢抹茶与绿茶，但最讨厌的食物是巧克力。',
    '她喜欢的动物是刺猬，也爱看有武将登场的电影、纪录片与自传。',
    '她擅长变装，四位姐妹都曾被她假扮过。',
    '她不太会做饭（常被调侃为「黑暗料理」），运动也不在行。',
    '她的角色歌：《Lovely music ～三週間前までは白かった～》（第一季）、《君が好き ～Three Feelings～》（第二季）。',
    '故事结局里，她成为了一家咖啡店的美女店主。',
    '她每天早上都会看占卜情报。'
  ];
  var tipText = document.getElementById('tipText');
  var tipBtn = document.getElementById('tipBtn');
  var lastFact = -1;
  function pickFact() {
    var i = Math.floor(Math.random() * facts.length);
    if (i === lastFact) i = (i + 1) % facts.length;
    lastFact = i;
    return facts[i];
  }
  if (tipText) tipText.textContent = pickFact();
  var tipCard = tipBtn ? tipBtn.closest('.tip-card') : null;
  var TIP_SECRET_KEY = 'miku_tip_secret_v1';
  var tipSecretShown = false;
  var tipStreak = 0;
  var tipLastClick = 0;
  try { tipSecretShown = localStorage.getItem(TIP_SECRET_KEY) === '1'; } catch (e) {}

  function tipSay(text, ms) {
    var ai = window.MikuAI;
    if (ai && ai.tools && typeof ai.tools.sayBubble === 'function') {
      ai.tools.sayBubble(text, ms || 5200);
    }
  }
  function repaintTip() {
    if (!tipText) return;
    tipText.classList.remove('fade');
    void tipText.offsetWidth;
    tipText.classList.add('fade');
  }
  function showTipSecret() {
    if (!tipText) return;
    var already = tipSecretShown;
    tipText.textContent = already
      ? '隐藏知识 · 第39条：三玖会把认真看她小知识的人，悄悄记在心里。'
      : '隐藏知识 · 第39条：其实，三玖会偷偷记住认真了解她的人。';
    repaintTip();
    if (tipCard) {
      tipCard.classList.add('tip-secret');
      setTimeout(function () { tipCard.classList.remove('tip-secret'); }, 7200);
    }
    tipSecretShown = true;
    try { localStorage.setItem(TIP_SECRET_KEY, '1'); } catch (e) {}
  }
  function tipLinkage() {
    var now = Date.now();
    if (now - tipLastClick > 2500) tipStreak = 0;
    tipLastClick = now;
    tipStreak += 1;
    if (tipStreak === 4) tipSay('……还在看？你对我的事，比我想的还认真。');
    if (tipStreak === 7) {
      var hadSecret = tipSecretShown;
      showTipSecret();
      tipSay(hadSecret ? '……又翻到这里了。好吧，我承认，有点开心。' : '等一下……有一条小知识，不在列表里。', 6200);
    }
  }
  if (tipBtn) {
    tipBtn.addEventListener('click', function () {
      tipText.textContent = pickFact();
      repaintTip();
      tipLinkage();
    });
  }

  /* ---------- 返回顶部 ---------- */
  var toTop = document.getElementById('toTop');
  if (toTop) {
    toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  }

  /* ---------- 立绘卡片视差 ---------- */
  var stage = document.getElementById('portraitStage');
  var card = document.getElementById('portraitCard');
  var finePointer = window.matchMedia('(pointer: fine)').matches;
  if (stage && card && finePointer && !reduceMotion) {
    stage.addEventListener('pointermove', function (e) {
      var rect = stage.getBoundingClientRect();
      var px = (e.clientX - rect.left) / rect.width - 0.5;
      var py = (e.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = 'rotateX(' + (py * -7).toFixed(2) + 'deg) rotateY(' + (px * 9).toFixed(2) + 'deg) translateY(-2px)';
    });
    stage.addEventListener('pointerleave', function () {
      card.style.transform = '';
    });
  }
})();

/* ============ 背景音乐：告白（櫻井美希） ============ */
(function () {
  'use strict';
  var wrap = document.getElementById('bgm');
  var audio = document.getElementById('bgmAudio');
  if (!wrap || !audio) return;
  var badge = document.getElementById('bgmBadge');
  var toggle = document.getElementById('bgmToggle');
  var mute = document.getElementById('bgmMute');
  var vol = document.getElementById('bgmVol');
  var stateLabel = document.getElementById('bgmState');
  var lastVol = 0.55;
  var userPaused = false;
  var coarse = window.matchMedia('(hover: none)').matches || window.matchMedia('(pointer: coarse)').matches;

  function store() { try { localStorage.setItem('mikuBgmVol', String(lastVol)); } catch (e) {} }
  function paint() {
    var playing = !audio.paused && !audio.ended;
    wrap.classList.toggle('playing', playing);
    wrap.classList.toggle('muted', audio.muted || audio.volume === 0);
    if (toggle) {
      toggle.setAttribute('aria-pressed', playing ? 'true' : 'false');
      toggle.setAttribute('aria-label', playing ? '暂停背景音乐' : '播放背景音乐');
    }
    if (mute) mute.setAttribute('aria-pressed', (audio.muted || audio.volume === 0) ? 'true' : 'false');
    if (stateLabel) {
      if (playing) stateLabel.textContent = '正在播放 BGM';
      else if (audio.muted || audio.volume === 0) stateLabel.textContent = '已静音 · 点击播放';
      else stateLabel.textContent = '点击 ▶ 播放 BGM';
    }
  }
  function setVol(v, save) {
    v = Math.max(0, Math.min(1, isFinite(v) ? v : 0));
    audio.volume = v;
    if (v > 0) { audio.muted = false; lastVol = v; }
    if (save !== false) store();
    if (vol) {
      vol.value = String(v);
      vol.style.setProperty('--v', (v * 100).toFixed(1) + '%');
    }
    paint();
  }
  function playIt() {
    var p = audio.play();
    if (p && p.catch) p.catch(function () { paint(); });
    paint();
  }
  function pauseIt() {
    audio.pause();
    userPaused = true;
    paint();
  }
  function togglePlay() {
    if (audio.paused) { userPaused = false; playIt(); }
    else pauseIt();
  }

  /* 小耳机图标：桌面直接播放/暂停；触屏先展开再操作 */
  if (badge) {
    badge.addEventListener('click', function () {
      if (coarse) {
        if (wrap.classList.contains('open')) togglePlay();
        else wrap.classList.add('open');
      } else {
        togglePlay();
      }
    });
  }
  if (toggle) toggle.addEventListener('click', togglePlay);
  if (mute) {
    mute.addEventListener('click', function () {
      if (audio.muted || audio.volume === 0) {
        audio.muted = false;
        setVol(lastVol > 0 ? lastVol : 0.55);
      } else {
        lastVol = audio.volume;
        audio.muted = true;
        paint();
      }
    });
  }
  if (vol) {
    vol.addEventListener('input', function () { setVol(parseFloat(vol.value) || 0); });
    vol.addEventListener('change', store);
  }
  ['play', 'pause', 'volumechange', 'ended'].forEach(function (ev) {
    audio.addEventListener(ev, paint);
  });

  try {
    var sv = parseFloat(localStorage.getItem('mikuBgmVol'));
    if (isFinite(sv) && sv >= 0 && sv <= 1) lastVol = sv;
  } catch (e) {}
  setVol(lastVol, false);

  /* 触屏：点控件外部收起展开的面板 */
  document.addEventListener('pointerdown', function (e) {
    if (wrap.classList.contains('open') && e.target && !wrap.contains(e.target)) {
      wrap.classList.remove('open');
    }
  }, { passive: true });

  /* 自动播放尝试；被拦截则桌面端首次点击页面时开播 */
  window.addEventListener('load', function () {
    setTimeout(function () {
      if (audio.paused) {
        var p = audio.play();
        if (p && p.catch) p.catch(function () {});
      }
    }, 600);
  });
  function firstGesture(e) {
    if (coarse) return;
    if (wrap.classList.contains('open')) return;
    if (e && e.target && e.target.closest && e.target.closest('#bgm')) return;
    if (!userPaused && audio.paused) playIt();
  }
  document.addEventListener('pointerdown', firstGesture, { passive: true });
  document.addEventListener('keydown', firstGesture, { passive: true });
})();

/* ============ 三玖图片展示：自动轮播 + 缩略图 ============ */
(function () {
  'use strict';
  var gal = document.getElementById('gal');
  if (!gal) return;
  var stage = document.getElementById('galStage');
  var slides = Array.prototype.slice.call(gal.querySelectorAll('.gal-slide'));
  var thumbsWrap = document.getElementById('galThumbs');
  var dotsWrap = document.getElementById('galDots');
  var capTitle = document.getElementById('galTitle');
  var capSub = document.getElementById('galSub');
  var bar = document.getElementById('galBar');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var GAP = 3000;
  var idx = 0, prog = 0, last = 0, raf = null;
  var playing = !reduce, inView = true, hovering = false;

  slides.forEach(function (s, i) {
    var src = s.getAttribute('data-thumb') || (s.querySelector('img') ? s.querySelector('img').getAttribute('src') : '');
    var pos = s.getAttribute('data-pos');
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'gal-thumb';
    b.setAttribute('aria-label', '切换到：' + (s.getAttribute('data-title') || ('第 ' + (i + 1) + ' 张')));
    var im = document.createElement('img');
    im.src = src; im.alt = ''; im.loading = 'lazy'; im.decoding = 'async';
    if (pos) im.style.objectPosition = pos;
    var t = document.createElement('span'); t.textContent = s.getAttribute('data-title') || '';
    b.appendChild(im); b.appendChild(t);
    b.addEventListener('click', function () { go(i, true); });
    thumbsWrap.appendChild(b);

    var d = document.createElement('button');
    d.type = 'button'; d.className = 'gal-dot';
    d.setAttribute('aria-label', '查看第 ' + (i + 1) + ' 张图片');
    d.addEventListener('click', function () { go(i, true); });
    dotsWrap.appendChild(d);
  });
  var thumbs = Array.prototype.slice.call(thumbsWrap.children);
  var dots = Array.prototype.slice.call(dotsWrap.children);

  function go(i, manual) {
    idx = (i + slides.length) % slides.length;
    slides.forEach(function (s, k) { s.classList.toggle('is-active', k === idx); });
    thumbs.forEach(function (t, k) {
      t.classList.toggle('is-active', k === idx);
      t.setAttribute('aria-current', k === idx ? 'true' : 'false');
    });
    dots.forEach(function (d, k) { d.classList.toggle('is-active', k === idx); });
    var s = slides[idx];
    if (capTitle) capTitle.textContent = s.getAttribute('data-title') || '';
    if (capSub) capSub.textContent = s.getAttribute('data-sub') || '';
    prog = 0; if (bar) bar.style.width = '0%';
    centerThumb();
    if (manual) playing = !reduce;
  }
  function centerThumb() {
    var t = thumbs[idx];
    if (!t || !thumbsWrap || !thumbsWrap.scrollTo) return;
    var left = t.offsetLeft - (thumbsWrap.clientWidth - t.offsetWidth) / 2;
    thumbsWrap.scrollTo({ left: Math.max(0, left), behavior: reduce ? 'auto' : 'smooth' });
  }
  function step(ts) {
    if (!last) last = ts;
    var dt = ts - last; last = ts;
    if (playing && inView && !hovering && !document.hidden && slides.length > 1) {
      prog += dt / GAP;
      if (prog >= 1) { go(idx + 1); } else if (bar) { bar.style.width = (prog * 100).toFixed(2) + '%'; }
    }
    raf = requestAnimationFrame(step);
  }

  var prev = document.getElementById('galPrev');
  var next = document.getElementById('galNext');
  if (prev) prev.addEventListener('click', function () { go(idx - 1, true); });
  if (next) next.addEventListener('click', function () { go(idx + 1, true); });
  gal.addEventListener('mouseenter', function () { hovering = true; });
  gal.addEventListener('mouseleave', function () { hovering = false; });
  if (stage) {
    stage.addEventListener('focusin', function () { hovering = true; });
    stage.addEventListener('focusout', function () { hovering = false; });
    stage.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { go(idx - 1, true); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { go(idx + 1, true); e.preventDefault(); }
    });
    var sx = null;
    stage.addEventListener('pointerdown', function (e) { sx = e.clientX; });
    stage.addEventListener('pointerup', function (e) {
      if (sx === null) return;
      var dx = e.clientX - sx; sx = null;
      if (Math.abs(dx) > 45) go(idx + (dx < 0 ? 1 : -1), true);
    });
    stage.addEventListener('pointercancel', function () { sx = null; });
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (en) { inView = en.isIntersecting; last = 0; });
    }, { threshold: 0.2 }).observe(gal);
  }
  document.addEventListener('visibilitychange', function () { last = 0; });
  go(0);
  if (!reduce) raf = requestAnimationFrame(step);
})();

/* ============ 目录折叠：点击外部 / ESC 关闭 ============ */
(function () {
  'use strict';
  var nav = document.getElementById('nav');
  var toggle = document.getElementById('navToggle');
  if (!nav || !toggle) return;
  function sync(open) {
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? '关闭目录' : '打开目录');
  }
  function close() {
    document.body.classList.remove('nav-open');
    sync(false);
  }
  toggle.addEventListener('click', function () {
    setTimeout(function () { sync(document.body.classList.contains('nav-open')); }, 0);
  });
  document.addEventListener('click', function (e) {
    if (toggle.contains(e.target)) return;
    if (nav.contains(e.target)) { close(); return; }
    if (document.body.classList.contains('nav-open')) close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.body.classList.contains('nav-open')) {
      close(); toggle.focus();
    }
  });
})();

/* ============ 滚动视差（电影感） ============ */
(function () {
  'use strict';
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var els = Array.prototype.slice.call(document.querySelectorAll('[data-parallax]'));
  if (!els.length) return;
  var ticking = false;
  function update() {
    ticking = false;
    var vh = window.innerHeight || document.documentElement.clientHeight;
    els.forEach(function (el) {
      var s = parseFloat(el.getAttribute('data-parallax')) || 0.05;
      var r = el.getBoundingClientRect();
      if (r.bottom < -240 || r.top > vh + 240) return;
      var progress = (r.top + r.height / 2 - vh / 2) / vh;
      var y = -progress * s * 100;
      el.style.transform = 'translate3d(0,' + y.toFixed(2) + 'px,0)';
    });
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
})();
/* ============ 专辑：3D 立体抽拉 + 滚轮 + 自动轮播 ============ */
(function () {
  'use strict';
  var rack = document.getElementById('discRack');
  if (!rack) return;
  var stage = document.getElementById('rackStage');
  var discs = Array.prototype.slice.call(rack.querySelectorAll('.disc'));
  var titleEl = document.getElementById('rackTitle');
  var subEl = document.getElementById('rackSub');
  var jpEl = document.getElementById('rackJp');
  var dotsWrap = document.getElementById('rackDots');
  var bar = document.getElementById('rackBar');
  var n = discs.length, idx = 0;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var GAP = 3600, prog = 0, last = 0, playing = !reduce, inView = true, hovering = false;

  discs.forEach(function (d, i) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'rack-dot';
    b.setAttribute('aria-label', '查看专辑：' + (d.getAttribute('data-title') || (i + 1)));
    b.addEventListener('click', function () { go(i); });
    dotsWrap.appendChild(b);
  });
  var dots = Array.prototype.slice.call(dotsWrap.children);

  function norm(o) {
    var h = Math.floor(n / 2);
    while (o > h) o -= n;
    while (o < -h) o += n;
    return o;
  }
  function render() {
    var disc = discs[0] ? discs[0].offsetWidth : 220;
    var spacing = disc * 0.74;
    discs.forEach(function (d, i) {
      var o = norm(i - idx), a = Math.abs(o);
      var x = 0, y = 0, z = 0, ry = 0, sc = 1, op = 1, br = 1;
      if (a === 0) { y = -14; z = disc * 0.55; ry = -5; sc = 1.06; }
      else if (a === 1) { x = o * spacing; y = 8; z = -disc * 0.2; ry = -o * 26; sc = 0.93; br = 0.82; }
      else if (a === 2) { x = o * spacing * 0.4; y = -4; z = -disc * 1.15; ry = -o * 15; sc = 0.78; op = 0.6; br = 0.5; }
      else { op = 0; }
      d.style.transform = 'translate(-50%,-50%) translate3d(' + x.toFixed(1) + 'px,' + y + 'px,' + z.toFixed(1) + 'px) rotateY(' + ry + 'deg) scale(' + sc + ')';
      d.style.zIndex = String(120 - a);
      d.style.setProperty('--op', String(op));
      d.style.setProperty('--dim', String(br));
      d.style.pointerEvents = op === 0 ? 'none' : 'pointer';
      d.classList.toggle('is-active', a === 0);
      d.setAttribute('aria-current', a === 0 ? 'true' : 'false');
    });
    dots.forEach(function (dot, i) { dot.classList.toggle('is-active', i === idx); });
    var cur = discs[idx];
    if (titleEl) titleEl.textContent = cur.getAttribute('data-title') || '';
    if (jpEl) jpEl.textContent = cur.getAttribute('data-jp') || '';
    if (subEl) subEl.textContent = cur.getAttribute('data-sub') || '';
  }
  function go(i) {
    idx = (i + n) % n; prog = 0; last = 0;
    if (bar) bar.style.width = '0%';
    render();
  }

  discs.forEach(function (d, i) {
    d.addEventListener('click', function () { if (i !== idx) go(i); });
    d.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(i); }
    });
  });
  rack.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { go(idx - 1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { go(idx + 1); e.preventDefault(); }
  });

  /* 鼠标拖拽 / 触摸滑动 */
  var sx = null;
  stage.addEventListener('pointerdown', function (e) { sx = e.clientX; });
  stage.addEventListener('pointerup', function (e) {
    if (sx === null) return;
    var dx = e.clientX - sx; sx = null;
    if (Math.abs(dx) > 40) go(idx + (dx < 0 ? 1 : -1));
  });
  stage.addEventListener('pointercancel', function () { sx = null; });

  /* 电脑端滚轮切换：连续滚动超过一圈后放行页面滚动，避免"卡住" */
  var wLock = false, wDir = 0, wSteps = 0, wStamp = 0;
  stage.addEventListener('wheel', function (e) {
    var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (!d) return;
    var dir = d > 0 ? 1 : -1;
    var now = Date.now();
    if (now - wStamp > 650) { wSteps = 0; wDir = dir; }
    wStamp = now;
    if (dir === wDir) wSteps++;
    else { wSteps = 1; wDir = dir; }
    if (wSteps > n) return;          /* 放行：让页面继续滚动 */
    e.preventDefault();
    if (wLock) return;
    wLock = true;
    setTimeout(function () { wLock = false; }, 240);
    go(idx + dir);
  }, { passive: false });

  /* 自动轮播 */
  function step(ts) {
    if (!last) last = ts;
    var dt = ts - last; last = ts;
    if (playing && inView && !hovering && !document.hidden && n > 1) {
      prog += dt / GAP;
      if (prog >= 1) { go(idx + 1); } else if (bar) { bar.style.width = (prog * 100).toFixed(2) + '%'; }
    }
    requestAnimationFrame(step);
  }
  rack.addEventListener('mouseenter', function () { hovering = true; });
  rack.addEventListener('mouseleave', function () { hovering = false; });
  rack.addEventListener('focusin', function () { hovering = true; });
  rack.addEventListener('focusout', function () { hovering = false; });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (en) { inView = en.isIntersecting; last = 0; });
    }, { threshold: 0.2 }).observe(rack);
  }
  document.addEventListener('visibilitychange', function () { last = 0; });
  window.addEventListener('resize', render);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
  render();
  if (!reduce) requestAnimationFrame(step);
})();

/* ============ PWA：注册 Service Worker + 安装提示 ============ */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator) || location.protocol.indexOf('http') !== 0) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  });
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    var btn = document.getElementById('pwaInstall');
    if (btn) btn.hidden = false;
  });
  document.addEventListener('click', function (e) {
    if (!e.target || e.target.id !== 'pwaInstall' || !deferred) return;
    deferred.prompt();
    deferred.userChoice.then(function () {
      var btn = document.getElementById('pwaInstall');
      if (btn) btn.hidden = true;
      deferred = null;
    });
  });
})();
