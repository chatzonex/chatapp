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
    arrayRemove,
    collection,
    query,
    where,
    orderBy,
    onSnapshot,
    serverTimestamp,
    writeBatch,
    ensureAuthenticated
} from "./firebase-init.js";

// =====================================================
// دالة أمان أساسية: بتتأكد إن الـ uid الحالي بتاع جلسة
// Firebase Auth (anonymous) هو فعلاً نفس الـ uid اللي
// اتسجل وقت التحقق من الإيميل ده (users/{email}.uid).
//
// المشكلة اللي بتحلها: لو حد كتب إيميلك يدويًا في
// localStorage بتاعه (cz_verified_email) على جهاز تاني،
// هيدخل بجلسة anonymous جديدة ليها uid مختلف تمامًا عن
// اللي مسجل فعليًا لإيميلك. من غير الفحص ده، الكود القديم
// كان بيسمحله يفتح المحادثة ويضيف نفسه للـ participants
// (arrayUnion) من غير أي تحقق حقيقي إنه صاحب الإيميل.
//
// ملحوظة: ده تحسين على مستوى الفرونت إند بيمنع السيناريو
// العملي (حد يكتب إيميلك في localStorage بتاعه). مش بديل
// كامل عن تحقق سيرفري حقيقي (Cloud Function + custom token)
// لأن أي حد عنده أدوات مطورين برضو يقدر نظريًا يتلاعب بالكود
// الشغال عنده محليًا. الحل الكامل محتاج Blaze plan.
// =====================================================
async function verifyOwnership(email, uid) {
    try {
        const userDocRef = doc(db, 'users', email.toLowerCase());
        const userSnap = await getDoc(userDocRef);
        if (!userSnap.exists()) return false;
        const data = userSnap.data();
        return data.uid === uid;
    } catch (e) {
        console.error('فشل التحقق من ملكية الإيميل:', e);
        return false;
    }
}

// =====================================================
// بيحفظ جهة اتصال في users/{myEmail}/contacts/{otherEmail} — قائمة
// منفصلة تمامًا عن مجموعة chats، فبتفضل موجودة حتى لو الشات نفسه
// اتحذف نهائيًا (زي ما بيحصل في deleteChatPermanently). بنستخدم
// setDoc بـ merge عشان أول مرة تنشئ ومرة بعد كده تحدّث lastContactAt
// بس من غير ما تكرر أي حاجة.
// =====================================================
async function saveContact(myEmail, otherEmail) {
    if (!myEmail || !otherEmail) return;
    const contactRef = doc(db, 'users', myEmail.toLowerCase(), 'contacts', otherEmail.toLowerCase());
    await setDoc(contactRef, {
        email: otherEmail.toLowerCase(),
        lastContactAt: serverTimestamp()
    }, { merge: true });
}

