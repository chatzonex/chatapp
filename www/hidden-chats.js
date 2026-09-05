/* ===================================================
   HIDDEN-CHATS.JS
   ميزة الشاتات المخفية بالكامل:
   - ضغطة مطولة على أيقونة CHATS تحت → إنشاء باسورد (PIN أو Pattern)
   - ضغطة عادية على CHATS (لو الباسورد موجود) → يطلب الباسورد ويدخل
     صفحة الشاتات المخفية (جوه نفس MainActivity.html)
   - ضغطة مطولة على صورة أي شات → أيقونة عين لإخفاء الشات
   - تخزين الباسورد (مُشفّر بـ hash) في Firebase تحت مستند اليوزر
   - نبضة على أيقونة CHATS لو فيه رسالة جديدة في شات مخفي

   الملف ده مستقل تمامًا عن main.js المشوّش، وبيتواصل مع باقي
   التطبيق من خلال DOM observation بس (من غير ما يلمس أي كود
   موجود أو يعتمد على تفاصيله الداخلية).
=================================================== */

import {
    db, doc, setDoc, getDoc, updateDoc, collection, query,
    onSnapshot, ensureAuthenticated
} from './firebase-init.js';

(function () {
    'use strict';

    /* ============ Helpers عامة ============ */

    function getCurrentEmail() {
        return (localStorage.getItem('cz_verified_email') || '').toLowerCase();
    }

    // Hash بسيط (SHA-256) عشان الباسورد مايتخزنش نص صريح في Firebase.
    async function hashValue(str) {
        const enc = new TextEncoder().encode(str);
        const buf = await crypto.subtle.digest('SHA-256', enc);
        return Array.from(new Uint8Array(buf))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
    }

    function userDocRef(email) {
        return doc(db, 'hiddenChatsAuth', email);
    }

    /* ============ حالة داخلية ============ */

    const state = {
        // 'create' وقت أول إنشاء، 'verify' وقت الدخول العادي،
        // 'confirm' وقت تأكيد الباسورد الجديد بعد إدخاله أول مرة،
        // 'change-old' / 'change-new' / 'change-confirm' وقت تغيير الباسورد.
        mode: null,
        passType: null, // 'pin' | 'pattern'
        pendingValue: null, // القيمة اللي اتكتبت أول مرة، عشان نقارنها بالتأكيد
        currentPin: '',
        patternPoints: [], // مصفوفة أرقام الخلايا (0-8) بالترتيب
        onSuccess: null, // callback يتنفذ بعد نجاح التحقق/الإنشاء
        oldPassVerifiedType: null,
        chatToHideId: null,
        chatToHideEmail: null
    };

    let cachedAuthDoc = null; // { exists, type, hash }

    async function loadAuthDoc(forceRefresh) {
        if (cachedAuthDoc && !forceRefresh) return cachedAuthDoc;
        const email = getCurrentEmail();
        if (!email) return { exists: false };
        try {
            const snap = await getDoc(userDocRef(email));
            if (snap.exists()) {
                cachedAuthDoc = { exists: true, ...snap.data() };
            } else {
                cachedAuthDoc = { exists: false };
            }
        } catch (e) {
            console.error('فشل تحميل بيانات باسورد الشاتات المخفية:', e);
            cachedAuthDoc = { exists: false };
        }
        return cachedAuthDoc;
    }

    /* ============ عناصر DOM ============ */

    const els = {};
    function q(id) { return document.getElementById(id); }

    function bindEls() {
        els.navChats = q('navChats');
        els.chooseTypeOverlay = q('hcChooseTypeOverlay');
        els.chooseTypeClose = q('hcChooseTypeClose');
        els.typePinBtn = q('hcTypePinBtn');
        els.typePatternBtn = q('hcTypePatternBtn');

        els.passOverlay = q('hcPassOverlay');
        els.passBack = q('hcPassBack');
        els.passIcon = q('hcPassIcon');
        els.passTitle = q('hcPassTitle');
        els.passSub = q('hcPassSub');
        els.passError = q('hcPassError');

        els.pinDots = q('hcPinDots');
        els.keypad = q('hcKeypad');

        els.patternWrap = q('hcPatternWrap');
        els.patternGrid = q('hcPatternGrid');
        els.patternLines = q('hcPatternLines');

        els.screenHiddenChats = q('screen-hidden-chats');
        els.hiddenChatsList = q('hiddenChatsList');
        els.hcBackToMainBtn = q('hcBackToMainBtn');
        els.hcMenuBtn = q('hcMenuBtn');
        els.sheetHcMenu = q('sheet-hc-menu');
        els.hcChangePassBtn = q('hcChangePassBtn');

        els.mainAppShell = document.querySelector('.app-shell');
        els.screenChats = q('screen-chats');
        els.chatsList = q('chatsList');
        els.bottomNav = q('bottomNav');
    }

    /* ============ فتح/قفل الأوفرليز ============ */

    function openOverlay(el) { el.classList.add('open'); }
    function closeOverlay(el) { el.classList.remove('open'); }

    function closeAllHcOverlays() {
        closeOverlay(els.chooseTypeOverlay);
        closeOverlay(els.passOverlay);
    }

    /* ============ بناء لوحة Pattern (3x3) ============ */

    function buildPatternGrid() {
        if (els.patternGrid.children.length) return; // بنيت مرة واحدة بس
        for (let i = 0; i < 9; i++) {
            const cell = document.createElement('div');
            cell.className = 'hc-pattern-dot';
            cell.dataset.index = String(i);
            const inner = document.createElement('div');
            inner.className = 'hc-pattern-dot-inner';
            cell.appendChild(inner);
            els.patternGrid.appendChild(cell);
        }
    }

    function getCellCenter(index) {
        const cell = els.patternGrid.children[index];
        const gridRect = els.patternGrid.getBoundingClientRect();
        const cellRect = cell.getBoundingClientRect();
        return {
            x: cellRect.left - gridRect.left + cellRect.width / 2,
            y: cellRect.top - gridRect.top + cellRect.height / 2
        };
    }

    function resetPatternUI() {
        state.patternPoints = [];
        Array.from(els.patternGrid.children).forEach((c) => {
            c.classList.remove('active', 'error');
        });
        els.patternLines.innerHTML = '';
        els.patternWrap.classList.remove('shake');
    }

    function redrawPatternLines() {
        els.patternLines.innerHTML = '';
        // نحول لإحداثيات الـ viewBox (300x300) عشان الخطوط تفضل صح مهما كان
        // حجم العرض الفعلي، بما إن الشبكة والـ viewBox بنفس النسبة (260 مربع
        // تقريبًا معروضة داخل viewBox مقاسه 300، فبنستخدم نسبة العرض الفعلي).
        const gridRect = els.patternGrid.getBoundingClientRect();
        const scaleX = 300 / gridRect.width;
        const scaleY = 300 / gridRect.height;

        for (let i = 0; i < state.patternPoints.length - 1; i++) {
            const p1 = getCellCenter(state.patternPoints[i]);
            const p2 = getCellCenter(state.patternPoints[i + 1]);
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', String(p1.x * scaleX));
            line.setAttribute('y1', String(p1.y * scaleY));
            line.setAttribute('x2', String(p2.x * scaleX));
            line.setAttribute('y2', String(p2.y * scaleY));
            els.patternLines.appendChild(line);
        }
    }

    function setupPatternInput(onComplete) {
        buildPatternGrid();
        resetPatternUI();

        let drawing = false;

        function cellFromPoint(clientX, clientY) {
            const cells = Array.from(els.patternGrid.children);
            for (const cell of cells) {
                const r = cell.getBoundingClientRect();
                if (
                    clientX >= r.left && clientX <= r.right &&
                    clientY >= r.top && clientY <= r.bottom
                ) {
                    return parseInt(cell.dataset.index, 10);
                }
            }
            return null;
        }

        function addPoint(index) {
            if (index === null) return;
            if (state.patternPoints.includes(index)) return;
            state.patternPoints.push(index);
            els.patternGrid.children[index].classList.add('active');
            redrawPatternLines();
        }

        function handleStart(clientX, clientY) {
            // لو الشبكة لسه معندهاش أبعاد حقيقية (لسه بتتحمّل / مخفية)
            // بنتجاهل اللمسة بدل ما نقبل نقطة غلط.
            const gridRect = els.patternGrid.getBoundingClientRect();
            if (gridRect.width === 0 || gridRect.height === 0) return;

            resetPatternUI();
            drawing = true;
            const idx = cellFromPoint(clientX, clientY);
            addPoint(idx);
        }

        function handleMove(clientX, clientY) {
            if (!drawing) return;
            const idx = cellFromPoint(clientX, clientY);
            addPoint(idx);
        }

        function handleEnd() {
            if (!drawing) return;
            drawing = false;
            if (state.patternPoints.length >= 2) {
                onComplete(state.patternPoints.slice());
            } else {
                triggerPatternError(false);
            }
        }

        function onTouchStart(e) {
            const t = e.touches[0];
            handleStart(t.clientX, t.clientY);
        }
        function onTouchMove(e) {
            e.preventDefault();
            const t = e.touches[0];
            handleMove(t.clientX, t.clientY);
        }
        function onTouchEnd() { handleEnd(); }

        function onMouseDown(e) { handleStart(e.clientX, e.clientY); }
        function onMouseMove(e) { handleMove(e.clientX, e.clientY); }
        function onMouseUp() { handleEnd(); }

        els.patternGrid.addEventListener('touchstart', onTouchStart, { passive: true });
        els.patternGrid.addEventListener('touchmove', onTouchMove, { passive: false });
        els.patternGrid.addEventListener('touchend', onTouchEnd, { passive: true });
        els.patternGrid.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        // بنرجع دالة تنظيف عشان نشيل الـ listeners لما نخرج من الشاشة دي
        return function cleanup() {
            els.patternGrid.removeEventListener('touchstart', onTouchStart);
            els.patternGrid.removeEventListener('touchmove', onTouchMove);
            els.patternGrid.removeEventListener('touchend', onTouchEnd);
            els.patternGrid.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }

    let patternCleanup = null;

    function triggerPatternError(showRedDots) {
        if (showRedDots) {
            state.patternPoints.forEach((i) => {
                els.patternGrid.children[i].classList.add('error');
            });
        }
        els.patternWrap.classList.add('shake');
        setTimeout(() => {
            resetPatternUI();
        }, 420);
    }

    /* ============ إدخال PIN ============ */

    function resetPinUI() {
        state.currentPin = '';
        Array.from(els.pinDots.children).forEach((d) => d.classList.remove('filled', 'shake-error'));
        els.pinDots.classList.remove('shake');
    }

    function updatePinDots() {
        Array.from(els.pinDots.children).forEach((dot, i) => {
            dot.classList.toggle('filled', i < state.currentPin.length);
        });
    }

    function triggerPinError() {
        els.pinDots.classList.add('shake');
        setTimeout(() => {
            resetPinUI();
        }, 420);
    }

    function setupKeypad(onComplete) {
        function handleKey(e) {
            const btn = e.target.closest('.hc-key[data-key]');
            if (btn) {
                if (state.currentPin.length >= 6) return;
                state.currentPin += btn.dataset.key;
                updatePinDots();
                if (state.currentPin.length === 6) {
                    setTimeout(() => onComplete(state.currentPin), 120);
                }
                return;
            }
            if (e.target.closest('#hcKeyDel')) {
                state.currentPin = state.currentPin.slice(0, -1);
                updatePinDots();
            }
        }
        els.keypad.addEventListener('click', handleKey);
        return function cleanup() {
            els.keypad.removeEventListener('click', handleKey);
        };
    }

    let keypadCleanup = null;

    /* ============ عرض/إخفاء شاشة إدخال الباسورد حسب النوع ============ */

    function showPassScreen(type, title, sub, icon) {
        els.passTitle.textContent = title;
        els.passSub.textContent = sub || '';
        els.passIcon.textContent = icon || '🔒';
        els.passError.classList.add('hidden');

        if (type === 'pin') {
            els.pinDots.style.display = 'flex';
            els.keypad.classList.remove('hidden');
            els.patternWrap.classList.add('hidden');
            resetPinUI();
        } else {
            els.pinDots.style.display = 'none';
            els.keypad.classList.add('hidden');
            els.patternWrap.classList.remove('hidden');
        }

        openOverlay(els.passOverlay);
    }

    function hidePassScreen() {
        closeOverlay(els.passOverlay);
        if (keypadCleanup) { keypadCleanup(); keypadCleanup = null; }
        if (patternCleanup) { patternCleanup(); patternCleanup = null; }
        resetPinUI();
        resetPatternUI();
    }

    /* ============ تدفق إنشاء الباسورد لأول مرة ============ */

    function startCreateFlow(type) {
        state.mode = 'create';
        state.passType = type;
        state.pendingValue = null;
        closeAllHcOverlays();

        const label = type === 'pin' ? 'PIN' : 'Pattern';
        const startMsg = type === 'pin' ? 'اكتب باسورد من 6 أرقام' : 'ارسم النقش اللي عاوزه';

        showPassScreen(type, `إنشاء ${label}`, startMsg, '🔒');

        if (type === 'pin') {
            keypadCleanup = setupKeypad(onCreateFirstEntry);
        } else {
            setTimeout(() => {
                patternCleanup = setupPatternInput(onCreateFirstEntry);
            }, 0);
        }
    }

    function onCreateFirstEntry(value) {
        // ناخد نسخة تانية مستقلة من القيمة عشان مفيش أي مرجع مشترك
        // ممكن يتغيّر لاحقًا (مصفوفة الـ pattern بالذات).
        state.pendingValue = Array.isArray(value) ? value.slice() : value;
        state.mode = 'create-confirm';

        if (state.passType === 'pin') {
            resetPinUI();
            els.passTitle.textContent = 'أكّد الـ PIN';
            els.passSub.textContent = 'اكتب نفس الأرقام تاني للتأكيد';
            keypadCleanup && keypadCleanup();
            keypadCleanup = setupKeypad(onCreateConfirmEntry);
        } else {
            els.passTitle.textContent = 'أكّد الـ Pattern';
            els.passSub.textContent = 'ارسم نفس النقش تاني للتأكيد';
            patternCleanup && patternCleanup();
            // بنأجل إعادة بناء شاشة الـ pattern لأول Tick تاني (بعد ما
            // حدث الـ mouseup/touchend الحالي يخلص يتنفذ تمامًا)، عشان
            // نضمن إن الـ listeners القديمة اتشالت فعلاً قبل ما نبدأ
            // نسجل جداد، ومفيش أي نقطة إضافية بتتسجل غلط من نفس اللمسة.
            setTimeout(() => {
                resetPatternUI();
                patternCleanup = setupPatternInput(onCreateConfirmEntry);
            }, 0);
        }
    }

    async function onCreateConfirmEntry(value) {
        const matches =
            state.passType === 'pin'
                ? value === state.pendingValue
                : value.join(',') === state.pendingValue.join(',');

        if (!matches) {
            els.passError.textContent = 'الباسورد غير مطابق، حاول تاني من الأول';
            els.passError.classList.remove('hidden');
            if (state.passType === 'pin') {
                triggerPinError();
            } else {
                triggerPatternError(true);
            }
            // نرجعه لأول خطوة تاني بعد لحظة
            setTimeout(() => {
                startCreateFlow(state.passType);
            }, 700);
            return;
        }

        // اتطابق. نحفظ في Firebase.
        const email = getCurrentEmail();
        if (!email) return;

        try {
            await ensureAuthenticated();
            const rawValue =
                state.passType === 'pin' ? state.pendingValue : state.pendingValue.join(',');
            const hash = await hashValue(rawValue);

            await setDoc(userDocRef(email), {
                type: state.passType,
                hash: hash,
                hiddenChatIds: [],
                updatedAt: Date.now()
            });

            cachedAuthDoc = { exists: true, type: state.passType, hash, hiddenChatIds: [] };

            hidePassScreen();
            state.mode = null;
            // يرجع لصفحة MAIN العادية (هي أصلاً الشاشة الحالية، فمفيش داعي
            // ننقل الشاشة — بس نتأكد إن شاشة الشاتات العادية هي الظاهرة).
            showMainChatsScreen();
        } catch (e) {
            console.error('فشل حفظ باسورد الشاتات المخفية:', e);
            els.passError.textContent = 'حصل خطأ، حاول تاني';
            els.passError.classList.remove('hidden');
        }
    }

    /* ============ تدفق التحقق من الباسورد (دخول عادي) ============ */

    function startVerifyFlow(authDoc, onSuccess) {
        state.mode = 'verify';
        state.passType = authDoc.type;
        state.onSuccess = onSuccess;
        closeAllHcOverlays();

        const label = authDoc.type === 'pin' ? 'اكتب الـ PIN' : 'ارسم الـ Pattern';
        showPassScreen(authDoc.type, label, '', '🔒');

        if (authDoc.type === 'pin') {
            keypadCleanup = setupKeypad((value) => onVerifyEntry(value, authDoc));
        } else {
            setTimeout(() => {
                patternCleanup = setupPatternInput((value) => onVerifyEntry(value, authDoc));
            }, 0);
        }
    }

    async function onVerifyEntry(value, authDoc) {
        const rawValue = state.passType === 'pin' ? value : value.join(',');
        const hash = await hashValue(rawValue);

        if (hash !== authDoc.hash) {
            els.passError.textContent = 'الباسورد غير صحيح';
            els.passError.classList.remove('hidden');
            if (state.passType === 'pin') {
                triggerPinError();
            } else {
                triggerPatternError(true);
            }
            return;
        }

        els.passError.classList.add('hidden');
        hidePassScreen();
        const cb = state.onSuccess;
        state.onSuccess = null;
        if (cb) cb();
    }

    /* ============ تدفق تغيير الباسورد ============ */

    function startChangePasswordFlow() {
        loadAuthDoc(true).then((authDoc) => {
            if (!authDoc.exists) return;
            closeOverlay(els.sheetHcMenu);

            startVerifyFlow(authDoc, () => {
                // بعد التأكد من الباسورد القديم، نفتح تدفق إنشاء جديد
                startCreateFlow(authDoc.type);
            });
        });
    }

    /* ============ التنقل بين شاشة الشاتات العادية والمخفية ============ */

    function showHiddenChatsScreen() {
        els.screenChats.classList.add('hidden');
        els.screenHiddenChats.classList.remove('hidden');
        els.bottomNav.style.display = 'none';
        renderHiddenChats();
    }

    function showMainChatsScreen() {
        els.screenHiddenChats.classList.add('hidden');
        els.screenChats.classList.remove('hidden');
        els.bottomNav.style.display = '';
    }

    /* ============ منطق الضغط المطول على أيقونة CHATS ============ */

    function setupNavChatsLongPress() {
        let pressTimer = null;
        let longPressTriggered = false;
        const LONG_PRESS_MS = 550;

        function start(e) {
            longPressTriggered = false;
            pressTimer = setTimeout(async () => {
                longPressTriggered = true;
                const authDoc = await loadAuthDoc();
                if (authDoc.exists) {
                    // لو الباسورد موجود بالفعل، الضغط المطول برضه يفتح تدفق
                    // الإنشاء (بيتطلب تأكيد الباسورد القديم الأول) بدل ما
                    // نتجاهله، عشان محدش يقدر يستبدل باسورد حد من غير ما
                    // يعرف القديم.
                    startVerifyFlow(authDoc, () => startCreateFlow(authDoc.type));
                } else {
                    openOverlay(els.chooseTypeOverlay);
                }
            }, LONG_PRESS_MS);
        }

        function cancel() {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        }

        // بدل ما نحاول نوقف الـ click الأساسي بتاع main.js (اللي ممكن يكون
        // متسجل بأي شكل: delegation، capture، أو مباشر — مش مضمون نلحقه)،
        // بنسيبه يشتغل عادي وبنصحح النتيجة بعده على طول: لو حصل ضغط مطول،
        // أو لو فيه باسورد محفوظ، بنرجّع شاشة الشاتات العادية زي ما هي
        // وبنعرض شاشة الباسورد فوقها بدل ما نسيب شاشة الشاتات المخفية
        // تتفتح من غير ما حد يتحقق من الباسورد.
        async function handleClickCorrection() {
            if (longPressTriggered) {
                longPressTriggered = false;
                // main.js خلاها active/تفتح شاشة الشاتات العادية — سيبها
                // زي ما هي، الأوفرلاي بتاع الباسورد فوقها أصلاً اتفتح.
                return;
            }

            const authDoc = await loadAuthDoc();
            if (!authDoc.exists) return; // مفيش باسورد، سيب السلوك العادي زي ما هو

            // فيه باسورد محفوظ: نطلب الباسورد فورًا. شاشة الشاتات العادية
            // اللي فتحها main.js تفضل زي ما هي تحت الأوفرلاي (مش مشكلة،
            // هي أصلاً المفروض تكون ظاهرة عادي).
            startVerifyFlow(authDoc, () => {
                showHiddenChatsScreen();
            });
        }

        els.navChats.addEventListener('touchstart', start, { passive: true });
        els.navChats.addEventListener('touchend', cancel, { passive: true });
        els.navChats.addEventListener('touchmove', cancel, { passive: true });
        els.navChats.addEventListener('mousedown', start);
        els.navChats.addEventListener('mouseup', cancel);
        els.navChats.addEventListener('mouseleave', cancel);

        // click بيتنفذ في الآخر بعد touchend/mouseup، فـ longPressTriggered
        // بيوصله بالقيمة الصح. بنستخدم capture:false عادي عشان يتنفذ بعد
        // أي منطق تبديل شاشات أساسي (مش قبله)، فنقدر نصحح فوقه.
        els.navChats.addEventListener('click', handleClickCorrection);
    }

    /* ============ زرار العين على كل شات (إخفاء) ============ */

    function addEyeButtonToRow(row) {
        if (row.querySelector('.hc-hide-eye-btn')) return; // موجود بالفعل

        const btn = document.createElement('button');
        btn.className = 'hc-hide-eye-btn';
        btn.setAttribute('aria-label', 'إخفاء الشات');
        // أيقونة عين وفي نصها خط مايل بزاوية حادة (عين مشطوبة مميزة)
        btn.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/>' +
            '<circle cx="12" cy="12" r="3"/>' +
            '<line x1="4" y1="19" x2="19" y2="5"/>' +
            '</svg>';

        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            onEyeButtonClick(row);
        });

        row.appendChild(btn);
    }

    let longPressedRow = null;

    function setupChatRowLongPressForEye() {
        let pressTimer = null;
        const LONG_PRESS_MS = 500;

        function findRow(target) {
            return target.closest ? target.closest('.chat-row') : null;
        }

        function start(e) {
            const row = findRow(e.target);
            if (!row) return;
            pressTimer = setTimeout(() => {
                document.querySelectorAll('.chat-row.hc-eye-visible').forEach((r) => {
                    if (r !== row) r.classList.remove('hc-eye-visible');
                });
                addEyeButtonToRow(row);
                row.classList.add('hc-eye-visible');
            }, LONG_PRESS_MS);
        }

        function cancel() {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        }

        els.chatsList.addEventListener('touchstart', start, { passive: true });
        els.chatsList.addEventListener('touchend', cancel, { passive: true });
        els.chatsList.addEventListener('touchmove', cancel, { passive: true });
        els.chatsList.addEventListener('mousedown', start);
        els.chatsList.addEventListener('mouseup', cancel);
        els.chatsList.addEventListener('mouseleave', cancel);

        // اضغط في أي مكان تاني يقفل ظهور العين
        document.addEventListener('click', function (e) {
            if (!e.target.closest('.chat-row')) {
                document.querySelectorAll('.chat-row.hc-eye-visible').forEach((r) => {
                    r.classList.remove('hc-eye-visible');
                });
            }
        });
    }

    async function onEyeButtonClick(row) {
        const chatId = row.getAttribute('data-chat-id');
        const email = row.getAttribute('data-email');
        if (!chatId) return;

        const authDoc = await loadAuthDoc();
        if (!authDoc.exists) {
            // مفيش باسورد لسه اتعمل، نوجه المستخدم لإنشاء باسورد الأول
            openOverlay(els.chooseTypeOverlay);
            return;
        }

        state.chatToHideId = chatId;
        state.chatToHideEmail = email;

        startVerifyFlow(authDoc, async () => {
            await hideChatById(state.chatToHideId);
            row.classList.remove('hc-eye-visible');
            row.style.display = 'none';
        });
    }

    async function hideChatById(chatId) {
        const email = getCurrentEmail();
        if (!email || !chatId) return;
        try {
            const authDoc = await loadAuthDoc();
            const current = new Set(authDoc.hiddenChatIds || []);
            current.add(chatId);
            await updateDoc(userDocRef(email), {
                hiddenChatIds: Array.from(current)
            });
            cachedAuthDoc = { ...authDoc, hiddenChatIds: Array.from(current) };
        } catch (e) {
            console.error('فشل إخفاء الشات:', e);
        }
    }

    async function unhideChatById(chatId) {
        const email = getCurrentEmail();
        if (!email || !chatId) return;
        try {
            const authDoc = await loadAuthDoc();
            const current = new Set(authDoc.hiddenChatIds || []);
            current.delete(chatId);
            await updateDoc(userDocRef(email), {
                hiddenChatIds: Array.from(current)
            });
            cachedAuthDoc = { ...authDoc, hiddenChatIds: Array.from(current) };
        } catch (e) {
            console.error('فشل إظهار الشات:', e);
        }
    }

    /* ============ رسم قائمة الشاتات المخفية ============ */

    async function renderHiddenChats() {
        const authDoc = await loadAuthDoc(true);
        const hiddenIds = authDoc.hiddenChatIds || [];

        els.hiddenChatsList.innerHTML = '';

        if (!hiddenIds.length) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.innerHTML =
                '<div class="empty-icon">🔒</div>' +
                '<p class="empty-title">مفيش شاتات مخفية</p>' +
                '<p class="empty-sub">أي شات تخفيه هيظهر هنا</p>';
            els.hiddenChatsList.appendChild(empty);
            return;
        }

        // نلاقي عناصر الشات المطابقة (لو موجودة أصلاً مرسومة في القائمة
        // العادية بالـ DOM) وننسخها هنا؛ ده أبسط وأأمن طريقة تضمن نفس
        // شكل الأفتار والاسم وآخر رسالة، من غير ما نعيد بناء المنطق
        // المعقد بتاع main.js من الصفر.
        hiddenIds.forEach((chatId) => {
            const original = document.querySelector(
                '.chat-row[data-chat-id="' + CSS.escape(chatId) + '"]'
            );
            let rowClone;
            if (original) {
                rowClone = original.cloneNode(true);
                rowClone.classList.remove('hc-eye-visible');
                const oldEye = rowClone.querySelector('.hc-hide-eye-btn');
                if (oldEye) oldEye.remove();
            } else {
                // مفيش عنصر مطابق في القائمة العادية دلوقتي (ممكن يكون
                // اتشال من الـ DOM لأنه مخفي أصلاً). نعرض صف بسيط بديل.
                rowClone = document.createElement('div');
                rowClone.className = 'chat-row';
                rowClone.setAttribute('data-chat-id', chatId);
                rowClone.innerHTML =
                    '<div class="chat-row-avatar"><span class="chat-row-avatar-icon">💬</span></div>' +
                    '<div class="chat-row-text"><h4 class="chat-row-name">شات مخفي</h4></div>';
            }

            // زرار إظهار (unhide)
            const unhideBtn = document.createElement('button');
            unhideBtn.className = 'hc-hide-eye-btn';
            unhideBtn.style.display = 'flex';
            unhideBtn.setAttribute('aria-label', 'إظهار الشات');
            unhideBtn.innerHTML =
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/>' +
                '<circle cx="12" cy="12" r="3"/>' +
                '</svg>';
            unhideBtn.addEventListener('click', async function (e) {
                e.preventDefault();
                e.stopPropagation();
                await unhideChatById(chatId);
                const originalRow = document.querySelector(
                    '.chat-row[data-chat-id="' + CSS.escape(chatId) + '"]'
                );
                if (originalRow) originalRow.style.display = '';
                renderHiddenChats();
            });
            rowClone.appendChild(unhideBtn);

            els.hiddenChatsList.appendChild(rowClone);
        });
    }

    /* ============ إخفاء الشاتات المخفية من القائمة العادية عند التحميل ============ */

    async function hideAlreadyHiddenChatsFromMainList() {
        const authDoc = await loadAuthDoc();
        if (!authDoc.exists || !authDoc.hiddenChatIds || !authDoc.hiddenChatIds.length) return;
        authDoc.hiddenChatIds.forEach((chatId) => {
            const row = document.querySelector(
                '.chat-row[data-chat-id="' + CSS.escape(chatId) + '"]'
            );
            if (row) row.style.display = 'none';
        });
    }

    // بما إن main.js بيرسم القائمة بشكل async (Firebase snapshot)، بنراقب
    // أي تغييرات جوه #chatsList ونعيد تطبيق الإخفاء على أي عنصر جديد.
    function observeChatsListForHiding() {
        const observer = new MutationObserver(() => {
            hideAlreadyHiddenChatsFromMainList();
        });
        observer.observe(els.chatsList, { childList: true, subtree: false });
    }

    /* ============ نبضة أيقونة CHATS لو فيه رسالة جديدة في شات مخفي ============ */

    function pulseNavChatsIcon() {
        els.navChats.classList.remove('hc-pulse');
        // إعادة تشغيل الأنيميشن (reflow trick)
        void els.navChats.offsetWidth;
        els.navChats.classList.add('hc-pulse');
        setTimeout(() => {
            els.navChats.classList.remove('hc-pulse');
        }, 1600);
    }

    async function watchHiddenChatsForNewMessages() {
        const email = getCurrentEmail();
        if (!email) return;
        const authDoc = await loadAuthDoc();
        if (!authDoc.exists || !authDoc.hiddenChatIds || !authDoc.hiddenChatIds.length) return;

        // آخر وقت شفنا فيه كل شات، محفوظ محليًا عشان نعرف نميز رسالة
        // جديدة فعلية من مجرد إعادة تحميل الصفحة.
        const lastSeenKey = 'cz_hc_last_seen';
        let lastSeen = {};
        try {
            lastSeen = JSON.parse(localStorage.getItem(lastSeenKey) || '{}');
        } catch (e) {}

        authDoc.hiddenChatIds.forEach((chatId) => {
            try {
                const msgsRef = collection(db, 'chats', chatId, 'messages');
                const q = query(msgsRef);
                onSnapshot(q, (snap) => {
                    if (snap.metadata.fromCache) return;
                    let latestTime = 0;
                    snap.forEach((docSnap) => {
                        const data = docSnap.data();
                        const t =
                            data.createdAt && data.createdAt.toMillis
                                ? data.createdAt.toMillis()
                                : Date.now();
                        if (t > latestTime) latestTime = t;
                    });
                    const previous = lastSeen[chatId] || 0;
                    if (latestTime > previous) {
                        pulseNavChatsIcon();
                    }
                    lastSeen[chatId] = latestTime;
                    localStorage.setItem(lastSeenKey, JSON.stringify(lastSeen));
                });
            } catch (e) {
                console.error('فشل مراقبة رسايل شات مخفي:', e);
            }
        });
    }

    /* ============ ربط باقي الأزرار الثابتة ============ */

    function bindStaticButtons() {
        els.chooseTypeClose.addEventListener('click', () => closeOverlay(els.chooseTypeOverlay));
        els.typePinBtn.addEventListener('click', () => startCreateFlow('pin'));
        els.typePatternBtn.addEventListener('click', () => startCreateFlow('pattern'));

        els.passBack.addEventListener('click', () => {
            hidePassScreen();
            state.mode = null;
        });

        els.hcBackToMainBtn.addEventListener('click', () => {
            showMainChatsScreen();
        });

        els.hcMenuBtn.addEventListener('click', () => {
            openOverlay(els.sheetHcMenu);
        });

        els.hcChangePassBtn.addEventListener('click', () => {
            startChangePasswordFlow();
        });

        // إغلاق الـ sheet بتاع القائمة عند الضغط على الخلفية أو زرار الإغلاق
        els.sheetHcMenu.addEventListener('click', (e) => {
            if (e.target === els.sheetHcMenu) closeOverlay(els.sheetHcMenu);
        });
        const closeBtn = els.sheetHcMenu.querySelector('[data-close-sheet]');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => closeOverlay(els.sheetHcMenu));
        }
    }

    /* ============ تهيئة عامة ============ */

    function init() {
        bindEls();
        if (!els.navChats || !els.chatsList) return; // مش صفحة MainActivity

        bindStaticButtons();
        setupNavChatsLongPress();
        setupChatRowLongPressForEye();
        observeChatsListForHiding();
        hideAlreadyHiddenChatsFromMainList();

        // نأجل مراقبة الرسايل الجديدة شوية عشان نضمن إن auth اتظبط الأول
        setTimeout(() => {
            watchHiddenChatsForNewMessages();
        }, 1500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
