/* ===================================================
   SETTINGS-NAV-PAGES.JS
   بيوصّل صفوف شاشة الإعدادات في MainActivity.html للصفحات
   الجديدة المستقلة بدل ما تفتح شيتات جوه نفس الصفحة:
   - navOpenThemes          -> Themes.html
   - navOpenLanguage        -> language-set.html
   - navOpenHomeSettings    -> HomeSettings.html
   - navOpenChatSettings    -> ChatSettings.html
   - navOpenAppInfo         -> AppInfo.html
   الملف مستقل ومبيلمسش أي كود تاني.
=================================================== */

(function () {
    'use strict';

    var ROUTES = {
        navOpenThemes: 'Themes.html',
        navOpenLanguage: 'language-set.html',
        navOpenHomeSettings: 'HomeSettings.html',
        navOpenChatSettings: 'ChatSettings.html',
        navOpenAppInfo: 'AppInfo.html'
    };

    function init() {
        Object.keys(ROUTES).forEach(function (id) {
            var row = document.getElementById(id);
            if (!row) return;
            row.addEventListener('click', function () {
                window.location.href = ROUTES[id];
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
