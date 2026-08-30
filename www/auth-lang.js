// auth-lang.js
// زرار تبديل اللغة (عربي/إنجليزي) لصفحات التسجيل (signup / verify / profile).
// بيستخدم مفتاح واحد (cz_lang) في localStorage عشان اختيار المستخدم
// يفضل متزامن بين الصفحات الثلاث، بنفس فكرة cz_theme في auth-theme.js.
//
// طريقة الاستخدام في الـ HTML: أي نص عايز يتترجم، حطّه في عنصر وضيفله
// data-ar="النص بالعربي" data-en="Text in English". السكريبت ده هيحل
// محل الـ textContent (أو placeholder لو input) حسب اللغة الحالية.
// لو العنصر محتوى بتاعه HTML (زي <b id="targetEmail">) استخدم data-ar-html/data-en-html
// بدل data-ar/data-en عشان يحافظ على أي تاجات جوه.
(function () {
    function applyAuthLang(lang) {
        const isEn = lang === 'en';
        document.documentElement.setAttribute('lang', isEn ? 'en' : 'ar');
        document.documentElement.setAttribute('dir', isEn ? 'ltr' : 'rtl');
        document.body.classList.toggle('lang-en', isEn);

        document.querySelectorAll('[data-ar], [data-en]').forEach(el => {
            const text = isEn ? el.getAttribute('data-en') : el.getAttribute('data-ar');
            if (text === null) return;
            if (el.hasAttribute('placeholder')) {
                el.setAttribute('placeholder', text);
            } else {
                el.textContent = text;
            }
        });

        document.querySelectorAll('[data-ar-html], [data-en-html]').forEach(el => {
            const html = isEn ? el.getAttribute('data-en-html') : el.getAttribute('data-ar-html');
            if (html === null) return;
            el.innerHTML = html;
        });

        document.querySelectorAll('[data-ar-aria], [data-en-aria]').forEach(el => {
            const label = isEn ? el.getAttribute('data-en-aria') : el.getAttribute('data-ar-aria');
            if (label === null) return;
            el.setAttribute('aria-label', label);
        });

        // بنبعت إيفنت عشان أي سكريبت صفحة (زي verify.js اللي بيحط
        // الإيميل الحقيقي جوه #targetEmail) يقدر يعيد ضبط أي محتوى
        // ديناميكي اتمسح بسبب استبدال innerHTML فوق.
        document.dispatchEvent(new CustomEvent('czlangchange', { detail: { lang: isEn ? 'en' : 'ar' } }));
    }

    function getCurrentLang() {
        return localStorage.getItem('cz_lang') || 'ar';
    }

    // نطبّق قبل ما الصفحة تترسم بصريًا عشان منحسّش بفلاش من عربي لإنجليزي
    applyAuthLang(getCurrentLang());

    document.addEventListener('DOMContentLoaded', () => {
        const btn = document.getElementById('authLangToggle');
        if (!btn) return;

        btn.addEventListener('click', () => {
            const next = getCurrentLang() === 'en' ? 'ar' : 'en';
            localStorage.setItem('cz_lang', next);
            applyAuthLang(next);
        });
    });

    // بنعرّضها عالمي عشان أي سكريبت تاني (signup.js / verify.js / profile.js)
    // يقدر ياخد اللغة الحالية لو احتاج يبعت رسالة خطأ ديناميكية.
    window.czGetLang = getCurrentLang;
    window.czApplyLang = applyAuthLang;
})();
