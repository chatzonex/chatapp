// =====================================================
// ChatZone Ai — منطق صفحة شات الذكاء الاصطناعي
// بيتكلم مع Cloudflare Worker (اللي بيخبي مفتاح Groq API)
// بدل ما يتكلم مع Firestore زي شات الأشخاص العادي.
// كل حاجة (رسايل، ألوان الفقاعات) متخزنة محليًا بس (localStorage).
// =====================================================

// ⚠️ غيّر الرابط ده لو غيّرت اسم الـ Worker بتاعك على Cloudflare
const AI_WORKER_URL = "https://chatzone-ai.m7ashr213.workers.dev/";

// اسم الموديل المستخدم (لازم يتطابق مع اللي مكتوب في كود الـ Worker)
const AI_MODEL = "openai/gpt-oss-120b";

(function () {
    // =====================================================
    // 1) احترام الثيم واللغة والـ Liquid Glass المحفوظين، زي باقي الشاشات
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

    // =====================================================
    // 2) ترجمة واجهة الصفحة بالكامل (تبع لغة التطبيق المحفوظة)
    // =====================================================
    const I18N = {
        ar: {
            status_online: 'متصل الآن',
            status_typing: 'بيكتب الآن...',
            welcome_sub: 'اسألني أي حاجة، هساعدك دلوقتي',
            first_greeting: 'أهلاً! أنا ChatZone Ai، أقدر أساعدك في إيه النهارده؟',
            menu_bubbles_title: 'تخصيص لون الفقاعات',
            menu_bubbles_sub: 'غيّر لون فقاعات شات الـ AI بس',
            menu_clear_title: 'مسح المحادثة',
            menu_clear_sub: 'يمسح شات الـ AI بالكامل',
            bubbles_sheet_title: 'تخصيص لون الفقاعات',
            bubbles_sheet_sub: 'الألوان دي هتتطبق في شات الـ AI بس.',
            bubble_preview_theirs: 'أهلا، أقدر أساعدك في إيه؟',
            bubble_preview_mine: 'أهلا',
            bubble_option_mine: 'لون فقاعتي',
            bubble_option_theirs: 'لون فقاعة ChatZone Ai',
            bubble_reset: 'إرجاع الافتراضي',
            choose_color_title_mine: 'لون فقاعتي',
            choose_color_title_theirs: 'لون فقاعة ChatZone Ai',
            color_editor: 'محرر الألوان (اختر أي لون)',
            color_presets: 'ألوان الفقاعات الخاصة بالتطبيق',
            presets_title: 'ألوان الفقاعات الخاصة بالتطبيق',
            color_save: 'حفظ',
            color_cancel: 'إلغاء',
            editor_title: 'اختر لون',
            editor_sub: 'دوس حفظ عشان اللون يتطبق، أو إلغاء عشان ترجع من غير أي تغيير.',
            ctx_reply: 'رد',
            ctx_copy: 'نسخ',
            ctx_select: 'تحديد',
            ctx_delete: 'حذف الرسالة',
            delete_msg_title: 'حذف الرسالة؟',
            delete_msg_sub: 'هتتحذف من الشات ده بس عندك.',
            delete_selected_title: 'حذف الرسائل المحددة؟',
            delete_selected_sub: 'هتتحذف كل الرسايل المحددة من الشات ده.',
            btn_delete: 'حذف',
            btn_cancel: 'إلغاء',
            clear_confirm_title: 'مسح المحادثة بالكامل؟',
            clear_confirm_sub: 'هتتمسح كل الرسايل ولن تقدر تسترجعها تاني.',
            clear_confirm_btn: 'مسح',
            deleted_msg_text: 'تم حذف هذه الرسالة',
            reply_you: 'أنت',
            reply_ai: 'ChatZone Ai',
            copied_toast: 'اتنسخت الرسالة',
            deleted_toast: 'اتحذفت الرسالة',
            placeholder: 'اكتب رسالة...',
            error_connection: 'حصلت مشكلة في الاتصال بالذكاء الاصطناعي، حاول تاني.',
            error_network: 'في مشكلة في الاتصال بالإنترنت، جرب تاني.',
            error_fallback: 'معرفتش أرد دلوقتي، حاول تسأل بطريقة تانية.',
            default: 'افتراضي', dark: 'داكن', silver: 'فضي', green: 'أخضر',
            blue: 'أزرق', pink: 'وردي', purple: 'بنفسجي', orange: 'برتقالي',
            cyan: 'سماوي', red: 'أحمر'
        },
        en: {
            status_online: 'Online',
            status_typing: 'Typing...',
            welcome_sub: 'Ask me anything, I\'m here to help',
            first_greeting: 'Hi! I\'m ChatZone Ai, how can I help you today?',
            menu_bubbles_title: 'Customize bubble colors',
            menu_bubbles_sub: 'Changes only the AI chat bubble colors',
            menu_clear_title: 'Clear chat',
            menu_clear_sub: 'Clears the entire AI chat',
            bubbles_sheet_title: 'Customize bubble colors',
            bubbles_sheet_sub: 'These colors only apply to the AI chat.',
            bubble_preview_theirs: 'Hi, how can I help?',
            bubble_preview_mine: 'Hello',
            bubble_option_mine: 'My bubble color',
            bubble_option_theirs: 'ChatZone Ai bubble color',
            bubble_reset: 'Reset to default',
            choose_color_title_mine: 'My bubble color',
            choose_color_title_theirs: 'ChatZone Ai bubble color',
            color_editor: 'Color editor (pick any color)',
            color_presets: 'App bubble color presets',
            presets_title: 'App bubble color presets',
            color_save: 'Save',
            color_cancel: 'Cancel',
            editor_title: 'Choose a color',
            editor_sub: 'Tap save to apply the color, or cancel to go back without changes.',
            ctx_reply: 'Reply',
            ctx_copy: 'Copy',
            ctx_select: 'Select',
            ctx_delete: 'Delete message',
            delete_msg_title: 'Delete message?',
            delete_msg_sub: 'This will only delete it from this chat on your device.',
            delete_selected_title: 'Delete selected messages?',
            delete_selected_sub: 'All selected messages in this chat will be deleted.',
            btn_delete: 'Delete',
            btn_cancel: 'Cancel',
            clear_confirm_title: 'Clear the entire chat?',
            clear_confirm_sub: 'All messages will be deleted and cannot be recovered.',
            clear_confirm_btn: 'Clear',
            deleted_msg_text: 'This message was deleted',
            reply_you: 'You',
            reply_ai: 'ChatZone Ai',
            copied_toast: 'Message copied',
            deleted_toast: 'Message deleted',
            placeholder: 'Type a message...',
            error_connection: 'There was a problem reaching the AI, please try again.',
            error_network: 'There\'s a connection problem, please try again.',
            error_fallback: "I couldn't answer that, try asking differently.",
            default: 'Default', dark: 'Dark', silver: 'Silver', green: 'Green',
            blue: 'Blue', pink: 'Pink', purple: 'Purple', orange: 'Orange',
            cyan: 'Cyan', red: 'Red'
        }
    };
    const T = I18N[lang] || I18N.ar;

    function applyStaticTranslations() {
        const map = {
            aiStatusText: T.status_online,
            aiWelcomeSub: T.welcome_sub,
            aiMenuBubblesTitle: T.menu_bubbles_title,
            aiMenuBubblesSub: T.menu_bubbles_sub,
            aiMenuClearTitle: T.menu_clear_title,
            aiMenuClearSub: T.menu_clear_sub,
            aiBubblesSheetTitle: T.bubbles_sheet_title,
            aiBubblesSheetSub: T.bubbles_sheet_sub,
            aiBubblePreviewTheirsText: T.bubble_preview_theirs,
            aiBubblePreviewMineText: T.bubble_preview_mine,
            aiBubbleOptionMineLabel: T.bubble_option_mine,
            aiBubbleOptionTheirsLabel: T.bubble_option_theirs,
            bubbleResetBtn: T.bubble_reset,
            aiColorEditorLabel: T.color_editor,
            aiColorPresetsLabel: T.color_presets,
            aiPresetsTitle: T.presets_title,
            presetsCancelBtn: T.color_cancel,
            presetsSaveBtn: T.color_save,
            aiEditorTitle: T.editor_title,
            aiEditorSub: T.editor_sub,
            editorCancelBtn: T.color_cancel,
            editorSaveBtn: T.color_save,
            aiCtxReply: T.ctx_reply,
            aiCtxCopy: T.ctx_copy,
            aiCtxSelect: T.ctx_select,
            aiCtxDelete: T.ctx_delete,
            aiDeleteMsgTitle: T.delete_msg_title,
            aiDeleteMsgSub: T.delete_msg_sub,
            deleteMsgConfirmBtn: T.btn_delete,
            aiDeleteMsgCancel: T.btn_cancel,
            aiDeleteSelectedTitle: T.delete_selected_title,
            aiDeleteSelectedSub: T.delete_selected_sub,
            deleteSelectedConfirmBtn: T.btn_delete,
            aiDeleteSelectedCancel: T.btn_cancel,
            aiClearConfirmTitle: T.clear_confirm_title,
            aiClearConfirmSub: T.clear_confirm_sub,
            aiClearConfirmBtn: T.clear_confirm_btn,
            aiClearCancelBtn: T.btn_cancel
        };
        Object.keys(map).forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.textContent = map[id];
        });

        const presetLabels = {
            '#FFFFFF': T.default, '#1B2027': T.dark, '#C9CDD3': T.silver,
            '#25D9A0': T.green, '#5B7FFF': T.blue, '#ec4899': T.pink,
            '#a78bfa': T.purple, '#f59e0b': T.orange, '#06b6d4': T.cyan,
            '#ef4444': T.red
        };
        document.querySelectorAll('.preset-square-option').forEach((opt) => {
            const label = presetLabels[opt.dataset.color];
            const span = opt.querySelector('span');
            if (label && span) span.textContent = label;
        });

        const textarea = document.getElementById('aiTextarea');
        if (textarea) textarea.placeholder = T.placeholder;
    }
    applyStaticTranslations();

    // ===== عناصر الصفحة =====
    const convMessages = document.getElementById('convMessages');
    const aiWelcome = document.getElementById('aiWelcome');
    const aiTextarea = document.getElementById('aiTextarea');
    const aiSendBtn = document.getElementById('aiSendBtn');
    const convInputBar = document.getElementById('convInputBar');
    const convBackBtn = document.getElementById('convBackBtn');
    const convMenuBtn = document.getElementById('convMenuBtn');
    const convSidebarMenu = document.getElementById('convSidebarMenu');
    const convSidebarOverlay = document.getElementById('convSidebarOverlay');
    const aiClearChatBtn = document.getElementById('aiClearChatBtn');
    const aiStatusText = document.getElementById('aiStatusText');
    const aiChatShell = document.querySelector('.ai-chat-shell');
    const convShellEl = aiChatShell;
    const convReplyBar = document.getElementById('convReplyBar');
    const convReplyBarName = document.getElementById('convReplyBarName');
    const convReplyBarPreview = document.getElementById('convReplyBarPreview');
    const convReplyBarClose = document.getElementById('convReplyBarClose');
    const convTopbarNormal = document.getElementById('convTopbarNormal');
    const convTopbarSelect = document.getElementById('convTopbarSelect');
    const convSelectCancelBtn = document.getElementById('convSelectCancelBtn');
    const convSelectCount = document.getElementById('convSelectCount');
    const convSelectDeleteBtn = document.getElementById('convSelectDeleteBtn');

    // ===== تخزين محلي لتاريخ المحادثة (بيتفتح تاني لو رجعت للصفحة) =====
    const STORAGE_KEY = 'cz_ai_chat_history';

    function loadHistory() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function saveHistory(history) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
        } catch (e) { /* تجاهل لو الملف كبير أوي */ }
    }

    // كل رسالة: { id, role: 'user'|'assistant', content, ts, replyTo?: {id, text, senderName}, deleted?: bool }
    let history = loadHistory();
    let msgIdCounter = Date.now();
    function nextMsgId() {
        msgIdCounter += 1;
        return 'm' + msgIdCounter;
    }
    // بنضمن إن كل رسالة قديمة معاها id (لو كانت متخزنة بنسخة قديمة من غير id)
    history.forEach((m) => { if (!m.id) m.id = nextMsgId(); });

    // ===== رجوع =====
    if (convBackBtn) {
        convBackBtn.addEventListener('click', () => {
            window.location.href = 'MainActivity.html';
        });
    }

    // =====================================================
    // قايمة التلت نقط (نفس منطق conversation.js بالظبط)
    // =====================================================
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
            if (convSidebarMenu && convSidebarMenu.classList.contains('open')) {
                closeConvMenu();
            } else {
                openConvMenu();
            }
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
    if (convOpenBubbleColors) {
        convOpenBubbleColors.addEventListener('click', () => {
            closeConvMenu();
            openSheet('sheet-bubble-colors');
        });
    }

    // ===== توست صغير =====
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
    // تخصيص لون الفقاعات — خاص بشات الـ AI بس، متخزن محليًا
    // (نفس آلية conversation.js: بيغيّر CSS variables على الشِل)
    // =====================================================
    const BUBBLE_MINE_KEY = 'cz_ai_bubble_mine';
    const BUBBLE_MINE_DARK_KEY = 'cz_ai_bubble_mine_dark';
    const BUBBLE_THEIRS_KEY = 'cz_ai_bubble_theirs';
    const BUBBLE_THEIRS_DARK_KEY = 'cz_ai_bubble_theirs_dark';

    function isLightMode() {
        return document.body.classList.contains('theme-white');
    }
    function DEFAULT_MINE_COLOR() {
        return isLightMode() ? '#DCF8C6' : '#005C4B';
    }
    function DEFAULT_THEIRS_COLOR() {
        return isLightMode() ? '#F0F4F2' : '#1B2027';
    }

    function textColorFor(isDark) {
        return isDark === '1' ? '#10161A' : '#FFFFFF';
    }
    function timeColorFor(isDark) {
        return isDark === '1' ? 'rgba(16, 22, 26, 0.55)' : 'rgba(255, 255, 255, 0.7)';
    }
    function isColorDark(hex) {
        const c = hex.replace('#', '');
        const r = parseInt(c.substring(0, 2), 16);
        const g = parseInt(c.substring(2, 4), 16);
        const b = parseInt(c.substring(4, 6), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 150 ? '1' : '0';
    }

    function getMineColor() { return localStorage.getItem(BUBBLE_MINE_KEY); }
    function getMineDark() { return localStorage.getItem(BUBBLE_MINE_DARK_KEY) || '1'; }
    function getTheirsColor() { return localStorage.getItem(BUBBLE_THEIRS_KEY); }
    function getTheirsDark() { return localStorage.getItem(BUBBLE_THEIRS_DARK_KEY) || '1'; }

    function applyBubbleColors() {
        if (!convShellEl) return;
        const mineColor = getMineColor();
        const theirsColor = getTheirsColor();
        const mineDark = getMineDark();
        const theirsDark = getTheirsDark();

        if (mineColor) {
            convShellEl.style.setProperty('--bubble-mine-bg', mineColor);
            convShellEl.style.setProperty('--bubble-mine-text', textColorFor(mineDark));
            convShellEl.style.setProperty('--bubble-mine-time', timeColorFor(mineDark));
        } else {
            convShellEl.style.removeProperty('--bubble-mine-bg');
            convShellEl.style.removeProperty('--bubble-mine-text');
            convShellEl.style.removeProperty('--bubble-mine-time');
        }
        if (theirsColor) {
            convShellEl.style.setProperty('--ai-bubble-bg', theirsColor);
            convShellEl.style.setProperty('--ai-bubble-text', textColorFor(theirsDark));
            convShellEl.style.setProperty('--ai-bubble-time', timeColorFor(theirsDark));
        } else {
            convShellEl.style.removeProperty('--ai-bubble-bg');
            convShellEl.style.removeProperty('--ai-bubble-text');
            convShellEl.style.removeProperty('--ai-bubble-time');
        }
    }

    const bubblePreviewMine = document.getElementById('bubblePreviewMine');
    const bubblePreviewTheirs = document.getElementById('bubblePreviewTheirs');
    const bubbleOptionMineSwatch = document.getElementById('bubbleOptionMineSwatch');
    const bubbleOptionTheirsSwatch = document.getElementById('bubbleOptionTheirsSwatch');

    function refreshBubblePreview() {
        const mineColor = getMineColor() || DEFAULT_MINE_COLOR();
        const theirsColor = getTheirsColor() || DEFAULT_THEIRS_COLOR();
        const mineDark = getMineDark();
        const theirsDark = getTheirsDark();

        if (bubblePreviewMine) {
            bubblePreviewMine.style.background = mineColor;
            bubblePreviewMine.style.color = textColorFor(mineDark);
        }
        if (bubblePreviewTheirs) {
            bubblePreviewTheirs.style.background = theirsColor;
            bubblePreviewTheirs.style.color = textColorFor(theirsDark);
        }
        if (bubbleOptionMineSwatch) bubbleOptionMineSwatch.style.background = mineColor;
        if (bubbleOptionTheirsSwatch) bubbleOptionTheirsSwatch.style.background = theirsColor;
    }

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

    let activeColorTarget = null; // 'mine' | 'theirs'
    let pendingEditorColor = null;
    let pendingEditorIsDark = '1';
    let pendingPresetChoice = null;

    function openChooseColorFor(target) {
        activeColorTarget = target;
        if (chooseColorTitle) {
            chooseColorTitle.textContent = target === 'mine' ? T.choose_color_title_mine : T.choose_color_title_theirs;
        }
        openSheet('sheet-choose-color');
    }
    const bubbleOptionMine = document.getElementById('bubbleOptionMine');
    const bubbleOptionTheirs = document.getElementById('bubbleOptionTheirs');
    if (bubbleOptionMine) bubbleOptionMine.addEventListener('click', () => openChooseColorFor('mine'));
    if (bubbleOptionTheirs) bubbleOptionTheirs.addEventListener('click', () => openChooseColorFor('theirs'));

    if (openColorEditorBtn && bubbleColorNativePicker) {
        openColorEditorBtn.addEventListener('click', () => {
            const current = activeColorTarget === 'mine' ? (getMineColor() || DEFAULT_MINE_COLOR()) : (getTheirsColor() || DEFAULT_THEIRS_COLOR());
            bubbleColorNativePicker.value = current;
            bubbleColorNativePicker.click();
        });
        bubbleColorNativePicker.addEventListener('input', () => {
            pendingEditorColor = bubbleColorNativePicker.value;
            pendingEditorIsDark = isColorDark(pendingEditorColor);
            if (colorEditorPreviewSwatch) {
                colorEditorPreviewSwatch.style.background = pendingEditorColor;
            }
            closeSheet('sheet-choose-color');
            openSheet('sheet-color-editor-confirm');
        });
    }

    function saveColorForTarget(target, color, isDark) {
        if (target === 'mine') {
            localStorage.setItem(BUBBLE_MINE_KEY, color);
            localStorage.setItem(BUBBLE_MINE_DARK_KEY, isDark);
        } else {
            localStorage.setItem(BUBBLE_THEIRS_KEY, color);
            localStorage.setItem(BUBBLE_THEIRS_DARK_KEY, isDark);
        }
        applyBubbleColors();
        refreshBubblePreview();
    }

    if (editorSaveBtn) {
        editorSaveBtn.addEventListener('click', () => {
            if (activeColorTarget && pendingEditorColor) {
                saveColorForTarget(activeColorTarget, pendingEditorColor, pendingEditorIsDark);
            }
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

    if (openColorPresetsBtn) {
        openColorPresetsBtn.addEventListener('click', () => {
            closeSheet('sheet-choose-color');
            document.querySelectorAll('.preset-square-option').forEach(opt => opt.classList.remove('selected'));
            pendingPresetChoice = null;
            openSheet('sheet-color-presets');
        });
    }
    if (presetSquareGrid) {
        presetSquareGrid.querySelectorAll('.preset-square-option').forEach((opt) => {
            opt.addEventListener('click', () => {
                presetSquareGrid.querySelectorAll('.preset-square-option').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                pendingPresetChoice = { color: opt.dataset.color, isDark: opt.dataset.textDark };
            });
        });
    }
    if (presetsSaveBtn) {
        presetsSaveBtn.addEventListener('click', () => {
            if (activeColorTarget && pendingPresetChoice) {
                saveColorForTarget(activeColorTarget, pendingPresetChoice.color, pendingPresetChoice.isDark);
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

    const bubbleResetBtn = document.getElementById('bubbleResetBtn');
    if (bubbleResetBtn) {
        bubbleResetBtn.addEventListener('click', () => {
            localStorage.removeItem(BUBBLE_MINE_KEY);
            localStorage.removeItem(BUBBLE_MINE_DARK_KEY);
            localStorage.removeItem(BUBBLE_THEIRS_KEY);
            localStorage.removeItem(BUBBLE_THEIRS_DARK_KEY);
            applyBubbleColors();
            refreshBubblePreview();
        });
    }

    applyBubbleColors();
    refreshBubblePreview();

    // ===== إظهار/إخفاء شاشة الترحيب باللوجو =====
    function showWelcome() {
        aiWelcome.classList.remove('ai-welcome-hidden');
    }
    function hideWelcome() {
        aiWelcome.classList.add('ai-welcome-hidden');
    }

    // ===== رسم فقاعة رسالة (مستخدم أو AI)، بنفس بنية conversation.js =====
    function formatTime(date) {
        let h = date.getHours();
        const m = date.getMinutes().toString().padStart(2, '0');
        if (isAr) {
            const ampm = h < 12 ? 'ص' : 'م';
            h = h % 12 || 12;
            return `${h}:${m} ${ampm}`;
        }
        const ampm = h < 12 ? 'AM' : 'PM';
        h = h % 12 || 12;
        return `${h}:${m} ${ampm}`;
    }

    const SWIPE_REPLY_THRESHOLD = 46;
    const LONG_PRESS_MSG_MS = 420;
    let selectModeOn = false;
    let selectedMessages = new Map();
    let activeReply = null; // { id, text, senderName, isMine }

    function messagePreviewText(msg) {
        if (msg.deleted) return T.deleted_msg_text;
        return (msg.content || '').slice(0, 120);
    }

    function copyTextToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => showToast(T.copied_toast)).catch(() => {});
        } else {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); showToast(T.copied_toast); } catch (e) {}
            document.body.removeChild(ta);
        }
    }

    function findMsg(id) {
        return history.find(m => m.id === id);
    }

    function appendMessage(msg) {
        const isMine = msg.role === 'user';
        const row = document.createElement('div');
        row.className = 'msg-row ' + (isMine ? 'from-me' : 'from-them');
        row.dataset.msgId = msg.id;

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
        bubble.className = 'bubble ' + (isMine ? 'bubble-right' : 'bubble-left bubble-ai');

        if (msg.replyTo && msg.replyTo.text) {
            const quote = document.createElement('div');
            quote.className = 'bubble-reply-quote';
            const qName = document.createElement('span');
            qName.className = 'bubble-reply-quote-name';
            qName.textContent = msg.replyTo.senderName || '';
            const qText = document.createElement('span');
            qText.className = 'bubble-reply-quote-text';
            qText.textContent = msg.replyTo.deleted ? T.deleted_msg_text : msg.replyTo.text;
            quote.appendChild(qName);
            quote.appendChild(qText);
            bubble.appendChild(quote);
        }

        const textEl = document.createElement('p');
        textEl.className = 'bubble-text' + (msg.deleted ? ' deleted' : '');
        textEl.textContent = msg.deleted ? T.deleted_msg_text : msg.content;
        bubble.appendChild(textEl);

        const meta = document.createElement('div');
        meta.className = 'bubble-meta';
        const timeEl = document.createElement('span');
        timeEl.className = 'bubble-time';
        timeEl.textContent = formatTime(new Date(msg.ts || Date.now()));
        meta.appendChild(timeEl);
        bubble.appendChild(meta);

        inner.appendChild(bubble);
        row.appendChild(inner);
        convMessages.appendChild(row);

        if (!msg.deleted) {
            attachMessageInteractions(row, msg, isMine);
        }

        return row;
    }

    // ===== وضع التحديد المتعدد =====
    function updateSelectCountUI() {
        if (convSelectCount) convSelectCount.textContent = String(selectedMessages.size);
    }
    function enterSelectMode(firstId, firstIsMine) {
        selectModeOn = true;
        document.body.classList.add('select-mode-on');
        selectedMessages.clear();
        if (firstId) {
            selectedMessages.set(firstId, firstIsMine);
            const row = convMessages.querySelector(`.msg-row[data-msg-id="${firstId}"]`);
            if (row) row.classList.add('multi-selected');
        }
        updateSelectCountUI();
    }
    function exitSelectMode() {
        selectModeOn = false;
        document.body.classList.remove('select-mode-on');
        selectedMessages.clear();
        convMessages.querySelectorAll('.msg-row.multi-selected').forEach(r => r.classList.remove('multi-selected'));
    }
    function toggleMessageSelection(row, id, isMine) {
        if (selectedMessages.has(id)) {
            selectedMessages.delete(id);
            row.classList.remove('multi-selected');
        } else {
            selectedMessages.set(id, isMine);
            row.classList.add('multi-selected');
        }
        if (selectedMessages.size === 0) {
            exitSelectMode();
        } else {
            updateSelectCountUI();
        }
    }
    if (convSelectCancelBtn) convSelectCancelBtn.addEventListener('click', exitSelectMode);
    if (convSelectDeleteBtn) {
        convSelectDeleteBtn.addEventListener('click', () => {
            if (selectedMessages.size === 0) return;
            openSheet('sheet-delete-selected');
        });
    }
    const deleteSelectedConfirmBtn = document.getElementById('deleteSelectedConfirmBtn');
    if (deleteSelectedConfirmBtn) {
        deleteSelectedConfirmBtn.addEventListener('click', () => {
            const ids = new Set(selectedMessages.keys());
            history = history.filter(m => !ids.has(m.id));
            saveHistory(history);
            closeSheet('sheet-delete-selected');
            exitSelectMode();
            redrawAllMessages();
            showToast(T.deleted_toast);
        });
    }

    // ===== سحب/ضغطة مطولة/قايمة سياق على كل رسالة =====
    function attachMessageInteractions(row, msg, isMine) {
        const inner = row.querySelector('.msg-row-inner');
        const id = msg.id;

        row.addEventListener('click', (e) => {
            if (!selectModeOn) return;
            e.preventDefault();
            e.stopPropagation();
            toggleMessageSelection(row, id, isMine);
        });

        let touchStartX = 0, touchStartY = 0, dragging = false, currentDx = 0;

        row.addEventListener('touchstart', (e) => {
            if (selectModeOn) return;
            const t0 = e.touches[0];
            touchStartX = t0.clientX;
            touchStartY = t0.clientY;
            dragging = false;
            currentDx = 0;
        }, { passive: true });

        row.addEventListener('touchmove', (e) => {
            if (selectModeOn) return;
            const t0 = e.touches[0];
            const dx = t0.clientX - touchStartX;
            const dy = t0.clientY - touchStartY;
            if (!dragging && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
                dragging = true;
            }
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
                startReply(msg, isMine);
            }
            inner.style.transform = '';
            row.classList.remove('swiping');
            dragging = false;
            currentDx = 0;
        });
        row.addEventListener('touchcancel', () => {
            inner.style.transform = '';
            row.classList.remove('swiping');
            dragging = false;
            currentDx = 0;
        });

        let pressTimer = null;
        function cancelPress() {
            if (pressTimer) clearTimeout(pressTimer);
            pressTimer = null;
        }
        row.addEventListener('touchstart', () => {
            if (selectModeOn) return;
            pressTimer = setTimeout(() => {
                if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }
                openMsgCtxMenu(row, msg, isMine);
            }, LONG_PRESS_MSG_MS);
        }, { passive: true });
        row.addEventListener('touchmove', cancelPress, { passive: true });
        row.addEventListener('touchend', cancelPress);
        row.addEventListener('touchcancel', cancelPress);

        row.addEventListener('contextmenu', (e) => {
            if (selectModeOn) { e.preventDefault(); return; }
            e.preventDefault();
            openMsgCtxMenu(row, msg, isMine);
        });

        let mouseTimer = null;
        row.addEventListener('mousedown', () => {
            if (selectModeOn) return;
            mouseTimer = setTimeout(() => openMsgCtxMenu(row, msg, isMine), LONG_PRESS_MSG_MS);
        });
        row.addEventListener('mouseup', () => { if (mouseTimer) clearTimeout(mouseTimer); });
        row.addEventListener('mouseleave', () => { if (mouseTimer) clearTimeout(mouseTimer); });
    }

    // ===== قايمة رد/نسخ/تحديد/حذف الخاصة بالرسالة =====
    const msgCtxOverlay = document.getElementById('msgCtxOverlay');
    const msgCtxMenu = document.getElementById('msgCtxMenu');
    const msgCtxReply = document.getElementById('msgCtxReply');
    const msgCtxCopy = document.getElementById('msgCtxCopy');
    const msgCtxSelect = document.getElementById('msgCtxSelect');
    const msgCtxDelete = document.getElementById('msgCtxDelete');
    let ctxMsg = null, ctxIsMine = false;

    function openMsgCtxMenu(row, msg, isMine) {
        ctxMsg = msg;
        ctxIsMine = isMine;
        document.querySelectorAll('.msg-row.selected').forEach(r => r.classList.remove('selected'));
        row.classList.add('selected');

        if (!msgCtxMenu || !msgCtxOverlay) return;

        const bubbleEl = row.querySelector('.bubble') || row;
        const rect = bubbleEl.getBoundingClientRect();
        const isRtl = document.documentElement.dir === 'rtl';

        msgCtxMenu.style.visibility = 'hidden';
        msgCtxMenu.style.top = '0px';
        msgCtxMenu.style.left = '0px';
        msgCtxMenu.style.right = 'auto';
        msgCtxMenu.classList.add('open');
        const menuRect = msgCtxMenu.getBoundingClientRect();
        const menuWidth = menuRect.width || 230;
        const menuHeight = menuRect.height || 180;
        msgCtxMenu.classList.remove('open');
        msgCtxMenu.style.visibility = '';

        const margin = 10;
        let top = rect.bottom + 6;
        if (top + menuHeight > window.innerHeight - margin) {
            top = rect.top - menuHeight - 6;
        }
        top = Math.min(Math.max(margin, top), window.innerHeight - menuHeight - margin);
        msgCtxMenu.style.top = top + 'px';

        const centerX = rect.left + rect.width / 2;
        let leftPos = Math.min(
            Math.max(margin, centerX - menuWidth / 2),
            window.innerWidth - menuWidth - margin
        );
        if (isRtl) {
            msgCtxMenu.style.right = (window.innerWidth - leftPos - menuWidth) + 'px';
            msgCtxMenu.style.left = 'auto';
        } else {
            msgCtxMenu.style.left = leftPos + 'px';
            msgCtxMenu.style.right = 'auto';
        }
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
            const msg = ctxMsg, mine = ctxIsMine;
            closeMsgCtxMenu();
            if (msg) startReply(msg, mine);
        });
    }
    if (msgCtxCopy) {
        msgCtxCopy.addEventListener('click', () => {
            const msg = ctxMsg;
            closeMsgCtxMenu();
            if (!msg || msg.deleted) return;
            copyTextToClipboard(msg.content || '');
        });
    }
    if (msgCtxSelect) {
        msgCtxSelect.addEventListener('click', () => {
            const msg = ctxMsg, mine = ctxIsMine;
            closeMsgCtxMenu();
            if (msg) enterSelectMode(msg.id, mine);
        });
    }
    if (msgCtxDelete) {
        msgCtxDelete.addEventListener('click', () => {
            closeMsgCtxMenu();
            if (ctxMsg) openDeleteMsgSheet(ctxMsg);
        });
    }

    // ===== حذف رسالة واحدة =====
    let deleteTargetId = null;
    function openDeleteMsgSheet(msg) {
        deleteTargetId = msg.id;
        openSheet('sheet-delete-msg');
    }
    const deleteMsgConfirmBtn = document.getElementById('deleteMsgConfirmBtn');
    if (deleteMsgConfirmBtn) {
        deleteMsgConfirmBtn.addEventListener('click', () => {
            if (deleteTargetId) {
                history = history.filter(m => m.id !== deleteTargetId);
                saveHistory(history);
                redrawAllMessages();
                showToast(T.deleted_toast);
            }
            deleteTargetId = null;
            closeSheet('sheet-delete-msg');
        });
    }

    // ===== بار الريبلاي =====
    function startReply(msg, isMine) {
        if (msg.deleted) return;
        activeReply = {
            id: msg.id,
            text: msg.content || '',
            senderName: isMine ? T.reply_you : T.reply_ai,
            isMine
        };
        if (convReplyBarName) convReplyBarName.textContent = activeReply.senderName;
        if (convReplyBarPreview) convReplyBarPreview.textContent = messagePreviewText(msg);
        if (convReplyBar) convReplyBar.classList.add('open');
        aiTextarea.focus();
    }
    function cancelReply() {
        activeReply = null;
        if (convReplyBar) convReplyBar.classList.remove('open');
    }
    if (convReplyBarClose) convReplyBarClose.addEventListener('click', cancelReply);

    // ===== إعادة رسم كل الرسايل من history (بعد أي حذف/مسح) =====
    function redrawAllMessages() {
        convMessages.querySelectorAll('.msg-row, #aiTypingRow, .ai-error-badge').forEach(el => el.remove());
        if (history.length === 0) {
            showWelcome();
            return;
        }
        hideWelcome();
        history.forEach(msg => appendMessage(msg));
        convMessages.scrollTop = convMessages.scrollHeight;
    }

    // ===== مؤشر "بيكتب..." وقت انتظار رد الـ AI =====
    function showTypingIndicator() {
        const row = document.createElement('div');
        row.className = 'msg-row from-them';
        row.id = 'aiTypingRow';
        const bubble = document.createElement('div');
        bubble.className = 'bubble bubble-left bubble-ai';
        bubble.innerHTML = `<div class="ai-typing-bubble"><span></span><span></span><span></span></div>`;
        row.appendChild(bubble);
        convMessages.appendChild(row);
        convMessages.scrollTop = convMessages.scrollHeight;
    }
    function removeTypingIndicator() {
        const row = document.getElementById('aiTypingRow');
        if (row) row.remove();
    }
    function showErrorBubble(message) {
        const el = document.createElement('div');
        el.className = 'ai-error-badge';
        el.textContent = message;
        convMessages.appendChild(el);
        convMessages.scrollTop = convMessages.scrollHeight;
    }

    // ===== إرسال الرسالة للـ Worker =====
    async function sendToAI(userMsg) {
        showTypingIndicator();
        if (aiStatusText) aiStatusText.textContent = T.status_typing;

        try {
            const systemPrompt = isAr
                ? "إنت ChatZone Ai، مساعد ذكاء اصطناعي جوه تطبيق دردشة اسمه ChatZone. ردودك تكون بالعربي المصري البسيط، ودودة ومختصرة ومفيدة، ومنظمة لما يكون المحتوى يحتاج نقط أو خطوات."
                : "You are ChatZone Ai, an AI assistant inside a chat app called ChatZone. Reply in simple, friendly, concise, and helpful English, and use bullet points or numbered steps when the content needs structure.";

            const apiMessages = history
                .filter(m => !m.deleted)
                .map(m => ({ role: m.role, content: m.content }));

            const payload = {
                model: AI_MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...apiMessages
                ]
            };

            const res = await fetch(AI_WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            removeTypingIndicator();

            if (!res.ok || data.error) {
                showErrorBubble(T.error_connection);
                if (aiStatusText) aiStatusText.textContent = T.status_online;
                return;
            }

            const reply = data.reply || T.error_fallback;
            const aiMsg = { id: nextMsgId(), role: 'assistant', content: reply, ts: Date.now() };
            history.push(aiMsg);
            saveHistory(history);
            appendMessage(aiMsg);
            convMessages.scrollTop = convMessages.scrollHeight;
        } catch (err) {
            removeTypingIndicator();
            showErrorBubble(T.error_network);
        } finally {
            if (aiStatusText) aiStatusText.textContent = T.status_online;
        }
    }

    // ===== التعامل مع إرسال رسالة من المستخدم =====
    function handleSend() {
        const text = aiTextarea.value.trim();
        if (!text) return;

        hideWelcome();

        const userMsg = { id: nextMsgId(), role: 'user', content: text, ts: Date.now() };
        if (activeReply) {
            userMsg.replyTo = {
                id: activeReply.id,
                text: activeReply.text.length > 120 ? activeReply.text.slice(0, 120) : activeReply.text,
                senderName: activeReply.senderName
            };
        }
        history.push(userMsg);
        saveHistory(history);
        appendMessage(userMsg);
        convMessages.scrollTop = convMessages.scrollHeight;

        aiTextarea.value = '';
        aiTextarea.style.height = 'auto';
        convInputBar.classList.remove('has-text');
        cancelReply();

        sendToAI(userMsg);
    }

    if (aiSendBtn) aiSendBtn.addEventListener('click', handleSend);

    if (aiTextarea) {
        aiTextarea.addEventListener('input', () => {
            aiTextarea.style.height = 'auto';
            aiTextarea.style.height = Math.min(aiTextarea.scrollHeight, 120) + 'px';
            convInputBar.classList.toggle('has-text', aiTextarea.value.trim().length > 0);
        });

        aiTextarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        });
    }

    // ===== مسح المحادثة بالكامل =====
    if (aiClearChatBtn) {
        aiClearChatBtn.addEventListener('click', () => {
            closeConvMenu();
            openSheet('sheet-clear-ai-chat');
        });
    }
    const aiClearConfirmBtn = document.getElementById('aiClearConfirmBtn');
    if (aiClearConfirmBtn) {
        aiClearConfirmBtn.addEventListener('click', () => {
            history = [];
            saveHistory(history);
            exitSelectMode();
            cancelReply();
            redrawAllMessages();
            closeSheet('sheet-clear-ai-chat');
        });
    }

    // =====================================================
    // أول رسالة ترحيب من الـ AI بتتبعت تلقائيًا (مرة واحدة بس،
    // لو المحادثة فاضية بالكامل) وبتحترم لغة التطبيق الحالية
    // =====================================================
    function seedFirstGreetingIfEmpty() {
        if (history.length > 0) return;
        const greeting = { id: nextMsgId(), role: 'assistant', content: T.first_greeting, ts: Date.now() };
        history.push(greeting);
        saveHistory(history);
    }

    // ===== تشغيل أولي =====
    if (history.length === 0) {
        seedFirstGreetingIfEmpty();
    }
    redrawAllMessages();
})();
