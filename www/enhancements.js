/* ===================================================
   ENHANCEMENTS.JS
   ملف مستقل تمامًا — مش بيلمس أي كود موجود في main.js /
   conversation.js / conv-group.js / groups.js / settings.js
   (كل السكريبتات دي متشفرة عمدًا وميتلمسش).

   بيضيف 3 ميزات:
   1) لون البار السفلي + لون خلفية الرئيسية (MainActivity)
   2) لون خلفية الشات "Background color" (conversation / conv-group)
   3) تكبير أيقونات البار السفلي (اتعمل بالكامل في enhancements.css)
=================================================== */

(function () {
    'use strict';

    /* ============ Helpers عامة ============ */

    function $(id) { return document.getElementById(id); }

    function openSheet(id) {
        var el = $(id);
        if (el) el.classList.add('open');
    }

    function closeSheet(id) {
        var el = $(id);
        if (el) el.classList.remove('open');
    }

    // يضمن إن أي زرار جوه الشيت اللي ضفناه (sheet-pick-app-color) بيقفل
    // صح حتى لو الـ delegation العام بتاع main.js مش شايف العنصر ده
    function wireCloseButtons(root) {
        var closers = root.querySelectorAll('[data-close-sheet]');
        closers.forEach(function (btn) {
            btn.addEventListener('click', function () {
                var target = btn.getAttribute('data-close-sheet');
                closeSheet(target);
            });
        });
        // قفل بالضغط على الخلفية نفسها (خارج sheet-box)
        if (root.classList && root.classList.contains('sheet-overlay')) {
            root.addEventListener('click', function (e) {
                if (e.target === root) root.classList.remove('open');
            });
        }
    }

    // بريستات الألوان الجاهزة (8 ألوان)
    var COLOR_PRESETS = [
        '#000000', // أسود (الافتراضي)
        '#0B0F14', // كحلي غامق جدًا
        '#12181A', // رمادي غامق
        '#1A1425', // بنفسجي غامق
        '#25D9A0', // أخضر التطبيق (accent)
        '#5B7FFF', // بنفسجي/أزرق (violet)
        '#F87171', // أحمر
        '#0EA5E9'  // أزرق سماوي
    ];

    /* ============================================================
       [1] لون البار السفلي + لون خلفية الرئيسية — MainActivity.html
       ============================================================ */

    var BOTTOMBAR_KEY = 'cz_bottombar_color';
    var MAINBG_KEY = 'cz_main_bg_color';

    function applyMainActivityColors() {
        var bottombar = localStorage.getItem(BOTTOMBAR_KEY);
        var mainBg = localStorage.getItem(MAINBG_KEY);
        var root = document.documentElement;
        if (bottombar) root.style.setProperty('--bottombar-bg', bottombar);
        if (mainBg) root.style.setProperty('--bg', mainBg);
        updateSwatch('bottombarColorSwatch', 'bottombarColorHex', bottombar);
        updateSwatch('mainBgColorSwatch', 'mainBgColorHex', mainBg);
    }

    function updateSwatch(swatchId, hexId, color) {
        var swatch = $(swatchId);
        var hexEl = $(hexId);
        if (!swatch) return;
        if (color) {
            swatch.classList.add('has-color');
            swatch.style.setProperty('--picked-swatch-color', color);
            if (hexEl) hexEl.textContent = color.toUpperCase();
        } else {
            swatch.classList.remove('has-color');
            swatch.style.removeProperty('--picked-swatch-color');
            if (hexEl) hexEl.textContent = '';
        }
    }

    function initAppColorPickerSheet() {
        var sheet = $('sheet-pick-app-color');
        if (!sheet) return null;
        wireCloseButtons(sheet);

        var grid = $('appColorPresetGrid');
        var nativePicker = $('appColorNativePicker');
        var customBtn = $('appColorCustomBtn');
        var resetBtn = $('appColorResetBtn');
        var titleEl = $('pickAppColorTitle');

        var state = { key: null, cssVar: null, onApply: null, title: '' };

        function buildPresets() {
            grid.innerHTML = '';
            COLOR_PRESETS.forEach(function (hex) {
                var item = document.createElement('div');
                item.className = 'app-color-preset-item';
                item.style.background = hex;
                item.addEventListener('click', function () {
                    applyColor(hex);
                    closeSheet('sheet-pick-app-color');
                });
                grid.appendChild(item);
            });
        }
        buildPresets();

        function applyColor(hex) {
            if (state.key) localStorage.setItem(state.key, hex);
            if (state.cssVar) document.documentElement.style.setProperty(state.cssVar, hex);
            if (typeof state.onApply === 'function') state.onApply(hex);
        }

        customBtn.addEventListener('click', function () {
            nativePicker.click();
        });

        nativePicker.addEventListener('input', function () {
            applyColor(nativePicker.value);
        });

        resetBtn.addEventListener('click', function () {
            if (state.key) localStorage.removeItem(state.key);
            if (state.cssVar) document.documentElement.style.removeProperty(state.cssVar);
            if (typeof state.onApply === 'function') state.onApply(null);
            closeSheet('sheet-pick-app-color');
        });

        return {
            open: function (opts) {
                state.key = opts.key;
                state.cssVar = opts.cssVar;
                state.onApply = opts.onApply;
                if (titleEl) titleEl.textContent = opts.title || 'اختر لون';
                openSheet('sheet-pick-app-color');
            }
        };
    }

    function initMainActivityColorRows(picker) {
        var bottombarRow = $('bottombarColorRow');
        var mainBgRow = $('mainBgColorRow');
        if (!bottombarRow && !mainBgRow) return;

        applyMainActivityColors();

        if (bottombarRow) {
            bottombarRow.addEventListener('click', function () {
                picker.open({
                    key: BOTTOMBAR_KEY,
                    cssVar: '--bottombar-bg',
                    title: 'لون البار السفلي',
                    onApply: function (hex) {
                        updateSwatch('bottombarColorSwatch', 'bottombarColorHex', hex);
                    }
                });
            });
        }

        if (mainBgRow) {
            mainBgRow.addEventListener('click', function () {
                picker.open({
                    key: MAINBG_KEY,
                    cssVar: '--bg',
                    title: 'لون خلفية الرئيسية',
                    onApply: function (hex) {
                        updateSwatch('mainBgColorSwatch', 'mainBgColorHex', hex);
                    }
                });
            });
        }
    }

    /* ============================================================
       [2] لون خلفية الشات "Background color" — conversation / conv-group
       ============================================================ */

    function getCurrentChatKey() {
        // بيحاول ياخد هوية الشات/الجروب الحالي من الـ URL بأي اسم شائع
        // للـ query param، عشان لون الخلفية يتخزن لكل شات لوحده.
        try {
            var params = new URLSearchParams(window.location.search);
            var candidates = ['id', 'uid', 'chatId', 'groupId', 'convId', 'cid', 'gid'];
            for (var i = 0; i < candidates.length; i++) {
                var v = params.get(candidates[i]);
                if (v) return v;
            }
        } catch (e) {}
        return 'default';
    }

    function chatBgStorageKey() {
        return 'cz_chat_bg_' + getCurrentChatKey();
    }

    function applyChatBackground() {
        var messagesEl = $('convMessages');
        if (!messagesEl) return;
        var saved = localStorage.getItem(chatBgStorageKey());
        if (saved) {
            messagesEl.style.background = saved;
        } else {
            messagesEl.style.background = '';
        }
        var swatch = $('bubbleOptionBgSwatch');
        if (swatch) {
            swatch.style.background = saved || 'transparent';
        }
    }

    function initChatBackgroundOption(picker) {
        var row = $('bubbleOptionBg');
        if (!row) return;

        applyChatBackground();

        row.addEventListener('click', function () {
            picker.open({
                key: chatBgStorageKey(),
                cssVar: null,
                title: 'لون خلفية الشات',
                onApply: function (hex) {
                    var messagesEl = $('convMessages');
                    if (messagesEl) messagesEl.style.background = hex || '';
                    var swatch = $('bubbleOptionBgSwatch');
                    if (swatch) swatch.style.background = hex || 'transparent';
                }
            });
        });

        // لو فيه زرار "إرجاع الافتراضي" الأصلي بتاع الفقاعات (bubbleResetBtn)،
        // نضيف مسح لون الخلفية معاه كمان من غير ما نمس أي listener تاني عليه.
        var mainReset = $('bubbleResetBtn');
        if (mainReset) {
            mainReset.addEventListener('click', function () {
                localStorage.removeItem(chatBgStorageKey());
                applyChatBackground();
            });
        }
    }

    /* ============================================================
    /* ============================================================
       [7] Loading Spinner — للشاتات، الجروبات، وشاشة المحادثة
       بيظهر لفترة قصيرة بس وقت التحميل الفعلي، وبيختفي أوتوماتيك
       (مش هيفضل معلّق لو مفيش نت أو حصلت مشكلة)
       ============================================================ */

    function buildSpinnerNode() {
        var wrap = document.createElement('div');
        wrap.className = 'cz-loading-spinner-wrap';
        wrap.innerHTML = '<div class="cz-loading-spinner"></div><span class="cz-loading-spinner-label">تحميل</span>';
        return wrap;
    }

    // بيراقب container (زي #chatsList) وبيحط سبينر بدل أي empty-state
    // ثابت موجود في الـ HTML الأصلي وقت التحميل الأول بس، لحد ما
    // main.js يحط المحتوى الحقيقي (شات فعلي أو "مفيش شاتات" النهائية).
    //
    // مهم: السبينر بيشتغل بس لو الـ HTML الأصلي فيه .empty-state (يعني
    // احتمال إننا في حالة "لسه بيحمّل من فايرستور"). لو مفيش empty-state
    // ومفيش أي حاجة تانية، معناها المستخدم شايف خلفية سودا عادي —
    // ومنعملش أي حاجة، بالظبط زي ما اتطلب.
    function watchListForLoading(containerId, maxWaitMs) {
        var container = $(containerId);
        if (!container) return;

        var emptyStateEl = container.querySelector('.empty-state');
        if (!emptyStateEl) return; // مفيش حالة انتظار معروفة — سيبها زي ما هي

        var spinner = buildSpinnerNode();
        emptyStateEl.style.display = 'none';
        container.appendChild(spinner);

        var settled = false;
        function settle() {
            if (settled) return;
            settled = true;
            observer.disconnect();
            if (spinner.parentNode) spinner.remove();
            // مش بنرجّع نص "مفيش شاتات لسه" تاني بناءً على الطلب —
            // لو فعلاً مفيش شاتات، الشاشة تفضل خلفية سودا فاضية بس
            // (emptyStateEl بيفضل مخفي دايمًا، سواء فيه شاتات ولا لأ)
        }

        var observer = new MutationObserver(function () {
            // أي عنصر جديد اتضاف غير السبينر نفسه = البيانات جت
            var hasNewContent = false;
            for (var i = 0; i < container.children.length; i++) {
                var child = container.children[i];
                if (child !== spinner && child !== emptyStateEl) { hasNewContent = true; break; }
            }
            if (hasNewContent) settle();
        });
        observer.observe(container, { childList: true });

        // أمان: مانخليش السبينر يفضل معلّق لو حصلت مشكلة في الشبكة
        setTimeout(settle, maxWaitMs || 8000);
    }

    function watchConversationLoading() {
        var container = $('convMessages');
        if (!container) return;

        // لو فيه رسايل جاهزة من الأول، مفيش داعي لسبينر
        if (container.children.length > 0) return;

        var spinner = buildSpinnerNode();
        spinner.classList.add('cz-loading-spinner-wrap-conv');
        container.appendChild(spinner);

        var settled = false;
        function settle() {
            if (settled) return;
            settled = true;
            observer.disconnect();
            if (spinner.parentNode) spinner.remove();
        }

        var observer = new MutationObserver(function () {
            var hasRealContent = false;
            for (var i = 0; i < container.children.length; i++) {
                if (container.children[i] !== spinner) { hasRealContent = true; break; }
            }
            if (hasRealContent) settle();
        });
        observer.observe(container, { childList: true });

        setTimeout(settle, 12000);
    }

    function initLoadingSpinners() {
        watchListForLoading('chatsList', 12000);
        watchListForLoading('groupsList', 12000);
        watchConversationLoading();
    }

    /* ============ نقطة الدخول: تشغيل حسب الصفحة الحالية ============ */

    function init() {
        var picker = initAppColorPickerSheet();

        if (picker) {
            initMainActivityColorRows(picker);
            initChatBackgroundOption(picker);
        }

        initLoadingSpinners();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
