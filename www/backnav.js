/* ===================================================
   BACKNAV.JS (v3 — إصلاح "خطوة الرجوع الزيادة" من الصفحات الفرعية)
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
       * رجوع يوديك لصفحة الإعدادات (MainActivity.html) على طول،
         بدون أي خطوة زيادة أو ضغطة تانية.

   ليه كان فيه خطوة رجوع "زيادة" لما ترجع من صفحة فرعية:
   الكود القديم كان بيفتح MainActivity.html عادي، وبعد ما الصفحة
   تحمّل كانت بتعمل pushGuardState() فورًا، وبعدها (مش قبلها) كانت
   بتفتح تبويب الإعدادات عن طريق sessionStorage. يعني وقت ما
   الحماية اتحطت في الـ history، الشاشة الظاهرة فعليًا كانت لسه
   "الشتات" (قبل ما نفتح تبويب الإعدادات)، فالنظام كان بيتعامل مع
   أول ضغطة رجوع بعد كده على أساس إنها "من الشتات" مش "من
   الإعدادات"، فكانت بتضيع خطوة.

   الحل: بنحدد الوجهة (الإعدادات) عن طريق ?tab=settings في نفس
   رابط الفتح، ونفتح تبويب الإعدادات فورًا أول ما الصفحة تحمّل
   *قبل* أي pushGuardState، عشان لما الحماية تتحط، الشاشة تبقى
   فعليًا هي "الإعدادات" من أول لحظة، ومطابقة تمامًا لمنطق الرجوع.
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

        // لو الصفحة اتفتحت بطلب صريح إننا نروح لتبويب معيّن (جايين
        // من صفحة فرعية بتاعة الإعدادات مثلاً)، نفتحه فورًا *قبل*
        // ما نحط أي طبقة حماية، عشان الحماية تتحط وهي فعليًا
        // مطابقة للشاشة الظاهرة على الشخص.
        try {
            var params = new URLSearchParams(window.location.search);
            var wantedTab = params.get('tab');
            if (wantedTab === 'settings') {
                var settingsBtn = document.getElementById('navSettings');
                if (settingsBtn) settingsBtn.click();
            }
            // ننضف الـ URL من الـ query عشان لو الصفحة اتعمل لها
            // reload لاحقًا (مش من عندنا) متفتحش تبويب الإعدادات
            // تاني من غير داعي.
            if (wantedTab && window.history.replaceState) {
                window.history.replaceState({}, '', window.location.pathname);
            }
        } catch (e) {}

        // دلوقتي بس، وبعد ما الشاشة بقت فعلاً مطابقة للمطلوب، نحط
        // طبقة الحماية.
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
            // بنحدد الوجهة في نفس رابط الفتح (?tab=settings) عشان
            // MainActivity.html يفتح تبويب الإعدادات فورًا من أول
            // لحظة تحميل، قبل ما يحط أي طبقة حماية في الـ history.
            window.location.href = 'MainActivity.html?tab=settings';
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
