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
