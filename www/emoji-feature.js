/* ===================================================
   EMOJI-FEATURE.JS
   ملف مستقل تمامًا — مش بيلمس أي كود موجود في main.js /
   conversation.js / conv-group.js / groups.js / settings.js
   (زي enhancements.js بالظبط، بنفس المبدأ).

   بيضيف:
   1) زرار إيموجي جنب خانة الكتابة (شكل زي واتساب)
   2) بيكر شبكة إيموجي بستايل iOS الحقيقي (صور مش رموز يونيكود)
   3) عند الاختيار: يتحط placeholder في الرسالة، وبعد الإرسال
      يتحول العرض في الفقاعة لصورة الإيموجي الحقيقية
   4) العرض يشتغل عند المرسل والمستقبل عن طريق مراقبة الرسائل
      اللي conversation.js بيبنيها في الـ DOM (MutationObserver)
      بدون التعديل في كود الإرسال/الاستقبال نفسه

   طريقة الترميز: كل رسالة فيها إيموجي مخصص بتتبعت كنص عادي
   فيه توكن مخفي بالشكل: [[czemoji:g0_5]]
   وقت العرض، الكود ده بيتحول لصورة <img> بدل النص.
=================================================== */

(function () {
    'use strict';

    /* ============ Config ============ */
    // عدّل المسار ده لو رفعت الملفات في مكان تاني غير جنب هذا الملف
    var SPRITE_URL = 'emoji-sprite.webp';
    var MANIFEST_URL = 'emoji-manifest.json';
    var TOKEN_PREFIX = '[[czemoji:';
    var TOKEN_SUFFIX = ']]';
    var TOKEN_RE = /\[\[czemoji:([a-zA-Z0-9_]+)\]\]/g;

    var manifestData = null; // { size, cols, rows, items: [{id,x,y}] }
    var manifestById = {};   // id -> {x,y}

    function $(id) { return document.getElementById(id); }

    /* ============ تحميل الـ manifest ============ */
    function loadManifest() {
        if (manifestData) return Promise.resolve(manifestData);
        return fetch(MANIFEST_URL)
            .then(function (r) { return r.json(); })
            .then(function (data) {
                manifestData = data;
                data.items.forEach(function (it) { manifestById[it.id] = it; });
                return data;
            })
            .catch(function (e) {
                console.error('فشل تحميل manifest الإيموجي:', e);
                return null;
            });
    }

    /* ============ بناء صورة إيموجي من الـ sprite ============ */
    function buildEmojiSpanHTML(emojiId, sizePx) {
        var it = manifestById[emojiId];
        if (!it || !manifestData) return '';
        var size = manifestData.size;
        var scale = (sizePx || 22) / size;
        var bgW = Math.round(manifestData.cols * size * scale);
        var bgH = Math.round(manifestData.rows * size * scale);
        var bgX = Math.round(it.x * scale);
        var bgY = Math.round(it.y * scale);
        var s = (sizePx || 22);
        return '<span class="cz-emoji-img" data-emoji-id="' + emojiId + '" ' +
            'style="display:inline-block;vertical-align:-4px;width:' + s + 'px;height:' + s + 'px;' +
            'background-image:url(\'' + SPRITE_URL + '\');' +
            'background-repeat:no-repeat;' +
            'background-position:-' + bgX + 'px -' + bgY + 'px;' +
            'background-size:' + bgW + 'px ' + bgH + 'px;"></span>';
    }

    /* ============ تحويل نص فيه توكنز لـ HTML فيه صور ============ */
    function renderTextWithEmoji(text, sizePx) {
        if (!text || text.indexOf(TOKEN_PREFIX) === -1) return null; // مفيش إيموجي مخصص
        var out = '';
        var lastIndex = 0;
        var m;
        TOKEN_RE.lastIndex = 0;
        while ((m = TOKEN_RE.exec(text)) !== null) {
            var before = text.slice(lastIndex, m.index);
            if (before) out += escapeHTML(before);
            out += buildEmojiSpanHTML(m[1], sizePx);
            lastIndex = TOKEN_RE.lastIndex;
        }
        out += escapeHTML(text.slice(lastIndex));
        return out;
    }

    function escapeHTML(s) {
        var div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    }

    /* ============ [1] زرار الإيموجي جنب خانة الكتابة ============ */
    function injectEmojiButton() {
        var inputBar = $('convInputBar');
        var textarea = $('convTextarea');
        var sendBtn = $('convSendBtn');
        if (!inputBar || !textarea || !sendBtn) return null;
        if ($('czEmojiBtn')) return $('czEmojiBtn'); // موجود بالفعل

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'czEmojiBtn';
        btn.className = 'cz-emoji-trigger-btn';
        btn.setAttribute('aria-label', 'إيموجي');
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
            '<circle cx="12" cy="12" r="9.3"></circle>' +
            '<path d="M8.3 14.2c1 1.3 2.2 2 3.7 2s2.7-.7 3.7-2"></path>' +
            '<circle cx="8.7" cy="9.7" r="1" fill="currentColor" stroke="none"></circle>' +
            '<circle cx="15.3" cy="9.7" r="1" fill="currentColor" stroke="none"></circle>' +
            '</svg>';

        // نحط الزرار قبل التكستاريا مباشرة (يمين التكستاريا في RTL)
        inputBar.insertBefore(btn, textarea);

        btn.addEventListener('click', function () {
            openEmojiPicker();
        });

        return btn;
    }

    /* ============ [2] بيكر الإيموجي ============ */
    var pickerEl = null;

    function buildPicker() {
        if (pickerEl) return pickerEl;

        var overlay = document.createElement('div');
        overlay.id = 'czEmojiPickerOverlay';
        overlay.className = 'cz-emoji-picker-overlay';

        var sheet = document.createElement('div');
        sheet.className = 'cz-emoji-picker-sheet';

        var handle = document.createElement('div');
        handle.className = 'cz-emoji-picker-handle';
        sheet.appendChild(handle);

        var grid = document.createElement('div');
        grid.className = 'cz-emoji-picker-grid';
        grid.id = 'czEmojiPickerGrid';
        sheet.appendChild(grid);

        overlay.appendChild(sheet);
        document.body.appendChild(overlay);

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) closeEmojiPicker();
        });

        pickerEl = overlay;
        return overlay;
    }

    function populateGrid() {
        var grid = $('czEmojiPickerGrid');
        if (!grid || !manifestData) return;
        if (grid.childElementCount > 0) return; // اتبنى قبل كده

        var frag = document.createDocumentFragment();
        manifestData.items.forEach(function (it) {
            var cell = document.createElement('div');
            cell.className = 'cz-emoji-picker-cell';
            cell.innerHTML = buildEmojiSpanHTML(it.id, 34);
            cell.addEventListener('click', function () {
                insertEmojiToken(it.id);
                closeEmojiPicker();
            });
            frag.appendChild(cell);
        });
        grid.appendChild(frag);
    }

    function openEmojiPicker() {
        var overlay = buildPicker();
        loadManifest().then(function () {
            populateGrid();
            overlay.classList.add('open');
        });
    }

    function closeEmojiPicker() {
        if (pickerEl) pickerEl.classList.remove('open');
    }

    /* ============ إدراج التوكن في خانة الكتابة ============ */
    function insertEmojiToken(emojiId) {
        var textarea = $('convTextarea');
        if (!textarea) return;
        var token = TOKEN_PREFIX + emojiId + TOKEN_SUFFIX;
        var start = textarea.selectionStart || textarea.value.length;
        var end = textarea.selectionEnd || textarea.value.length;
        var val = textarea.value;
        textarea.value = val.slice(0, start) + token + val.slice(end);
        var newPos = start + token.length;
        textarea.setSelectionRange(newPos, newPos);
        textarea.focus();
        // نطلق حدث input عشان أي listener موجود (زي تكبير التكستاريا) يشتغل
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    /* ============ [3] تحويل الرسائل المعروضة لصور ============
       بيراقب convMessages وأي فقاعة جديدة تتضاف، يدور على
       .bubble-text جواها ولو لاقى توكن إيموجي يستبدله بصورة
       ================================================= */
    function processMessageBubble(bubbleEl) {
        if (!manifestData) return; // لسه الـ manifest ملحملش
        if (bubbleEl.dataset.czEmojiProcessed === '1') return;

        var textEl = bubbleEl.querySelector('.bubble-text');
        if (!textEl) return;

        var raw = textEl.textContent || '';
        if (raw.indexOf(TOKEN_PREFIX) === -1) {
            bubbleEl.dataset.czEmojiProcessed = '1';
            return;
        }

        var html = renderTextWithEmoji(raw, 22);
        if (html !== null) {
            textEl.innerHTML = html;
            bubbleEl.classList.add('cz-has-emoji');
        }
        bubbleEl.dataset.czEmojiProcessed = '1';
    }

    function processAllVisibleMessages() {
        var container = $('convMessages');
        if (!container) return;
        var bubbles = container.querySelectorAll('.bubble');
        bubbles.forEach(processMessageBubble);
    }

    function watchMessagesContainer() {
        var container = $('convMessages');
        if (!container) return;

        loadManifest().then(function () {
            processAllVisibleMessages();
        });

        var observer = new MutationObserver(function (mutations) {
            if (!manifestData) return; // هيتحط باقي بعد ما يخلص تحميل
            var needsProcess = false;
            mutations.forEach(function (m) {
                if (m.addedNodes && m.addedNodes.length) needsProcess = true;
            });
            if (needsProcess) processAllVisibleMessages();
        });
        observer.observe(container, { childList: true, subtree: true });
    }

    /* ============ نقطة الدخول ============ */
    function init() {
        var btn = injectEmojiButton();
        if (btn) {
            loadManifest(); // نحمل الـ manifest بدري عشان يبقى جاهز
        }
        watchMessagesContainer();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
