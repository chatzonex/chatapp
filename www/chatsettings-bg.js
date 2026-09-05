/* ===================================================
   CHATSETTINGS-BG.JS
   ميزة "Background color" العامة في ChatSettings.html:
   لون واحد بيتطبق على خلفية كل الشتات والجروبات (مش لكل شات
   لوحده زي enhancements.js). بيتخزن في مفتاح واحد عام
   'cz_global_chat_bg' ومستقل تمامًا عن اللون بتاع الشات المفرد
   (لو الشات له لون خاص محفوظ، بيفضل هو الأولوية — نفس منطق
   "override" منطقي، بس من غير ما نلمس أي كود تاني).
=================================================== */

(function () {
    'use strict';

    var GLOBAL_BG_KEY = 'cz_global_chat_bg';

    var COLOR_PRESETS = [
        '#000000',
        '#0B0F14',
        '#12181A',
        '#1A1425',
        '#25D9A0',
        '#5B7FFF',
        '#F87171',
        '#0EA5E9'
    ];

    function $(id) { return document.getElementById(id); }

    function openSheet(id) {
        var el = $(id);
        if (el) el.classList.add('open');
    }

    function closeSheet(id) {
        var el = $(id);
        if (el) el.classList.remove('open');
    }

    function wireCloseButtons(root) {
        var closers = root.querySelectorAll('[data-close-sheet]');
        closers.forEach(function (btn) {
            btn.addEventListener('click', function () {
                closeSheet(btn.getAttribute('data-close-sheet'));
            });
        });
        if (root.classList && root.classList.contains('sheet-overlay')) {
            root.addEventListener('click', function (e) {
                if (e.target === root) root.classList.remove('open');
            });
        }
    }

    function updateSwatch(color) {
        var swatch = $('globalChatBgColorSwatch');
        var hexEl = $('globalChatBgColorHex');
        if (!swatch) return;
        if (color) {
            swatch.classList.add('has-color');
            swatch.style.setProperty('--picked-swatch-color', color);
            if (hexEl) hexEl.textContent = color.toUpperCase();
        } else {
            swatch.classList.remove('has-color');
            swatch.style.removeProperty('--picked-swatch-color');
            if (hexEl) hexEl.textContent = '';
        }
    }

    function init() {
        var sheet = $('sheet-pick-app-color');
        var row = $('globalChatBgColorRow');
        if (!sheet || !row) return;

        wireCloseButtons(sheet);

        var grid = $('appColorPresetGrid');
        var nativePicker = $('appColorNativePicker');
        var customBtn = $('appColorCustomBtn');
        var resetBtn = $('appColorResetBtn');
        var titleEl = $('pickAppColorTitle');

        function buildPresets() {
            grid.innerHTML = '';
            COLOR_PRESETS.forEach(function (hex) {
                var item = document.createElement('div');
                item.className = 'app-color-preset-item';
                item.style.background = hex;
                item.addEventListener('click', function () {
                    applyColor(hex);
                    closeSheet('sheet-pick-app-color');
                });
                grid.appendChild(item);
            });
        }
        buildPresets();

        function applyColor(hex) {
            if (hex) {
                localStorage.setItem(GLOBAL_BG_KEY, hex);
            } else {
                localStorage.removeItem(GLOBAL_BG_KEY);
            }
            updateSwatch(hex);
        }

        row.addEventListener('click', function () {
            if (titleEl) titleEl.textContent = row.querySelector('.theme-color-label') ?
                row.querySelector('.theme-color-label').textContent : 'اختر لون';
            openSheet('sheet-pick-app-color');
        });

        customBtn.addEventListener('click', function () {
            nativePicker.click();
        });

        nativePicker.addEventListener('input', function () {
            applyColor(nativePicker.value);
        });

        resetBtn.addEventListener('click', function () {
            applyColor(null);
            closeSheet('sheet-pick-app-color');
        });

        // عرض اللون المحفوظ حالياً (لو موجود) عند فتح الصفحة
        updateSwatch(localStorage.getItem(GLOBAL_BG_KEY));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
