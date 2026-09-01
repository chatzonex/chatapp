/* ===================================================
   BACKNAV.JS
   نظام موحّد للتحكم في زرار/چيستشر الرجوع الفعلي في الموبايل
   (سواء زرار الرجوع الفيزيائي في أندرويد أو چيستشر السحب) بدل
   ما يقفل التطبيق فورًا زي ما بيحصل افتراضيًا في أي صفحة ويب.

   القاعدة:
   - MainActivity.html:
       * لو واقف على "الإعدادات" أو "الجروبات" -> رجوع يودّي
         لتبويب "الشتات" (من غير خروج من التطبيق).
       * لو واقف بالفعل على "الشتات" -> رجوع يقفل التطبيق
         (السلوك الافتراضي للمتصفح/الـ WebView، مبنعملوش أي حاجة).
   - Conversation.html / Conv-group.html:
       * رجوع دايمًا يوديك لصفحة الشتات (MainActivity.html).
   - الصفحات الفرعية الجديدة بتاعة الإعدادات (HomeSettings,
     ChatSettings, Themes, language-set, AppInfo):
       * رجوع يوديك لصفحة الإعدادات الرئيسية (MainActivity.html
         على تبويب "الإعدادات").

   الفكرة التقنية: بنستخدم history.pushState عشان "نمسك" أول
   خطوة رجوع (popstate) ونتحكم فيها يدويًا، بدل ما نسيب المتصفح/
   الـ WebView يقفل الصفحة أو يرجع لصفحة تانية بره التطبيق.
   الملف مستقل تمامًا ومبيلمسش أي كود موجود في main.js أو غيره.
=================================================== */

(function () {
    'use strict';

    var STATE_MARK = 'czInAppNav';

    function pushGuardState() {
        try {
            history.pushState({ mark: STATE_MARK }, '');
        } catch (e) {}
    }

    // نضمن إن فيه "طبقة حماية" واحدة على الأقل في الـ history، عشان
    // أول ضغطة رجوع تتلقط بواسطة popstate بدل ما تسيب الصفحة على
    // طول. لو المستخدم رجع فعليًا (popstate اتلقط ومعملناش push
    // تاني) هيرجع لحالة قبلها أو يقفل التطبيق حسب حالة الـ history.
    function ensureGuard() {
        pushGuardState();
    }

    /* ============ MainActivity.html ============ */
    function initMainActivityBackNav() {
        var shell = document.querySelector('.app-shell');
        if (!shell) return;

        ensureGuard();

        function getActiveScreenId() {
            var active = document.querySelector('.screen:not(.hidden)');
            return active ? active.id : 'screen-chats';
        }

        // بيدوس على زرار التبويب المناسب فعليًا عشان نستخدم نفس منطق
        // main.js الأصلي في تبديل الشاشات (تحديث الـ pill، الـ active
        // class، وأي حاجة تانية main.js بيعملها) من غير ما نلمس الملف.
        function switchToChatsTab() {
            var chatsBtn = document.getElementById('navChats');
            if (chatsBtn) chatsBtn.click();
        }

        window.addEventListener('popstate', function () {
            var activeId = getActiveScreenId();
            if (activeId === 'screen-settings' || activeId === 'screen-groups') {
                switchToChatsTab();
                // نرجع نحط طبقة حماية تانية عشان لو دوس رجوع تاني من
                // شاشة الشتات نفسها، يقفل التطبيق فعليًا (مش يعلق).
                ensureGuard();
            }
            // لو كان أصلاً على شاشة الشتات، مبنعملش ensureGuard تاني —
            // فبيتفتح المجال للمتصفح/الـ WebView يقفل التطبيق عادي.
        });

        // لو المستخدم فتح صفحة الإعدادات جاي من صفحة فرعية (رجوع
        // مننا احنا)، نفتح تبويب الإعدادات تلقائيًا مرة واحدة.
        try {
            if (sessionStorage.getItem('cz_open_tab') === 'settings') {
                sessionStorage.removeItem('cz_open_tab');
                var settingsBtn = document.getElementById('navSettings');
                if (settingsBtn) settingsBtn.click();
            }
        } catch (e) {}
    }

    /* ============ Conversation / Conv-group ============ */
    function initConversationBackNav() {
        var shell = document.querySelector('.conv-shell');
        if (!shell) return;

        ensureGuard();

        function goToChats() {
            window.location.href = 'MainActivity.html';
        }

        window.addEventListener('popstate', function () {
            goToChats();
        });

        // لو زرار الرجوع الفعلي (اللي في البار العلوي بتاع الشات)
        // اتضغط، برضه نضمن إننا رايحين لصفحة الشتات مش أي حاجة
        // تانية، ومن غير ما نلمس أي listener تاني موجود على الزرار
        // ده أصلاً في conversation.js/conv-group.js.
        var backBtn = document.getElementById('convBackBtn');
        if (backBtn) {
            backBtn.addEventListener('click', function () {
                // بنمسح الحماية اللي حطيناها عشان الرجوع من الزرار
                // العادي ميسببش ضغطة رجوع "إضافية" فاضية بعد كده.
                try { history.back(); } catch (e) {}
            }, true);
        }
    }

    /* ============ الصفحات الفرعية الجديدة (الإعدادات) ============ */
    function initSubpageBackNav() {
        var shell = document.querySelector('.subpage-shell');
        if (!shell) return;

        ensureGuard();

        function goToSettings() {
            try { sessionStorage.setItem('cz_open_tab', 'settings'); } catch (e) {}
            window.location.href = 'MainActivity.html';
        }

        window.addEventListener('popstate', function () {
            goToSettings();
        });
    }

    function init() {
        initMainActivityBackNav();
        initConversationBackNav();
        initSubpageBackNav();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