(function () {
    // =====================================================
    // 1) احترام الثيم واللغة والـ Liquid Glass المحفوظين
    //    من شاشة الإعدادات — بنفس منطق باقي شاشات الأبب
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

    // الزجاج السائل في شاشة الشات بقى مفتاح مستقل تمامًا (cz_lg_chat)
    // عن زجاج الرئيسية (cz_lg_bottombar) — كل واحد بيتفعّل لوحده من
    // غير ما يأثر على التاني.
    if (localStorage.getItem('cz_lg_chat') === 'on') {
        document.body.classList.add('lg-chat-on');
    }

    const I18N = {
        ar: {
            type_message: 'اكتب رسالة...',
            back: 'رجوع',
            unknown_contact: 'مستخدم',
            conv_menu_bubbles: 'تخصيص لون الفقاعات',
            conv_menu_bubbles_sub: 'لون فقاعتك بيفضل معاك في كل شاتاتك',
            conv_menu_font: 'تخصيص الخط',
            conv_menu_font_sub: 'اختر خط الكتابة في الشات',
            conv_menu_info: 'معلومات الحساب',
            conv_menu_info_sub: 'اسم وإيميل الشخص اللي بتكلمه',
            bubbles_title: 'تخصيص لون الفقاعات',
            bubbles_body: 'لون فقاعتك بيفضل معاك في كل الشاتات اللي ليك. وتقدر كمان تغيّر لون فقاعة الطرف التاني، وهيتطبق عنده فورًا.',
            bubbles_mine_title: 'لون فقاعتي',
            bubbles_theirs_title: 'لون فقاعة {name}',
            bubbles_tick_title: 'لون الصح الزرقاء',
            bubbles_preview_hi: 'أهلا',
            bubbles_preview_hi_reply: 'أهلا وسهلا',
            bubbles_default: 'افتراضي',
            bubbles_silver: 'فضي',
            bubbles_green: 'أخضر',
            bubbles_blue: 'أزرق',
            bubbles_pink: 'وردي',
            bubbles_purple: 'بنفسجي',
            bubbles_orange: 'برتقالي',
            bubbles_cyan: 'سماوي',
            bubbles_red: 'أحمر',
            bubbles_dark: 'داكن',
            bubbles_reset: 'إرجاع الافتراضي',
            choose_color_title: 'اختر لون',
            choose_color_custom: 'محرر الألوان (اختر أي لون)',
            choose_color_presets: 'ألوان الفقاعات الخاصة بالتطبيق',
            choose_color_presets_title: 'ألوان الفقاعات الخاصة بالتطبيق',
            choose_color_editor_title: 'اختر لون',
            choose_color_editor_sub: 'دوس حفظ عشان اللون يتطبق، أو إلغاء عشان ترجع من غير أي تغيير.',
            color_save: 'حفظ',
            color_cancel: 'إلغاء',
            unsaved_guard_title: 'تحفظ اللون الأول؟',
            unsaved_guard_sub: 'عندك لون مختار لسه ما اتحفظش. لو خرجت دلوقتي هيتلغي.',
            unsaved_guard_discard: 'إلغاء',
            font_title: 'تخصيص الخط',
            font_body: 'اختر خط الكتابة في الشات، وسيتم حفظه واستخدامه دايمًا في كل المحادثات.',
            font_default: 'الافتراضي',
            font_deco_ar: '(خط زخرفي عربي)',
            font_deco_en: '(خط زخرفي إنجليزي)',
            info_name_label: 'الاسم',
            info_email_label: 'البريد الإلكتروني',
            info_rename_label: 'تغيير الاسم',
            info_rename_placeholder: 'اكتب اسم جديد',
            info_rename_save: 'حفظ',
            info_rename_success: 'اتغيّر الاسم',
            info_rename_empty: 'اكتب اسم الأول',
            ctx_reply: 'رد',
            ctx_copy: 'نسخ',
            ctx_forward: 'توجيه',
            ctx_select: 'تحديد',
            ctx_delete_msg: 'حذف الرسالة',
            ctx_delete_everyone: 'حذف من عند الطرفين',
            ctx_delete_me: 'حذف من عندي بس',
            delete_msg_title: 'حذف الرسالة؟',
            delete_msg_body_mine: 'تقدر تحذفها من عندك بس، أو من عند الطرفين.',
            delete_msg_body_theirs: 'هتتحذف من عندك أنت بس، ولسه هتفضل ظاهرة عند الطرف التاني.',
            delete_selected_title: 'حذف الرسائل المحددة؟',
            delete_selected_body: 'رسائلك هتتحذف نهائيًا من عند الطرفين، ورسائل الطرف التاني هتتخفي من عندك بس.',
            btn_delete: 'حذف',
            deleted_msg_text: 'تم حذف هذه الرسالة',
            reply_you: 'أنت',
            msg_deleted_toast: 'اتحذفت الرسالة',
            copied_toast: 'اتنسخت الرسالة',
            forwarded_label: 'تم التوجيه',
            forward_title: 'توجيه إلى',
            forward_pick_hint: 'اختر لغاية 10 أشخاص',
            forward_search_placeholder: 'بحث بالاسم أو الإيميل',
            forward_send: 'توجيه',
            forward_limit_toast: 'أقصى حاجة تقدر تختار 10 أشخاص',
            forward_empty: 'لسه معملتش أي محادثة مع حد',
            forward_loading: 'بيتحمّل...',
            forwarded_toast: 'اتوجهت الرسالة',
            typing_status: 'يكتب الآن...',
            weak_connection: 'نتك ضعيف'
        },
        en: {
            type_message: 'Type a message...',
            back: 'Back',
            unknown_contact: 'User',
            conv_menu_bubbles: 'Customize bubble colors',
            conv_menu_bubbles_sub: 'Your bubble color follows you across all chats',
            conv_menu_font: 'Customize font',
            conv_menu_font_sub: 'Choose the chat font',
            conv_menu_info: 'Account info',
            conv_menu_info_sub: 'Name and email of the person you\'re chatting with',
            bubbles_title: 'Customize bubble colors',
            bubbles_body: 'Your bubble color follows you across all your chats. You can also change the other person\'s bubble color, and it applies instantly for them.',
            bubbles_mine_title: 'My bubble color',
            bubbles_theirs_title: '{name}\'s bubble color',
            bubbles_tick_title: 'Blue checkmark color',
            bubbles_preview_hi: 'Hi',
            bubbles_preview_hi_reply: 'Hi there',
            bubbles_default: 'Default',
            bubbles_silver: 'Silver',
            bubbles_green: 'Green',
            bubbles_blue: 'Blue',
            bubbles_pink: 'Pink',
            bubbles_purple: 'Purple',
            bubbles_orange: 'Orange',
            bubbles_cyan: 'Cyan',
            bubbles_red: 'Red',
            bubbles_dark: 'Dark',
            bubbles_reset: 'Reset to default',
            choose_color_title: 'Choose a color',
            choose_color_custom: 'Color editor (pick any color)',
            choose_color_presets: 'App bubble colors',
            choose_color_presets_title: 'App bubble colors',
            choose_color_editor_title: 'Choose a color',
            choose_color_editor_sub: 'Tap Save to apply the color, or Cancel to go back without changes.',
            color_save: 'Save',
            color_cancel: 'Cancel',
            unsaved_guard_title: 'Save this color?',
            unsaved_guard_sub: 'You picked a color that hasn\'t been saved yet. Leaving now will discard it.',
            unsaved_guard_discard: 'Discard',
            font_title: 'Customize font',
            font_body: 'Choose the chat font. It will be saved and used across all conversations.',
            font_default: 'Default',
            font_deco_ar: '(Arabic decorative font)',
            font_deco_en: '(English decorative font)',
            info_name_label: 'Name',
            info_email_label: 'Email',
            info_rename_label: 'Change name',
            info_rename_placeholder: 'Type a new name',
            info_rename_save: 'Save',
            info_rename_success: 'Name updated',
            info_rename_empty: 'Type a name first',
            ctx_reply: 'Reply',
            ctx_copy: 'Copy',
            ctx_forward: 'Forward',
            ctx_select: 'Select',
            ctx_delete_msg: 'Delete message',
            ctx_delete_everyone: 'Delete for everyone',
            ctx_delete_me: 'Delete for me',
            delete_msg_title: 'Delete this message?',
            delete_msg_body_mine: 'You can delete it for you only, or for everyone.',
            delete_msg_body_theirs: 'It will be deleted for you only. It will still show for the other person.',
            delete_selected_title: 'Delete selected messages?',
            delete_selected_body: 'Your messages will be permanently deleted for everyone, and their messages will be hidden for you only.',
            btn_delete: 'Delete',
            deleted_msg_text: 'This message was deleted',
            reply_you: 'You',
            msg_deleted_toast: 'Message deleted',
            copied_toast: 'Message copied',
            forwarded_label: 'Forwarded',
            forward_title: 'Forward to',
            forward_pick_hint: 'Choose up to 10 people',
            forward_search_placeholder: 'Search by name or email',
            forward_send: 'Forward',
            forward_limit_toast: 'You can select up to 10 people only',
            forward_empty: "You haven't chatted with anyone yet",
            forward_loading: 'Loading...',
            forwarded_toast: 'Message forwarded',
            typing_status: 'typing...',
            weak_connection: 'Weak connection'
        }
    };
    const T = I18N[isAr ? 'ar' : 'en'];

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (T[key] !== undefined) el.textContent = T[key];
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (T[key]) el.setAttribute('placeholder', T[key]);
    });

    // =====================================================
    // 2) لازم يكون فيه مستخدم مسجل دخول (Firebase Auth) قبل
    //    أي حاجة، وإلا نرجّعه لصفحة التسجيل
    // =====================================================
    const myEmail = localStorage.getItem('cz_verified_email');
    const otherEmail = localStorage.getItem('cz_active_chat_email') || '';

    if (!myEmail || !otherEmail) {
        window.location.href = 'MainActivity.html';
        return;
    }

    const convNameEl = document.getElementById('convName');
    const convStatusEl = document.getElementById('convStatus');

    // =====================================================
    // مراقبة جودة الاتصال — تنبيه "نتك ضعيف" في نص الشاشة
    // =====================================================
    // المنطق: أول ما الصفحة تتفتح، بنبدأ عداد 10 دقايق. بعد كل 10
    // دقايق بنتشيك: هل النت واقع (navigator.onLine == false) أو لسه
    // مستني رد من السيرفر من فترة طويلة (آخر إشارة وصلتنا من الكاش
    // المحلي بس مش من السيرفر)؟ لو أيوه، بنورّي رسالة في نص الشاشة
    // لمدة 5 ثواني وتختفي لوحدها، وبعدين نرجع نتشيك تاني بعد 10
    // دقايق كمان — وهكذا لحد ما النت يرجع تمام.
    const WEAK_CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 دقايق
    const WEAK_ALERT_DURATION_MS = 5 * 1000; // 5 ثواني
    let lastServerAckAt = Date.now();
    let weakAlertEl = null;
    let weakAlertHideTimer = null;

    function markServerAck() {
        lastServerAckAt = Date.now();
    }

    function isConnectionCurrentlyWeak() {
        if (navigator.onLine === false) return true;
        // لو عدى أكتر من دقيقتين من غير ما نستلم أي تأكيد حقيقي من
        // السيرفر (مش من الكاش)، نعتبر النت ضعيف/متعثر
        return (Date.now() - lastServerAckAt) > 2 * 60 * 1000;
    }

    function showWeakConnectionAlert() {
        if (weakAlertEl) return;
        weakAlertEl = document.createElement('div');
        weakAlertEl.className = 'cz-weak-conn-overlay';
        weakAlertEl.innerHTML = `
            <div class="cz-weak-conn-box">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9z"></path>
                    <path d="M5 13l2 2a8.5 8.5 0 0 1 10 0l2-2C14.5 8.5 9.5 8.5 5 13z"></path>
                    <line x1="12" y1="20" x2="12.01" y2="20"></line>
                </svg>
                <span>${T.weak_connection}</span>
            </div>`;
        document.body.appendChild(weakAlertEl);
        requestAnimationFrame(() => weakAlertEl.classList.add('show'));
        weakAlertHideTimer = setTimeout(hideWeakConnectionAlert, WEAK_ALERT_DURATION_MS);
    }

    function hideWeakConnectionAlert() {
        if (!weakAlertEl) return;
        weakAlertEl.classList.remove('show');
        const el = weakAlertEl;
        weakAlertEl = null;
        setTimeout(() => el.remove(), 300);
    }

    function scheduleWeakConnectionCheck() {
        setTimeout(() => {
            if (isConnectionCurrentlyWeak()) {
                showWeakConnectionAlert();
            }
            scheduleWeakConnectionCheck();
        }, WEAK_CHECK_INTERVAL_MS);
    }

    window.addEventListener('offline', () => {
        // لو النت واقع فعلاً، مفيش داعي نستنى 10 دقايق — نورّي التنبيه
        // على طول عشان المستخدم يعرف إن رسايله هتتأخر لحد ما يرجع
        showWeakConnectionAlert();
    });

    scheduleWeakConnectionCheck();

    function displayNameFromEmail(email) {
        if (!email) return T.unknown_contact;
        const namePart = email.split('@')[0];
        return namePart.charAt(0).toUpperCase() + namePart.slice(1);
    }

    // بنحط اسم مبدئي مشتق من الإيميل فورًا (عشان الشاشة متفضلش فاضية)،
    // وبعدين نستبدله بالاسم الحقيقي المحفوظ في users/{email}.name أول
    // ما نجيبه من Firestore. مفيش حالة أونلاين/أوفلاين خالص دلوقتي —
    // شاشة الحالة اتشالت نهائيًا بناءً على طلب المستخدم.
    convNameEl.textContent = displayNameFromEmail(otherEmail);
    convStatusEl.textContent = '';

    let otherRealName = displayNameFromEmail(otherEmail);
    // الاسم اللي أنا (بس أنا) غيّرته لجهة الاتصال دي في الشات ده —
    // لو موجود، بيتعرض بدل الاسم الحقيقي بتاعها، وده تأثير محلي عندي
    // أنا بس ومش بيغيّر أي حاجة عند الطرف التاني.
    let myContactName = '';

    // اسمي الحقيقي أنا (من users/{myEmail}.name) — مستخدم في رسائل
    // النظام (زي "فلان غيّر لون الفقاعات") عشان الطرف التاني يشوف
    // اسمي الحقيقي أنا مش اسم مشتق من إيميلي.
    let myRealName = displayNameFromEmail(myEmail);
    async function loadMyRealName() {
        try {
            const mySnap = await getDoc(doc(db, 'users', myEmail.toLowerCase()));
            if (mySnap.exists() && mySnap.data().name) {
                myRealName = mySnap.data().name;
            }
        } catch (e) {
            console.error('فشل جلب اسمي الحقيقي:', e);
        }
    }
    loadMyRealName();

    function currentDisplayName() {
        return myContactName || otherRealName;
    }

    function refreshTopBarName() {
        convNameEl.textContent = currentDisplayName();
    }

    // =====================================================
    // صورة بروفايل الطرف التاني — بتتحط جمب اسمه في البار العلوي،
    // وجوه بابل الـ About كمان
    // =====================================================
    const convAvatarEl = document.getElementById('convAvatar');
    const convAvatarIconEl = document.getElementById('convAvatarIcon');
    const convAboutToastAvatarEl = document.getElementById('convAboutToastAvatar');

    function renderOtherAvatarImage(photoURL) {
        otherPhotoURL = photoURL || '';
        // البار العلوي
        if (convAvatarEl) {
            let img = convAvatarEl.querySelector('.conv-avatar-img');
            if (photoURL) {
                if (!img) {
                    img = document.createElement('img');
                    img.className = 'conv-avatar-img';
                    img.alt = '';
                    convAvatarEl.appendChild(img);
                }
                img.src = photoURL;
                if (convAvatarIconEl) convAvatarIconEl.style.display = 'none';
            } else {
                if (img) img.remove();
                if (convAvatarIconEl) convAvatarIconEl.style.display = '';
            }
        }
        // بابل الـ About
        if (convAboutToastAvatarEl) {
            let img2 = convAboutToastAvatarEl.querySelector('img');
            const iconSvg = convAboutToastAvatarEl.querySelector('svg');
            if (photoURL) {
                if (!img2) {
                    img2 = document.createElement('img');
                    img2.alt = '';
                    convAboutToastAvatarEl.appendChild(img2);
                }
                img2.src = photoURL;
                if (iconSvg) iconSvg.style.display = 'none';
            } else {
                if (img2) img2.remove();
                if (iconSvg) iconSvg.style.display = '';
            }
        }
    }

    // =====================================================
    // بابل About — بتظهر مرة واحدة بس في أول مرة يتفتح فيها الشات
    // ده على الجهاز ده (مش كل مرة يفتح فيها الشات)، وبتنزل من تحت
    // البار العلوي جنب زرار الرجوع، وتختفي لوحدها بعد كام ثانية.
    // =====================================================
    function maybeShowAboutToast(aboutText) {
        const toastEl = document.getElementById('convAboutToast');
        const nameEl = document.getElementById('convAboutToastName');
        const bodyEl = document.getElementById('convAboutToastBody');
        if (!toastEl || !aboutText) return;

        const seenKey = 'cz_about_seen_' + myEmail.toLowerCase() + '_' + otherEmail.toLowerCase();
        if (localStorage.getItem(seenKey)) return;

        if (nameEl) nameEl.textContent = currentDisplayName();
        if (bodyEl) bodyEl.textContent = aboutText;

        requestAnimationFrame(() => {
            toastEl.classList.add('show');
        });

        localStorage.setItem(seenKey, '1');

        setTimeout(() => {
            toastEl.classList.remove('show');
        }, 4500);
    }

    async function loadOtherRealName() {
        try {
            const otherUserRef = doc(db, 'users', otherEmail.toLowerCase());
            const snap = await getDoc(otherUserRef);
            if (snap.exists()) {
                const data = snap.data();
                if (data.name) {
                    otherRealName = data.name;
                    refreshTopBarName();
                    if (typeof refreshTheirsBubbleLabel === 'function') refreshTheirsBubbleLabel();
                }
                // لو الطرف التاني مفعّل "إخفاء صورة البروفايل عن الآخرين"،
                // منعرضش صورته عندنا خالص (حتى لو موجودة في مستنده).
                if (data.photoURL && data.hidePhotoFromOthers !== true) renderOtherAvatarImage(data.photoURL);
                if (data.about) maybeShowAboutToast(data.about);
                otherHidesReadReceipts = data.hideReadReceipts === true;
            }
        } catch (e) {
            // لو فشل الجلب لأي سبب، بيفضل الاسم المشتق من الإيميل كبديل
            console.error('فشل جلب الاسم الحقيقي للطرف التاني:', e);
        } finally {
            populateAccountInfo();
        }
    }

    // =====================================================
    // معلومات الحساب (اسم + إيميل الطرف التاني) — بتتحط في
    // شيت "معلومات الحساب" اللي بيتفتح من قايمة التلت نقط
    // =====================================================
    let otherPhotoURL = '';
    // لو الطرف التاني مفعّل "منع الصح الزرقاء" عنده هو (بنجيبها من
    // مستنده في loadOtherRealName)، وقتها منبعتش status:'read' خالص
    // على رسايله — عشان الخاصية تبقى ثنائية (bilateral): محدش من
    // الاتنين يشوف صح زرقاء في الشات ده لو أي طرف مفعّلها.
    let otherHidesReadReceipts = false;

    function populateAccountInfo() {
        const avatarEl = document.getElementById('accountInfoAvatar');
        const avatarIconEl = document.getElementById('accountInfoAvatarIcon');
        const nameEl = document.getElementById('accountInfoName');
        const emailEl = document.getElementById('accountInfoEmail');
        const nameValEl = document.getElementById('accountInfoNameValue');
        const emailValEl = document.getElementById('accountInfoEmailValue');
        const renameInput = document.getElementById('accountInfoRenameInput');

        const shownName = currentDisplayName();
        if (avatarEl) {
            let img = avatarEl.querySelector('.account-info-avatar-img');
            if (otherPhotoURL) {
                if (!img) {
                    img = document.createElement('img');
                    img.className = 'account-info-avatar-img';
                    img.alt = '';
                    avatarEl.appendChild(img);
                }
                img.src = otherPhotoURL;
                if (avatarIconEl) avatarIconEl.style.display = 'none';
            } else {
                if (img) img.remove();
                if (avatarIconEl) avatarIconEl.style.display = '';
            }
        }
        if (nameEl) nameEl.textContent = shownName;
        if (emailEl) emailEl.textContent = otherEmail;
        if (nameValEl) nameValEl.textContent = shownName;
        if (emailValEl) emailValEl.textContent = otherEmail;
        // بنحط الاسم المخصّص (لو موجود) جاهز في خانة التعديل، مش الاسم
        // الحقيقي، عشان يبان للمستخدم إنه ده اللي هيتعدّل
        if (renameInput && document.activeElement !== renameInput) {
            renameInput.value = myContactName || '';
        }
    }

    populateAccountInfo();
    loadOtherRealName();

    // لو جاي من بانل الصورة في الصفحة الرئيسية بضغطة على "معلومات
    // الحساب"، نفتح الشيت تلقائيًا أول ما الشات يفتح
    if (localStorage.getItem('cz_open_info_on_load') === '1') {
        localStorage.removeItem('cz_open_info_on_load');
        openSheet('sheet-account-info');
    }

    // =====================================================
    // 2.1) تغيير اسم جهة الاتصال — محلي عندي أنا بس، بيتخزن جوه
    //      مستند الشات بتاعي تحت contactNames.{myUid}، وبيتطبق في كل
    //      حتة اسم الطرف التاني بيظهر فيها في الشات ده (مش بيغيّر
    //      اسمه الحقيقي عند حد تاني خالص).
    // =====================================================
    const renameInput = document.getElementById('accountInfoRenameInput');
    const renameSaveBtn = document.getElementById('accountInfoRenameSave');

    async function loadMyContactName() {
        try {
            const chatSnap = await getDoc(doc(db, 'chats', chatId));
            if (chatSnap.exists()) {
                const data = chatSnap.data();
                const names = data.contactNames || {};
                if (myUid && names[myUid]) {
                    myContactName = names[myUid];
                    refreshTopBarName();
                    populateAccountInfo();
                }
            }
        } catch (e) {
            console.error('فشل جلب الاسم المخصص لجهة الاتصال:', e);
        }
    }

    async function saveContactRename() {
        if (!renameInput || !myUid) return;
        const newName = renameInput.value.trim();
        if (!newName) {
            showToast(T.info_rename_empty);
            return;
        }
        renameSaveBtn.disabled = true;
        try {
            await updateDoc(doc(db, 'chats', chatId), {
                ['contactNames.' + myUid]: newName
            });
            myContactName = newName;
            refreshTopBarName();
            populateAccountInfo();
            showToast(T.info_rename_success);
            if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} }
        } catch (e) {
            console.error('فشل حفظ الاسم المخصص:', e);
        } finally {
            renameSaveBtn.disabled = false;
        }
    }

    if (renameSaveBtn) {
        renameSaveBtn.addEventListener('click', saveContactRename);
    }
    if (renameInput) {
        renameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveContactRename();
        });
    }

    // =====================================================
    // توست صغير (تأكيد "اتغيّر الاسم"، "اتحذفت الرسالة"... إلخ)
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
    // 4) بناء chatId ثابت من الإيميلين (مرتبين أبجديًا) عشان
    //    نفس الاتنين يوصلوا لنفس المحادثة أيًا كان مين بدأها
    // =====================================================
    function makeChatId(emailA, emailB) {
        return [emailA.toLowerCase(), emailB.toLowerCase()].sort().join('__');
    }

    const chatId = makeChatId(myEmail, otherEmail);

    // =====================================================
    // 4.1) قايمة التلت نقط الخاصة بشاشة الشات (زي اللي في
    //      الصفحة الرئيسية بالظبط، بس بخيارات مختلفة)
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
            if (convSidebarMenu && convSidebarMenu.classList.contains('open')) {
                closeConvMenu();
            } else {
                openConvMenu();
            }
        });
    }
    if (convSidebarOverlay) {
        convSidebarOverlay.addEventListener('click', closeConvMenu);
    }

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
        convOpenBubbleColors.addEventListener('click', () => {
            closeConvMenu();
            openSheet('sheet-bubble-colors');
        });
    }
    if (convOpenFont) {
        convOpenFont.addEventListener('click', () => {
            closeConvMenu();
            openSheet('sheet-font');
        });
    }
    if (convOpenInfo) {
        convOpenInfo.addEventListener('click', () => {
            closeConvMenu();
            openSheet('sheet-account-info');
        });
    }

    // =====================================================
    // الضغط على صورة/اسم الطرف التاني في البار العلوي بيفتح
    // شيت "معلومات الحساب" مباشرة (فيه الصورة + الاسم + الإيميل)
    // =====================================================
    const convIdentityEl = document.getElementById('convIdentity');
    if (convIdentityEl) {
        convIdentityEl.addEventListener('click', () => {
            openSheet('sheet-account-info');
        });
    }

    // =====================================================
    // Fullscreen photo viewer — بيتفتح بضغطة مطولة على أي صورة
    // بروفايل (هنا: صورة الطرف التاني جوه شيت "معلومات الحساب")
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
        let timer = null;
        let startX = 0, startY = 0;

        function cancel() {
            if (timer) clearTimeout(timer);
            timer = null;
        }
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
        el.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            start(touch.clientX, touch.clientY);
        }, { passive: true });
        el.addEventListener('touchmove', (e) => {
            const touch = e.touches[0];
            if (Math.abs(touch.clientX - startX) > 10 || Math.abs(touch.clientY - startY) > 10) cancel();
        }, { passive: true });
        el.addEventListener('touchend', cancel);
        el.addEventListener('mousedown', (e) => start(e.clientX, e.clientY));
        el.addEventListener('mouseup', cancel);
        el.addEventListener('mouseleave', cancel);
        el.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    attachLongPressToViewPhoto(document.getElementById('accountInfoAvatar'), () => otherPhotoURL);

    // =====================================================
    // 4.2) تخصيص لون الفقاعات — دلوقتي بقى "تابع للشخص" مش
    //      للشات: كل شخص له لون واحد بيفضل معاه في كل شاتاته،
    //      متخزن في users/{email}.bubbleColor + bubbleColorDark.
    //      أي طرف في الشات يقدر يغيّر لون نفسه أو لون الطرف
    //      التاني، والتغيير بيتطبق فورًا عند الاتنين (onSnapshot)
    //      + بتتبعت رسالة نظام في الشات بـ "فلان غيّر لون الفقاعات".
    //      لون "الصح الزرقاء" فضل زي ما هو بالظبط: خاص بالشات ده
    //      بس، متخزن محليًا زي الأول.
    // =====================================================
    const convShellEl = document.querySelector('.conv-shell');
    const BUBBLE_TICK_KEY = 'cz_bubble_tick_' + chatId;

    // الألوان الافتراضية الرسمية لما المستخدم ملوّنش أي حاجة بنفسه:
    // فقاعتي = أخضر واتساب، فقاعة التاني = رمادي غامق واتساب،
    // وبتختلف حسب الوضع الفاتح/الداكن بتاع التطبيق (مش لون ثابت).
    function isLightMode() {
        return document.body.classList.contains('theme-white');
    }
    function DEFAULT_MINE_COLOR() {
        return isLightMode() ? '#DCF8C6' : '#005C4B';
    }
    function DEFAULT_THEIRS_COLOR() {
        return isLightMode() ? '#E9EAEB' : '#202C33';
    }
    const DEFAULT_TICK_COLOR = '#4FA3FF';

    // آخر لون معروف لكل طرف (بيتحدث لايف من onSnapshot على مستند
    // كل واحد فيهم — شايف تعريف الـ listeners في initChat تحت)
    let myBubbleColor = null;
    let myBubbleColorDark = '1';
    let otherBubbleColor = null;
    let otherBubbleColorDark = '1';

    function textColorFor(hex, isDark) {
        if (isDark === '1') return '#10161A';
        return '#FFFFFF';
    }

    function timeColorFor(hex, isDark) {
        return isDark === '1' ? 'rgba(16, 22, 26, 0.55)' : 'rgba(255, 255, 255, 0.7)';
    }

    function tickColorFor(isDark) {
        return isDark === '1' ? 'rgba(16, 22, 26, 0.45)' : 'rgba(255, 255, 255, 0.6)';
    }

    // بيحسب هل اللون فاتح ولا غامق عشان يقرر لون النص الأنسب
    // (مستخدم لما اللون جاي من محرر الألوان الحر، مش من قايمة جاهزة).
    function isColorDark(hex) {
        const c = hex.replace('#', '');
        const r = parseInt(c.substring(0, 2), 16);
        const g = parseInt(c.substring(2, 4), 16);
        const b = parseInt(c.substring(4, 6), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 150 ? '1' : '0';
    }

    function applyBubbleColors() {
        const mineColor = myBubbleColor;
        const theirsColor = otherBubbleColor;
        const tickColor = localStorage.getItem(BUBBLE_TICK_KEY);
        const mineDark = myBubbleColorDark || '1';
        const theirsDark = otherBubbleColorDark || '1';

        if (convShellEl) {
            if (mineColor) {
                convShellEl.style.setProperty('--bubble-mine-bg', mineColor);
                convShellEl.style.setProperty('--bubble-mine-text', textColorFor(mineColor, mineDark));
                convShellEl.style.setProperty('--bubble-mine-time', timeColorFor(mineColor, mineDark));
                convShellEl.style.setProperty('--bubble-mine-tick', tickColorFor(mineDark));
            } else {
                convShellEl.style.removeProperty('--bubble-mine-bg');
                convShellEl.style.removeProperty('--bubble-mine-text');
                convShellEl.style.removeProperty('--bubble-mine-time');
                convShellEl.style.removeProperty('--bubble-mine-tick');
            }
            if (theirsColor) {
                convShellEl.style.setProperty('--bubble-theirs-bg', theirsColor);
                convShellEl.style.setProperty('--bubble-theirs-text', textColorFor(theirsColor, theirsDark));
                convShellEl.style.setProperty('--bubble-theirs-time', timeColorFor(theirsColor, theirsDark));
            } else {
                convShellEl.style.removeProperty('--bubble-theirs-bg');
                convShellEl.style.removeProperty('--bubble-theirs-text');
                convShellEl.style.removeProperty('--bubble-theirs-time');
            }
            if (tickColor) {
                convShellEl.style.setProperty('--bubble-tick-read', tickColor);
            } else {
                convShellEl.style.removeProperty('--bubble-tick-read');
            }
        }
    }

    // =====================================================
    // معاينة حية (الفقاعتين + الصح) في أعلى شيت "تخصيص لون
    // الفقاعات" — بتتحدث فورًا كل ما لون يتغيّر أو يتحفظ
    // =====================================================
    const bubblePreviewMine = document.getElementById('bubblePreviewMine');
    const bubblePreviewTheirs = document.getElementById('bubblePreviewTheirs');
    const bubblePreviewTick = document.getElementById('bubblePreviewTick');
    const bubbleOptionMineSwatch = document.getElementById('bubbleOptionMineSwatch');
    const bubbleOptionTheirsSwatch = document.getElementById('bubbleOptionTheirsSwatch');
    const bubbleOptionTickSwatch = document.getElementById('bubbleOptionTickSwatch');

    function refreshBubblePreview() {
        const mineColor = myBubbleColor || DEFAULT_MINE_COLOR();
        const theirsColor = otherBubbleColor || DEFAULT_THEIRS_COLOR();
        const tickColor = localStorage.getItem(BUBBLE_TICK_KEY) || DEFAULT_TICK_COLOR;
        const mineDark = myBubbleColorDark || '1';
        const theirsDark = otherBubbleColorDark || '1';

        if (bubblePreviewMine) {
            bubblePreviewMine.style.background = mineColor;
            bubblePreviewMine.style.color = textColorFor(mineColor, mineDark);
        }
        if (bubblePreviewTheirs) {
            bubblePreviewTheirs.style.background = theirsColor;
            bubblePreviewTheirs.style.color = textColorFor(theirsColor, theirsDark);
        }
        if (bubblePreviewTick) {
            bubblePreviewTick.style.backgroundColor = tickColor;
        }
        if (bubbleOptionMineSwatch) bubbleOptionMineSwatch.style.background = mineColor;
        if (bubbleOptionTheirsSwatch) bubbleOptionTheirsSwatch.style.background = theirsColor;
        if (bubbleOptionTickSwatch) bubbleOptionTickSwatch.style.background = tickColor;
    }

    // =====================================================
    // "اختر لون" — شيت بيظهر لما تدوس على أي من الخيارات
    // التلاتة (يمين / يسار / صح زرقاء)، وفيه محرر ألوان حر
    // أو قايمة ألوان جاهزة (مربعات) في نص الشاشة
    // =====================================================
    const TARGET_LABELS = {
        mine: 'bubbles_mine_title',
        theirs: 'bubbles_theirs_title',
        tick: 'bubbles_tick_title'
    };
    function TARGET_DEFAULT(target) {
        if (target === 'mine') return DEFAULT_MINE_COLOR();
        if (target === 'theirs') return DEFAULT_THEIRS_COLOR();
        return DEFAULT_TICK_COLOR;
    }

    // بيرجع اللون الحالي المحفوظ للهدف ده (مش localStorage تاني —
    // mine/theirs بقوا متابعين للمتغيرات اللايف الجاية من Firestore)
    function currentColorFor(target) {
        if (target === 'mine') return myBubbleColor;
        if (target === 'theirs') return otherBubbleColor;
        return localStorage.getItem(BUBBLE_TICK_KEY);
    }

    let activeColorTarget = null; // 'mine' | 'theirs' | 'tick'
    let pendingEditorColor = null; // اللون اللي متختار في المحرر بس لسه ما اتحفظش
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

    let pendingPresetChoice = null; // { color, isDark } — اختيار من المربعات لسه ما اتحفظش

    function labelFor(key) {
        const raw = (T && T[key]) || key;
        return raw.replace('{name}', otherRealName);
    }

    // بيحدّث نص خيار "لون فقاعة فلان" في الشيت الرئيسي بالاسم
    // الحقيقي للطرف التاني (بيتنادى أول ما نجيب اسمه من Firestore)
    const bubbleOptionTheirsLabel = document.querySelector('#bubbleOptionTheirs span[data-i18n="bubbles_theirs_title"]');
    function refreshTheirsBubbleLabel() {
        if (bubbleOptionTheirsLabel) bubbleOptionTheirsLabel.textContent = labelFor('bubbles_theirs_title');
    }
    refreshTheirsBubbleLabel();

    function openChooseColorFor(target) {
        activeColorTarget = target;
        if (chooseColorTitle) chooseColorTitle.textContent = labelFor(TARGET_LABELS[target]);
        openSheet('sheet-choose-color');
    }

    if (document.getElementById('bubbleOptionMine')) {
        document.getElementById('bubbleOptionMine').addEventListener('click', () => openChooseColorFor('mine'));
    }
    if (document.getElementById('bubbleOptionTheirs')) {
        document.getElementById('bubbleOptionTheirs').addEventListener('click', () => openChooseColorFor('theirs'));
    }
    if (document.getElementById('bubbleOptionTick')) {
        document.getElementById('bubbleOptionTick').addEventListener('click', () => openChooseColorFor('tick'));
    }

    // --- محرر الألوان الحر ---
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

    // بيكتب لون فقاعة شخص (أنا أو الطرف التاني) في مستنده هو على
    // Firestore. bubbleColorViaChatId مطلوب في الـ rule عشان تتأكد
    // إن التعديل ده جاي من طرف فعلي في شات فيه صاحب اللون ده نفسه —
    // شايف تفاصيل الشرط في firestore.rules.
    async function writeBubbleColorFor(targetEmail, color, isDark, isDefault) {
        const userRef = doc(db, 'users', targetEmail.toLowerCase());
        await updateDoc(userRef, {
            bubbleColor: isDefault ? deleteField() : color,
            bubbleColorDark: isDefault ? deleteField() : isDark,
            bubbleColorUpdatedAt: serverTimestamp(),
            bubbleColorViaChatId: chatId
        });
    }

    async function commitColor(target, color, isDark) {
        if (target === 'tick') {
            if (color === TARGET_DEFAULT('tick')) {
                localStorage.removeItem(BUBBLE_TICK_KEY);
            } else {
                localStorage.setItem(BUBBLE_TICK_KEY, color);
            }
            applyBubbleColors();
            refreshBubblePreview();
            if (navigator.vibrate) { try { navigator.vibrate([6, 30, 6]); } catch (e) {} }
            return;
        }

        // mine / theirs: بيتكتبوا في Firestore على مستند صاحب اللون
        // الحقيقي، سواء أنا أو الطرف التاني. تحديث "متفائل" فوري على
        // المتغيرات المحلية عشان الاستجابة تحس إنها لحظية، والـ
        // onSnapshot هيأكد/يصحح القيمة لما ترجع من السيرفر (ولو
        // فشلت الكتابة، هيرجعها زي ما كانت).
        const targetEmail = target === 'mine' ? myEmail : otherEmail;
        const previousColor = target === 'mine' ? myBubbleColor : otherBubbleColor;
        const previousDark = target === 'mine' ? myBubbleColorDark : otherBubbleColorDark;
        const isDefault = color === TARGET_DEFAULT(target);

        if (target === 'mine') {
            myBubbleColor = isDefault ? null : color;
            myBubbleColorDark = isDark;
        } else {
            otherBubbleColor = isDefault ? null : color;
            otherBubbleColorDark = isDark;
        }
        applyBubbleColors();
        refreshBubblePreview();
        if (navigator.vibrate) { try { navigator.vibrate([6, 30, 6]); } catch (e) {} }

        try {
            await writeBubbleColorFor(targetEmail, color, isDark, isDefault);
        } catch (e) {
            console.error('فشل حفظ لون الفقاعة:', e);
            // رجّع القيمة القديمة لو الكتابة فشلت فعليًا
            if (target === 'mine') {
                myBubbleColor = previousColor;
                myBubbleColorDark = previousDark;
            } else {
                otherBubbleColor = previousColor;
                otherBubbleColorDark = previousDark;
            }
            applyBubbleColors();
            refreshBubblePreview();
        }
    }

    if (editorSaveBtn) {
        editorSaveBtn.addEventListener('click', () => {
            if (activeColorTarget && pendingEditorColor) {
                commitColor(activeColorTarget, pendingEditorColor, pendingEditorIsDark);
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

    // --- قايمة الألوان الجاهزة (مربعات، في نص الشاشة) ---
    function markSelectedPreset(savedColor) {
        if (!presetSquareGrid) return;
        presetSquareGrid.querySelectorAll('.preset-square-option').forEach(opt => {
            const isDefault = opt.dataset.color === '#FFFFFF' && !savedColor;
            const isMatch = savedColor && opt.dataset.color.toLowerCase() === savedColor.toLowerCase();
            opt.classList.toggle('selected', isDefault || isMatch);
        });
    }

    if (openColorPresetsBtn) {
        openColorPresetsBtn.addEventListener('click', () => {
            closeSheet('sheet-choose-color');
            pendingPresetChoice = null;
            markSelectedPreset(currentColorFor(activeColorTarget));
            openSheet('sheet-color-presets');
        });
    }

    if (presetSquareGrid) {
        presetSquareGrid.querySelectorAll('.preset-square-option').forEach(opt => {
            opt.addEventListener('click', () => {
                pendingPresetChoice = { color: opt.dataset.color, isDark: opt.dataset.textDark };
                markSelectedPreset(opt.dataset.color === '#FFFFFF' ? null : opt.dataset.color);
                if (navigator.vibrate) { try { navigator.vibrate(6); } catch (e) {} }
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

    // --- تحذير الخروج من غير حفظ (لو فيه لون مختار ولسه ما اتحفظش) ---
    function hasUnsavedChoice() {
        return !!(pendingEditorColor || pendingPresetChoice);
    }

    function discardPendingChoice() {
        pendingEditorColor = null;
        pendingPresetChoice = null;
    }

    if (unsavedSaveBtn) {
        unsavedSaveBtn.addEventListener('click', () => {
            if (activeColorTarget) {
                if (pendingEditorColor) {
                    commitColor(activeColorTarget, pendingEditorColor, pendingEditorIsDark);
                } else if (pendingPresetChoice) {
                    commitColor(activeColorTarget, pendingPresetChoice.color, pendingPresetChoice.isDark);
                }
            }
            discardPendingChoice();
            closeSheet('sheet-unsaved-guard');
            closeSheet('sheet-color-editor-confirm');
            closeSheet('sheet-color-presets');
            closeSheet('sheet-choose-color');
        });
    }
    if (unsavedDiscardBtn) {
        unsavedDiscardBtn.addEventListener('click', () => {
            discardPendingChoice();
            closeSheet('sheet-unsaved-guard');
            closeSheet('sheet-color-editor-confirm');
            closeSheet('sheet-color-presets');
            closeSheet('sheet-choose-color');
        });
    }

    // بيعترض قفل شيتات اللون (بالـ X أو بالدوس بره) لو فيه اختيار
    // لسه ما اتحفظش، ويعرض تحذير بدل ما يقفل على طول
    const GUARDED_SHEETS = ['sheet-color-editor-confirm', 'sheet-color-presets'];
    document.querySelectorAll('[data-close-sheet]').forEach(el => {
        const targetSheet = el.dataset.closeSheet;
        if (!GUARDED_SHEETS.includes(targetSheet)) return;
        el.addEventListener('click', (e) => {
            if (hasUnsavedChoice()) {
                e.stopImmediatePropagation();
                openSheet('sheet-unsaved-guard');
            }
        }, true);
    });
    GUARDED_SHEETS.forEach(sheetId => {
        const overlay = document.getElementById(sheetId);
        if (!overlay) return;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay && hasUnsavedChoice()) {
                e.stopImmediatePropagation();
                openSheet('sheet-unsaved-guard');
            }
        }, true);
    });

    const bubbleResetBtn = document.getElementById('bubbleResetBtn');
    if (bubbleResetBtn) {
        bubbleResetBtn.addEventListener('click', async () => {
            // بيرجّع لون فقاعتي أنا وفقاعة الطرف التاني للألوان
            // الافتراضية (أخضر/رمادي واتساب) مع بعض — كل واحد فيهم
            // بيتبعت update منفصل على مستنده هو.
            const hadMine = !!myBubbleColor;
            const hadTheirs = !!otherBubbleColor;
            localStorage.removeItem(BUBBLE_TICK_KEY);
            if (hadMine) await commitColor('mine', DEFAULT_MINE_COLOR(), '1');
            if (hadTheirs) await commitColor('theirs', DEFAULT_THEIRS_COLOR(), '1');
            applyBubbleColors();
            refreshBubblePreview();
            if (navigator.vibrate) { try { navigator.vibrate([6, 30, 6]); } catch (e) {} }
        });
    }

    applyBubbleColors();
    refreshBubblePreview();

    // =====================================================
    // 4.3) تخصيص الخط — عام لكل الشاتات (مش خاص بشات واحد
    //      زي الفقاعات)، بيتحفظ ويفضل شغال دايمًا لحد ما
    //      يتغيّر تاني من نفس الشيت
    // =====================================================
    const FONT_KEY = 'cz_chat_font';
    const FONT_CLASS_PREFIX = 'font-';
    const FONT_IDS = ['default', 'cairo', 'tajawal', 'amiri', 'reem', 'lobster', 'pacifico', 'dancing'];

    function applyChatFont(fontId) {
        if (!convShellEl) return;
        FONT_IDS.forEach(id => convShellEl.classList.remove(FONT_CLASS_PREFIX + id));
        if (fontId && fontId !== 'default') {
            convShellEl.classList.add(FONT_CLASS_PREFIX + fontId);
        }
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
            if (navigator.vibrate) { try { navigator.vibrate(6); } catch (e) {} }
        });
    });

    const TICK_ICON = {
        unsent: 'tick-unsent',
        unread: 'tick-unread',
        read: 'tick-read'
    };

    function formatTime(date) {
        let h = date.getHours();
        const m = date.getMinutes().toString().padStart(2, '0');
        const ampmAr = h < 12 ? 'ص' : 'م';
        const ampmEn = h < 12 ? 'AM' : 'PM';
        h = h % 12;
        if (h === 0) h = 12;
        return isAr ? `${h}:${m} ${ampmAr}` : `${h}:${m} ${ampmEn}`;
    }

    const messagesEl = document.getElementById('convMessages');
    let messagesById = new Map(); // docId -> { data, isMine }

    function messagePreviewText(data) {
        if (data.deleted) return T.deleted_msg_text;
        return (data.text || '').length > 60 ? data.text.slice(0, 60) + '…' : (data.text || '');
    }

    // رسالة نظام (زي "فلان غيّر لون الفقاعات") — شارة صغيرة في نص
    // الشات، مش فقاعة يمين/شمال، زي رسائل واتساب النظامية بالظبط.
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

    function appendMessage(docId, msg, myEmailLower) {
        // بنحدد "هل الرسالة دي بتاعتي أنا؟" بمقارنة الإيميل، مش الـ uid،
        // لأن الـ uid بتاع Anonymous Auth ممكن يتغيّر بين جلسة وتانية
        // (لو الكاش اتمسح أو الجهاز غيّر حالة الاتصال)، لكن الإيميل ثابت.
        const isMine = (msg.senderEmail || '').toLowerCase() === myEmailLower;

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

        // لو الرسالة دي متوجهة من شات تاني، بنعرض شارة "تم التوجيه"
        // فوق كل حاجة تانية جوه الفقاعة
        if (msg.forwarded) {
            const fwd = document.createElement('div');
            fwd.className = 'bubble-forwarded-label';
            fwd.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 17 20 12 15 7"></polyline><path d="M4 18v-2a4 4 0 0 1 4-4h12"></path></svg>';
            const fwdText = document.createElement('span');
            fwdText.textContent = T.forwarded_label;
            fwd.appendChild(fwdText);
            bubble.appendChild(fwd);
        }

        // لو الرسالة دي رد على رسالة تانية، بنعرض مقتطف صغير منها فوق
        // نص الرسالة نفسها (زي واتساب)
        if (msg.replyTo && msg.replyTo.text) {
            const quote = document.createElement('div');
            quote.className = 'bubble-reply-quote';
            const qName = document.createElement('span');
            qName.className = 'bubble-reply-quote-name';
            qName.textContent = msg.replyTo.isMineAuthor === undefined
                ? (msg.replyTo.senderName || '')
                : '';
            const qText = document.createElement('span');
            qText.className = 'bubble-reply-quote-text';
            qText.textContent = msg.replyTo.deleted ? T.deleted_msg_text : msg.replyTo.text;
            if (msg.replyTo.senderName) quote.appendChild(qName);
            quote.appendChild(qText);
            bubble.appendChild(quote);
            if (msg.replyTo.senderName) qName.textContent = msg.replyTo.senderName;
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

        if (!msg.deleted) {
            attachMessageInteractions(row, docId, msg, isMine);
        }
    }

    // ===== فقاعة "بيكتب الآن" المتحركة تحت آخر رسالة (زي واتساب) =====
    // ملحوظة: messagesEl.innerHTML بيتصفر بالكامل مع كل تحديث رسايل
    // (onSnapshot)، فمينفعش نعتمد على وجود العنصر في الـ DOM كعلامة
    // حالة — بنحتفظ بمتغيّر منفصل (otherIsTypingNow) وبنعيد إضافة
    // الفقاعة بعد أي إعادة رسم لو لسه محتاجة تظهر.
    let otherIsTypingNow = false;

    function renderTypingBubbleIfNeeded() {
        if (!otherIsTypingNow) return;
        const bubble = document.createElement('div');
        bubble.className = 'msg-row from-them typing-row';
        bubble.innerHTML = `
            <div class="msg-row-inner">
                <div class="bubble bubble-left bubble-typing">
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                </div>
            </div>`;
        messagesEl.appendChild(bubble);
    }

    function setOtherTyping(isTyping) {
        if (otherIsTypingNow === isTyping) return;
        otherIsTypingNow = isTyping;
        const existing = messagesEl.querySelector('.typing-row');
        if (isTyping) {
            if (!existing) renderTypingBubbleIfNeeded();
            scrollToBottom(true);
        } else if (existing) {
            existing.remove();
        }
    }

    function scrollToBottom(smooth) {
        messagesEl.scrollTo({
            top: messagesEl.scrollHeight,
            behavior: smooth ? 'smooth' : 'auto'
        });
    }

    function renderEmptyState() {
        messagesEl.innerHTML = '';
        const empty = document.createElement('div');
        empty.className = 'conv-empty';
        empty.textContent = isAr ? 'مفيش رسائل لسه، ابدأ المحادثة 👋' : 'No messages yet, say hi 👋';
        messagesEl.appendChild(empty);
        renderTypingBubbleIfNeeded();
    }

    // =====================================================
    // وضع التحديد المتعدد (Select mode): بيتفعّل من زرار "تحديد"
    // في منيو الرسالة. وإحنا فيه، الضغط العادي على أي رسالة بيضيفها/
    // بيشيلها من مجموعة selectedMessages بدل ما يفتح منيو الرد/الحذف
    // العادي. الحذف الجماعي بيفرّق بين رسايلي (حذف نهائي فعلي) ورسايل
    // الطرف التاني (تخفي من عندي بس - نفس منطق "حذف من عندي" الفردي).
    // =====================================================
    let selectModeOn = false;
    const selectedMessages = new Map(); // docId -> { isMine }

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
        // لو مسحنا آخر عنصر بالضغط عليه تاني، منقفلش وضع التحديد
        // تلقائيًا — بنسيب المستخدم يقفله هو بزرار الإلغاء أو يكمّل يختار
    }

    if (convSelectCancelBtn) convSelectCancelBtn.addEventListener('click', exitSelectMode);

    // ===== تنفيذ الحذف الجماعي: رسايلي تتمسح نهائيًا، رسايل التاني تتخفي عندي بس =====
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
                        batch.delete(doc(db, 'chats', chatId, 'messages', id));
                    });
                    await batch.commit();
                }
            }
            if (theirsIds.length && myUid) {
                for (const id of theirsIds) {
                    await updateDoc(doc(db, 'chats', chatId, 'messages', id), {
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
    const deleteSelectedSheetBody = document.getElementById('deleteSelectedSheetBody');

    if (convSelectDeleteBtn) {
        convSelectDeleteBtn.addEventListener('click', () => {
            if (selectedMessages.size === 0) return;
            const hasMine = [...selectedMessages.values()].some(v => v.isMine);
            const hasTheirs = [...selectedMessages.values()].some(v => !v.isMine);
            if (deleteSelectedSheetBody) {
                if (hasMine && hasTheirs) {
                    deleteSelectedSheetBody.textContent = isAr
                        ? 'رسايلك المحددة هتتحذف نهائيًا من عند الطرفين، ورسايل الطرف التاني المحددة هتتخفي من عندك بس.'
                        : 'Your selected messages will be permanently deleted for everyone, and their selected messages will be hidden for you only.';
                } else if (hasMine) {
                    deleteSelectedSheetBody.textContent = isAr
                        ? 'الرسايل المحددة هتتحذف نهائيًا من عند الطرفين.'
                        : 'The selected messages will be permanently deleted for everyone.';
                } else {
                    deleteSelectedSheetBody.textContent = isAr
                        ? 'الرسايل المحددة هتتخفي من عندك بس، وهتفضل ظاهرة عند الطرف التاني.'
                        : 'The selected messages will be hidden for you only, and will still be visible to the other side.';
                }
            }
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
    // ريبلاي بالسحب لمنتصف الشاشة (زي واتساب) + ضغطة مطولة
    // لحذف الرسالة
    // =====================================================
    const SWIPE_REPLY_THRESHOLD = 46; // بكسل يسحبها المستخدم قبل ما نعتبرها "قرر يرد"
    const LONG_PRESS_MSG_MS = 420;

    function attachMessageInteractions(row, docId, msg, isMine) {
        const inner = row.querySelector('.msg-row-inner');

        // وإحنا في وضع التحديد، أي ضغطة عادية (tap/click) على الصف
        // بتضيفه/بتشيله من التحديد بدل أي سلوك تاني (رد/منيو)
        row.addEventListener('click', (e) => {
            if (!selectModeOn) return;
            e.preventDefault();
            e.stopPropagation();
            toggleMessageSelection(row, docId, isMine);
        });

        // ===== سحب لمنتصف الشاشة = ريبلاي =====
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
            const t0 = e.touches[0];
            const dx = t0.clientX - touchStartX;
            const dy = t0.clientY - touchStartY;
            // بنتأكد إن السحب أفقي أكتر منه رأسي عشان منمنعش سكرول الشات العادي
            if (!dragging && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
                dragging = true;
            }
            if (dragging) {
                // بغض النظر عن اتجاه الرسالة (يمين/شمال)، بنسمح بالسحب
                // في الاتجاهين ونحدد أقصى مسافة بسيطة
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
            dragging = false;
            currentDx = 0;
        });

        row.addEventListener('touchcancel', () => {
            inner.style.transform = '';
            row.classList.remove('swiping');
            dragging = false;
            currentDx = 0;
        });

        // ===== ضغطة مطولة = تحديد الرسالة وفتح قايمة (رد / حذف) =====
        let pressTimer = null;
        function cancelPress() {
            if (pressTimer) clearTimeout(pressTimer);
            pressTimer = null;
        }
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

        // دعم الماوس (ديسكتوب/تجربة): ضغطة مطولة بالماوس تعمل نفس الحاجة
        let mouseTimer = null;
        row.addEventListener('mousedown', () => {
            if (selectModeOn) return;
            mouseTimer = setTimeout(() => openMsgCtxMenu(row, docId, msg, isMine), LONG_PRESS_MSG_MS);
        });
        row.addEventListener('mouseup', () => { if (mouseTimer) clearTimeout(mouseTimer); });
        row.addEventListener('mouseleave', () => { if (mouseTimer) clearTimeout(mouseTimer); });
    }

    // ===== قايمة رد/حذف الخاصة بالرسالة =====
    const msgCtxOverlay = document.getElementById('msgCtxOverlay');
    const msgCtxMenu = document.getElementById('msgCtxMenu');
    const msgCtxReply = document.getElementById('msgCtxReply');
    const msgCtxCopy = document.getElementById('msgCtxCopy');
    const msgCtxForward = document.getElementById('msgCtxForward');
    const msgCtxSelect = document.getElementById('msgCtxSelect');
    const msgCtxDelete = document.getElementById('msgCtxDelete');
    let ctxMsgId = null, ctxMsgData = null, ctxMsgIsMine = false;

    function openMsgCtxMenu(row, docId, msg, isMine) {
        ctxMsgId = docId;
        ctxMsgData = msg;
        ctxMsgIsMine = isMine;
        document.querySelectorAll('.msg-row.selected').forEach(r => r.classList.remove('selected'));
        row.classList.add('selected');

        if (!msgCtxMenu || !msgCtxOverlay) return;

        // مهم: بنقيس مكان الفقاعة (.bubble) نفسها مش الـ row، لأن
        // الـ row عرضه 100% دايمًا (عشان الـ justify-content بتاعت
        // محاذاة يمين/شمال تشتغل)، فلو قسنا الـ row هيرجعلنا مركز
        // الشاشة أفقيًا كل مرة بغض النظر عن مكان الفقاعة الفعلي —
        // وده بالظبط سبب ظهور القايمة في نص الشاشة بدل تحت الرسالة.
        const bubbleEl = row.querySelector('.bubble') || row;
        const rect = bubbleEl.getBoundingClientRect();
        const isRtl = document.documentElement.dir === 'rtl';

        // بنستنى فريم واحد عشان نعرف الأبعاد الحقيقية للقايمة (width
        // بتاعها ثابت في الـ CSS: 230px، لكن الارتفاع بيتغيّر حسب لو
        // فيه أوبشن "تحديد"/"توجيه" ظاهر أو لأ)
        msgCtxMenu.style.visibility = 'hidden';
        msgCtxMenu.style.top = '0px';
        msgCtxMenu.style.left = '0px';
        msgCtxMenu.style.right = 'auto';
        msgCtxMenu.classList.add('open');
        const menuRect = msgCtxMenu.getBoundingClientRect();
        const menuWidth = menuRect.width || 230;
        const menuHeight = menuRect.height || 210;
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

    if (msgCtxForward) {
        msgCtxForward.addEventListener('click', () => {
            const msg = ctxMsgData;
            closeMsgCtxMenu();
            if (!msg || msg.deleted) return;
            openForwardSheet(msg);
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

    // =====================================================
    // نسخ نص الرسالة للكليبورد
    // =====================================================
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
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            ta.style.pointerEvents = 'none';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            done();
        } catch (e) {
            console.error('فشل نسخ الرسالة:', e);
        }
    }

    // =====================================================
    // توجيه الرسالة لواحد أو أكتر من الأشخاص اللي كلمتهم قبل
    // كده (لغاية 10 أشخاص). بنجيب القايمة من مستندات 'chats'
    // اللي أنا participant فيها (نفس منطق الصفحة الرئيسية).
    // =====================================================
    const FORWARD_MAX = 10;
    const forwardContactsList = document.getElementById('forwardContactsList');
    const forwardSearchInput = document.getElementById('forwardSearchInput');
    const forwardSendBtn = document.getElementById('forwardSendBtn');
    const forwardSendCount = document.getElementById('forwardSendCount');

    let forwardMsgData = null;
    let forwardAllContacts = null; // بيتكاش بعد أول تحميل عشان منكررش القراءة
    let forwardSelected = new Map(); // email -> name

    function contactInitial(name) {
        const trimmed = (name || '').trim();
        return trimmed ? trimmed.charAt(0).toUpperCase() : '؟';
    }

    async function fetchForwardContacts() {
        if (forwardAllContacts) return forwardAllContacts;
        const chatsRef = collection(db, 'chats');
        const q = query(chatsRef, where('participants', 'array-contains', myUid));
        const snap = await getDocs(q);
        const emails = new Set();
        snap.forEach(chatDoc => {
            const data = chatDoc.data();
            const list = data.participantsEmails || [];
            list.forEach(e => {
                const lower = (e || '').toLowerCase();
                if (lower && lower !== myEmailLower) emails.add(lower);
            });
        });
        const contacts = [];
        for (const email of emails) {
            let name = displayNameFromEmail(email);
            try {
                const uSnap = await getDoc(doc(db, 'users', email));
                if (uSnap.exists() && uSnap.data().name) name = uSnap.data().name;
            } catch (e) {
                // تجاهل — هنستخدم الاسم المستخرج من الإيميل
            }
            contacts.push({ email, name });
        }
        contacts.sort((a, b) => a.name.localeCompare(b.name, isAr ? 'ar' : 'en'));
        forwardAllContacts = contacts;
        return contacts;
    }

    function renderForwardContacts(list) {
        if (!forwardContactsList) return;
        forwardContactsList.innerHTML = '';
        if (!list.length) {
            const empty = document.createElement('div');
            empty.className = 'forward-empty';
            empty.textContent = T.forward_empty;
            forwardContactsList.appendChild(empty);
            return;
        }
        list.forEach(contact => {
            const row = document.createElement('div');
            row.className = 'forward-contact-row';
            row.dataset.email = contact.email;

            const avatar = document.createElement('div');
            avatar.className = 'forward-contact-avatar';
            avatar.textContent = contactInitial(contact.name);

            const textWrap = document.createElement('div');
            textWrap.className = 'forward-contact-text';
            const nameEl = document.createElement('div');
            nameEl.className = 'forward-contact-name';
            nameEl.textContent = contact.name;
            const emailEl = document.createElement('div');
            emailEl.className = 'forward-contact-email';
            emailEl.textContent = contact.email;
            textWrap.appendChild(nameEl);
            textWrap.appendChild(emailEl);

            const check = document.createElement('div');
            check.className = 'forward-contact-check';
            check.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

            row.appendChild(avatar);
            row.appendChild(textWrap);
            row.appendChild(check);

            row.classList.toggle('checked', forwardSelected.has(contact.email));

            row.addEventListener('click', () => toggleForwardContact(contact, row));

            forwardContactsList.appendChild(row);
        });
        updateForwardUI();
    }

    function toggleForwardContact(contact, row) {
        if (forwardSelected.has(contact.email)) {
            forwardSelected.delete(contact.email);
            row.classList.remove('checked');
        } else {
            if (forwardSelected.size >= FORWARD_MAX) {
                showToast(T.forward_limit_toast);
                return;
            }
            forwardSelected.set(contact.email, contact.name);
            row.classList.add('checked');
        }
        updateForwardUI();
    }

    function updateForwardUI() {
        const count = forwardSelected.size;
        if (forwardSendBtn) forwardSendBtn.disabled = count === 0;
        if (forwardSendCount) forwardSendCount.textContent = count > 0 ? `(${count}/${FORWARD_MAX})` : '';
        if (forwardContactsList) {
            forwardContactsList.querySelectorAll('.forward-contact-row').forEach(row => {
                const isChecked = row.classList.contains('checked');
                row.classList.toggle('disabled', !isChecked && count >= FORWARD_MAX);
            });
        }
    }

    async function openForwardSheet(msg) {
        forwardMsgData = msg;
        forwardSelected = new Map();
        if (forwardSearchInput) forwardSearchInput.value = '';
        updateForwardUI();
        if (forwardContactsList) {
            forwardContactsList.innerHTML = `<div class="forward-loading">${T.forward_loading}</div>`;
        }
        openSheet('sheet-forward');
        try {
            const contacts = await fetchForwardContacts();
            renderForwardContacts(contacts);
        } catch (e) {
            console.error('فشل تحميل قائمة جهات الاتصال للتوجيه:', e);
            renderForwardContacts([]);
        }
    }

    if (forwardSearchInput) {
        forwardSearchInput.addEventListener('input', () => {
            if (!forwardAllContacts) return;
            const term = forwardSearchInput.value.trim().toLowerCase();
            const filtered = !term
                ? forwardAllContacts
                : forwardAllContacts.filter(c =>
                    c.name.toLowerCase().includes(term) || c.email.toLowerCase().includes(term)
                );
            renderForwardContacts(filtered);
        });
    }

    if (forwardSendBtn) {
        forwardSendBtn.addEventListener('click', () => {
            if (!forwardMsgData || forwardSelected.size === 0 || !myUid) return;
            const targets = Array.from(forwardSelected.keys());
            const text = forwardMsgData.text || '';
            forwardSendBtn.disabled = true;

            const jobs = targets.map(targetEmail => {
                const targetChatId = makeChatId(myEmail, targetEmail);
                const payload = {
                    senderUid: myUid,
                    senderEmail: myEmail,
                    text,
                    forwarded: true,
                    createdAt: serverTimestamp(),
                    status: 'unread'
                };
                const messagesRef = collection(db, 'chats', targetChatId, 'messages');
                return addDoc(messagesRef, payload);
            });

            Promise.all(jobs).then(() => {
                if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} }
                closeSheet('sheet-forward');
                showToast(T.forwarded_toast);
            }).catch((err) => {
                console.error('فشل توجيه الرسالة:', err);
                updateForwardUI();
            });
        });
    }

    // =====================================================
    // بار الريبلاي فوق مكان الكتابة
    // =====================================================
    const convReplyBar = document.getElementById('convReplyBar');
    const convReplyBarName = document.getElementById('convReplyBarName');
    const convReplyBarPreview = document.getElementById('convReplyBarPreview');
    const convReplyBarClose = document.getElementById('convReplyBarClose');
    let activeReply = null; // { id, text, senderName, isMine }

    function startReply(docId, msg, isMine) {
        if (msg.deleted) return;
        activeReply = {
            id: docId,
            text: msg.text || '',
            senderName: isMine ? T.reply_you : currentDisplayName(),
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
    // حذف رسالة: من عندي بس، أو من عند الطرفين (لو هي رسالتي أنا)
    // =====================================================
    const deleteMsgSheetBody = document.getElementById('deleteMsgSheetBody');
    const deleteMsgForEveryoneBtn = document.getElementById('deleteMsgForEveryoneBtn');
    const deleteMsgForMeBtn = document.getElementById('deleteMsgForMeBtn');
    let deleteTargetId = null, deleteTargetIsMine = false;

    function openDeleteMsgSheet(docId, msg, isMine) {
        deleteTargetId = docId;
        deleteTargetIsMine = isMine;
        if (deleteMsgSheetBody) {
            deleteMsgSheetBody.textContent = isMine ? T.delete_msg_body_mine : T.delete_msg_body_theirs;
        }
        // خيار "حذف من عند الطرفين" متاح بس لو الرسالة رسالتي أنا
        if (deleteMsgForEveryoneBtn) {
            deleteMsgForEveryoneBtn.style.display = isMine ? '' : 'none';
        }
        openSheet('sheet-delete-msg');
    }

    async function deleteMessageForMe() {
        const id = deleteTargetId;
        closeSheet('sheet-delete-msg');
        closeMsgCtxMenu();
        if (!id || !myUid) return;
        try {
            await updateDoc(doc(db, 'chats', chatId, 'messages', id), {
                deletedFor: arrayUnion(myUid)
            });
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
            await updateDoc(doc(db, 'chats', chatId, 'messages', id), {
                deleted: true,
                text: ''
            });
            showToast(T.msg_deleted_toast);
        } catch (e) {
            console.error('فشل حذف الرسالة من عند الطرفين:', e);
        }
    }

    if (deleteMsgForMeBtn) deleteMsgForMeBtn.addEventListener('click', deleteMessageForMe);
    if (deleteMsgForEveryoneBtn) deleteMsgForEveryoneBtn.addEventListener('click', deleteMessageForEveryone);

    // =====================================================
    // 5) بار الكتابة
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

    // =====================================================
    // 5.1) بث حالة "بيكتب الآن" — بنكتب uid بتاعي جوه مستند الشات
    //      نفسه تحت typing.{myUid} = true وقت الكتابة الفعلية، وبنمسحه
    //      (typing.{myUid} = false) بعد فترة سكون أو عند الإرسال/مغادرة
    //      الصفحة. الطرف التاني بيسمع نفس المستند ويعرض "يكتب الآن..."
    //      تحت اسمه في شاشة المحادثة، ونقطة/أيقونة جنب اسمه في قايمة
    //      الدردشات الرئيسية.
    // =====================================================
    const TYPING_IDLE_MS = 2500;
    let typingIdleTimer = null;
    let iAmMarkedTyping = false;

    function setTypingState(isTyping) {
        if (!myUid) return;
        if (isTyping === iAmMarkedTyping) return;
        iAmMarkedTyping = isTyping;
        updateDoc(doc(db, 'chats', chatId), {
            ['typing.' + myUid]: isTyping
        }).catch(() => {
            // لو فشل التحديث (مشكلة شبكة مؤقتة مثلاً)، منسيبش الحالة
            // عالقة على "بيكتب" للأبد — نرجّعها false تاني عشان تتحاول
            // تتحدث صح في المرة الجاية.
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
        if (textarea.value.trim().length > 0) {
            pingTyping();
        } else {
            if (typingIdleTimer) clearTimeout(typingIdleTimer);
            setTypingState(false);
        }
    });

    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    updateSendVisibility();

    // =====================================================
    // 6) الاتصال الفعلي بـ Firestore
    // =====================================================
    let myUid = null;
    let unsubscribeMessages = null;

    // بتستنى لحد ما مستند الشات على السيرفر فعليًا يحتوي على uid بتاعي
    // جوه participants، مع محاولات محدودة عشان منعلقش لو حصل مشكلة
    // تانية غير متوقعة.
    async function waitUntilIAmParticipant(chatDocRef, uid, maxTries) {
        maxTries = maxTries || 10;
        for (let i = 0; i < maxTries; i++) {
            try {
                const snap = await getDoc(chatDocRef);
                if (snap.exists()) {
                    const data = snap.data();
                    if (data.participants && data.participants.includes(uid)) {
                        return true;
                    }
                }
            } catch (e) {
                // لسه مرفوضة، هنكمل نحاول
            }
            await new Promise(res => setTimeout(res, 300));
        }
        console.error('لم يتم التأكد من انضمامي إلى participants بعد عدة محاولات.');
        return false;
    }

    // بتحاول تحدّث حالة رسالة لـ read مع إعادة محاولة لو فشلت لأول مرة
    // (بسبب توقيت الـ Security Rules)، بدل ما تفشل بصمت للأبد.
    function updateStatusWithRetry(docRef, tries) {
        tries = tries || 3;
        updateDoc(docRef, { status: 'read' }).catch((err) => {
            if (tries > 1) {
                setTimeout(() => updateStatusWithRetry(docRef, tries - 1), 500);
            } else {
                console.error('فشل تحديث حالة الرسالة إلى مقروءة نهائيًا:', err);
            }
        });
    }

    async function initChat() {
        // لازم جلسة Firebase Auth حقيقية قبل أي قراءة/كتابة، وإلا
        // الـ Firestore Rules هترفض الطلب.
        const user = await ensureAuthenticated();
        myUid = user.uid;

        // فحص ملكية الإيميل: لازم الـ uid الحالي يطابق اللي مسجل
        // فعليًا لإيميلي في users/{email}. لو مش متطابق، معناه إن
        // اللي حاطط الإيميل ده في localStorage مش هو صاحبه الحقيقي،
        // فنرفض الدخول فورًا قبل ما نلمس أي محادثة.
        const owns = await verifyOwnership(myEmail, myUid);
        if (!owns) {
            console.error('فشل التحقق من ملكية الإيميل — الجلسة الحالية غير مطابقة.');
            localStorage.removeItem('cz_verified_email');
            localStorage.removeItem('cz_active_chat_email');
            window.location.href = 'MainActivity.html';
            return;
        }

        // نجيب الاسم المخصص اللي أنا (بس أنا) حطيته لجهة الاتصال دي،
        // ونجيب حالة التثبيت/الحذف بتاعتي للشات ده (لو موجودة)
        loadMyContactName();

        // =====================================================
        // استماع لايف للون فقاعة كل طرف (mine/theirs) — بيتحدث
        // فورًا لو أي حد غيّر لونه هو أو لون الطرف التاني، حتى لو
        // التغيير حصل من شات تاني (لون الشخص بقى تابع له مش للشات).
        // بنبدأهم بدري هنا عشان يكونوا شغالين طول عمر الصفحة.
        // =====================================================
        onSnapshot(doc(db, 'users', myEmail.toLowerCase()), (snap) => {
            if (!snap.exists()) return;
            const data = snap.data();
            myBubbleColor = data.bubbleColor || null;
            myBubbleColorDark = data.bubbleColorDark || '1';
            applyBubbleColors();
            refreshBubblePreview();
        });
        onSnapshot(doc(db, 'users', otherEmail.toLowerCase()), (snap) => {
            if (!snap.exists()) return;
            const data = snap.data();
            otherBubbleColor = data.bubbleColor || null;
            otherBubbleColorDark = data.bubbleColorDark || '1';
            applyBubbleColors();
            refreshBubblePreview();
        });

        const chatDocRef = doc(db, 'chats', chatId);


        let otherUid = null;
        try {
            const otherUserSnap = await getDoc(doc(db, 'users', otherEmail.toLowerCase()));
            if (otherUserSnap.exists() && otherUserSnap.data().uid) {
                otherUid = otherUserSnap.data().uid;
            }
        } catch (e) {
            // لو فشل الجلب لأي سبب، هنكمل من غير uid بتاع الطرف التاني
            // (fallback القديم: هيتضاف هو بنفسه أول ما يفتح الشات)
            console.error('تعذّر جلب uid الطرف التاني وقت إنشاء المحادثة:', e);
        }

        // =====================================================
        // ليه غيّرنا الطريقة بالكامل:
        // مع الـ Rules الحالية، لو المستند مش موجود خالص، أي محاولة
        // لقراءته (getDoc) بترمي "permission-denied" (مش "not found")
        // لأن الـ rule بتحاول توصل resource.data.participants على
        // مستند مالوش data أصلاً. يعني مستحيل نفرّق من نتيجة القراءة
        // بس هل المستند "مش موجود" أو "موجود ومرفوض" — الاتنين شكلهم
        // نفس الخطأ بالظبط.
        //
        // الحل: منعتمدش على القراءة خالص لتحديد الحالة. بدل كده:
        //   1) نجرب ننشئ المستند (setDoc بدون merge) — لو نجح، معناه
        //      كان فعلاً أول مرة، وخلاص إحنا الطرف الوحيد (أو إحنا +
        //      الطرف التاني لو كان مسجّل ولقينا uid بتاعه فوق).
        //   2) لو فشل بـ "already-exists" أو "permission-denied"
        //      (لأن create مسموحة بس لو المستند مش موجود أصلاً حسب
        //      قواعد Firestore الداخلية)، معناه إن حد تاني سبقنا
        //      وعمل المستند، فنحاول بعدها updateDoc (arrayUnion)
        //      اللي مسموح بيه حتى لو أنا مش participant لسه.
        // =====================================================
        let joined = false;

        const initialParticipants = otherUid ? [myUid, otherUid] : [myUid];

        try {
            await setDoc(chatDocRef, {
                participants: initialParticipants,
                participantsEmails: [myEmail.toLowerCase(), otherEmail.toLowerCase()],
                createdAt: serverTimestamp()
            });
            joined = true;
        } catch (createErr) {
            // فشل الإنشاء = غالبًا المستند موجود بالفعل (الطرف التاني
            // بدأ المحادثة قبلي). نحاول أضيف نفسي بدل ما أنشئه.
        }

        if (!joined) {
            try {
                await updateDoc(chatDocRef, {
                    participants: arrayUnion(myUid)
                });
                joined = true;
            } catch (updateErr) {
                console.error(
                    'فشل الانضمام كـ participant للمحادثة. كود الخطأ:',
                    updateErr.code, updateErr.message
                );
                throw updateErr;
            }
        }

        // =====================================================
        // تأكيد فعلي إن الـ uid بتاعي بقى موجود في participants على
        // السيرفر (مش بس إن الـ Promise فوق خلص من غير error) قبل ما
        // نبدأ نستمع للرسايل. ده بيمنع المشكلة اللي كانت بتحصل:
        // markIncomingMessagesAsRead بيتنفذ بسرعة جدًا بعد الانضمام،
        // والـ Security Rules بترفض تحديث status لأن الانضمام لسه ما
        // اتأكدش فعليًا في نسخة السيرفر من المستند (خصوصًا مع اتصال
        // بطيء)، فرسايل الطرف التاني تفضل "صح واحدة" للأبد عند
        // المرسل حتى لو أنا فاتح الشات وشايفها فعليًا.
        // =====================================================
        await waitUntilIAmParticipant(chatDocRef, myUid);

        // نسجّل جهة الاتصال دي في قائمتي الشخصية (users/{myEmail}/contacts/{otherEmail})
        // عشان تفضل ظاهرة في "تحدث مع اكونت تحدثت معه من قبل" حتى لو
        // اتحذف الشات نهائيًا بعد كده. بنعمل ده مرة واحدة كفاية (merge)
        // وما بنستنهاش، عشان منأخرش فتح الشات لو فشلت لأي سبب.
        saveContact(myEmail, otherEmail).catch((e) => {
            console.error('فشل حفظ جهة الاتصال:', e);
        });

        // الاستماع اللحظي لحالة "بيكتب الآن" بتاعة الطرف التاني بس
        // (مش بتاعتي أنا) — بنعرضها في مكان "الحالة" تحت الاسم في
        // البار العلوي (convStatus)، وبتتشال تلقائيًا أول ما هو يوقف
        // عن الكتابة أو يمسح النص.
        onSnapshot(chatDocRef, (snap) => {
            if (!snap.exists()) return;
            if (!snap.metadata.fromCache) {
                markServerAck();
                hideWeakConnectionAlert();
            }
            const data = snap.data();
            const typingMap = data.typing || {};
            const otherIsTyping = Object.keys(typingMap).some(uid => uid !== myUid && typingMap[uid]);
            convStatusEl.textContent = otherIsTyping ? T.typing_status : '';
            convStatusEl.classList.toggle('conv-status-typing', otherIsTyping);
            setOtherTyping(otherIsTyping);
        }, (err) => {
            console.error('فشل الاستماع لحالة الكتابة:', err);
        });

        // الاستماع اللحظي للرسايل
        const messagesRef = collection(db, 'chats', chatId, 'messages');
        const q = query(messagesRef, orderBy('createdAt', 'asc'));

        unsubscribeMessages = onSnapshot(q, (snapshot) => {
            // لو الداتا دي وصلت فعليًا من السيرفر (مش بس من الكاش
            // المحلي)، ده تأكيد إن الاتصال شغال وسليم دلوقتي
            if (!snapshot.metadata.fromCache) {
                markServerAck();
                hideWeakConnectionAlert();
            }

            const docs = snapshot.docs;

            // الرسايل اللي حذفتها "من عندي بس" (deletedFor بتحتوي على
            // uid بتاعي) بتتشال من العرض خالص عندي أنا، مع إنها لسه
            // موجودة وظاهرة بشكل طبيعي عند الطرف التاني.
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
                // رسالة نظام (زي "فلان غيّر لون الفقاعات") — بتتعرض
                // شارة صغيرة في النص، مش فقاعة يمين/شمال عادية
                if (data.type === 'system') {
                    appendSystemMessage(d.id, data);
                    return;
                }
                // لو الرسالة دي رد على رسالة تانية، بنجهّز اسم صاحب
                // الرسالة الأصلية عشان يتعرض جوه المقتطف
                if (data.replyTo && data.replyTo.id) {
                    const original = messagesById.get(data.replyTo.id);
                    if (original) {
                        const originalIsMine = (original.senderEmail || '').toLowerCase() === myEmail.toLowerCase();
                        data.replyTo.senderName = originalIsMine ? T.reply_you : currentDisplayName();
                        data.replyTo.deleted = !!original.deleted;
                    }
                }
                appendMessage(d.id, data, myEmail.toLowerCase());
            });
            renderTypingBubbleIfNeeded();
            scrollToBottom(false);

            // لو إحنا في وضع التحديد المتعدد، الـ DOM اتبني من جديد
            // بالكامل فوق، فلازم نرجّع نعلّم بصريًا على الرسايل اللي
            // كانت متحددة قبل التحديث (باستخدام selectedMessages اللي
            // فاضلة محفوظة في الذاكرة). أي رسالة اتحذفت فعليًا في الأثناء
            // بتتشال تلقائيًا من المجموعة لأنها مش هتلاقي صف تحطها عليه.
            if (selectModeOn) {
                const stillPresent = new Set(visibleDocs.map(d => d.id));
                [...selectedMessages.keys()].forEach((id) => {
                    if (!stillPresent.has(id)) {
                        selectedMessages.delete(id);
                        return;
                    }
                    const row = messagesEl.querySelector(`.msg-row[data-msg-id="${id}"]`);
                    if (row) row.classList.add('multi-selected');
                });
                updateSelectCountUI();
            }

            // أي رسالة وصلتلي من الطرف التاني ولسه حالتها unread،
            // معناه إني دلوقتي فاتح الشات وشايفها فعليًا، فنعلّمها read
            // عشان الطرف اللي بعتها يشوف الصح الزرقة عنده.
            markIncomingMessagesAsRead(visibleDocs);
        }, (err) => {
            console.error('فشل الاستماع للرسايل:', err);
        });
    }

    const myEmailLower = myEmail.toLowerCase();

    function markIncomingMessagesAsRead(docs) {
        // منع الصح الزرقاء بيبقى ثنائي: لو أنا مفعّلها عندي، أو الطرف
        // التاني مفعّلها عنده هو، مبعتش status:'read' خالص على رسايله —
        // فتفضل الصح رمادية عند الاتنين، مش بس عند اللي فعّل الخاصية.
        const myHideReceipts = window.CZPrivacy && window.CZPrivacy.areReadReceiptsHidden
            ? window.CZPrivacy.areReadReceiptsHidden()
            : false;
        if (myHideReceipts || otherHidesReadReceipts) return;

        docs.forEach(d => {
            const data = d.data();
            const isFromOther = (data.senderEmail || '').toLowerCase() !== myEmailLower;
            const needsUpdate = data.status === 'unread';
            if (isFromOther && needsUpdate) {
                updateStatusWithRetry(d.ref);
            }
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
            // كل رسالة بتتبعت بحالة "unread" (صح رمادية)، وتتحول "read"
            // (صح زرقاء) لما الطرف التاني يفتح الشات فعليًا ويشوفها —
            // مفيش تفرقة أونلاين/أوفلاين خالص دلوقتي.
            status: 'unread'
        };

        // لو كنت رادّ على رسالة معيّنة، بنرفق مقتطف صغير منها مع
        // الرسالة الجديدة عشان يتعرض فوقها في الفقاعة
        if (activeReply) {
            payload.replyTo = {
                id: activeReply.id,
                text: activeReply.text.length > 120 ? activeReply.text.slice(0, 120) : activeReply.text
            };
        }

        const messagesRef = collection(db, 'chats', chatId, 'messages');
        addDoc(messagesRef, payload).then(() => {
            if (navigator.vibrate) { try { navigator.vibrate(6); } catch (e) {} }
        }).catch((err) => {
            console.error('فشل إرسال الرسالة:', err);
        });

        cancelReply();
    }

    sendBtn.addEventListener('click', sendMessage);

    initChat().catch((err) => {
        console.error('فشل تهيئة المحادثة. الكود:', err && err.code, '— الرسالة:', err && err.message, err);
    });

    window.addEventListener('unload', () => {
        if (unsubscribeMessages) unsubscribeMessages();
        setTypingState(false);
    });
})();
