import {
    db,
    doc,
    setDoc,
    getDoc,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    deleteField,
    arrayUnion,
    collection,
    query,
    orderBy,
    onSnapshot,
    serverTimestamp,
    writeBatch,
    ensureAuthenticated
} from "./firebase-init.js";

(function () {
    // =====================================================
    // 1) احترام الثيم واللغة والـ Liquid Glass المحفوظين — نفس
    //    منطق conversation.js بالظبط (نفس المفتاح cz_lg_chat، فتفعيل
    //    الزجاج السائل في شاشة الشات العادية بيفعّله هنا كمان تلقائيًا)
    // =====================================================
    const lang = localStorage.getItem('cz_lang') || 'ar';
    const theme = localStorage.getItem('cz_theme') || 'dark';
    const isAr = lang === 'ar';

    document.documentElement.lang = lang;
    document.documentElement.dir = isAr ? 'rtl' : 'ltr';

    if (theme === 'white') document.body.classList.add('theme-white');
    if (theme === 'custom') {
        document.body.classList.add('theme-custom');
        const color = localStorage.getItem('cz_theme_color');
        if (color) document.documentElement.style.setProperty('--accent', color);
    }
    if (localStorage.getItem('cz_lg_chat') === 'on') {
        document.body.classList.add('lg-chat-on');
    }

    const I18N = {
        ar: {
            type_message: 'اكتب رسالة...',
            unknown_group: 'جروب',
            bubbles_mine_title: 'لون فقاعتي',
            bubbles_tick_title: 'لون الصح الزرقاء',
            choose_color_title: 'اختر لون',
            ctx_reply: 'رد',
            ctx_copy: 'نسخ',
            ctx_select: 'تحديد',
            ctx_delete_msg: 'حذف الرسالة',
            deleted_msg_text: 'تم حذف هذه الرسالة',
            reply_you: 'أنت',
            msg_deleted_toast: 'اتحذفت الرسالة',
            copied_toast: 'اتنسخت الرسالة',
            typing_status_one: '{name} بيكتب الآن...',
            typing_status_many: 'كذا شخص بيكتبوا الآن...',
            weak_connection: 'نتك ضعيف',
            group_you_created: 'أنشأ الجروب',
            group_members_count: 'عضو',
            group_owner_badge: 'صاحب الجروب'
        },
        en: {
            type_message: 'Type a message...',
            unknown_group: 'Group',
            bubbles_mine_title: 'My bubble color',
            bubbles_tick_title: 'Blue checkmark color',
            choose_color_title: 'Choose a color',
            ctx_reply: 'Reply',
            ctx_copy: 'Copy',
            ctx_select: 'Select',
            ctx_delete_msg: 'Delete message',
            deleted_msg_text: 'This message was deleted',
            reply_you: 'You',
            msg_deleted_toast: 'Message deleted',
            copied_toast: 'Message copied',
            typing_status_one: '{name} is typing...',
            typing_status_many: 'Several people are typing...',
            weak_connection: 'Weak connection',
            group_you_created: 'created the group',
            group_members_count: 'members',
            group_owner_badge: 'Owner'
        }
    };
    const T = I18N[isAr ? 'ar' : 'en'];

    document.querySelectorAll('[data-i18n]').forEach(el => {
        // بعض النصوص (زي bubbles_body_group) متعرفة في القاموس العام
        // بتاع settings.js نفسه لما اتحمّل قبل كده، فمنعملش override
        // ليها هنا لو مش موجودة في T المحلي بتاع الصفحة دي
        const key = el.getAttribute('data-i18n');
        if (T[key] !== undefined) el.textContent = T[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (T[key]) el.setAttribute('placeholder', T[key]);
    });

    // =====================================================
    // 2) لازم مستخدم مسجل + جروب فعلي محدد قبل أي حاجة
    // =====================================================
    const myEmail = localStorage.getItem('cz_verified_email');
    const groupId = localStorage.getItem('cz_active_group_id') || '';

    if (!myEmail || !groupId) {
        window.location.href = 'MainActivity.html';
        return;
    }
    const myEmailLower = myEmail.toLowerCase();

    const convNameEl = document.getElementById('convName');
    const convStatusEl = document.getElementById('convStatus');
    const convAvatarEl = document.getElementById('convAvatar');
    const groupAvatarInitialEl = document.getElementById('groupAvatarInitial');
    const messagesEl = document.getElementById('convMessages');

    function displayInitial(name) {
        const v = (name || T.unknown_group).trim();
        return v ? v.charAt(0).toUpperCase() : '؟';
    }

    // =====================================================
    // توست صغير
    // =====================================================
    let toastTimer = null;
    function showToast(message) {
        let toastEl = document.getElementById('czToast');
        if (!toastEl) {
            toastEl = document.createElement('div');
            toastEl.id = 'czToast';
            toastEl.className = 'cz-toast';
            document.body.appendChild(toastEl);
        }
        toastEl.textContent = message;
        toastEl.classList.add('show');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
    }

    // =====================================================
    // 3) زرار الرجوع
    // =====================================================
    const backBtn = document.getElementById('convBackBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = 'MainActivity.html';
        });
    }

    // =====================================================
    // 4) بيانات الجروب — بتتحدث لايف (اسم/صورة/أعضاء بيتغيروا فورًا
    //    عند الكل لو أي عضو غيّرهم)
    // =====================================================
    const groupDocRef = doc(db, 'groups', groupId);
    let groupData = { name: '', photoURL: '', members: [], memberEmails: [], ownerUid: '' };
    let memberProfiles = new Map(); // uid -> { email, name, photoURL }

    function renderGroupHeader() {
        if (convNameEl) convNameEl.textContent = groupData.name || T.unknown_group;
        if (convAvatarEl) {
            let img = convAvatarEl.querySelector('.conv-avatar-img');
            if (groupData.photoURL) {
                if (!img) {
                    img = document.createElement('img');
                    img.className = 'conv-avatar-img';
                    img.alt = '';
                    convAvatarEl.appendChild(img);
                }
                img.src = groupData.photoURL;
                if (groupAvatarInitialEl) groupAvatarInitialEl.style.display = 'none';
            } else {
                if (img) img.remove();
                if (groupAvatarInitialEl) {
                    groupAvatarInitialEl.style.display = '';
                    groupAvatarInitialEl.textContent = displayInitial(groupData.name);
                }
            }
        }
        populateGroupInfoSheet();
    }

    // =====================================================
    // 4.1) قايمة التلت نقط
    // =====================================================
    const convMenuBtn = document.getElementById('convMenuBtn');
    const convSidebarMenu = document.getElementById('convSidebarMenu');
    const convSidebarOverlay = document.getElementById('convSidebarOverlay');

    function openConvMenu() {
        if (!convSidebarMenu || !convSidebarOverlay || !convMenuBtn) return;
        const isRtl = document.documentElement.dir === 'rtl';
        const btnRect = convMenuBtn.getBoundingClientRect();
        convSidebarMenu.style.top = (btnRect.bottom + 8) + 'px';
        if (isRtl) {
            convSidebarMenu.style.right = (window.innerWidth - btnRect.right) + 'px';
            convSidebarMenu.style.left = 'auto';
        } else {
            convSidebarMenu.style.left = btnRect.left + 'px';
            convSidebarMenu.style.right = 'auto';
        }
        convSidebarMenu.classList.add('open');
        convSidebarOverlay.classList.add('open');
    }
    function closeConvMenu() {
        if (!convSidebarMenu || !convSidebarOverlay) return;
        convSidebarMenu.classList.remove('open');
        convSidebarOverlay.classList.remove('open');
    }
    if (convMenuBtn) {
        convMenuBtn.addEventListener('click', () => {
            if (convSidebarMenu && convSidebarMenu.classList.contains('open')) closeConvMenu();
            else openConvMenu();
        });
    }
    if (convSidebarOverlay) convSidebarOverlay.addEventListener('click', closeConvMenu);

    function openSheet(id) {
        const overlay = document.getElementById(id);
        if (overlay) overlay.classList.add('open');
    }
    function closeSheet(id) {
        const overlay = document.getElementById(id);
        if (overlay) overlay.classList.remove('open');
    }
    document.querySelectorAll('[data-close-sheet]').forEach(el => {
        el.addEventListener('click', () => closeSheet(el.dataset.closeSheet));
    });
    document.querySelectorAll('.sheet-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeSheet(overlay.id);
        });
    });

    const convOpenBubbleColors = document.getElementById('convOpenBubbleColors');
    const convOpenFont = document.getElementById('convOpenFont');
    const convOpenInfo = document.getElementById('convOpenInfo');
    if (convOpenBubbleColors) {
        convOpenBubbleColors.addEventListener('click', () => { closeConvMenu(); openSheet('sheet-bubble-colors'); });
    }
    if (convOpenFont) {
        convOpenFont.addEventListener('click', () => { closeConvMenu(); openSheet('sheet-font'); });
    }
    if (convOpenInfo) {
        convOpenInfo.addEventListener('click', () => { closeConvMenu(); openSheet('sheet-account-info'); });
    }
    const convIdentityEl = document.getElementById('convIdentity');
    if (convIdentityEl) {
        convIdentityEl.addEventListener('click', () => openSheet('sheet-account-info'));
    }

    // =====================================================
    // Fullscreen photo viewer (زي الأصلي بالظبط)
    // =====================================================
    const photoViewerOverlay = document.getElementById('photoViewerOverlay');
    const photoViewerImg = document.getElementById('photoViewerImg');
    const photoViewerClose = document.getElementById('photoViewerClose');
    function openPhotoViewer(photoURL) {
        if (!photoViewerOverlay || !photoViewerImg || !photoURL) return;
        photoViewerImg.src = photoURL;
        photoViewerOverlay.classList.add('open');
    }
    function closePhotoViewer() {
        if (!photoViewerOverlay) return;
        photoViewerOverlay.classList.remove('open');
    }
    if (photoViewerClose) photoViewerClose.addEventListener('click', closePhotoViewer);
    if (photoViewerOverlay) {
        photoViewerOverlay.addEventListener('click', (e) => {
            if (e.target === photoViewerOverlay) closePhotoViewer();
        });
    }
    function attachLongPressToViewPhoto(el, getPhotoURL) {
        if (!el) return;
        const LP_MS = 450;
        let timer = null, startX = 0, startY = 0;
        function cancel() { if (timer) clearTimeout(timer); timer = null; }
        function start(x, y) {
            startX = x; startY = y;
            cancel();
            timer = setTimeout(() => {
                const url = getPhotoURL();
                if (url) {
                    if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }
                    openPhotoViewer(url);
                }
            }, LP_MS);
        }
        el.addEventListener('touchstart', (e) => { const t = e.touches[0]; start(t.clientX, t.clientY); }, { passive: true });
        el.addEventListener('touchmove', (e) => {
            const t = e.touches[0];
            if (Math.abs(t.clientX - startX) > 10 || Math.abs(t.clientY - startY) > 10) cancel();
        }, { passive: true });
        el.addEventListener('touchend', cancel);
        el.addEventListener('mousedown', (e) => start(e.clientX, e.clientY));
        el.addEventListener('mouseup', cancel);
        el.addEventListener('mouseleave', cancel);
        el.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    attachLongPressToViewPhoto(convAvatarEl, () => groupData.photoURL);
    attachLongPressToViewPhoto(document.getElementById('accountInfoAvatar'), () => groupData.photoURL);

    // =====================================================
    // 4.2) شيت "معلومات الجروب" — صورة + اسم + عدد الأعضاء + قائمتهم
    // =====================================================
    const accountInfoAvatar = document.getElementById('accountInfoAvatar');
    const groupInfoAvatarInitial = document.getElementById('groupInfoAvatarInitial');
    const accountInfoName = document.getElementById('accountInfoName');
    const groupInfoMemberCount = document.getElementById('groupInfoMemberCount');
    const groupMembersScroll = document.getElementById('groupMembersScroll');

    function populateGroupInfoSheet() {
        if (accountInfoName) accountInfoName.textContent = groupData.name || T.unknown_group;
        if (groupInfoMemberCount) {
            const n = (groupData.members || []).length;
            groupInfoMemberCount.textContent = `${n} ${T.group_members_count}`;
        }
        if (accountInfoAvatar) {
            let img = accountInfoAvatar.querySelector('.account-info-avatar-img');
            if (groupData.photoURL) {
                if (!img) {
                    img = document.createElement('img');
                    img.className = 'account-info-avatar-img';
                    img.alt = '';
                    accountInfoAvatar.appendChild(img);
                }
                img.src = groupData.photoURL;
                if (groupInfoAvatarInitial) groupInfoAvatarInitial.style.display = 'none';
            } else {
                if (img) img.remove();
                if (groupInfoAvatarInitial) {
                    groupInfoAvatarInitial.style.display = '';
                    groupInfoAvatarInitial.textContent = displayInitial(groupData.name);
                }
            }
        }
        renderGroupMembersList();
    }

    function renderGroupMembersList() {
        if (!groupMembersScroll) return;
        groupMembersScroll.innerHTML = '';
        const uids = groupData.members || [];
        uids.forEach((uid) => {
            const profile = memberProfiles.get(uid) || { email: '', name: T.unknown_group, photoURL: '' };
            const row = document.createElement('div');
            row.className = 'group-member-row';
            const initial = displayInitial(profile.name);
            const avatarInner = profile.photoURL
                ? `<img src="${profile.photoURL}" alt="">`
                : initial;
            const isOwner = uid === groupData.ownerUid;
            row.innerHTML = `
                <div class="group-member-avatar">${avatarInner}</div>
                <div class="group-member-text">
                    <div class="group-member-name">${(profile.name || '').replace(/</g, '&lt;')}</div>
                    <div class="group-member-email">${(profile.email || '').replace(/</g, '&lt;')}</div>
                </div>
                ${isOwner ? `<span class="group-member-owner-badge">${T.group_owner_badge}</span>` : ''}
            `;
            groupMembersScroll.appendChild(row);
        });
    }

    // =====================================================
    // 4.3) تخصيص لون الفقاعات — تابع للشخص عالميًا زي الشات العادي
    //      بالظبط (users/{email}.bubbleColor)، بس هنا "الطرف التاني"
    //      مش شخص واحد ثابت؛ كل عضو بيفضل بلونه هو في رسايله. اللي
    //      ممكن أغيّره من هنا هو لون فقاعتي أنا بس + لون الصح الزرقاء
    //      (خاص بالجروب ده، محلي).
    // =====================================================
    const convShellEl = document.querySelector('.conv-shell');
    const BUBBLE_TICK_KEY = 'cz_bubble_tick_group_' + groupId;

    function isLightMode() { return document.body.classList.contains('theme-white'); }
    function DEFAULT_MINE_COLOR() { return isLightMode() ? '#DCF8C6' : '#005C4B'; }
    function DEFAULT_THEIRS_COLOR() { return isLightMode() ? '#E9EAEB' : '#202C33'; }
    const DEFAULT_TICK_COLOR = '#4FA3FF';

    let myBubbleColor = null;
    let myBubbleColorDark = '1';

    function textColorFor(isDark) { return isDark === '1' ? '#10161A' : '#FFFFFF'; }
    function timeColorFor(isDark) { return isDark === '1' ? 'rgba(16, 22, 26, 0.55)' : 'rgba(255, 255, 255, 0.7)'; }
    function tickColorFor(isDark) { return isDark === '1' ? 'rgba(16, 22, 26, 0.45)' : 'rgba(255, 255, 255, 0.6)'; }

    function isColorDark(hex) {
        const c = hex.replace('#', '');
        const r = parseInt(c.substring(0, 2), 16);
        const g = parseInt(c.substring(2, 4), 16);
        const b = parseInt(c.substring(4, 6), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 150 ? '1' : '0';
    }

    function applyBubbleColors() {
        const tickColor = localStorage.getItem(BUBBLE_TICK_KEY);
        const mineDark = myBubbleColorDark || '1';
        if (!convShellEl) return;
        if (myBubbleColor) {
            convShellEl.style.setProperty('--bubble-mine-bg', myBubbleColor);
            convShellEl.style.setProperty('--bubble-mine-text', textColorFor(mineDark));
            convShellEl.style.setProperty('--bubble-mine-time', timeColorFor(mineDark));
            convShellEl.style.setProperty('--bubble-mine-tick', tickColorFor(mineDark));
        } else {
            convShellEl.style.removeProperty('--bubble-mine-bg');
            convShellEl.style.removeProperty('--bubble-mine-text');
            convShellEl.style.removeProperty('--bubble-mine-time');
            convShellEl.style.removeProperty('--bubble-mine-tick');
        }
        // لون فقاعة "الآخرين" الافتراضي بيتطبق زي ما هو (كل عضو غيره
        // بيتلوّن بلونه هو وقت الرسم في appendMessage عن طريق inline style)
        convShellEl.style.removeProperty('--bubble-theirs-bg');
        convShellEl.style.removeProperty('--bubble-theirs-text');
        convShellEl.style.removeProperty('--bubble-theirs-time');
        if (tickColor) {
            convShellEl.style.setProperty('--bubble-tick-read', tickColor);
        } else {
            convShellEl.style.removeProperty('--bubble-tick-read');
        }
    }

    const bubblePreviewMine = document.getElementById('bubblePreviewMine');
    const bubblePreviewTheirs = document.getElementById('bubblePreviewTheirs');
    const bubblePreviewTick = document.getElementById('bubblePreviewTick');
    const bubbleOptionMineSwatch = document.getElementById('bubbleOptionMineSwatch');
    const bubbleOptionTickSwatch = document.getElementById('bubbleOptionTickSwatch');

    function refreshBubblePreview() {
        const mineColor = myBubbleColor || DEFAULT_MINE_COLOR();
        const theirsColor = DEFAULT_THEIRS_COLOR();
        const tickColor = localStorage.getItem(BUBBLE_TICK_KEY) || DEFAULT_TICK_COLOR;
        const mineDark = myBubbleColorDark || '1';
        if (bubblePreviewMine) {
            bubblePreviewMine.style.background = mineColor;
            bubblePreviewMine.style.color = textColorFor(mineDark);
        }
        if (bubblePreviewTheirs) {
            bubblePreviewTheirs.style.background = theirsColor;
            bubblePreviewTheirs.style.color = textColorFor('1');
        }
        if (bubblePreviewTick) bubblePreviewTick.style.backgroundColor = tickColor;
        if (bubbleOptionMineSwatch) bubbleOptionMineSwatch.style.background = mineColor;
        if (bubbleOptionTickSwatch) bubbleOptionTickSwatch.style.background = tickColor;
    }

    const TARGET_LABELS = { mine: 'bubbles_mine_title', tick: 'bubbles_tick_title' };
    function TARGET_DEFAULT(target) {
        return target === 'mine' ? DEFAULT_MINE_COLOR() : DEFAULT_TICK_COLOR;
    }
    function currentColorFor(target) {
        return target === 'mine' ? myBubbleColor : localStorage.getItem(BUBBLE_TICK_KEY);
    }

    let activeColorTarget = null;
    let pendingEditorColor = null;
    let pendingEditorIsDark = '1';

    const chooseColorTitle = document.getElementById('chooseColorTitle');
    const openColorEditorBtn = document.getElementById('openColorEditorBtn');
    const openColorPresetsBtn = document.getElementById('openColorPresetsBtn');
    const bubbleColorNativePicker = document.getElementById('bubbleColorNativePicker');
    const colorEditorPreviewSwatch = document.getElementById('colorEditorPreviewSwatch');
    const editorSaveBtn = document.getElementById('editorSaveBtn');
    const editorCancelBtn = document.getElementById('editorCancelBtn');
    const presetSquareGrid = document.getElementById('presetSquareGrid');
    const presetsSaveBtn = document.getElementById('presetsSaveBtn');
    const presetsCancelBtn = document.getElementById('presetsCancelBtn');
    const unsavedSaveBtn = document.getElementById('unsavedSaveBtn');
    const unsavedDiscardBtn = document.getElementById('unsavedDiscardBtn');
    let pendingPresetChoice = null;

    function openChooseColorFor(target) {
        activeColorTarget = target;
        if (chooseColorTitle) chooseColorTitle.textContent = T[TARGET_LABELS[target]] || '';
        openSheet('sheet-choose-color');
    }
    if (document.getElementById('bubbleOptionMine')) {
        document.getElementById('bubbleOptionMine').addEventListener('click', () => openChooseColorFor('mine'));
    }
    if (document.getElementById('bubbleOptionTick')) {
        document.getElementById('bubbleOptionTick').addEventListener('click', () => openChooseColorFor('tick'));
    }

    if (openColorEditorBtn && bubbleColorNativePicker) {
        openColorEditorBtn.addEventListener('click', () => {
            const current = currentColorFor(activeColorTarget) || TARGET_DEFAULT(activeColorTarget);
            bubbleColorNativePicker.value = current;
            bubbleColorNativePicker.click();
        });
        bubbleColorNativePicker.addEventListener('input', (e) => {
            pendingEditorColor = e.target.value;
            pendingEditorIsDark = isColorDark(pendingEditorColor);
            if (colorEditorPreviewSwatch) colorEditorPreviewSwatch.style.background = pendingEditorColor;
            closeSheet('sheet-choose-color');
            openSheet('sheet-color-editor-confirm');
        });
    }

    async function writeMyBubbleColor(color, isDark, isDefault) {
        const userRef = doc(db, 'users', myEmailLower);
        await updateDoc(userRef, {
            bubbleColor: isDefault ? deleteField() : color,
            bubbleColorDark: isDefault ? deleteField() : isDark,
            bubbleColorUpdatedAt: serverTimestamp(),
            bubbleColorViaChatId: groupId
        });
    }

    async function commitColor(target, color, isDark) {
        if (target === 'tick') {
            if (color === TARGET_DEFAULT('tick')) localStorage.removeItem(BUBBLE_TICK_KEY);
            else localStorage.setItem(BUBBLE_TICK_KEY, color);
            applyBubbleColors();
            refreshBubblePreview();
            if (navigator.vibrate) { try { navigator.vibrate([6, 30, 6]); } catch (e) {} }
            return;
        }
        const previousColor = myBubbleColor;
        const previousDark = myBubbleColorDark;
        const isDefault = color === TARGET_DEFAULT('mine');
        myBubbleColor = isDefault ? null : color;
        myBubbleColorDark = isDark;
        applyBubbleColors();
        refreshBubblePreview();
        if (navigator.vibrate) { try { navigator.vibrate([6, 30, 6]); } catch (e) {} }
        try {
            await writeMyBubbleColor(color, isDark, isDefault);
        } catch (e) {
            console.error('فشل حفظ لون الفقاعة:', e);
            myBubbleColor = previousColor;
            myBubbleColorDark = previousDark;
            applyBubbleColors();
            refreshBubblePreview();
        }
    }

    if (editorSaveBtn) {
        editorSaveBtn.addEventListener('click', () => {
            if (activeColorTarget && pendingEditorColor) commitColor(activeColorTarget, pendingEditorColor, pendingEditorIsDark);
            pendingEditorColor = null;
            closeSheet('sheet-color-editor-confirm');
        });
    }
    if (editorCancelBtn) {
        editorCancelBtn.addEventListener('click', () => {
            pendingEditorColor = null;
            closeSheet('sheet-color-editor-confirm');
        });
    }

    function markSelectedPreset(savedColor) {
        if (!presetSquareGrid) return;
        presetSquareGrid.querySelectorAll('.preset-square-option').forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.color === savedColor);
        });
    }
    if (openColorPresetsBtn) {
        openColorPresetsBtn.addEventListener('click', () => {
            const current = currentColorFor(activeColorTarget) || TARGET_DEFAULT(activeColorTarget);
            pendingPresetChoice = null;
            markSelectedPreset(current);
            closeSheet('sheet-choose-color');
            openSheet('sheet-color-presets');
        });
    }
    if (presetSquareGrid) {
        presetSquareGrid.querySelectorAll('.preset-square-option').forEach(opt => {
            opt.addEventListener('click', () => {
                pendingPresetChoice = { color: opt.dataset.color, isDark: opt.dataset.textDark };
                markSelectedPreset(opt.dataset.color);
            });
        });
    }
    if (presetsSaveBtn) {
        presetsSaveBtn.addEventListener('click', () => {
            if (activeColorTarget && pendingPresetChoice) {
                commitColor(activeColorTarget, pendingPresetChoice.color, pendingPresetChoice.isDark);
            }
            pendingPresetChoice = null;
            closeSheet('sheet-color-presets');
        });
    }
    if (presetsCancelBtn) {
        presetsCancelBtn.addEventListener('click', () => {
            pendingPresetChoice = null;
            closeSheet('sheet-color-presets');
        });
    }
    if (unsavedDiscardBtn) unsavedDiscardBtn.addEventListener('click', () => closeSheet('sheet-unsaved-guard'));
    if (unsavedSaveBtn) {
        unsavedSaveBtn.addEventListener('click', () => {
            if (activeColorTarget && pendingEditorColor) commitColor(activeColorTarget, pendingEditorColor, pendingEditorIsDark);
            pendingEditorColor = null;
            closeSheet('sheet-unsaved-guard');
        });
    }

    const bubbleResetBtn = document.getElementById('bubbleResetBtn');
    if (bubbleResetBtn) {
        bubbleResetBtn.addEventListener('click', () => {
            commitColor('mine', DEFAULT_MINE_COLOR(), '1');
            localStorage.removeItem(BUBBLE_TICK_KEY);
            applyBubbleColors();
            refreshBubblePreview();
        });
    }

    // =====================================================
    // 4.4) تخصيص الخط — نفس منطق conversation.js بالظبط (محفوظ عالميًا)
    // =====================================================
    const FONT_KEY = 'cz_chat_font';
    function applyChatFont(fontId) {
        if (!convShellEl) return;
        convShellEl.className = convShellEl.className.replace(/font-\S+/g, '').trim();
        if (fontId && fontId !== 'default') convShellEl.classList.add('font-' + fontId);
    }
    function markSelectedFont(fontId) {
        document.querySelectorAll('.font-option').forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.font === fontId);
        });
    }
    const savedFont = localStorage.getItem(FONT_KEY) || 'default';
    applyChatFont(savedFont);
    markSelectedFont(savedFont);
    document.querySelectorAll('.font-option').forEach(opt => {
        opt.addEventListener('click', () => {
            const fontId = opt.dataset.font;
            localStorage.setItem(FONT_KEY, fontId);
            applyChatFont(fontId);
            markSelectedFont(fontId);
            if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} }
        });
    });

    // =====================================================
    // 5) عرض الرسايل — بابل يمين لرسايلي أنا، شمال لأي حد تاني، مع
    //    اسم صاحب الرسالة فوق كل بابل شمال (زي جروبات واتساب)، ولون
    //    فقاعة كل عضو تابع له هو شخصيًا (bubbleColor بتاعه المحفوظة
    //    عالميًا في users/{email})، مش لون موحّد لكل "الطرف التاني"
    //    زي الشات الفردي.
    // =====================================================
    let messagesById = new Map();
    const TICK_ICON = { unsent: 'tick-unsent', offline: 'tick-offline', unread: 'tick-unread', read: 'tick-read' };

    function formatTime(date) {
        let h = date.getHours();
        const m = date.getMinutes();
        const ampmAr = h >= 12 ? 'م' : 'ص';
        const ampmEn = h >= 12 ? 'PM' : 'AM';
        h = h % 12; if (h === 0) h = 12;
        const mm = m < 10 ? '0' + m : m;
        return isAr ? `${h}:${mm} ${ampmAr}` : `${h}:${mm} ${ampmEn}`;
    }

    function messagePreviewText(msg) {
        if (msg.deleted) return T.deleted_msg_text;
        return (msg.text || '').length > 80 ? msg.text.slice(0, 80) + '…' : (msg.text || '');
    }

    function appendSystemMessage(docId, msg) {
        const row = document.createElement('div');
        row.className = 'msg-row-system';
        row.dataset.msgId = docId;
        const badge = document.createElement('span');
        badge.className = 'msg-row-system-badge';
        badge.textContent = msg.text || '';
        row.appendChild(badge);
        messagesEl.appendChild(row);
    }

    function appendMessage(docId, msg, myEmailLowerLocal) {
        const isMine = (msg.senderEmail || '').toLowerCase() === myEmailLowerLocal;

        const row = document.createElement('div');
        row.className = 'msg-row ' + (isMine ? 'from-me' : 'from-them');
        row.dataset.msgId = docId;

        const inner = document.createElement('div');
        inner.className = 'msg-row-inner';

        const selectDot = document.createElement('div');
        selectDot.className = 'msg-row-select-dot';
        selectDot.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        inner.appendChild(selectDot);

        const replyIcon = document.createElement('div');
        replyIcon.className = 'msg-row-reply-icon';
        replyIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>';
        row.appendChild(replyIcon);

        const bubble = document.createElement('div');
        bubble.className = 'bubble ' + (isMine ? 'bubble-right' : 'bubble-left');

        // لون الفقاعة الخاص بصاحب الرسالة (لو مش أنا) — بيتطبق مباشرة
        // كـ inline style عشان كل عضو يفضل بلونه الشخصي هو، مش لون
        // موحّد لكل "الطرف التاني" زي الشات الفردي
        if (!isMine) {
            const senderProfile = memberProfiles.get(msg.senderUid) || {};
            if (senderProfile.bubbleColor) {
                const dark = senderProfile.bubbleColorDark || '1';
                bubble.style.background = senderProfile.bubbleColor;
                bubble.style.color = textColorFor(dark);
            }
        }

        // اسم صاحب الرسالة فوق البابل (بس للرسايل اللي مش بتاعتي)
        if (!isMine) {
            const senderProfile = memberProfiles.get(msg.senderUid);
            const senderName = senderProfile ? senderProfile.name : displayNameFromEmailLocal(msg.senderEmail);
            const nameEl = document.createElement('div');
            nameEl.className = 'bubble-sender-name';
            nameEl.textContent = senderName;
            bubble.appendChild(nameEl);
        }

        if (msg.replyTo && msg.replyTo.text) {
            const quote = document.createElement('div');
            quote.className = 'bubble-reply-quote';
            const qName = document.createElement('span');
            qName.className = 'bubble-reply-quote-name';
            qName.textContent = msg.replyTo.senderName || '';
            const qText = document.createElement('span');
            qText.className = 'bubble-reply-quote-text';
            qText.textContent = msg.replyTo.deleted ? T.deleted_msg_text : msg.replyTo.text;
            if (msg.replyTo.senderName) quote.appendChild(qName);
            quote.appendChild(qText);
            bubble.appendChild(quote);
        }

        const textEl = document.createElement('p');
        textEl.className = 'bubble-text' + (msg.deleted ? ' deleted' : '');
        textEl.textContent = msg.deleted ? T.deleted_msg_text : msg.text;
        bubble.appendChild(textEl);

        const meta = document.createElement('div');
        meta.className = 'bubble-meta';
        const timeEl = document.createElement('span');
        timeEl.className = 'bubble-time';
        const time = msg.createdAt && msg.createdAt.toDate ? msg.createdAt.toDate() : new Date();
        timeEl.textContent = formatTime(time);
        meta.appendChild(timeEl);

        if (isMine) {
            const tick = document.createElement('span');
            const status = msg.status || 'unread';
            tick.className = 'bubble-tick ' + (TICK_ICON[status] || TICK_ICON.unread);
            meta.appendChild(tick);
        }

        bubble.appendChild(meta);
        inner.appendChild(bubble);
        row.appendChild(inner);
        messagesEl.appendChild(row);

        if (!msg.deleted) attachMessageInteractions(row, docId, msg, isMine);
    }

    function displayNameFromEmailLocal(email) {
        if (!email) return T.unknown_group;
        const namePart = email.split('@')[0];
        return namePart.charAt(0).toUpperCase() + namePart.slice(1);
    }

    function scrollToBottom(smooth) {
        messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    }

    function renderEmptyState() {
        messagesEl.innerHTML = '';
        const empty = document.createElement('div');
        empty.className = 'conv-empty';
        empty.textContent = isAr ? 'مفيش رسائل لسه، ابدأ المحادثة 👋' : 'No messages yet, say hi 👋';
        messagesEl.appendChild(empty);
    }

    // =====================================================
    // وضع التحديد المتعدد (نفس منطق الشات الفردي بالظبط)
    // =====================================================
    let selectModeOn = false;
    const selectedMessages = new Map();
    const convTopbarSelect = document.getElementById('convTopbarSelect');
    const convSelectCancelBtn = document.getElementById('convSelectCancelBtn');
    const convSelectCount = document.getElementById('convSelectCount');
    const convSelectDeleteBtn = document.getElementById('convSelectDeleteBtn');

    function updateSelectCountUI() {
        const n = selectedMessages.size;
        if (convSelectCount) convSelectCount.textContent = String(n);
        if (convSelectDeleteBtn) convSelectDeleteBtn.disabled = n === 0;
    }
    function enterSelectMode(firstDocId, firstIsMine) {
        selectModeOn = true;
        selectedMessages.clear();
        document.body.classList.add('select-mode-on');
        if (firstDocId) {
            selectedMessages.set(firstDocId, { isMine: firstIsMine });
            const row = messagesEl.querySelector(`.msg-row[data-msg-id="${firstDocId}"]`);
            if (row) row.classList.add('multi-selected');
        }
        updateSelectCountUI();
    }
    function exitSelectMode() {
        selectModeOn = false;
        selectedMessages.clear();
        document.body.classList.remove('select-mode-on');
        messagesEl.querySelectorAll('.msg-row.multi-selected').forEach(r => r.classList.remove('multi-selected'));
    }
    function toggleMessageSelection(row, docId, isMine) {
        if (selectedMessages.has(docId)) {
            selectedMessages.delete(docId);
            row.classList.remove('multi-selected');
        } else {
            selectedMessages.set(docId, { isMine });
            row.classList.add('multi-selected');
        }
        updateSelectCountUI();
    }
    if (convSelectCancelBtn) convSelectCancelBtn.addEventListener('click', exitSelectMode);

    async function deleteSelectedMessages() {
        const mineIds = [];
        const theirsIds = [];
        selectedMessages.forEach((info, id) => {
            if (info.isMine) mineIds.push(id); else theirsIds.push(id);
        });
        try {
            if (mineIds.length) {
                for (let i = 0; i < mineIds.length; i += 500) {
                    const batch = writeBatch(db);
                    mineIds.slice(i, i + 500).forEach((id) => {
                        batch.delete(doc(db, 'groups', groupId, 'messages', id));
                    });
                    await batch.commit();
                }
            }
            if (theirsIds.length && myUid) {
                for (const id of theirsIds) {
                    await updateDoc(doc(db, 'groups', groupId, 'messages', id), {
                        deletedFor: arrayUnion(myUid)
                    });
                }
            }
            showToast(T.msg_deleted_toast);
        } catch (e) {
            console.error('فشل حذف الرسايل المحددة:', e);
        } finally {
            exitSelectMode();
        }
    }
    const deleteSelectedConfirmBtn = document.getElementById('deleteSelectedConfirmBtn');
    if (convSelectDeleteBtn) {
        convSelectDeleteBtn.addEventListener('click', () => {
            if (selectedMessages.size === 0) return;
            openSheet('sheet-delete-selected');
        });
    }
    if (deleteSelectedConfirmBtn) {
        deleteSelectedConfirmBtn.addEventListener('click', () => {
            closeSheet('sheet-delete-selected');
            deleteSelectedMessages();
        });
    }

    // =====================================================
    // ريبلاي بالسحب + ضغطة مطولة (نفس منطق الشات الفردي بالظبط)
    // =====================================================
    const SWIPE_REPLY_THRESHOLD = 46;
    const LONG_PRESS_MSG_MS = 420;

    function attachMessageInteractions(row, docId, msg, isMine) {
        const inner = row.querySelector('.msg-row-inner');

        row.addEventListener('click', (e) => {
            if (!selectModeOn) return;
            e.preventDefault();
            e.stopPropagation();
            toggleMessageSelection(row, docId, isMine);
        });

        let touchStartX = 0, touchStartY = 0, dragging = false, currentDx = 0;
        row.addEventListener('touchstart', (e) => {
            if (selectModeOn) return;
            const t0 = e.touches[0];
            touchStartX = t0.clientX; touchStartY = t0.clientY;
            dragging = false; currentDx = 0;
        }, { passive: true });
        row.addEventListener('touchmove', (e) => {
            const t0 = e.touches[0];
            const dx = t0.clientX - touchStartX;
            const dy = t0.clientY - touchStartY;
            if (!dragging && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) dragging = true;
            if (dragging) {
                const clamped = Math.max(-70, Math.min(70, dx));
                currentDx = clamped;
                inner.style.transform = `translateX(${clamped}px)`;
                row.classList.toggle('swiping', Math.abs(clamped) > 14);
                if (Math.abs(clamped) > 10) e.preventDefault();
            }
        }, { passive: false });
        row.addEventListener('touchend', () => {
            if (!selectModeOn && dragging && Math.abs(currentDx) >= SWIPE_REPLY_THRESHOLD) {
                if (navigator.vibrate) { try { navigator.vibrate(10); } catch (e) {} }
                startReply(docId, msg, isMine);
            }
            inner.style.transform = '';
            row.classList.remove('swiping');
            dragging = false; currentDx = 0;
        });
        row.addEventListener('touchcancel', () => {
            inner.style.transform = '';
            row.classList.remove('swiping');
            dragging = false; currentDx = 0;
        });

        let pressTimer = null;
        function cancelPress() { if (pressTimer) clearTimeout(pressTimer); pressTimer = null; }
        row.addEventListener('touchstart', () => {
            if (selectModeOn) return;
            pressTimer = setTimeout(() => {
                if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }
                openMsgCtxMenu(row, docId, msg, isMine);
            }, LONG_PRESS_MSG_MS);
        }, { passive: true });
        row.addEventListener('touchmove', cancelPress, { passive: true });
        row.addEventListener('touchend', cancelPress);
        row.addEventListener('touchcancel', cancelPress);
        row.addEventListener('contextmenu', (e) => {
            if (selectModeOn) { e.preventDefault(); return; }
            e.preventDefault();
            openMsgCtxMenu(row, docId, msg, isMine);
        });
        let mouseTimer = null;
        row.addEventListener('mousedown', () => {
            if (selectModeOn) return;
            mouseTimer = setTimeout(() => openMsgCtxMenu(row, docId, msg, isMine), LONG_PRESS_MSG_MS);
        });
        row.addEventListener('mouseup', () => { if (mouseTimer) clearTimeout(mouseTimer); });
        row.addEventListener('mouseleave', () => { if (mouseTimer) clearTimeout(mouseTimer); });
    }

    // ===== قايمة رد/حذف الخاصة بالرسالة (بدون "توجيه" في الجروبات) =====
    const msgCtxOverlay = document.getElementById('msgCtxOverlay');
    const msgCtxMenu = document.getElementById('msgCtxMenu');
    const msgCtxReply = document.getElementById('msgCtxReply');
    const msgCtxCopy = document.getElementById('msgCtxCopy');
    const msgCtxSelect = document.getElementById('msgCtxSelect');
    const msgCtxDelete = document.getElementById('msgCtxDelete');
    let ctxMsgId = null, ctxMsgData = null, ctxMsgIsMine = false;

    function openMsgCtxMenu(row, docId, msg, isMine) {
        ctxMsgId = docId; ctxMsgData = msg; ctxMsgIsMine = isMine;
        document.querySelectorAll('.msg-row.selected').forEach(r => r.classList.remove('selected'));
        row.classList.add('selected');
        if (!msgCtxMenu || !msgCtxOverlay) return;

        const bubbleEl = row.querySelector('.bubble') || row;
        const rect = bubbleEl.getBoundingClientRect();
        const isRtl = document.documentElement.dir === 'rtl';

        msgCtxMenu.style.visibility = 'hidden';
        msgCtxMenu.style.top = '0px'; msgCtxMenu.style.left = '0px'; msgCtxMenu.style.right = 'auto';
        msgCtxMenu.classList.add('open');
        const menuRect = msgCtxMenu.getBoundingClientRect();
        const menuWidth = menuRect.width || 230;
        const menuHeight = menuRect.height || 180;
        msgCtxMenu.classList.remove('open');
        msgCtxMenu.style.visibility = '';

        const margin = 10;
        let top = rect.bottom + 6;
        if (top + menuHeight > window.innerHeight - margin) top = rect.top - menuHeight - 6;
        top = Math.min(Math.max(margin, top), window.innerHeight - menuHeight - margin);
        msgCtxMenu.style.top = top + 'px';

        const centerX = rect.left + rect.width / 2;
        let leftPos = Math.min(Math.max(margin, centerX - menuWidth / 2), window.innerWidth - menuWidth - margin);
        if (isRtl) { msgCtxMenu.style.right = (window.innerWidth - leftPos - menuWidth) + 'px'; msgCtxMenu.style.left = 'auto'; }
        else { msgCtxMenu.style.left = leftPos + 'px'; msgCtxMenu.style.right = 'auto'; }
        msgCtxMenu.classList.add('open');
        msgCtxOverlay.classList.add('open');
    }
    function closeMsgCtxMenu() {
        if (msgCtxMenu) msgCtxMenu.classList.remove('open');
        if (msgCtxOverlay) msgCtxOverlay.classList.remove('open');
        document.querySelectorAll('.msg-row.selected').forEach(r => r.classList.remove('selected'));
    }
    if (msgCtxOverlay) msgCtxOverlay.addEventListener('click', closeMsgCtxMenu);
    if (msgCtxReply) {
        msgCtxReply.addEventListener('click', () => {
            const id = ctxMsgId, msg = ctxMsgData, mine = ctxMsgIsMine;
            closeMsgCtxMenu();
            if (id && msg) startReply(id, msg, mine);
        });
    }
    if (msgCtxCopy) {
        msgCtxCopy.addEventListener('click', () => {
            const msg = ctxMsgData;
            closeMsgCtxMenu();
            if (!msg || msg.deleted) return;
            copyTextToClipboard(msg.text || '');
        });
    }
    if (msgCtxSelect) {
        msgCtxSelect.addEventListener('click', () => {
            const id = ctxMsgId, mine = ctxMsgIsMine;
            closeMsgCtxMenu();
            enterSelectMode(id, mine);
        });
    }
    if (msgCtxDelete) {
        msgCtxDelete.addEventListener('click', () => {
            closeMsgCtxMenu();
            openDeleteMsgSheet(ctxMsgId, ctxMsgData, ctxMsgIsMine);
        });
    }

    function copyTextToClipboard(text) {
        if (!text) return;
        const done = () => showToast(T.copied_toast);
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopyText(text, done));
        } else {
            fallbackCopyText(text, done);
        }
    }
    function fallbackCopyText(text, done) {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed'; ta.style.opacity = '0'; ta.style.pointerEvents = 'none';
            document.body.appendChild(ta);
            ta.focus(); ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            done();
        } catch (e) {
            console.error('فشل نسخ الرسالة:', e);
        }
    }

    // =====================================================
    // ريبلاي
    // =====================================================
    const convReplyBar = document.getElementById('convReplyBar');
    const convReplyBarName = document.getElementById('convReplyBarName');
    const convReplyBarPreview = document.getElementById('convReplyBarPreview');
    const convReplyBarClose = document.getElementById('convReplyBarClose');
    let activeReply = null;

    function startReply(docId, msg, isMine) {
        if (msg.deleted) return;
        const senderProfile = !isMine ? memberProfiles.get(msg.senderUid) : null;
        activeReply = {
            id: docId,
            text: msg.text || '',
            senderName: isMine ? T.reply_you : (senderProfile ? senderProfile.name : displayNameFromEmailLocal(msg.senderEmail)),
            isMine
        };
        if (convReplyBarName) convReplyBarName.textContent = activeReply.senderName;
        if (convReplyBarPreview) convReplyBarPreview.textContent = messagePreviewText(msg);
        if (convReplyBar) convReplyBar.classList.add('open');
        textarea.focus();
    }
    function cancelReply() {
        activeReply = null;
        if (convReplyBar) convReplyBar.classList.remove('open');
    }
    if (convReplyBarClose) convReplyBarClose.addEventListener('click', cancelReply);

    // =====================================================
    // حذف رسالة: من عندي بس، أو من عند الجميع (لو رسالتي أنا)
    // =====================================================
    const deleteMsgSheetBody = document.getElementById('deleteMsgSheetBody');
    const deleteMsgForEveryoneBtn = document.getElementById('deleteMsgForEveryoneBtn');
    const deleteMsgForMeBtn = document.getElementById('deleteMsgForMeBtn');
    let deleteTargetId = null;

    function openDeleteMsgSheet(docId, msg, isMine) {
        deleteTargetId = docId;
        if (deleteMsgForEveryoneBtn) deleteMsgForEveryoneBtn.style.display = isMine ? '' : 'none';
        openSheet('sheet-delete-msg');
    }
    async function deleteMessageForMe() {
        const id = deleteTargetId;
        closeSheet('sheet-delete-msg');
        closeMsgCtxMenu();
        if (!id || !myUid) return;
        try {
            await updateDoc(doc(db, 'groups', groupId, 'messages', id), { deletedFor: arrayUnion(myUid) });
            showToast(T.msg_deleted_toast);
        } catch (e) {
            console.error('فشل حذف الرسالة من عندي:', e);
        }
    }
    async function deleteMessageForEveryone() {
        const id = deleteTargetId;
        closeSheet('sheet-delete-msg');
        closeMsgCtxMenu();
        if (!id) return;
        try {
            await updateDoc(doc(db, 'groups', groupId, 'messages', id), { deleted: true, text: '' });
            showToast(T.msg_deleted_toast);
        } catch (e) {
            console.error('فشل حذف الرسالة من عند الجميع:', e);
        }
    }
    if (deleteMsgForMeBtn) deleteMsgForMeBtn.addEventListener('click', deleteMessageForMe);
    if (deleteMsgForEveryoneBtn) deleteMsgForEveryoneBtn.addEventListener('click', deleteMessageForEveryone);

    // =====================================================
    // بار الكتابة
    // =====================================================
    const textarea = document.getElementById('convTextarea');
    const inputBar = document.getElementById('convInputBar');
    const sendBtn = document.getElementById('convSendBtn');

    function autoResize() {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }
    function updateSendVisibility() {
        const hasText = textarea.value.trim().length > 0;
        inputBar.classList.toggle('has-text', hasText);
    }

    // ===== حالة "بيكتب الآن" — typing.{myUid}=true جوه مستند الجروب،
    // وبنعرض "فلان بيكتب الآن" أو "كذا شخص بيكتبوا الآن" لو أكتر من
    // عضو واحد بيكتب في نفس الوقت =====
    const TYPING_IDLE_MS = 2500;
    let typingIdleTimer = null;
    let iAmMarkedTyping = false;

    function setTypingState(isTyping) {
        if (!myUid) return;
        if (isTyping === iAmMarkedTyping) return;
        iAmMarkedTyping = isTyping;
        updateDoc(groupDocRef, { ['typing.' + myUid]: isTyping }).catch(() => {
            if (isTyping) iAmMarkedTyping = false;
        });
    }
    function pingTyping() {
        setTypingState(true);
        if (typingIdleTimer) clearTimeout(typingIdleTimer);
        typingIdleTimer = setTimeout(() => setTypingState(false), TYPING_IDLE_MS);
    }
    textarea.addEventListener('input', () => {
        autoResize();
        updateSendVisibility();
        if (textarea.value.trim().length > 0) pingTyping();
        else { if (typingIdleTimer) clearTimeout(typingIdleTimer); setTypingState(false); }
    });
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    updateSendVisibility();

    function updateTypingStatusUI(typingMap) {
        const others = Object.keys(typingMap || {}).filter(uid => uid !== myUid && typingMap[uid]);
        if (!others.length) {
            convStatusEl.textContent = '';
            convStatusEl.classList.remove('conv-status-typing');
            return;
        }
        convStatusEl.classList.add('conv-status-typing');
        if (others.length === 1) {
            const profile = memberProfiles.get(others[0]);
            const name = profile ? profile.name : T.unknown_group;
            convStatusEl.textContent = T.typing_status_one.replace('{name}', name);
        } else {
            convStatusEl.textContent = T.typing_status_many;
        }
    }

    // =====================================================
    // 6) الاتصال الفعلي بـ Firestore
    // =====================================================
    let myUid = null;
    let unsubscribeMessages = null;

    async function loadMemberProfiles(uids, emails) {
        const results = await Promise.all(emails.map(async (email) => {
            try {
                const snap = await getDoc(doc(db, 'users', email.toLowerCase()));
                if (snap.exists()) {
                    const data = snap.data();
                    return {
                        uid: data.uid,
                        email: email.toLowerCase(),
                        name: data.name || displayNameFromEmailLocal(email),
                        photoURL: (data.hidePhotoFromOthers !== true && data.photoURL) ? data.photoURL : '',
                        bubbleColor: data.bubbleColor || null,
                        bubbleColorDark: data.bubbleColorDark || '1'
                    };
                }
            } catch (e) {
                console.error('فشل جلب بيانات عضو:', email, e);
            }
            return { uid: null, email: email.toLowerCase(), name: displayNameFromEmailLocal(email), photoURL: '', bubbleColor: null, bubbleColorDark: '1' };
        }));
        memberProfiles = new Map();
        results.forEach((p) => { if (p.uid) memberProfiles.set(p.uid, p); });

        const me = memberProfiles.get(myUid);
        if (me) {
            myBubbleColor = me.bubbleColor;
            myBubbleColorDark = me.bubbleColorDark;
            applyBubbleColors();
            refreshBubblePreview();
        }
    }

    async function waitUntilIAmMember(maxTries) {
        maxTries = maxTries || 10;
        for (let i = 0; i < maxTries; i++) {
            try {
                const snap = await getDoc(groupDocRef);
                if (snap.exists()) {
                    const data = snap.data();
                    if (data.members && data.members.includes(myUid)) return true;
                }
            } catch (e) {}
            await new Promise(res => setTimeout(res, 300));
        }
        console.error('لم يتم التأكد من عضويتي في الجروب بعد عدة محاولات.');
        return false;
    }

    function updateStatusWithRetry(docRef, tries) {
        tries = tries || 0;
        updateDoc(docRef, { status: 'read' }).catch((err) => {
            if (tries < 3) {
                setTimeout(() => updateStatusWithRetry(docRef, tries + 1), 400);
            } else {
                console.error('فشل تحديث حالة الرسالة إلى read بعد عدة محاولات:', err);
            }
        });
    }

    function markIncomingMessagesAsRead(docs) {
        const myHideReceipts = window.CZPrivacy && window.CZPrivacy.areReadReceiptsHidden
            ? window.CZPrivacy.areReadReceiptsHidden()
            : false;
        if (myHideReceipts) return;
        docs.forEach(d => {
            const data = d.data();
            const isFromOther = (data.senderEmail || '').toLowerCase() !== myEmailLower;
            const needsUpdate = data.status === 'unread';
            if (isFromOther && needsUpdate) updateStatusWithRetry(d.ref);
        });
    }

    async function initGroup() {
        const user = await ensureAuthenticated();
        myUid = user.uid;

        const groupSnap = await getDoc(groupDocRef);
        if (!groupSnap.exists()) {
            showToast(isAr ? 'الجروب ده مش موجود' : "This group doesn't exist");
            setTimeout(() => { window.location.href = 'MainActivity.html'; }, 1200);
            return;
        }
        const data = groupSnap.data();

        // لو أنا مش عضو أصلاً (رابط اتشارك أو حالة غير متوقعة)، منكملش
        if (!data.members || !data.members.includes(myUid)) {
            showToast(isAr ? 'انت مش عضو في الجروب ده' : "You're not a member of this group");
            setTimeout(() => { window.location.href = 'MainActivity.html'; }, 1200);
            return;
        }

        groupData = {
            name: data.name || '',
            photoURL: data.photoURL || '',
            members: data.members || [],
            memberEmails: data.memberEmails || [],
            ownerUid: data.ownerUid || ''
        };
        renderGroupHeader();
        await loadMemberProfiles(groupData.members, groupData.memberEmails);
        renderGroupHeader();

        // تحديث لايف لمستند الجروب نفسه (اسم/صورة/أعضاء/حالة الكتابة)
        onSnapshot(groupDocRef, (snap) => {
            if (!snap.exists()) return;
            const d = snap.data();
            groupData = {
                name: d.name || '',
                photoURL: d.photoURL || '',
                members: d.members || [],
                memberEmails: d.memberEmails || [],
                ownerUid: d.ownerUid || ''
            };
            renderGroupHeader();
            updateTypingStatusUI(d.typing || {});
            // لو اتضاف عضو جديد مش عندنا بروفايله لسه، نجيبه
            const missingEmail = groupData.memberEmails.find((email, idx) => {
                const uid = groupData.members[idx];
                return uid && !memberProfiles.has(uid);
            });
            if (missingEmail) {
                loadMemberProfiles(groupData.members, groupData.memberEmails).then(renderGroupHeader);
            }
        }, (err) => {
            console.error('فشل الاستماع لمستند الجروب:', err);
        });

        // الاستماع اللحظي للرسايل
        const messagesRef = collection(db, 'groups', groupId, 'messages');
        const q = query(messagesRef, orderBy('createdAt', 'asc'));

        unsubscribeMessages = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs;
            const visibleDocs = docs.filter(d => {
                const data = d.data();
                const deletedFor = data.deletedFor || [];
                return !deletedFor.includes(myUid);
            });

            messagesById = new Map(visibleDocs.map(d => [d.id, d.data()]));

            if (!visibleDocs.length) {
                renderEmptyState();
                return;
            }
            messagesEl.innerHTML = '';
            visibleDocs.forEach(d => {
                const data = d.data();
                if (data.type === 'system') {
                    appendSystemMessage(d.id, data);
                    return;
                }
                if (data.replyTo && data.replyTo.id) {
                    const original = messagesById.get(data.replyTo.id);
                    if (original) {
                        const originalIsMine = (original.senderEmail || '').toLowerCase() === myEmailLower;
                        const originalProfile = !originalIsMine ? memberProfiles.get(original.senderUid) : null;
                        data.replyTo.senderName = originalIsMine ? T.reply_you : (originalProfile ? originalProfile.name : displayNameFromEmailLocal(original.senderEmail));
                        data.replyTo.deleted = !!original.deleted;
                    }
                }
                appendMessage(d.id, data, myEmailLower);
            });
            scrollToBottom(false);

            if (selectModeOn) {
                const stillPresent = new Set(visibleDocs.map(d => d.id));
                [...selectedMessages.keys()].forEach((id) => {
                    if (!stillPresent.has(id)) { selectedMessages.delete(id); return; }
                    const row = messagesEl.querySelector(`.msg-row[data-msg-id="${id}"]`);
                    if (row) row.classList.add('multi-selected');
                });
                updateSelectCountUI();
            }

            markIncomingMessagesAsRead(visibleDocs);
        }, (err) => {
            console.error('فشل الاستماع لرسايل الجروب:', err);
        });
    }

    function sendMessage() {
        const text = textarea.value.trim();
        if (!text || !myUid) return;

        textarea.value = '';
        autoResize();
        updateSendVisibility();
        if (typingIdleTimer) clearTimeout(typingIdleTimer);
        setTypingState(false);

        const payload = {
            senderUid: myUid,
            senderEmail: myEmail,
            text,
            createdAt: serverTimestamp(),
            status: 'unread'
        };
        if (activeReply) {
            payload.replyTo = {
                id: activeReply.id,
                text: activeReply.text.length > 120 ? activeReply.text.slice(0, 120) : activeReply.text
            };
        }

        const messagesRef = collection(db, 'groups', groupId, 'messages');
        addDoc(messagesRef, payload).then(() => {
            if (navigator.vibrate) { try { navigator.vibrate(6); } catch (e) {} }
        }).catch((err) => {
            console.error('فشل إرسال الرسالة:', err);
        });

        cancelReply();
    }

    sendBtn.addEventListener('click', sendMessage);

    initGroup().catch((err) => {
        console.error('فشل تهيئة الجروب. الكود:', err && err.code, '— الرسالة:', err && err.message, err);
    });

    window.addEventListener('unload', () => {
        if (unsubscribeMessages) unsubscribeMessages();
        setTypingState(false);
    });
})();

