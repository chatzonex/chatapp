/* ===================================================
   SUBPAGES-NAV.JS
   سكريبت مشترك لكل الصفحات الفرعية الجديدة:
   HomeSettings.html / ChatSettings.html / Themes.html /
   language-set.html / AppInfo.html
   1) زرار الرجوع العلوي: دايمًا يرجّع لصفحة MainActivity (تبويب
      الإعدادات) — بيستخدم backNav.js (لو محمّل) عشان الرجوع
      الذكي بالموبايل يبقى متسق مع نفس القاعدة في باقي التطبيق.
   2) ترجمة الكلمات الإضافية اللي مش موجودة في قاموس settings.js
      الأصلي (زي عناوين صفحة AppInfo ولون خلفية الشات).
=================================================== */

(function () {
    'use strict';

    var EXTRA_I18N = {
        ar: {
            custom_color_option: 'لون مخصص (اختر أي لون)',
            reset_default: 'إرجاع الافتراضي',
            chat_bg_group_label: 'مظهر الشات',
            chat_bg_color_pick: 'لون خلفية الشات',
            chat_bg_color_note: 'هيتطبق اللون ده على خلفية كل الشتات والجروبات.',
            appinfo_developer_label: 'مطور التطبيق:',
            appinfo_telegram_label: 'قناة التليجرام:',
            appinfo_contact_label: 'التحدث مع المطور:',
            appinfo_version_label: 'اصدار التطبيق:'
        },
        en: {
            custom_color_option: 'Custom color (pick any color)',
            reset_default: 'Reset to default',
            chat_bg_group_label: 'Chat appearance',
            chat_bg_color_pick: 'Chat background color',
            chat_bg_color_note: 'This color will apply to the background of all chats and groups.',
            appinfo_developer_label: 'App developer:',
            appinfo_telegram_label: 'Telegram channel:',
            appinfo_contact_label: 'Contact the developer:',
            appinfo_version_label: 'App version:'
        }
    };

    function applyExtraI18n() {
        var lang = (localStorage.getItem('cz_lang') === 'en') ? 'en' : 'ar';
        var dict = EXTRA_I18N[lang];
        document.querySelectorAll('[data-i18n]').forEach(function (el) {
            var key = el.getAttribute('data-i18n');
            if (dict[key] === undefined) return;
            // عناصر فيها عنصر تاني جوه (زي appinfo-footer-line اللي فيها
            // <b> ولينك) بنسيبها زي ما هي — بترجم بس الـ <b> جوه نفسه
            // اللي معاه data-i18n مستقل (appinfo_*_label)، عشان منمسحش
            // اللينك أو الإيميل أو اسم المطور.
            if (el.children.length > 0 && el.getAttribute('data-i18n').indexOf('appinfo_') !== 0
                && el.getAttribute('data-i18n') !== 'appinfo_developer') {
                return;
            }
            if (el.getAttribute('data-i18n') === 'appinfo_developer') return;
            el.textContent = dict[key];
        });
    }

    function goToSettings() {
        // الرجوع من صفحات الإعدادات الفرعية دايمًا بيوديك لصفحة
        // الإعدادات الرئيسية تاني (MainActivity على تبويب الإعدادات)
        // على طول من غير خطوة زيادة. لو backnav.js محمّل، بيبقى
        // فيه "طبقة حماية" في الـ history فبنستخدم history.back()
        // عشان نفس منطق زرار/چيستشر الرجوع الفعلي في الموبايل
        // يتطبق برضه على الزرار اللي في الشاشة (backnav.js هو اللي
        // بيحدد الوجهة الصح ?tab=settings). لو backnav.js مش محمّل
        // لأي سبب، بنرجع لصفحة الإعدادات مباشرة.
        if (window.history && window.history.length > 1) {
            window.history.back();
        } else {
            window.location.href = 'MainActivity.html?tab=settings';
        }
    }

    function initBackButton() {
        var btn = document.getElementById('subpageBackBtn');
        if (!btn) return;
        btn.addEventListener('click', goToSettings);
    }

    function init() {
        applyExtraI18n();
        initBackButton();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
