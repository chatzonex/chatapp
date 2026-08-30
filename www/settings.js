import { db, doc, getDoc, updateDoc, ensureAuthenticated } from "./firebase-init.js";

(function () {
    // ===== فتح/قفل الـ Sheets =====
    function openSheet(id) {
        const overlay = document.getElementById(id);
        if (overlay) overlay.classList.add('open');
    }
    function closeSheet(id) {
        const overlay = document.getElementById(id);
        if (overlay) overlay.classList.remove('open');
    }

    const sheetTriggers = {
        openThemes: 'sheet-themes',
        openLanguage: 'sheet-language',
        openPrivacy: 'sheet-privacy',
        openVersion: 'sheet-version',
        openAbout: 'sheet-about',
        navHomeShortcut: 'sheet-lg-home',
        openChatRow: 'sheet-lg-chat'
    };

    Object.keys(sheetTriggers).forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) btn.addEventListener('click', () => openSheet(sheetTriggers[btnId]));
    });

    document.querySelectorAll('[data-close-sheet]').forEach(el => {
        el.addEventListener('click', () => closeSheet(el.dataset.closeSheet));
    });

    document.querySelectorAll('.sheet-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeSheet(overlay.id);
        });
    });

    // ===== Liquid Glass Toggles =====
    // كل زرار مستقل تمامًا عن التاني وله مفتاح تخزين وكلاس CSS خاص
    // بيه بس، عشان محدش يأثر على التاني:
    //   - bottombar : شريط التنقل السفلي في الرئيسية بس (lg-bottombar-on)
    //   - icons     : الأزرار الدائرية في الرئيسية بس (lg-icons-on)
    //   - chat      : بار الاسم + زرار الرجوع + بار الكتابة في شاشة
    //                 المحادثة بس (lg-chat-on) — منفصل خالص عن
    //                 bottombar، مش نفس المفتاح ولا نفس الكلاس.
    const LG_OPTIONS = ['bottombar', 'icons', 'chat'];
    const LG_CLASS = {
        bottombar: 'lg-bottombar-on',
        icons: 'lg-icons-on',
        chat: 'lg-chat-on'
    };
    const LG_SWITCH_ID = {
        bottombar: 'lgSwitch-bottombar',
        icons: 'lgSwitch-icons',
        chat: 'lgSwitch-bottombar-chat'
    };
    const lgState = {};
    LG_OPTIONS.forEach(opt => {
        lgState[opt] = localStorage.getItem('cz_lg_' + opt) === 'on';
    });

    function applyLgState() {
        LG_OPTIONS.forEach(opt => {
            document.body.classList.toggle(LG_CLASS[opt], !!lgState[opt]);
        });
    }

    LG_OPTIONS.forEach(opt => {
        const input = document.getElementById(LG_SWITCH_ID[opt]);
        if (!input) return;
        input.checked = !!lgState[opt];
        input.addEventListener('change', () => {
            lgState[opt] = input.checked;
            localStorage.setItem('cz_lg_' + opt, input.checked ? 'on' : 'off');
            applyLgState();
            if (navigator.vibrate) { try { navigator.vibrate(6); } catch (e) {} }
        });
    });

    applyLgState();

    // ===== Privacy Toggles =====
    // خياران بس في سيكشن الخصوصية دلوقتي:
    //  1) منع الصح الزرقاء — إعداد محلي (localStorage)، بيتحقق منه
    //     كل طرف من عنده هو، فلو أي واحد في الشات مفعّلها الصح
    //     الزرقاء متظهرش خالص لا عنده ولا عند الطرف التاني.
    //  2) إخفاء صورة البروفايل عن الآخرين — ده حقل على مستند
    //     المستخدم نفسه في Firestore (مش محلي)، اتربط بعدين تحت
    //     (initHidePhotoToggle) لأنه محتاج الإيميل المتحقق منه اللي
    //     بيتجهز لاحقًا في الملف ده.
    const PRIVACY_OPTIONS = {
        hideReadReceipts: 'cz_privacy_hide_read_receipts'
    };

    const privacyState = {};
    Object.keys(PRIVACY_OPTIONS).forEach(key => {
        privacyState[key] = localStorage.getItem(PRIVACY_OPTIONS[key]) === 'on';
    });

    // نقطة الدخول اللي كود المحادثة (conversation.js) بيستخدمها عشان
    // يعرف هل يبعت status: 'read' فعليًا ولا لأ.
    window.CZPrivacy = {
        areReadReceiptsHidden: () => !!privacyState.hideReadReceipts
    };

    function applyPrivacyState() {
        document.body.classList.toggle('privacy-hide-read-receipts', !!privacyState.hideReadReceipts);
    }

    Object.keys(PRIVACY_OPTIONS).forEach(key => {
        const input = document.getElementById('privacySwitch-' + key);
        if (!input) return;
        input.checked = !!privacyState[key];
        input.addEventListener('change', () => {
            privacyState[key] = input.checked;
            localStorage.setItem(PRIVACY_OPTIONS[key], input.checked ? 'on' : 'off');
            applyPrivacyState();
            // بنمرّر نفس القيمة لمستند المستخدم في Firestore كمان، عشان
            // الطرف التاني في أي شات يقدر يتأكد إني أنا مفعّلها هو
            // كمان قبل ما يبعت status:'read' على رسايلي — بكده الخاصية
            // بتبقى ثنائية فعليًا مش بس عندي أنا محليًا.
            if (key === 'hideReadReceipts' && savedEmailLowerForAvatar) {
                updateDoc(doc(db, 'users', savedEmailLowerForAvatar), { hideReadReceipts: input.checked })
                    .catch((e) => console.warn('تعذّر مزامنة إعداد منع الصح الزرقاء:', e));
            }
            if (navigator.vibrate) { try { navigator.vibrate(6); } catch (e) {} }
        });
    });

    applyPrivacyState();

    // ===== Themes =====
    function hexToRgb(hex) {
        hex = hex.replace('#', '');
        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
        const num = parseInt(hex, 16);
        return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
    }
    function rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
    }
    function shadeColor(hex, percent) {
        const { r, g, b } = hexToRgb(hex);
        const amt = Math.round(2.55 * percent);
        return rgbToHex(r + amt, g + amt, b + amt);
    }

    let currentTheme = localStorage.getItem('cz_theme') || 'dark';
    let customColor = localStorage.getItem('cz_theme_color') || '#25D9A0';

    function updateColorSwatch(hex) {
        const swatch = document.getElementById('themeColorSwatch');
        const hexLabel = document.getElementById('themeColorHex');
        const picker = document.getElementById('themeColorPicker');
        if (swatch) {
            swatch.classList.add('has-color');
            swatch.style.setProperty('--picked-color', hex);
        }
        if (hexLabel) hexLabel.textContent = hex.toUpperCase();
        if (picker) picker.value = hex;
    }

    // Applies the CSS vars that everything else in the app (buttons, badges,
    // active states, gradients) reads from — this is what makes theme
    // changes show up everywhere, not just inside the settings sheet.
    function applyAccentVars(hex) {
        const dark = shadeColor(hex, -25);
        const { r, g, b } = hexToRgb(hex);
        document.documentElement.style.setProperty('--accent', hex);
        document.documentElement.style.setProperty('--accent-dim', `rgba(${r},${g},${b},0.35)`);
        document.documentElement.style.setProperty('--grad', `linear-gradient(120deg, ${hex}, var(--violet))`);
    }

    function applyTheme(theme) {
        currentTheme = theme;
        localStorage.setItem('cz_theme', theme);

        document.body.classList.remove('theme-white', 'theme-custom');
        if (theme === 'white') document.body.classList.add('theme-white');
        if (theme === 'custom') document.body.classList.add('theme-custom');

        if (theme === 'custom') {
            applyAccentVars(customColor);
        } else {
            document.documentElement.style.removeProperty('--accent');
            document.documentElement.style.removeProperty('--accent-dim');
            document.documentElement.style.removeProperty('--grad');
        }

        const darkOpt = document.getElementById('theme-opt-dark');
        const whiteOpt = document.getElementById('theme-opt-white');
        const colorRow = document.getElementById('themeColorRow');
        if (darkOpt) darkOpt.classList.toggle('selected', theme === 'dark');
        if (whiteOpt) whiteOpt.classList.toggle('selected', theme === 'white');
        if (colorRow) colorRow.classList.toggle('selected', theme === 'custom');
    }

    function applyCustomColor(hex) {
        customColor = hex;
        localStorage.setItem('cz_theme_color', hex);
        updateColorSwatch(hex);
        applyTheme('custom');
        if (navigator.vibrate) { try { navigator.vibrate([6, 30, 6]); } catch (e) {} }
    }

    const themeDarkOpt = document.getElementById('theme-opt-dark');
    const themeWhiteOpt = document.getElementById('theme-opt-white');
    if (themeDarkOpt) themeDarkOpt.addEventListener('click', () => applyTheme('dark'));
    if (themeWhiteOpt) themeWhiteOpt.addEventListener('click', () => applyTheme('white'));

    const colorPicker = document.getElementById('themeColorPicker');
    const colorRowEl = document.getElementById('themeColorRow');
    if (colorRowEl && colorPicker) {
        colorRowEl.addEventListener('click', () => colorPicker.click());
        colorPicker.addEventListener('input', (e) => applyCustomColor(e.target.value));
    }

    // تطبيق الثيم المحفوظ عند التحميل
    updateColorSwatch(customColor);
    applyTheme(currentTheme);

    // ===== Language (عربي / إنجليزي) — يغطي كل شاشات التطبيق =====
    const AR_TEXT = {
        settings: 'الإعدادات',
        chats_title: 'الدردشات',
        search_placeholder: 'ابحث عن الشتات',
        empty_title: 'مفيش شتات لسه',
        empty_sub: 'دوس على علامة + وابدأ أول محادثة',
        nav_chats: 'الدردشات',
        nav_settings: 'الإعدادات',
        sidebar_airplane: 'وضع الطيران',
        sidebar_ghost: 'وضع الشبح',
        sidebar_restart: 'إعادة تشغيل التطبيق',
        mode_conflict_title: 'لازم تلغي وضع تاني الأول',
        mode_conflict_sub: 'مينفعش تشغّل وضع الطيران ووضع الشبح مع بعض في نفس الوقت',
        btn_ok: 'تمام',
        vip_required_title: 'الخاصية دي لمشتركي VIP بس',
        vip_required_sub: 'وضع الطيران ووضع الشبح متاحين لمشتركي VIP مقابل 30 جنيه بس في الشهر',
        vip_required_cta: 'اشترك دلوقتي',
        airplane_confirm_on_title: 'تفعيل وضع الطيران؟',
        airplane_confirm_on_sub: 'هتتقطع عن الإنترنت جوه التطبيق تمامًا، ومش هتوصلك أي رسايل جديدة لحد ما تلغيه',
        airplane_confirm_off_title: 'إلغاء وضع الطيران؟',
        airplane_confirm_off_sub: 'هترجع تتصل بالإنترنت جوه التطبيق عادي وهتوصلك الرسايل تاني',
        ghost_confirm_on_title: 'تفعيل وضع الشبح؟',
        ghost_confirm_on_sub: 'ردودك هتوصل عادي، لكن هتفضل ظاهر عند الطرف التاني تيك واحد بس لحد ما تلغي الوضع',
        ghost_confirm_off_title: 'إلغاء وضع الشبح؟',
        ghost_confirm_off_sub: 'هتفضل الرسايل تظهر تيكين زرقاء عادي زي ما هي في الأصل',
        btn_confirm: 'تأكيد',
        modal_new_chat_sub: 'اكتب الإيميل اللي هتكلمه',
        btn_cancel: 'إلغاء',
        btn_start_chat: 'ابدأ المحادثة',
        lg_title: 'الزجاج السائل',
        lg_sub: 'فعّل تأثير Liquid Glass في الأبب',
        lg_body: 'فعّل أو ألغِ كل تأثير Liquid Glass على حدة. كل شيء متوقف افتراضياً.',
        lg_warning: 'مُوصى به فقط للأجهزة القوية. قد يحدث بطء بسيط على الأجهزة الأضعف.',
        lg_bottombar_title: 'تفعيل الزجاج السائل',
        lg_bottombar_sub: 'شريط تنقل زجاجي شفاف',
        lg_icons_title: 'الزجاج السائل من الأيقونات',
        lg_icons_sub: 'طبّق خامة الزجاج على الأزرار الدائرية',
        lg_home_title: 'الزجاج السائل في الرئيسية',
        lg_home_toggle_title: 'الزجاج السائل في الرئيسية',
        lg_icons_home_title: 'الزجاج السائل في الأيقونة',
        lg_chat_title: 'الزجاج السائل في الدردشة',
        lg_chat_body: 'فعّل الزجاج السائل على بار الاسم وزرار الرجوع وبار الكتابة في شاشة الدردشة.',
        lg_chat_toggle_title: 'الزجاج السائل في الدردشة',
        lg_chat_sub: 'بار الاسم، زرار الرجوع، وبار الكتابة',
        lg_icons_chat_title: 'الزجاج السائل في الأيقونة',
        lg_chat_soon_body: 'هذه الميزة قيد التطوير حالياً وستكون متاحة قريباً.',
        lg_soon_sub: 'قريباً',
        themes_title: 'ثيمات التطبيق',
        themes_sub: 'خصّص مظهر ألوان التطبيق',
        themes_body: 'اختر ثيم ألوان للتطبيق، وسيتم حفظ اختيارك تلقائياً.',
        theme_dark: 'داكن',
        theme_white: 'أبيض',
        theme_pick: 'اختر لون الثيم',
        lang_title: 'لغة التطبيق',
        lang_sub: 'التبديل بين العربية والإنجليزية',
        lang_body: 'اختر لغتك المفضلة، وسيتم تحديث الأبب فوراً.',
        version_title: 'إصدار التطبيق',
        version_sub: 'معرفة الإصدار الحالي',
        version_body: 'أنت تستخدم أحدث إصدار من ChatZone. يتم تحديث الأبب بانتظام لضمان أفضل تجربة.',
        version_badge: 'الإصدار الحالي: 1.0',
        about_title: 'معلومات عنا',
        about_sub: 'تعرّف على فريق ChatZone',
        about_body: 'أهلاً بيك في ChatZone، تطبيق دردشة بسيط وسريع، بيهدف يديك تجربة تواصل مريحة وآمنة مع أي حد بس بإيميله. نتمنى نكون دايماً عند حسن ظنك 💚',
        nav_chats_row: 'الصفحة الرئيسية',
        chat_row: 'الدردشة',
        privacy_row: 'الخصوصية',
        privacy_title: 'الخصوصية',
        privacy_body: 'بنحترم خصوصيتك، وبيانات محادثاتك متشفّرة ومتخزنة بأمان. مش بنشارك بياناتك مع أي طرف تالت.',
        privacy_hide_photo_title: 'إخفاء صورة البروفايل عن الآخرين',
        privacy_hide_photo_sub: 'اللي بتتكلم معاهم مش هيشوفوا صورة البروفايل بتاعتك',
        privacy_hide_readreceipts_title: 'منع الصح الزرقاء',
        privacy_hide_readreceipts_sub: 'علامات القراءة الزرقاء مش هتظهر عندك ولا عند الطرف التاني',
        ctx_pin: 'تثبيت المحادثة',
        ctx_delete_chat: 'حذف المحادثة',
        delete_chat_title: 'حذف المحادثة؟',
        delete_chat_body: 'هتتحذف من عندك أنت بس، ولو الطرف التاني بعت رسالة جديدة هتظهر تاني.',
        logout_row: 'تسجيل خروج',
        logout_title: 'تسجيل خروج؟',
        logout_body: 'عند تسجيل الخروج سيتم حذف اكونتك نهائيًا (شاتاتك ورسايلك كلها) وستقوم بتسجيل الدخول مرة أخرى.',
        add_choice_sub: 'مين عاوز تتكلم معاه؟',
        add_choice_existing_title: 'تحدث مع اكونت تحدثت معه من قبل',
        add_choice_existing_sub: 'اختر من قائمة جهات اتصالك',
        add_choice_new_title: 'تحدث مع شخص جديد',
        add_choice_new_sub: 'ابدأ محادثة بإيميل جديد',
        contacts_sub: 'جهات الاتصال اللي اتكلمت معاها قبل كده',
        contacts_empty: 'لسه مفيش جهات اتصال سابقة',
        nav_groups: 'الجروبات',
        groups_title: 'الجروبات',
        groups_search_placeholder: 'ابحث عن جروب',
        groups_empty_title: 'مفيش جروبات لسه',
        groups_empty_sub: 'دوس على علامة + وابدأ أول جروب',
        group_pick_members_sub: 'اختار الناس اللي عايز تعمل معاهم الجروب',
        group_pick_members_empty: 'لازم تتكلم مع حد الأول عشان تضيفه لجروب',
        group_details_sub: 'اختار اسم وصورة للجروب',
        group_name_placeholder: 'اسم الجروب',
        btn_next: 'التالي',
        btn_back: 'رجوع',
        btn_create_group: 'إنشاء',
        conv_menu_group_members: 'أعضاء الجروب',
        conv_menu_group_members_sub: 'شوف كل الأعضاء في الجروب ده',
        group_info_title: 'معلومات الجروب',
        group_members_count: 'الأعضاء',
        bubbles_body_group: 'لون فقاعتك بيفضل معاك في كل الشاتات والجروبات اللي ليك.',
        ctx_delete_everyone_group: 'حذف من عند الجميع',
        delete_selected_body_group: 'رسائلك هتتحذف نهائيًا من عند الجميع، ورسائل الأعضاء التانيين هتتخفي من عندك بس.'
    };

    const EN_TEXT = {
        settings: 'Settings',
        chats_title: 'Chats',
        search_placeholder: 'Search chats',
        empty_title: 'No chats yet',
        empty_sub: 'Tap the + button to start your first chat',
        nav_chats: 'Chats',
        nav_settings: 'Settings',
        sidebar_airplane: 'Airplane Mode',
        sidebar_ghost: 'Ghost Mode',
        sidebar_restart: 'Restart app',
        mode_conflict_title: 'Turn off the other mode first',
        mode_conflict_sub: "You can't run Airplane Mode and Ghost Mode at the same time",
        btn_ok: 'OK',
        vip_required_title: 'This feature is for VIP members only',
        vip_required_sub: 'Airplane Mode and Ghost Mode are available for VIP members for just 30 EGP a month',
        vip_required_cta: 'Subscribe now',
        airplane_confirm_on_title: 'Turn on Airplane Mode?',
        airplane_confirm_on_sub: "You'll be disconnected from the internet in-app entirely, and won't receive any new messages until you turn it off",
        airplane_confirm_off_title: 'Turn off Airplane Mode?',
        airplane_confirm_off_sub: "You'll reconnect to the internet in-app normally and start receiving messages again",
        ghost_confirm_on_title: 'Turn on Ghost Mode?',
        ghost_confirm_on_sub: 'Your replies will go through normally, but the other side will only see a single check mark until you turn this off',
        ghost_confirm_off_title: 'Turn off Ghost Mode?',
        ghost_confirm_off_sub: 'Messages will go back to showing normal blue double checks',
        btn_confirm: 'Confirm',
        modal_new_chat_sub: 'Type the email you want to chat with',
        btn_cancel: 'Cancel',
        btn_start_chat: 'Start Chat',
        lg_title: 'Liquid Glass',
        lg_sub: 'Enable the Liquid Glass effect across the app',
        lg_body: 'Turn each Liquid Glass effect on or off individually. Everything is off by default.',
        lg_warning: 'Recommended for powerful devices only. Slight lag may occur on weaker devices.',
        lg_bottombar_title: 'Enable Liquid Glass',
        lg_bottombar_sub: 'A translucent glass navigation bar',
        lg_icons_title: 'Liquid Glass from icons',
        lg_icons_sub: 'Apply glass material to circular buttons',
        lg_home_title: 'Liquid Glass in Home',
        lg_home_toggle_title: 'Liquid Glass in Home',
        lg_icons_home_title: 'Liquid Glass in icon',
        lg_chat_title: 'Liquid Glass in Chat',
        lg_chat_body: 'Enable Liquid Glass on the name bar, the back button, and the input bar in the chat screen.',
        lg_chat_toggle_title: 'Liquid Glass in Chat',
        lg_chat_sub: 'Name bar, back button, and input bar',
        lg_icons_chat_title: 'Liquid Glass in icon',
        lg_chat_soon_body: 'This feature is currently in development and will be available soon.',
        lg_soon_sub: 'Coming soon',
        themes_title: 'App Themes',
        themes_sub: 'Customize your color scheme',
        themes_body: 'Choose a color theme for the app. Your choice is saved automatically.',
        theme_dark: 'Dark',
        theme_white: 'White',
        theme_pick: 'Choose your theme color',
        lang_title: 'App Language',
        lang_sub: 'Switch between Arabic and English',
        lang_body: 'Choose your preferred language. The app will update instantly.',
        version_title: 'App Version',
        version_sub: 'Check the current version',
        version_body: 'You are using the latest version of ChatZone. The app is updated regularly to ensure the best experience.',
        version_badge: 'Current version: 1.0',
        about_title: 'Info',
        about_sub: 'Meet the ChatZone team',
        about_body: 'Welcome to ChatZone, a simple and fast chat app that aims to give you a comfortable and secure way to connect with anyone using just their email. We hope to always be worthy of your trust 💚',
        nav_chats_row: 'Home',
        chat_row: 'Chat',
        privacy_row: 'Privacy',
        privacy_title: 'Privacy',
        privacy_body: 'We respect your privacy. Your chat data is encrypted and stored securely. We never share your data with third parties.',
        privacy_hide_photo_title: 'Hide profile photo from others',
        privacy_hide_photo_sub: 'People you chat with won\'t see your profile photo',
        privacy_hide_readreceipts_title: 'Hide read receipts',
        privacy_hide_readreceipts_sub: 'Blue read receipts won\'t appear for you or the other person',
        ctx_pin: 'Pin chat',
        ctx_delete_chat: 'Delete chat',
        delete_chat_title: 'Delete this chat?',
        delete_chat_body: 'It will be deleted for you only. If the other person sends a new message, it will reappear.',
        logout_row: 'Log out',
        logout_title: 'Log out?',
        logout_body: 'Logging out will permanently delete your account (all your chats and messages), and you will need to sign in again.',
        add_choice_sub: 'Who do you want to talk to?',
        add_choice_existing_title: 'Chat with someone you talked to before',
        add_choice_existing_sub: 'Pick from your contacts list',
        add_choice_new_title: 'Chat with someone new',
        add_choice_new_sub: 'Start a chat with a new email',
        contacts_sub: 'People you have previously chatted with',
        contacts_empty: 'No previous contacts yet',
        nav_groups: 'Groups',
        groups_title: 'Groups',
        groups_search_placeholder: 'Search groups',
        groups_empty_title: 'No groups yet',
        groups_empty_sub: 'Tap the + button to start your first group',
        group_pick_members_sub: 'Pick the people you want in the group',
        group_pick_members_empty: 'You need to chat with someone first before adding them to a group',
        group_details_sub: 'Choose a name and photo for the group',
        group_name_placeholder: 'Group name',
        btn_next: 'Next',
        btn_back: 'Back',
        btn_create_group: 'Create',
        conv_menu_group_members: 'Group members',
        conv_menu_group_members_sub: 'See everyone in this group',
        group_info_title: 'Group info',
        group_members_count: 'Members',
        bubbles_body_group: 'Your bubble color follows you across all your chats and groups.',
        ctx_delete_everyone_group: 'Delete for everyone',
        delete_selected_body_group: 'Your selected messages will be permanently deleted for everyone, and other members\' selected messages will be hidden for you only.'
    };

    let currentLang = localStorage.getItem('cz_lang') || 'ar';

    function applyLang(lang) {
        currentLang = lang;
        localStorage.setItem('cz_lang', lang);
        const isAr = lang === 'ar';
        document.documentElement.lang = lang;
        document.documentElement.dir = isAr ? 'rtl' : 'ltr';

        const dict = isAr ? AR_TEXT : EN_TEXT;
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (dict[key] !== undefined) el.textContent = dict[key];
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (dict[key] !== undefined) el.setAttribute('placeholder', dict[key]);
        });

        const langAr = document.getElementById('lang-opt-ar');
        const langEn = document.getElementById('lang-opt-en');
        if (langAr) langAr.classList.toggle('selected', lang === 'ar');
        if (langEn) langEn.classList.toggle('selected', lang === 'en');
    }

    const langArOpt = document.getElementById('lang-opt-ar');
    const langEnOpt = document.getElementById('lang-opt-en');
    if (langArOpt) langArOpt.addEventListener('click', () => applyLang('ar'));
    if (langEnOpt) langEnOpt.addEventListener('click', () => applyLang('en'));

    applyLang(currentLang);

    // ===== شاشات: تنقل بين الدردشات والإعدادات =====
    const screens = document.querySelectorAll('.screen');
    const navButtons = document.querySelectorAll('.nav-btn');
    const tabPill = document.getElementById('tabPill');
    const bottomNav = document.getElementById('bottomNav');

    // الدايرة اتصغرت بنسبة 18% عن عرض الزرار الأصلي، وبتفضل متمركزة
    // تحت الزرار (مش ملاصقة الحافة) عشان تبقى دايرة عادية واضحة.
    const PILL_SHRINK = 0.82; // 100% - 18%

    function movePillTo(btn, animate) {
        if (!tabPill || !bottomNav || !btn) return;
        const navRect = bottomNav.getBoundingClientRect();
        const btnRect = btn.getBoundingClientRect();
        const fullWidth = btnRect.width;
        const width = fullWidth * PILL_SHRINK;
        const left = (btnRect.left - navRect.left) + (fullWidth - width) / 2;
        if (!animate) {
            tabPill.style.transition = 'none';
        }
        tabPill.style.width = width + 'px';
        tabPill.style.transform = 'translateX(' + left + 'px)';
        if (!animate) {
            void tabPill.offsetHeight;
            tabPill.style.transition = '';
        }
    }

    function switchTab(targetId) {
        screens.forEach(screen => {
            screen.classList.toggle('hidden', screen.id !== targetId);
        });
        let activeBtn = null;
        navButtons.forEach(btn => {
            const isActive = btn.dataset.target === targetId;
            btn.classList.toggle('active', isActive);
            if (isActive) activeBtn = btn;
        });
        if (activeBtn) movePillTo(activeBtn, true);
        closeSidebarMenu();
    }

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.target));
    });

    // نضبط مكان الـ pill عند التحميل الأول (بدون أنيميشن) وعند تغيير حجم الشاشة
    window.addEventListener('load', () => {
        const activeBtn = document.querySelector('.nav-btn.active');
        movePillTo(activeBtn, false);
    });
    window.addEventListener('resize', () => {
        const activeBtn = document.querySelector('.nav-btn.active');
        movePillTo(activeBtn, false);
    });
    // Fallback فوري في حالة الـ load event فات قبل ما نوصله
    requestAnimationFrame(() => {
        const activeBtn = document.querySelector('.nav-btn.active');
        movePillTo(activeBtn, false);
    });

    // ===== بيانات البروفايل (اسم + إيميل + أفاتار) فوق شاشة الإعدادات =====
    const profileName = document.getElementById('profileName');
    const profileEmail = document.getElementById('profileEmail');
    const profileAvatar = document.getElementById('profileAvatar');

    const savedName = localStorage.getItem('cz_user_name');
    const savedEmail = localStorage.getItem('cz_verified_email');

    if (savedName && profileName) {
        profileName.textContent = savedName;
    }
    if (savedEmail && profileEmail) {
        profileEmail.textContent = savedEmail;
    }

    function t(arText, enText) {
        return (localStorage.getItem('cz_lang') || 'ar') === 'en' ? enText : arText;
    }

    // ===== صورة البروفايل (عرض فقط هنا — التغيير بقى من صفحة
    // your-profile.html بس، مش من شاشة الإعدادات) =====
    const profileAvatarIcon = document.getElementById('profileAvatarIcon');
    const savedEmailLowerForAvatar = savedEmail ? savedEmail.toLowerCase() : '';

    // ===== إخفاء صورة البروفايل عن الآخرين =====
    // مخزّنة كحقل على مستند المستخدم نفسه (users/{email}.hidePhotoFromOthers)
    // في Firestore، مش localStorage — عشان أي حد تاني بيفتح شات مع
    // المستخدم ده يقدر يتأكد من الحقل ده قبل ما يعرض صورته.
    (async function initHidePhotoToggle() {
        const input = document.getElementById('privacySwitch-hidePhotoFromOthers');
        if (!input || !savedEmailLowerForAvatar) return;

        try {
            const snap = await getDoc(doc(db, 'users', savedEmailLowerForAvatar));
            input.checked = snap.exists() && snap.data().hidePhotoFromOthers === true;
        } catch (e) {
            console.warn('تعذّر تحميل حالة إخفاء صورة البروفايل:', e);
        }

        input.addEventListener('change', async () => {
            const wantHidden = input.checked;
            input.disabled = true;
            try {
                await updateDoc(doc(db, 'users', savedEmailLowerForAvatar), { hidePhotoFromOthers: wantHidden });
                if (navigator.vibrate) { try { navigator.vibrate(6); } catch (e) {} }
            } catch (e) {
                console.error('فشل تحديث إخفاء صورة البروفايل:', e);
                input.checked = !wantHidden; // رجوع للحالة القديمة لو الحفظ فشل
            } finally {
                input.disabled = false;
            }
        });
    })();

    // بيعرض الصورة الحالية جوه دايرة البروفايل، أو يرجّع الأيقونة
    // الافتراضية لو مفيش صورة محفوظة أصلاً.
    function renderProfileAvatarImage(photoURL) {
        if (!profileAvatar) return;
        let img = profileAvatar.querySelector('.profile-avatar-img');
        if (photoURL) {
            if (!img) {
                img = document.createElement('img');
                img.className = 'profile-avatar-img';
                img.alt = '';
                profileAvatar.appendChild(img);
            }
            img.src = photoURL;
            if (profileAvatarIcon) profileAvatarIcon.style.display = 'none';
        } else {
            if (img) img.remove();
            if (profileAvatarIcon) profileAvatarIcon.style.display = '';
        }
    }

    // أول ما تفتح صفحة الإعدادات، نجيب صورة البروفايل المحفوظة (لو
    // موجودة) من Firestore ونعرضها فورًا.
    (async function loadSavedAvatar() {
        if (!savedEmailLowerForAvatar) return;
        try {
            const snap = await getDoc(doc(db, 'users', savedEmailLowerForAvatar));
            const photoURL = snap.exists() && snap.data().photoURL ? snap.data().photoURL : '';
            if (photoURL) renderProfileAvatarImage(photoURL);
        } catch (e) {
            console.warn('تعذّر تحميل صورة البروفايل:', e);
        }
    })();

    // الصف كله (صورة + اسم + إيميل) بيودّي لصفحة البروفايل الشخصي،
    // ومن هناك بس يقدر يغيّر الصورة أو يحذفها أو يكتب About.
    const openYourProfileRow = document.getElementById('openYourProfile');
    if (openYourProfileRow) {
        openYourProfileRow.addEventListener('click', () => {
            window.location.href = 'your-profile.html';
        });
    }

    // ===== قائمة التلت نقط (Dropdown Menu) =====
    const menuBtn = document.getElementById('menuBtn');
    const sidebarMenu = document.getElementById('sidebarMenu');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    function openSidebarMenu() {
        if (!sidebarMenu || !sidebarOverlay || !menuBtn) return;
        // نحط القائمة تحت زرار التلت نقط مباشرة (يمين في RTL، شمال في LTR)
        const isRtl = document.documentElement.dir === 'rtl';
        const btnRect = menuBtn.getBoundingClientRect();
        sidebarMenu.style.top = (btnRect.bottom + 8) + 'px';
        if (isRtl) {
            sidebarMenu.style.right = (window.innerWidth - btnRect.right) + 'px';
            sidebarMenu.style.left = 'auto';
        } else {
            sidebarMenu.style.left = btnRect.left + 'px';
            sidebarMenu.style.right = 'auto';
        }
        sidebarMenu.classList.add('open');
        sidebarOverlay.classList.add('open');
    }

    function closeSidebarMenu() {
        if (!sidebarMenu || !sidebarOverlay) return;
        sidebarMenu.classList.remove('open');
        sidebarOverlay.classList.remove('open');
    }

    if (menuBtn) {
        menuBtn.addEventListener('click', () => {
            if (sidebarMenu && sidebarMenu.classList.contains('open')) {
                closeSidebarMenu();
            } else {
                openSidebarMenu();
            }
        });
    }
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', closeSidebarMenu);
    }
})();
