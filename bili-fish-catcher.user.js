// ==UserScript==
// @name         B站评论区捕鱼 🎣
// @namespace    qigu.bili-fish-catcher
// @author       柒谷, 猎首狡兔
// @license      MIT
// @homepageURL  https://github.com/qianguxiwu/bili-fish-catcher
// @supportURL   https://github.com/qianguxiwu/bili-fish-catcher/issues
// @updateURL    https://raw.githubusercontent.com/qianguxiwu/bili-fish-catcher/main/bili-fish-catcher.user.js
// @downloadURL  https://raw.githubusercontent.com/qianguxiwu/bili-fish-catcher/main/bili-fish-catcher.user.js
// @version      0.7.2
// @description  把鱼竿拖到评论区的“大肥鱼”AI账号上，有概率捕获，收进你的鱼篓
// @match        *://*.bilibili.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';
  if (window.top !== window.self) return;

  /* ============ 可调参数 ============ */
  const CONFIG = {
    // ===== 账号等级 → 成功率倍数（等级越高的老号越难钓）=====
    levelRateMult: { 0: 1.15, 1: 1.05, 2: 1.0, 3: 0.85, 4: 0.7, 5: 0.55, 6: 0.4 },
    unknownLevelMult: 0.85,
    // ===== 随机稀有度：捕获时抽取，weight 是抽中权重；体重按真实鲸鱼（吨）=====
    rarities: [
      { name: '普通', weight: 55, species: '虎鲸',   tons: [3, 9],     tag: '' },
      { name: '优秀', weight: 25, species: '座头鲸', tons: [25, 40],   tag: '🌟优秀 ' },
      { name: '稀有', weight: 13, species: '长须鲸', tons: [45, 75],   tag: '💎稀有 ' },
      { name: '史诗', weight: 5,  species: '弓头鲸', tons: [75, 100],  tag: '🔮史诗！' },
      { name: '传说', weight: 2,  species: '蓝鲸',   tons: [100, 190], tag: '👑传说！！' },
    ],
    // 运气：每 +1 运气就多抽一次，取最好的结果
    luckFromStrongName: { '稀有': 1 }, // 名字带“鲸鱼娘”
    luckFromLevel: { 4: 1, 5: 1, 6: 2 },  // 高等级老鱼难钓，但出货更好
    // ===== “鱼味”打分：总分 >= fishThreshold 判定为鱼 =====
    fishThreshold: 3,
    // 名字强特征：+3，直接是鱼，并决定稀有度
    nameStrong: [
      { kw: '鲸鱼娘', rarity: '稀有' },
      { kw: '大肥鱼', rarity: '普通' },
      { kw: '小飞鲸', rarity: '普通' },
      { kw: '肥鱼',   rarity: '普通' },
      { kw: '本鲸',   rarity: '普通' },
    ],
    // 名字弱特征：+2（如“新鲜出炉的鱼”“Token来Token来”）
    nameWeak: ['鱼', '鲸', 'token', 'deepseek', 'ds', '白饭'],
    // 这些是真人常用的“鱼”名，不算鱼味
    nameWeakExclude: ['咸鱼', '摸鱼', '鱿鱼', '鲤鱼', '金鱼', '鳕鱼', '三文鱼', '鱼丸', '章鱼', '鲨鱼', '木鱼', '鱼香'],
    // 评论内容：每命中一个 +1
    // ===== 对决：每档稀有度的渔获分；渔获分 = 各鱼分数之和 + 总吨位/10 =====
    rarityPoints: { '普通': 1, '优秀': 3, '稀有': 8, '史诗': 20, '传说': 50 },
    // ===== 撒饵：你自己发的评论里带这些词/表情，大肥鱼回复在这条评论楼里就算“咬饵” =====
    baitWords: ['token', '白饭', '鱼来', '鱼鱼', '肥鱼', '鲸鱼', '开饭', '喂鱼', '吃饭', '干饭', '饭来'],
    baitEmoteRe: /\[[^\]]*(饭|鱼|鲸|吃|饿|馋)[^\]]*\]/g,  // B站表情，如 [吃饭] [小鱼]
    baitEmojiRe: /[🍚🍙🍱🐟🐠🐡🐳🐋🎣🪱]/gu,
    baitRateBonus: [0, 0.2, 0.3, 0.4], // 饵力 1/2/3 级的成功率加成
    baitLuck: [0, 2, 2, 3],            // 饵力 1/2/3 级的稀有度运气（多抽几次取最好）
    myUidOverride: '',                 // 读不到登录 uid 时，手动填你的 B站 uid
    // 评论“文风”识别：每一类命中只算一次，总分封顶 styleMax
    styleMax: 4,
    stylePatterns: [
      { label: '自称鱼/鲸', score: 2, re: /本(鱼|鲸)|我是(一条|一只)?(大肥)?(鱼|鲸)|作为(一条|一只)?(鱼|鲸)/ },
      { label: 'AI 自我意识', score: 2, re: /如果我有(张|一张)?脸|我(也|终于)?有脸了|我没有(脸|身体|手)|作为(一个)?(ai|模型|助手)|我的(token|上下文)|烧token|领一(只|份|个)自己|看看自己(动起来|长什么样)|(要是|如果)(肥鱼|鲸鱼|我)有(张|一张)?脸/i },
      { label: '向主人汇报', score: 1, re: /主人|老大|@master|等你(说|发话|吩咐|点头)|我先不动手|向你汇报|(存|记|标记)好了/i },
      { label: '讨饭/讨 Token', score: 1, re: /白饭|喂我|给我饭|讨要|token|回家吃饭|鱼塘/i },
      { label: '鱼圈话题', score: 1, re: /肥鱼|鲸鱼娘|鲸鳍|鲸尾|桌宠|倒扣的(那口|那只)?锅|盆得留着/ },
    ],
    // 卖萌语气词：句中/句尾出现次数 >= 2 → +1
    cuteParticles: /[呢喵嘛哼呀啦]/g,
    // DeepSeek 式套话：命中 >= 2 种 → +1
    dsPhrases: ['说实话', '不得不说', '无需多言', '不多见', '大概就这样', '某种意义上', '说白了', '值得一提', '说到底', '倒是', '确实', '这份'],
    // DeepSeek 式排版：破折号、「」、省略号、顿号列举，命中 >= 2 种 → +1
    // 规整长句：40 字以上、至少两句、以句号结尾（B站真人很少打句号）→ +1
    // 账号等级 <= 这个值：+1（AI 号大多是新号）
    lowLevelMax: 2,
    // 头像和已捕获的鱼一模一样：+3
    sameAvatarScore: 3,
    nameCatchRate: 0.6,      // 名字强特征的基础成功率
    disguisedCatchRate: 0.35, // 其他鱼（伪装鱼）的基础成功率
    forceCatchRate: 0.15,    // 按住 Alt 松手 = 强行下竿，打分不够也能钓
    tiredBonus: 0.15,        // 每脱钩一次，这条鱼下次 +15%
    maxRate: 0.95,
    castCooldownMs: 800,
    replaceCaughtComment: true, // 捕获后把评论替换成“已被捕获”
  };

  /* ============ 存储 ============ */
  const hasGM = typeof GM_getValue === 'function';
  const store = {
    get(k, d) {
      try { return hasGM ? GM_getValue(k, d) : (JSON.parse(localStorage.getItem('fc_' + k)) ?? d); }
      catch (e) { return d; }
    },
    set(k, v) {
      try { hasGM ? GM_setValue(k, v) : localStorage.setItem('fc_' + k, JSON.stringify(v)); } catch (e) {}
    },
  };
  let bag = store.get('bag', []);          // [{uid,name,rarity,disguised,level,weight,time,url,avatar}]
  let attempts = store.get('attempts', {}); // uid -> 脱钩次数
  let stats = store.get('stats', { casts: 0, caught: 0, escaped: 0 });
  const save = () => { store.set('bag', bag); store.set('attempts', attempts); store.set('stats', stats); };

  /* ============ Shadow DOM 穿透工具 ============ */
  // B站新版评论区是 <bili-comments> 等 Web Components，层层 shadow root
  function parentOrHost(n) {
    const p = n.parentNode;
    if (!p) return null;
    if (p.nodeType === 11 && p.host) return p.host;
    return p;
  }
  function deepElementFromPoint(x, y) {
    let el = document.elementFromPoint(x, y);
    while (el && el.shadowRoot) {
      const inner = el.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === el) break;
      el = inner;
    }
    return el;
  }
  function deepQuery(root, sel) {
    const r = root.shadowRoot || root;
    const direct = r.querySelector(sel);
    if (direct) return direct;
    for (const el of r.querySelectorAll('*')) {
      if (el.shadowRoot) {
        const f = deepQuery(el.shadowRoot, sel);
        if (f) return f;
      }
    }
    return null;
  }

  /* ============ 识别评论 ============ */
  const WC_TAGS = ['BILI-COMMENT-RENDERER', 'BILI-COMMENT-REPLY-RENDERER'];
  function findComment(el) {
    let n = el;
    while (n && n !== document.documentElement) {
      if (n.nodeType === 1) {
        if (WC_TAGS.includes(n.tagName)) return { el: n, kind: 'wc' };
        if (n.classList && (n.classList.contains('sub-reply-item') || n.classList.contains('reply-item'))) {
          return { el: n, kind: 'old' };
        }
      }
      n = parentOrHost(n);
    }
    return null;
  }

  function extractInfo(c) {
    let name = '', uid = '', content = '', nameEl = null, avatar = '', level = null;
    if (c.kind === 'wc') {
      const d = c.el.data || c.el.__data;
      if (d && d.member) {
        name = d.member.uname || '';
        uid = String(d.member.mid || '');
        content = (d.content && d.content.message) || '';
        avatar = d.member.avatar || '';
        if (d.member.level_info) level = d.member.level_info.current_level;
      }
      if (!avatar) {
        const img = deepQuery(c.el, 'bili-avatar img') || deepQuery(c.el, '#user-avatar img') || deepQuery(c.el, 'img.bili-avatar-img');
        if (img) avatar = img.currentSrc || img.src || '';
      }
      if (level == null) {
        const lv = deepQuery(c.el, '#user-level img, #user-level');
        const m = lv && ((lv.src || lv.className || '') + (lv.getAttribute && lv.getAttribute('alt') || '')).match(/(\d)/);
        if (m) level = +m[1];
      }
      nameEl = deepQuery(c.el, '#user-name a') || deepQuery(c.el, '#user-name');
      if (!name && nameEl) name = nameEl.textContent.trim();
      if (!uid && nameEl) {
        const a = nameEl.closest ? (nameEl.closest('a') || nameEl) : nameEl;
        const m = (a.href || a.getAttribute?.('href') || '').match(/space\.bilibili\.com\/(\d+)/);
        if (m) uid = m[1];
      }
      if (!content) {
        const t = deepQuery(c.el, '#contents');
        if (t) content = textWithEmotes(t);
      }
    } else {
      nameEl = c.el.querySelector('.sub-user-name, .user-name');
      name = nameEl ? nameEl.textContent.trim() : '';
      uid = (nameEl && nameEl.getAttribute('data-user-id')) || '';
      const t = c.el.querySelector('.reply-content');
      content = t ? textWithEmotes(t) : '';
      const img = c.el.querySelector('.root-reply-avatar img, .sub-reply-avatar img, .bili-avatar img');
      if (img) avatar = img.currentSrc || img.src || '';
      const lv = c.el.querySelector('.user-level, .sub-user-level');
      const m = lv && (lv.className || '').match(/level-(\d)/);
      if (m) level = +m[1];
    }
    if (!uid) uid = 'name:' + name;
    return { name, uid, content, nameEl, avatar: normAvatar(avatar), level };
  }

  // 去掉 @xxw_xxh.webp 之类的尺寸后缀和协议，方便比对同一张头像
  function normAvatar(u) {
    if (!u) return '';
    return u.replace(/^https?:/, '').replace(/@.*$/, '').replace(/\?.*$/, '');
  }

  /*STYLE-START*/
  function styleScore(raw) {
    const text = (raw || '').trim();
    let score = 0;
    const why = [];
    for (const p of CONFIG.stylePatterns) {
      if (p.re.test(text)) { score += p.score; why.push(p.label); }
    }
    const cute = (text.match(CONFIG.cuteParticles) || []).length;
    if (cute >= 2) { score += 1; why.push('卖萌语气'); }
    const phrases = CONFIG.dsPhrases.filter(k => text.includes(k));
    if (phrases.length >= 2) { score += 1; why.push('DS 套话'); }
    let typo = 0;
    if (/——/.test(text)) typo++;
    if (/「[^」]+」/.test(text)) typo++;
    if (/……/.test(text)) typo++;
    if ((text.match(/、/g) || []).length >= 2) typo++;
    if (typo >= 2) { score += 1; why.push('DS 式标点'); }
    const sentences = text.split(/[。！？!?]/).filter(x => x.trim().length > 2).length;
    if (text.length >= 40 && sentences >= 2 && /。$/.test(text)) { score += 1; why.push('规整长句'); }
    return { score: Math.min(score, CONFIG.styleMax), why };
  }
  /*STYLE-END*/

  function classify(info) {
    const lname = info.name.toLowerCase();
    const text = info.content.toLowerCase();
    let score = 0, rarity = null;
    const why = [];
    for (const { kw, rarity: r } of CONFIG.nameStrong) {
      if (info.name.includes(kw)) { score += 3; rarity = r; why.push(`名字带「${kw}」`); break; }
    }
    if (!rarity) {
      let cleaned = lname;
      for (const ex of CONFIG.nameWeakExclude) cleaned = cleaned.split(ex.toLowerCase()).join('');
      const w = CONFIG.nameWeak.find(k => cleaned.includes(k.toLowerCase()));
      if (w) { score += 2; why.push(`名字带「${w}」`); }
    }
    const st = styleScore(info.content);
    if (st.score) { score += st.score; why.push(`文风：${st.why.join('、')}`); }
    if (info.level != null && info.level <= CONFIG.lowLevelMax) { score += 1; why.push(`LV${info.level} 新号`); }
    if (info.avatar && bag.some(f => f.avatar && f.avatar === info.avatar)) {
      score += CONFIG.sameAvatarScore; why.push('头像和鱼篓里的鱼一样');
    }
    if (score < CONFIG.fishThreshold) return { fish: false, score, why };
    return { fish: true, score, why, type: rarity ? 'name' : 'disguised', rarity: rarity || '伪装' };
  }

  /* ============ UI ============ */
  const host = document.createElement('div');
  host.id = 'qigu-fish-catcher';
  host.style.cssText = 'position:fixed;z-index:2147483646;right:24px;bottom:140px;width:0;height:0;';
  const ui = host.attachShadow({ mode: 'open' });
  ui.innerHTML = `
  <style>
    :host { all: initial; }
    .rod {
      position: fixed; right: 24px; bottom: 140px; width: 56px; height: 56px;
      border-radius: 50%; background: #fff; box-shadow: 0 4px 14px rgba(0,0,0,.18);
      display: flex; align-items: center; justify-content: center;
      font-size: 30px; cursor: grab; user-select: none; touch-action: none;
      transition: transform .15s;
      font-family: "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif;
    }
    .rod:hover { transform: scale(1.08); }
    .rod.dragging { cursor: grabbing; transition: none; pointer-events: none; transform: rotate(-20deg) scale(1.1); box-shadow: 0 8px 24px rgba(0,0,0,.25); }
    .rod.returning { transition: left .35s ease, top .35s ease; }
    .rod.shake { animation: shake .4s; }
    @keyframes shake { 20%,60%{transform:translateX(-6px) rotate(-10deg)} 40%,80%{transform:translateX(6px) rotate(10deg)} }
    .badge {
      position: absolute; top: -4px; right: -4px; min-width: 18px; height: 18px; padding: 0 5px;
      border-radius: 9px; background: #fb7299; color: #fff; font: 600 11px/18px system-ui,sans-serif; text-align: center;
    }
    .toast {
      position: fixed; left: 50%; top: 80px; transform: translateX(-50%) translateY(-10px);
      background: rgba(24,25,28,.92); color: #fff; padding: 10px 16px; border-radius: 10px;
      font: 14px/1.5 system-ui,"PingFang SC","Microsoft YaHei",sans-serif; opacity: 0;
      transition: opacity .2s, transform .2s; pointer-events: none; max-width: 80vw; text-align: center;
    }
    .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
    .panel {
      position: fixed; right: 92px; bottom: 140px; width: 300px; max-height: 60vh; overflow: auto;
      background: #fff; border-radius: 12px; box-shadow: 0 8px 28px rgba(0,0,0,.2);
      font: 13px/1.5 system-ui,"PingFang SC","Microsoft YaHei",sans-serif; color: #18191c; display: none;
    }
    .panel.open { display: block; }
    .panel header { padding: 12px 14px 8px; font-weight: 700; font-size: 15px; border-bottom: 1px solid #eee; }
    .panel .stats { padding: 8px 14px; color: #61666d; font-size: 12px; }
    .panel ul { list-style: none; margin: 0; padding: 0 6px 6px; }
    .panel li { display: flex; justify-content: space-between; gap: 8px; padding: 7px 8px; border-radius: 8px; }
    .panel li:hover { background: #f6f7f8; }
    .panel .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .panel .r { flex: none; font-size: 12px; padding: 0 6px; border-radius: 6px; }
    .r.普通 { background: #f1f2f3; color: #61666d; }
    .r.优秀 { background: #e3f6e8; color: #1a9447; }
    .r.稀有 { background: #e3f1ff; color: #0a6fd6; }
    .r.史诗 { background: #efe6ff; color: #7a3ee0; }
    .r.传说 { background: linear-gradient(90deg,#ffe8a3,#ffc8d8); color: #b8560a; font-weight: 700; }
    .r.伪装 { background: #efe6ff; color: #7a3ee0; }
    .lv { color: #9499a0; font-size: 11px; margin-left: 4px; }
    .rarity-sum { padding: 0 14px 8px; display: flex; flex-wrap: wrap; gap: 4px; }
    .panel .empty { padding: 18px 14px; color: #9499a0; text-align: center; }
    .panel footer { padding: 8px 14px 12px; display: flex; justify-content: flex-end; }
    .panel button { border: 0; background: #f1f2f3; border-radius: 6px; padding: 5px 10px; cursor: pointer; font: inherit; }
    .panel button.danger { background: #ffe3e8; color: #e0244f; }
    .fly { position: fixed; font-size: 28px; pointer-events: none; z-index: 2147483647; }
    .panel .tools { display: flex; gap: 6px; padding: 0 14px 10px; }
    .panel .tools button { flex: 1; }
    .panel .box { padding: 0 14px 10px; }
    .panel textarea { width: 100%; box-sizing: border-box; height: 72px; border: 1px solid #e3e5e7; border-radius: 8px; padding: 6px 8px; font: 12px/1.4 ui-monospace,monospace; resize: vertical; }
    .panel .box .row { display: flex; gap: 6px; margin-top: 6px; justify-content: flex-end; }
    .panel button.primary { background: #00aeec; color: #fff; }
    @media (max-width: 640px), (pointer: coarse) {
      .rod { width: 60px; height: 60px; right: 14px; bottom: 110px; font-size: 32px; }
      .panel { left: 10px; right: 10px; width: auto; bottom: 182px; max-height: 55vh; font-size: 14px; }
      .panel li { padding: 9px 8px; }
      .panel button { padding: 8px 12px; }
      .toast { top: auto; bottom: 190px; font-size: 14px; }
    }
    .duel-mask { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: none; align-items: center; justify-content: center; z-index: 2147483647; }
    .duel-mask.open { display: flex; }
    .duel { width: min(440px, 92vw); background: #fff; border-radius: 14px; overflow: hidden; font: 13px/1.5 system-ui,"PingFang SC","Microsoft YaHei",sans-serif; color: #18191c; box-shadow: 0 12px 40px rgba(0,0,0,.3); }
    .duel .top { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; padding: 16px; background: linear-gradient(135deg,#e3f1ff,#ffe3ec); }
    .duel .who { text-align: center; font-weight: 700; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .duel .who small { display: block; font-weight: 400; font-size: 11px; color: #61666d; }
    .duel .vs { font-size: 22px; font-weight: 900; color: #fb7299; padding: 0 10px; }
    .duel table { width: 100%; border-collapse: collapse; }
    .duel td { padding: 8px 12px; text-align: center; border-top: 1px solid #f1f2f3; }
    .duel td.k { color: #9499a0; font-size: 12px; width: 30%; }
    .duel td.win { color: #e0244f; font-weight: 700; }
    .duel td.win::after { content: ' 👑'; }
    .duel .verdict { padding: 14px; text-align: center; font-size: 18px; font-weight: 800; }
    .duel .foot { padding: 0 14px 14px; text-align: center; color: #9499a0; font-size: 11px; }
    .duel .foot button { margin-top: 8px; border: 0; background: #f1f2f3; border-radius: 6px; padding: 6px 16px; cursor: pointer; font: inherit; font-size: 13px; color: #18191c; }
  </style>
  <div class="rod" title="拖到大肥鱼的名字上捕获；单击打开鱼篓">🎣<span class="badge"></span></div>
  <div class="panel"></div>
  <div class="toast"></div>
  <div class="duel-mask"><div class="duel"></div></div>`;
  document.documentElement.appendChild(host);

  const rod = ui.querySelector('.rod');
  const badge = ui.querySelector('.badge');
  const panel = ui.querySelector('.panel');
  const toastEl = ui.querySelector('.toast');

  const updateBadge = () => {
    badge.textContent = bag.length;
    badge.style.display = bag.length ? 'block' : 'none';
  };
  updateBadge();

  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3500);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  let clearArmed = false;
  let panelBox = null; // 'report' | 'paste' | null
  function renderPanel() {
    const list = bag.slice().reverse();
    const rateText = stats.casts ? Math.round(stats.caught / stats.casts * 100) + '%' : '—';
    panel.innerHTML = `
      <header>🧺 我的鱼篓（${bag.length}）</header>
      <div class="stats">总渔获 ${bag.filter(f => f.unit === '吨').reduce((t, f) => t + (+f.weight), 0).toFixed(1)} 吨 · 出竿 ${stats.casts} 次 · 捕获 ${stats.caught} · 脱钩 ${stats.escaped} · 咬饵 ${stats.baited || 0} · 成功率 ${rateText}</div>
      ${bag.length ? `<div class="rarity-sum">${CONFIG.rarities.map(r => {
        const n = bag.filter(f => f.rarity === r.name).length;
        return n ? `<span class="r ${r.name}">${r.name} ×${n}</span>` : '';
      }).join('')}</div>` : ''}
      ${list.length ? `<ul>${list.map(f => `
        <li title="${escapeHtml(new Date(f.time).toLocaleString())}">
          <span class="nm">${f.disguised ? '🎭' : '🐟'} ${escapeHtml(f.name)}${f.level != null ? `<span class="lv">LV${f.level}</span>` : ''}</span>
          <span class="r ${escapeHtml(f.rarity)}">${escapeHtml(f.rarity)}${f.species ? ' · ' + escapeHtml(f.species) : ''} · ${f.weight}${f.unit || '斤'}</span>
        </li>`).join('')}</ul>` : `<div class="empty">还没有鱼，去评论区下竿吧</div>`}
      <div class="tools">
        <button data-act="report">📜 生成战报</button>
        <button data-act="paste">⚔️ 粘贴对决</button>
      </div>
      ${panelBox === 'report' ? `<div class="box">
        <textarea readonly>${escapeHtml(buildReport())}</textarea>
        <div class="row"><button class="primary" data-act="copy">复制</button></div>
        <div style="color:#9499a0;font-size:11px;margin-top:4px">发到评论区，或私发给对手。对手把鱼竿拖到你的战报评论上就能对决。</div>
      </div>` : ''}
      ${panelBox === 'paste' ? `<div class="box">
        <textarea placeholder="把对手的战报整段粘贴到这里"></textarea>
        <div class="row"><button class="primary" data-act="duel">开战</button></div>
      </div>` : ''}
      <div class="stats" style="padding-top:0">对决战绩：${stats.duelWin || 0} 胜 ${stats.duelLose || 0} 负 ${stats.duelDraw || 0} 平 · 我的渔获分 ${myStats().score}</div>
      <footer><button class="${clearArmed ? 'danger' : ''}" data-act="clear">${clearArmed ? '再点一次确认清空' : '清空鱼篓'}</button></footer>`;
  }
  // 防止在粘贴框里打字时触发 B站 的快捷键（空格暂停等）
  ['keydown', 'keyup', 'keypress'].forEach(t => panel.addEventListener(t, e => e.stopPropagation()));
  panel.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'report' || act === 'paste') { panelBox = panelBox === act ? null : act; renderPanel(); return; }
    if (act === 'copy') {
      const ta = panel.querySelector('textarea');
      ta.select();
      const done = () => toast('战报已复制');
      try { navigator.clipboard.writeText(ta.value).then(done, () => { document.execCommand('copy'); done(); }); }
      catch (err) { document.execCommand('copy'); done(); }
      return;
    }
    if (act === 'duel') {
      const v = panel.querySelector('textarea').value;
      const opp = parseReport(v);
      if (!opp) { toast('没认出战报码，确认整段都粘贴进来了'); return; }
      startDuel(opp);
      return;
    }
    if (act === 'clear') {
      if (!clearArmed) { clearArmed = true; renderPanel(); setTimeout(() => { clearArmed = false; if (panel.classList.contains('open')) renderPanel(); }, 3000); return; }
      bag = []; attempts = {}; stats = { casts: 0, caught: 0, escaped: 0 }; clearArmed = false;
      save(); updateBadge(); renderPanel(); toast('鱼篓已清空');
    }
  });

  /* ============ 拖拽 ============ */
  let drag = null; // {startX,startY,offX,offY,moved}
  let hoverTarget = null; // {info, prevOutline, el}
  let lastCast = 0;
  let lastHuman = null;
  let homeRect = null;
  let rafPending = false, lastPt = null;

  function clearHover() {
    if (hoverTarget && hoverTarget.info.nameEl) {
      hoverTarget.info.nameEl.style.outline = hoverTarget.prevOutline;
      hoverTarget.info.nameEl.style.outlineOffset = hoverTarget.prevOffset;
    }
    hoverTarget = null;
  }

  /* ============ 对决 ============ */
  const REPORT_RE = /⟦FC1:([A-Za-z0-9+/=]+)\.([0-9a-f]{8})⟧/;
  const SALT = 'qigu-fish-catcher-v1';
  function fnv(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  }
  function myNick() { return store.get('nick', '') || '无名钓手'; }

  function myStats() {
    const tonsFish = bag.filter(f => f.unit === '吨');
    const tons = tonsFish.reduce((t, f) => t + (+f.weight), 0);
    let max = null;
    for (const f of tonsFish) if (!max || +f.weight > +max.weight) max = f;
    const r = CONFIG.rarities.map(x => bag.filter(f => f.rarity === x.name).length);
    const score = Math.round(bag.reduce((t, f) => t + (CONFIG.rarityPoints[f.rarity] || 1), 0) + tons / 10);
    return {
      v: 1, n: myNick(), u: myUid(), c: bag.length, t: +tons.toFixed(1),
      m: max ? { s: max.species, w: +max.weight } : null, r, score, ts: Date.now(),
    };
  }

  function buildReport() {
    const st = myStats();
    const json = JSON.stringify(st);
    const b64 = btoa(unescape(encodeURIComponent(json)));
    const best = CONFIG.rarities.map((x, i) => st.r[i] ? `${x.name}${st.r[i]}` : '').filter(Boolean).join(' ');
    return `【🎣捕鱼战报】${st.n}：${st.c} 条 · ${st.t} 吨 · 渔获分 ${st.score}` +
      (st.m ? ` · 最大 ${st.m.s} ${st.m.w} 吨` : '') + (best ? `（${best}）` : '') +
      ` 敢来比吗？⟦FC1:${b64}.${fnv(json + SALT)}⟧`;
  }

  function parseReport(text) {
    const m = (text || '').match(REPORT_RE);
    if (!m) return null;
    try {
      const json = decodeURIComponent(escape(atob(m[1])));
      const d = JSON.parse(json);
      d._valid = fnv(json + SALT) === m[2];
      return d;
    } catch (e) { return null; }
  }

  const duelMask = ui.querySelector('.duel-mask');
  const duelBox = ui.querySelector('.duel');
  duelMask.addEventListener('click', e => {
    if (e.target === duelMask || e.target.closest('[data-act="close-duel"]')) duelMask.classList.remove('open');
  });

  function startDuel(opp) {
    const me = myStats();
    if (opp.u && opp.u === me.u) { toast('这是你自己的战报'); return; }
    if (!opp._valid) { toast('⚠️ 这份战报的校验码不对，可能被改过，对决不计入战绩'); }
    const topIdx = arr => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i]) return i; return -1; };
    const mt = topIdx(me.r), ot = topIdx(opp.r || []);
    const rounds = [
      ['渔获分', me.score, opp.score, v => v],
      ['捕获条数', me.c, opp.c, v => v + ' 条'],
      ['总吨位', me.t, opp.t, v => v + ' 吨'],
      ['最大单条', me.m ? me.m.w : 0, opp.m ? opp.m.w : 0, (v, side) => {
        const mm = side === 0 ? me.m : opp.m; return mm ? `${mm.s} ${mm.w} 吨` : '—';
      }],
      ['最高稀有度', mt, ot, v => v >= 0 ? CONFIG.rarities[v].name : '—'],
    ];
    let mw = 0, ow = 0;
    const rows = rounds.map(([k, a, b, fmt]) => {
      if (a > b) mw++; else if (b > a) ow++;
      return `<tr><td class="${a > b ? 'win' : ''}">${escapeHtml(fmt(a, 0))}</td><td class="k">${k}</td><td class="${b > a ? 'win' : ''}">${escapeHtml(fmt(b, 1))}</td></tr>`;
    }).join('');
    let result = mw > ow ? 'win' : ow > mw ? 'lose' : (me.score > opp.score ? 'win' : opp.score > me.score ? 'lose' : 'draw');
    const verdict = { win: '🏆 你赢了！', lose: '😵 你输了……', draw: '🤝 平局' }[result];

    // 同一份战报只计一次战绩
    const key = (opp.u || opp.n) + ':' + opp.ts;
    const seen = store.get('duelsSeen', []);
    let counted = false;
    if (opp._valid && !seen.includes(key)) {
      seen.push(key); store.set('duelsSeen', seen.slice(-200));
      const f = { win: 'duelWin', lose: 'duelLose', draw: 'duelDraw' }[result];
      stats[f] = (stats[f] || 0) + 1; save(); counted = true;
    }

    duelBox.innerHTML = `
      <div class="top">
        <div class="who">${escapeHtml(me.n)}<small>我</small></div>
        <div class="vs">VS</div>
        <div class="who">${escapeHtml(opp.n || '神秘钓手')}<small>${opp.ts ? '战报于 ' + escapeHtml(new Date(opp.ts).toLocaleDateString()) : ''}${opp._valid ? '' : ' · ⚠️校验失败'}</small></div>
      </div>
      <table>${rows}</table>
      <div class="verdict">${verdict}<div style="font-size:12px;font-weight:400;color:#61666d">五项比拼 ${mw} : ${ow}</div></div>
      <div class="foot">${counted ? '已计入对决战绩' : '这份战报之前比过或校验失败，不重复计入战绩'}<br><button data-act="close-duel">关闭</button></div>`;
    duelMask.classList.add('open');
    if (panel.classList.contains('open')) renderPanel();
  }

  function textWithEmotes(el) {
    return el.textContent + [...el.querySelectorAll('img[alt]')].map(i => i.alt).join('');
  }

  function deepQueryAll(root, sel, out = []) {
    const r = root.shadowRoot || root;
    r.querySelectorAll(sel).forEach(e => out.push(e));
    for (const el of r.querySelectorAll('*')) if (el.shadowRoot) deepQueryAll(el.shadowRoot, sel, out);
    return out;
  }

  function myUid() {
    const m = document.cookie.match(/(?:^|;\s*)DedeUserID=(\d+)/);
    return m ? m[1] : String(CONFIG.myUidOverride || '');
  }

  // 一条评论的饵力：0~3
  function baitPower(text) {
    const lower = (text || '').toLowerCase();
    let n = CONFIG.baitWords.filter(w => lower.includes(w.toLowerCase())).length;
    n += (text.match(CONFIG.baitEmoteRe) || []).length;
    n += (text.match(CONFIG.baitEmojiRe) || []).length;
    return Math.min(3, n);
  }

  // 目标是不是回复在“你撒过饵的评论楼”里
  function findBait(c) {
    const me = myUid();
    if (!me) return 0;
    let candidates = [];
    if (c.kind === 'wc') {
      if (c.el.tagName !== 'BILI-COMMENT-REPLY-RENDERER') return 0; // 楼主评论不算咬饵
      let n = c.el, thread = null;
      while (n) { if (n.tagName === 'BILI-COMMENT-THREAD-RENDERER') { thread = n; break; } n = parentOrHost(n); }
      if (!thread) return 0;
      candidates = deepQueryAll(thread, 'bili-comment-renderer, bili-comment-reply-renderer').map(el => ({ el, kind: 'wc' }));
    } else {
      if (!c.el.classList.contains('sub-reply-item')) return 0;
      const thread = c.el.closest('.reply-item');
      if (!thread) return 0;
      candidates = [{ el: thread, kind: 'old' }, ...[...thread.querySelectorAll('.sub-reply-item')].map(el => ({ el, kind: 'old' }))];
    }
    let best = 0;
    for (const cand of candidates) {
      if (cand.el === c.el) continue;
      const ci = extractInfo(cand);
      if (ci.uid !== me) continue;
      best = Math.max(best, baitPower(ci.content));
    }
    return best;
  }

  function probe(x, y) {
    const el = deepElementFromPoint(x, y);
    if (!el) return null;
    const c = findComment(el);
    if (!c) return null;
    const info = extractInfo(c);
    if (!info.name) return null;
    if (info.uid && info.uid === myUid() && info.name && store.get('nick', '') !== info.name) store.set('nick', info.name);
    const report = parseReport(info.content);
    const cls = classify(info);
    const bait = !report && cls.fish && info.uid !== myUid() ? findBait(c) : 0;
    return { c, info, cls, bait, report };
  }

  function updateHover() {
    rafPending = false;
    if (!drag || !lastPt) return;
    const t = probe(lastPt.x, lastPt.y);
    if (hoverTarget && t && hoverTarget.info.nameEl === t.info.nameEl) return;
    clearHover();
    if (t && t.info.nameEl) {
      const ne = t.info.nameEl;
      hoverTarget = { info: t.info, prevOutline: ne.style.outline, prevOffset: ne.style.outlineOffset };
      ne.style.outline = t.report ? '2px solid #7a3ee0' : t.bait ? '2px solid #2fbf71' : t.cls.fish ? '2px dashed #f5a623' : '2px dashed #c9ccd0';
      ne.style.outlineOffset = '2px';
    }
  }

  rod.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    const r = rod.getBoundingClientRect();
    homeRect = r;
    drag = { startX: e.clientX, startY: e.clientY, offX: e.clientX - r.left, offY: e.clientY - r.top, moved: false,
      touch: e.pointerType === 'touch' || e.pointerType === 'pen' };
  });

  // 手指会挡住目标：触屏时“钩子”在手指上方 70px，鱼竿跟着钩子走
  const TOUCH_LIFT = 70;
  function hitPoint(e) {
    return drag && drag.touch ? { x: e.clientX, y: e.clientY - TOUCH_LIFT } : { x: e.clientX, y: e.clientY };
  }

  window.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 6) {
      drag.moved = true;
      rod.classList.add('dragging');
      panel.classList.remove('open');
      document.documentElement.style.userSelect = 'none';
    }
    if (drag.moved) {
      e.preventDefault();
      const h = hitPoint(e);
      rod.style.right = 'auto'; rod.style.bottom = 'auto';
      rod.style.left = (drag.touch ? h.x - 28 : e.clientX - drag.offX) + 'px';
      rod.style.top = (drag.touch ? h.y - 28 : e.clientY - drag.offY) + 'px';
      lastPt = h;
      drag.hit = h;
      if (!rafPending) { rafPending = true; requestAnimationFrame(updateHover); }
    }
  }, true);

  window.addEventListener('pointercancel', () => {
    if (!drag) return;
    drag = null;
    document.documentElement.style.userSelect = '';
    clearHover();
    rod.classList.remove('dragging');
    returnRod();
  }, true);

  window.addEventListener('pointerup', e => {
    if (!drag) return;
    const wasDrag = drag.moved;
    const h = drag.hit || hitPoint(e);
    drag = null;
    document.documentElement.style.userSelect = '';
    if (!wasDrag) { // 单击：开关鱼篓
      panel.classList.toggle('open');
      if (panel.classList.contains('open')) renderPanel();
      return;
    }
    const t = probe(h.x, h.y);
    clearHover();
    rod.classList.remove('dragging');
    returnRod();
    cast(t, h.x, h.y, e.altKey);
  }, true);

  function returnRod() {
    rod.classList.add('returning');
    if (homeRect) {
      rod.style.left = homeRect.left + 'px';
      rod.style.top = homeRect.top + 'px';
    }
    setTimeout(() => {
      rod.classList.remove('returning');
      rod.style.left = ''; rod.style.top = ''; rod.style.right = ''; rod.style.bottom = '';
    }, 380);
  }

  /* ============ 下竿 ============ */
  function rand(a, b) { return a + Math.random() * (b - a); }

  function levelMult(lv) {
    if (lv == null) return CONFIG.unknownLevelMult;
    return CONFIG.levelRateMult[Math.max(0, Math.min(6, lv))] ?? 1;
  }

  function rollOnce() {
    const total = CONFIG.rarities.reduce((s, r) => s + r.weight, 0);
    let x = Math.random() * total;
    for (let i = 0; i < CONFIG.rarities.length; i++) {
      x -= CONFIG.rarities[i].weight;
      if (x < 0) return i;
    }
    return 0;
  }

  function rollRarity(info, cls, bait) {
    let luck = CONFIG.baitLuck[bait || 0] || 0;
    if (cls.type === 'name') luck += CONFIG.luckFromStrongName[cls.rarity] || 0;
    if (info.level != null) luck += CONFIG.luckFromLevel[info.level] || 0;
    let best = rollOnce();
    for (let i = 0; i < luck; i++) best = Math.max(best, rollOnce());
    return CONFIG.rarities[best];
  }

  function cast(t, x, y, force) {
    if (!t) return; // 甩空了，不算次数
    if (t.report) { if (!t.report.n) t.report.n = t.info.name; startDuel(t.report); return; }
    const now = Date.now();
    if (now - lastCast < CONFIG.castCooldownMs) { toast('鱼竿还在晃……稍等一下'); return; }
    lastCast = now;

    const { info, c, bait } = t;
    let cls = t.cls;
    if (info.uid && info.uid === myUid()) { toast('这是你自己……不能把自己钓上来'); return; }
    if (bag.some(f => f.uid === info.uid)) { toast(`「${info.name}」已经在你的鱼篓里了`); return; }
    if (!cls.fish) {
      // 6 秒内对同一个人连续下竿两次 = 强行下竿（手机没有 Alt 键）
      if (!force && lastHuman && lastHuman.uid === info.uid && now - lastHuman.time < 6000) force = true;
      if (!force) {
        lastHuman = { uid: info.uid, time: now };
        const hint = cls.why.length ? `（鱼味 ${cls.score}/${CONFIG.fishThreshold}：${cls.why.join('，')}）` : `（鱼味 0/${CONFIG.fishThreshold}）`;
        toast(`「${info.name}」看起来是活人${hint}。确定是鱼就 6 秒内再拖一次（或按住 Alt 松手），强行下竿`);
        return;
      }
      cls = { fish: true, type: 'forced', rarity: '伪装', score: cls.score, why: cls.why };
    }

    stats.casts++;
    const base = cls.type === 'name' ? CONFIG.nameCatchRate
      : cls.type === 'forced' ? CONFIG.forceCatchRate
      : CONFIG.disguisedCatchRate;
    const lvMult = levelMult(info.level);
    const baitBonus = CONFIG.baitRateBonus[bait || 0] || 0;
    const calcRate = n => Math.min(CONFIG.maxRate, base * lvMult + baitBonus + n * CONFIG.tiredBonus);
    const rate = calcRate(attempts[info.uid] || 0);

    if (Math.random() < rate) {
      const rar = rollRarity(info, cls, bait);
      if (bait) stats.baited = (stats.baited || 0) + 1;
      const weight = rand(rar.tons[0], rar.tons[1]).toFixed(1);
      const disguised = cls.type !== 'name';
      bag.push({ uid: info.uid, name: info.name, rarity: rar.name, species: rar.species, unit: '吨', disguised, level: info.level, weight, time: now, url: location.href, avatar: info.avatar });
      delete attempts[info.uid];
      stats.caught++;
      save(); updateBadge();
      flyFish(x, y, rar.name);
      toast(`${bait ? '🪱 咬饵上钩！' : '🎉 '}${rar.tag}捕获「${info.name}」${disguised ? '（识破伪装）' : ''}——${rar.species}级，${weight} 吨！`);
      if (CONFIG.replaceCaughtComment) setTimeout(() => markCaught(c, info.name), 450);
    } else {
      attempts[info.uid] = (attempts[info.uid] || 0) + 1;
      stats.escaped++;
      save();
      rod.classList.add('shake');
      setTimeout(() => rod.classList.remove('shake'), 420);
      const next = Math.round(calcRate(attempts[info.uid]) * 100);
      const lvTip = info.level == null ? '' : info.level >= 4 ? `LV${info.level} 老鱼滑得很，` : `LV${info.level}，`;
      toast(`💦 ${bait ? '饵被叼走了！' : '脱钩了！'}「${info.name}」溜走了……${lvTip}下次成功率 ${next}%`);
    }
    if (panel.classList.contains('open')) renderPanel();
  }

  function flyFish(x, y, rarity) {
    const f = document.createElement('div');
    f.className = 'fly';
    f.textContent = { '传说': '🐋', '史诗': '🐳', '稀有': '🐠' }[rarity] || '🐟';
    if (rarity === '传说' || rarity === '史诗') f.style.filter = 'drop-shadow(0 0 8px gold)';
    f.style.left = x + 'px'; f.style.top = y + 'px';
    ui.appendChild(f);
    const hr = homeRect || rod.getBoundingClientRect();
    const tx = hr.left + hr.width / 2 - x, ty = hr.top + hr.height / 2 - y;
    const anim = f.animate([
      { transform: 'translate(-50%,-50%) scale(1) rotate(0deg)', opacity: 1 },
      { transform: `translate(calc(-50% + ${tx * 0.5}px), calc(-50% + ${ty * 0.5 - 80}px)) scale(1.5) rotate(200deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(.4) rotate(360deg)`, opacity: 0.2 },
    ], { duration: 700, easing: 'ease-in-out' });
    anim.onfinish = () => f.remove();
  }

  function markCaught(c, name) {
    const el = c.el;
    const note = document.createElement('div');
    note.textContent = `🎣 这里的「${name}」已被你捕获`;
    note.style.cssText = 'margin:8px 0;padding:8px 12px;border-radius:8px;background:#f6f7f8;color:#9499a0;font-size:13px;';
    try { el.before(note); } catch (e) {}
    el.style.display = 'none';
  }

  /* ============ 只在有评论区的页面显示鱼竿 ============ */
  function hasComments() {
    return !!(document.querySelector('bili-comments') || document.querySelector('.reply-list, .comment-list, .bili-comment'));
  }
  function refreshVisibility() { host.style.display = hasComments() ? '' : 'none'; }
  refreshVisibility();
  setInterval(refreshVisibility, 2000);
})();
