// auth-theme.js
// زرار تبديل الوضع الداكن/الفاتح لصفحات التسجيل (signup / verify / profile).
// بيستخدم نفس المفتاح (cz_theme) اللي main.js/settings.js بتستخدمه في
// MainActivity، عشان اختيار المستخدم يفضل متزامن في كل الصفحات.
(function () {
    function applyAuthTheme(theme) {
        document.body.classList.toggle('theme-white', theme === 'white');
    }

    const saved = localStorage.getItem('cz_theme') || 'dark';
    applyAuthTheme(saved);

    document.addEventListener('DOMContentLoaded', () => {
        const btn = document.getElementById('authThemeToggle');
        if (!btn) return;

        btn.addEventListener('click', () => {
            const current = localStorage.getItem('cz_theme') || 'dark';
            const next = current === 'white' ? 'dark' : 'white';
            localStorage.setItem('cz_theme', next);
            applyAuthTheme(next);
        });
    });
})();
