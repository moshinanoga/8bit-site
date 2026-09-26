(function(){
  var root = document.documentElement;

  try{
    if('scrollRestoration' in history){ history.scrollRestoration = 'manual'; }
    /* A hash in the URL doesn't always mean "jump to an anchor" — the artifact
       host can append its own fragment. Only skip the reset when the hash
       actually names an element on this page; otherwise force the top so the
       page never opens pre-scrolled to wherever history/the host left it.
       One early call isn't enough on the artifact host: something there
       restores a remembered scroll position slightly AFTER this script runs,
       so the reset has to re-fire a few times (load, pageshow/bfcache, and a
       couple of delayed retries) to actually win that race. */
    function resetScroll(){
      try{
        var anchor = location.hash && document.getElementById(location.hash.slice(1));
        /* explicit behavior:'instant' — the page sets scroll-behavior:smooth
           globally, which would otherwise turn every one of these repeated
           resets into a visible animated scroll back up to the top */
        if(!anchor){ window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }
      }catch(e){}
    }
    resetScroll();
    window.addEventListener('load', resetScroll);
    window.addEventListener('pageshow', resetScroll);
    window.setTimeout(resetScroll, 0);
    window.setTimeout(resetScroll, 100);
    window.setTimeout(resetScroll, 400);
  }catch(e){}

  function safeGetItem(key){
    try{ return localStorage.getItem(key); }catch(e){ return null; }
  }
  function safeSetItem(key, val){
    try{ localStorage.setItem(key, val); }catch(e){ /* storage blocked, ignore */ }
  }

  /* Reveal-on-scroll must always end up visible, no matter what else fails below */
  var revealEls = document.querySelectorAll('.reveal');
  var revealDone = false;
  function forceRevealAll(){
    if(revealDone) return;
    revealDone = true;
    revealEls.forEach(function(el){ el.classList.add('visible'); });
  }
  window.setTimeout(forceRevealAll, 2500);

  try{

    /* Theme */
    var stored = safeGetItem('8bit-theme');
    if(stored){ root.setAttribute('data-theme', stored); }
    function setTheme(t){
      root.setAttribute('data-theme', t);
      safeSetItem('8bit-theme', t);
      document.querySelectorAll('.theme-toggle').forEach(function(b){ b.setAttribute('aria-pressed', t === 'dark'); });
    }
    document.querySelectorAll('.theme-toggle').forEach(function(btn){
      btn.addEventListener('click', function(){
        var current = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        setTheme(current === 'dark' ? 'light' : 'dark');
      });
    });

    /* Header scroll state */
    var header = document.querySelector('.site-header');
    if(header){
      var onScroll = function(){ header.classList.toggle('scrolled', window.scrollY > 16); };
      document.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }

    /* Product showcase: open card + vertical tabs, accordion-style.
       Cards stay in their fixed slot (01, 02, 03, 04, left to right) — clicking a tab
       never reorders them, it just moves which slot is wide. Only the resulting shift
       in neighbouring cards' positions needs FLIP (position isn't natively animatable),
       so we measure before, resize, measure after, snap back with transform, then
       release so the browser animates the delta. */
    var showcase = document.querySelector('.product-showcase');
    if(showcase){
      var items = Array.prototype.slice.call(showcase.querySelectorAll('.product-item'));
      var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

      function activate(target){
        if(target.classList.contains('is-open')) return;

        /* 1. FIRST: record where every card currently is */
        var first = items.map(function(it){ return it.getBoundingClientRect(); });

        /* width/flex-basis have a transition declared in CSS, so reading layout right
           after the class change would otherwise risk catching that transition already
           mid-flight and give a corrupted "last" measurement. Kill transitions first so
           the resize lands on its true final geometry instantly. */
        items.forEach(function(it){ it.style.transition = 'none'; });

        /* 2. swap which card is the open one (cards stay in their original slot) */
        items.forEach(function(it){ it.classList.toggle('is-open', it === target); });

        /* force reflow so the class change is fully committed with no transition */
        showcase.offsetWidth;

        /* 3. LAST: record where every card ended up after the resize */
        var last = items.map(function(it){ return it.getBoundingClientRect(); });

        if(reduceMotion){
          items.forEach(function(it){ it.style.transition = ''; });
          return;
        }

        /* 4. INVERT: snap every card back to its start position, still no transition */
        items.forEach(function(it, i){
          var dx = first[i].left - last[i].left;
          var dy = first[i].top - last[i].top;
          if(!dx && !dy) return;
          it.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        });

        /* force reflow so the snapped-back transform is committed before we release it */
        showcase.offsetWidth;

        /* 5. PLAY: re-enable the transition and clear the snap so width, position and
           transform all animate together from the snapped-back state to identity. A
           requestAnimationFrame hand-off (with a setTimeout fallback in case rAF is
           throttled by a backgrounded/hidden tab) makes sure this happens on a fresh
           frame rather than racing the reflow above. */
        var released = false;
        function release(){
          if(released) return;
          released = true;
          items.forEach(function(it){
            it.style.transition = '';
            it.style.transform = '';
          });
        }
        requestAnimationFrame(release);
        window.setTimeout(release, 50);
      }

      items.forEach(function(item){
        var tabBtn = item.querySelector('.item-tab');
        if(!tabBtn) return;
        tabBtn.addEventListener('click', function(){ activate(item); });
      });
    }

    /* Overlay / modal helpers */
    function openPanel(el){ el.classList.add('open'); el.setAttribute('aria-hidden','false'); document.body.classList.add('lock'); }
    function closePanel(el){ el.classList.remove('open'); el.setAttribute('aria-hidden','true'); document.body.classList.remove('lock'); }

    var menu = document.querySelector('.menu-overlay');
    document.querySelectorAll('.burger').forEach(function(b){
      b.addEventListener('click', function(){ openPanel(menu); b.setAttribute('aria-expanded','true'); });
    });
    document.querySelectorAll('.menu-close').forEach(function(b){
      b.addEventListener('click', function(){ closePanel(menu); document.querySelectorAll('.burger').forEach(function(x){x.setAttribute('aria-expanded','false');}); });
    });
    if(menu){
      menu.querySelectorAll('a').forEach(function(a){
        a.addEventListener('click', function(){ closePanel(menu); });
      });
    }

    document.querySelectorAll('[data-open-modal]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var sel = btn.getAttribute('data-open-modal');
        var modal = document.querySelector(sel);
        if(!modal) return;
        /* case-detail modals reuse the triggering card's already-loaded photo
           instead of carrying their own duplicate <img src>, so each photo
           only ships once in the page instead of twice */
        var srcImg = btn.querySelector('.simple-card-photo img');
        var dstImg = modal.querySelector('.case-modal-photo img');
        if(srcImg && dstImg){ dstImg.src = srcImg.src; }
        openPanel(modal);
      });
    });
    document.querySelectorAll('.modal').forEach(function(modal){
      modal.addEventListener('click', function(e){ if(e.target === modal) closePanel(modal); });
      modal.querySelectorAll('.modal-close').forEach(function(b){ b.addEventListener('click', function(){ closePanel(modal); }); });
    });
    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape'){
        document.querySelectorAll('.modal.open, .menu-overlay.open').forEach(closePanel);
      }
    });

    /* Reveal on scroll */
    if('IntersectionObserver' in window && revealEls.length){
      var io = new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          if(entry.isIntersecting){
            entry.target.classList.add('visible');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.1, rootMargin: '0px 0px -4% 0px' });
      revealEls.forEach(function(el){ io.observe(el); });
    } else {
      forceRevealAll();
    }

    /* Gallery arrows */
    document.querySelectorAll('.gallery-wrap').forEach(function(wrap){
      var track = wrap.querySelector('.gallery');
      var prev = wrap.querySelector('[data-gal-prev]');
      var next = wrap.querySelector('[data-gal-next]');
      if(!track) return;
      function step(){ var f = track.querySelector('figure'); return f ? f.getBoundingClientRect().width + 14 : 320; }
      if(prev) prev.addEventListener('click', function(){ track.scrollBy({ left: -step(), behavior: 'smooth' }); });
      if(next) next.addEventListener('click', function(){ track.scrollBy({ left: step(), behavior: 'smooth' }); });
    });

    /* Equipment product page — thumbnail gallery + arrows + quantity stepper */
    function selectEquipThumb(wrap, btn){
      var mainImg = wrap.querySelector('.equip-detail-photo img');
      var thumbImg = btn.querySelector('img');
      if(!mainImg || !thumbImg || mainImg.src === thumbImg.src) return;
      mainImg.classList.add('fading');
      window.setTimeout(function(){
        mainImg.src = thumbImg.src;
        mainImg.classList.remove('fading');
      }, 240);
      wrap.querySelectorAll('.equip-detail-thumbs button').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
    }
    document.querySelectorAll('.equip-detail-gallery').forEach(function(wrap){
      var thumbs = Array.prototype.slice.call(wrap.querySelectorAll('.equip-detail-thumbs button'));
      thumbs.forEach(function(btn){
        btn.addEventListener('click', function(){ selectEquipThumb(wrap, btn); });
      });
      if(thumbs.length > 1){
        function step(dir){
          var i = thumbs.findIndex(function(b){ return b.classList.contains('active'); });
          if(i < 0) i = 0;
          var next = thumbs[(i + dir + thumbs.length) % thumbs.length];
          selectEquipThumb(wrap, next);
        }
        wrap.querySelectorAll('.equip-gallery-arrow').forEach(function(arrow){
          arrow.addEventListener('click', function(){ step(arrow.classList.contains('prev') ? -1 : 1); });
        });

        /* Auto-advancing carousel — pauses while the visitor's mouse is over it
           or right after a manual click, so it never fights the person browsing. */
        var AUTOPLAY_MS = 4500;
        var timer = null;
        function play(){ stop(); timer = window.setInterval(function(){ step(1); }, AUTOPLAY_MS); }
        function stop(){ if(timer){ window.clearInterval(timer); timer = null; } }
        wrap.addEventListener('mouseenter', stop);
        wrap.addEventListener('mouseleave', play);
        wrap.addEventListener('click', function(){ stop(); window.setTimeout(play, AUTOPLAY_MS); });
        play();
      }

      /* Hover-to-zoom on the main photo, like the vc8bit.ru product pages */
      var photoBox = wrap.querySelector('.equip-detail-photo');
      var photoImg = photoBox && photoBox.querySelector('img');
      if(photoBox && photoImg && window.matchMedia('(hover: hover) and (pointer: fine)').matches){
        photoBox.addEventListener('mousemove', function(e){
          var r = photoBox.getBoundingClientRect();
          var x = ((e.clientX - r.left) / r.width) * 100;
          var y = ((e.clientY - r.top) / r.height) * 100;
          photoImg.style.transformOrigin = x + '% ' + y + '%';
          photoImg.style.transform = 'scale(2.2)';
        });
        photoBox.addEventListener('mouseleave', function(){
          photoImg.style.transform = 'scale(1)';
        });
      }
    });

    /* Обзор / Характеристики tabs on equipment product pages */
    document.querySelectorAll('.equip-tabs-nav').forEach(function(nav){
      var group = nav.closest('.equip-tabs');
      var btns = Array.prototype.slice.call(nav.querySelectorAll('.equip-tab-btn'));
      btns.forEach(function(btn){
        btn.addEventListener('click', function(){
          var target = btn.getAttribute('data-tab');
          btns.forEach(function(b){ b.classList.toggle('active', b === btn); });
          group.querySelectorAll('.equip-tab-panel').forEach(function(panel){
            panel.hidden = panel.getAttribute('data-tab-panel') !== target;
          });
        });
      });
    });
    /* Избранное — сохраняется в браузере посетителя, без сервера/аккаунта */
    document.querySelectorAll('.equip-like-btn').forEach(function(btn){
      var key = 'equip-like-' + (btn.getAttribute('data-product') || location.pathname);
      try{ if(localStorage.getItem(key) === '1') btn.classList.add('active'); }catch(e){}
      btn.addEventListener('click', function(){
        var active = btn.classList.toggle('active');
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        try{ localStorage.setItem(key, active ? '1' : '0'); }catch(e){}
      });
    });
    document.querySelectorAll('.qty-stepper').forEach(function(stepper){
      var input = stepper.querySelector('input');
      if(!input) return;
      stepper.querySelectorAll('button').forEach(function(btn){
        btn.addEventListener('click', function(){
          var delta = btn.hasAttribute('data-qty-minus') ? -1 : 1;
          var v = Math.max(1, (parseInt(input.value, 10) || 1) + delta);
          input.value = v;
        });
      });
    });

  }catch(e){
    /* Any unexpected failure above must never leave the page blank */
    forceRevealAll();
  }
})();
