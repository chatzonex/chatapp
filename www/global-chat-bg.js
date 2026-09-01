/* ===================================================
   GLOBAL-CHAT-BG.JS
   بيطبّق لون "Background color" العام (المحفوظ من ChatSettings.html
   في مفتاح cz_global_chat_bg) على خلفية أي محادثة (شات فردي أو
   جروب)، إلا لو المحادثة دي بالذات ليها لون خاص محفوظ مسبقًا
   (cz_chat_bg_color__<id> أو cz_chat_bg_<id>) — في الحالة دي
   اللون الخاص بيفضل هو الأولوية، واللون العام بيتجاهل لنفس
   المحادثة دي بس.
   لازم يتحمّل بأسرع وقت ممكن (زي السكريبت المضمّن جوه
   conversation.html) عشان مايحصلش فلاش لوني قبل ما يتطبق.
=================================================== */

(function () {
    'use strict';

    try {
        var params = new URLSearchParams(window.location.search);
        var candidates = ['id', 'uid', 'chatId', 'conversationId', 'convId', 'groupId', 'gid', 'cid'];
        var convKey = 'default';
        for (var i = 0; i < candidates.length; i++) {
            var v = params.get(candidates[i]);
            if (v) { convKey = v; break; }
        }

        // لو فيه لون خاص بالمحادثة دي بالذات (من أي نظام قديم)، بنسيبه
        // هو اللي شغال ومنعملش override بلون عام.
        var perChatA = localStorage.getItem('cz_chat_bg_color__' + convKey);
        var perChatB = localStorage.getItem('cz_chat_bg_' + convKey);
        if (perChatA || perChatB) return;

        var globalHex = localStorage.getItem('cz_global_chat_bg');
        if (!globalHex) return;

        var inject = function () {
            var style = document.createElement('style');
            style.id = 'globalChatBgStyle';
            style.textContent = '#convMessages{background:' + globalHex + ' !important;}';
            document.head.appendChild(style);
        };

        if (document.head) {
            inject();
        } else {
            new MutationObserver(function (_, obs) {
                if (document.head) { inject(); obs.disconnect(); }
            }).observe(document.documentElement, { childList: true });
        }
    } catch (e) {}
})();
