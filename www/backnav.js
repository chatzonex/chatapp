/* ===================================================
   BACKNAV.JS (v2 — إصلاح مشكلة قفل التطبيق فجأة)
   نظام موحّد للتحكم في زرار/چيستشر الرجوع الفعلي في الموبايل.

   القاعدة:
   - MainActivity.html:
       * واقف على "الإعدادات" أو "الجروبات" -> رجوع يودّي لتبويب
         "الشتات" (تفضل طبقة حماية شغالة).
       * واقف على "الشتات" -> رجوع تاني يقفل التطبيق فعليًا.
   - Conversation.html / Conv-group.html:
       * رجوع دايمًا يوديك لصفحة الشتات (MainActivity.html).
   - الصفحات الفرعية بتاعة الإعدادات (HomeSettings, ChatSettings,
     Themes, language-set, AppInfo):
       * رجوع يوديك لصفحة الإعدادات (MainActivity.html).

   ليه الإصدار القديم كان بيقفل التطبيق غلط:
   كان بيعمل history.pushState مرة واحدة بس عند تحميل الصفحة.
   في WebView حقيقي (Capacitor) مفيش "history" تاني غير كده، فأول
   ضغطة رجوع كانت بتاكل الـ pushState الوحيد ده، وبعدها أي ضغطة
   رجوع (حتى لو المفروض تودي للشتات مش تقفل التطبيق) كانت بتلاقي
   الـ history فاضي فيقفل النشاط على طول.
   الحل: في كل حالة *غير* حالة "الخروج الفعلي المقصود"، بعد أي
   popstate بنعمل pushState تاني فورًا عشان الحماية تفضل موجودة
   دايمًا وميحصلش قفل مفاجئ.
=================================================== */

(function () {
    'use strict';

    function pushGuardState() {
        try {
            history.pushState({ czGuard: true, t: Date.now() }, '');
        } catch (e) {}
    }

    /* ============ MainActivity.html ============ */
    function initMainActivityBackNav() {
        var shell = document.querySelector('.app-shell');
        if (!shell) return;

        // نضمن وجود طبقة حماية واحدة على الأقل من البداية.
        pushGuardState();

        function getActiveScreenId() {
            var active = document.querySelector('.screen:not(.hidden)');
            return active ? active.id : 'screen-chats';
        }

        function switchToChatsTab() {
            var chatsBtn = document.getElementById('navChats');
            if (chatsBtn) chatsBtn.click();
        }

        window.addEventListener('popstate', function () {
            var activeId = getActiveScreenId();

            if (activeId === 'screen-settings' || activeId === 'screen-groups') {
                // رجّعه لتبويب الشتات، وحافظ على طبقة حماية عشان
                // الضغطة الجاية تتلقط برضه بدل ما تقفل التطبيق.
                switchToChatsTab();
                pushGuardState();
                return;
            }

            // واقف بالفعل على شاشة الشتات: ده الخروج الفعلي المقصود
            // — مبنعملش pushGuardState تاني، فالضغطة دي بتاخد
            // المستخدم بره التطبيق (السلوك الطبيعي).
        });

        // لو المستخدم راجع من صفحة فرعية (إحنا اللي وديناه هنا)،
        // افتح تبويب الإعدادات تلقائيًا مرة واحدة.
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

        pushGuardState();

        function goToChats() {
            window.location.href = 'MainActivity.html';
        }

        // أي popstate هنا (زرار/چيستشر الرجوع الفعلي) يوديك للشتات
        // على طول — الصفحة دي مفيهاش "خروج فعلي"، دايمًا بترجع
        // للشتات الأول.
        window.addEventListener('popstate', function () {
            goToChats();
        });

        // زرار الرجوع اللي في الشاشة نفسها (مش زرار الموبايل) —
        // نخليه يودي لنفس الوجهة مباشرة من غير ما يعتمد على
        // popstate (أضمن، ومايتعارضش مع أي listener تاني على نفس
        // الزرار في conversation.js الأصلي لأننا مش بنوقف الحدث).
        var backBtn = document.getElementById('convBackBtn');
        if (backBtn) {
            backBtn.addEventListener('click', function () {
                goToChats();
            });
        }
    }

    /* ============ الصفحات الفرعية الجديدة (الإعدادات) ============ */
    function initSubpageBackNav() {
        var shell = document.querySelector('.subpage-shell');
        if (!shell) return;

        pushGuardState();

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
