/* ===================================================
   LANG-FLASH-GUARD.JS
   بيمنع "الفلاش" اللي كان بيحصل لما اللغة المحفوظة تبقى إنجليزي
   (أو أي لغة تانية غير العربي): الصفحة مكتوبة بالعربي جوه الـ HTML
   نفسه كنص افتراضي، وde settings.js (اللي بيتحمّل كـ module ولسه
   بياخد وقت أطول شوية) هو اللي بيستبدل النصوص باللغة الفعلية. فكان
   بيبان النص العربي لجزء من الثانية قبل ما يتبدّل.

   الحل (بنفس أسلوب الحماية من "القفشة المرئية" المستخدم في باقي
   الصفحة زي إعدادات الزجاج السائل وألوان الثيم): بنخفي الصفحة
   فورًا لو اللغة المحفوظة مش عربي، وبنسيبها مخفية لحد ما نلمح إن
   settings.js فعلاً بدّل النصوص، وبعدين بنظهرها.

   لازم السكريبت ده يتحط في أول <head> (قبل أي حاجة تانية) عشان
   ياخد فرصته يخفي الصفحة قبل أول رسم فعلي من المتصفح.
=================================================== */

(function () {
    'use strict';

    try {
        var lang = localStorage.getItem('cz_lang') || 'ar';

        // لو اللغة عربي أصلاً، النص الافتراضي في الـ HTML مطابق،
        // فمفيش داعي نخفي أي حاجة.
        if (lang === 'ar') return;

        var html = document.documentElement;
        html.classList.add('lang-loading');

        // ستايل مباشر (مش لازم ننتظر ملفات CSS الخارجية) عشان
        // الإخفاء يشتغل فورًا من أول لحظة ممكنة.
        var style = document.createElement('style');
        style.textContent =
            'html.lang-loading body { opacity: 0 !important; }';
        (document.head || document.documentElement).appendChild(style);

        function reveal() {
            html.classList.remove('lang-loading');
        }

        // شبكة أمان: مهما حصل (حتى لو حاجة فشلت)، الصفحة تتاح
        // للمستخدم بعد أقصى نص ثانية، عشان محدش يفضل شايف شاشة فاضية.
        var safetyTimeout = setTimeout(reveal, 500);

        function watchForTranslation() {
            var target = document.querySelector('[data-i18n]');
            if (!target) {
                // لسه الـ DOM مترسمش، جرّب تاني بعد لحظة
                requestAnimationFrame(watchForTranslation);
                return;
            }

            var originalText = target.textContent;

            var observer = new MutationObserver(function () {
                if (target.textContent !== originalText) {
                    clearTimeout(safetyTimeout);
                    observer.disconnect();
                    reveal();
                }
            });

            observer.observe(target, {
                characterData: true,
                childList: true,
                subtree: true
            });
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', watchForTranslation);
        } else {
            watchForTranslation();
        }
    } catch (e) {}
})();
