/* ===================================================
   DEEPLINK.JS
   بيسمع للينكات اللي بتفتح التطبيق من برة (chatzone://chat?email=...)
   بواسطة Capacitor App plugin، وبيدور على المستخدم صاحب الإيميل
   في Firestore (collection: users، field: email)، وبعدين بيدور
   على شات موجود بالفعل بينه وبين المستخدم الحالي في collection
   "chats" (field: participants يحتوي على الـ UIDs)، ولو مفيش
   بيعمل واحد جديد، وأخيرًا بيوديك على conversation.html بتاعه.

   الملف ده مستقل تمامًا عن أي كود تاني (main.js/conversation.js)
   ومبيلمسش حاجة فيهم. لازم يتحمّل في MainActivity.html بس (هو
   نقطة الدخول للتطبيق).
=================================================== */

import {
    db, collection, query, where, getDocs, addDoc, serverTimestamp,
    waitForAuthUser
} from './firebase-init.js';

(function () {
    'use strict';

    function showDeepLinkLoading() {
        var overlay = document.createElement('div');
        overlay.id = 'deepLinkLoadingOverlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:var(--bg,#0A0B0D);' +
            'display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;';
        var spinner = document.createElement('div');
        spinner.style.cssText = 'width:34px;height:34px;border-radius:50%;' +
            'border:3px solid rgba(255,255,255,0.12);border-top-color:#8A9691;' +
            'animation:deepLinkSpin 0.8s linear infinite;';
        var styleTag = document.createElement('style');
        styleTag.textContent = '@keyframes deepLinkSpin{to{transform:rotate(360deg);}}';
        document.head.appendChild(styleTag);
        overlay.appendChild(spinner);
        document.body.appendChild(overlay);
        return overlay;
    }

    function extractEmailFromUrl(urlString) {
        try {
            // custom scheme زي chatzone://chat?email=xxx مش URL قياسي
            // مية بالمية في كل المتصفحات/البيئات، فبنستخرج الـ query
            // string يدويًا كمان كـ fallback أضمن.
            var url = new URL(urlString);
            var email = url.searchParams.get('email');
            if (email) return decodeURIComponent(email);
        } catch (e) {}

        var match = urlString.match(/[?&]email=([^&]+)/);
        if (match && match[1]) {
            try { return decodeURIComponent(match[1]); } catch (e) { return match[1]; }
        }
        return null;
    }

    async function findUserByEmail(email) {
        var usersRef = collection(db, 'users');
        var q = query(usersRef, where('email', '==', email));
        var snap = await getDocs(q);
        if (snap.empty) return null;
        var docSnap = snap.docs[0];
        return { uid: docSnap.id, ...docSnap.data() };
    }

    async function findOrCreateChat(myUid, otherUid, otherEmail, myEmail) {
        var chatsRef = collection(db, 'chats');
        var q = query(chatsRef, where('participants', 'array-contains', myUid));
        var snap = await getDocs(q);

        var existing = null;
        snap.forEach(function (docSnap) {
            if (existing) return;
            var data = docSnap.data();
            var parts = data.participants || [];
            if (parts.indexOf(otherUid) !== -1 && parts.length === 2) {
                existing = docSnap.id;
            }
        });

        if (existing) return existing;

        var newChat = await addDoc(chatsRef, {
            participants: [myUid, otherUid],
            participantsEmails: [myEmail, otherEmail].filter(Boolean),
            createdAt: serverTimestamp()
        });
        return newChat.id;
    }

    async function handleDeepLinkEmail(email) {
        var overlay = showDeepLinkLoading();
        try {
            var me = await waitForAuthUser();
            if (!me || !me.uid || me.isAnonymous) {
                // مفيش مستخدم مسجل دخول فعليًا (session حقيقي) —
                // مش هنعمل تسجيل دخول تلقائي (anonymous) ولا نفتح
                // شات لحد مش مسجل. سيبه يفتح التطبيق عادي ويسجل
                // دخوله بنفسه الأول.
                if (overlay) overlay.remove();
                return;
            }

            var myEmail = me.email || null;
            var otherUser = await findUserByEmail(email);
            if (!otherUser) {
                if (overlay) overlay.remove();
                try { alert('لم يتم العثور على مستخدم بهذا الإيميل.'); } catch (e) {}
                return;
            }

            if (otherUser.uid === me.uid) {
                if (overlay) overlay.remove();
                return;
            }

            var chatId = await findOrCreateChat(me.uid, otherUser.uid, otherUser.email, myEmail);

            // بنحط كل أسماء الـ param المحتملة اللي conversation.js
            // ممكن يكون بيقرا منها، عشان نضمن إنه هيلاقي الـ id
            // أيًا كان الاسم اللي بيستخدمه فعليًا جوه الكود.
            var qs = new URLSearchParams();
            ['id', 'uid', 'chatId', 'conversationId', 'convId', 'cid'].forEach(function (key) {
                qs.set(key, chatId);
            });

            window.location.href = 'conversation.html?' + qs.toString();
        } catch (e) {
            console.warn('DeepLink error:', e);
            if (overlay) overlay.remove();
        }
    }

    async function init() {
        var CapacitorApp = (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) || null;
        if (!CapacitorApp) return; // مش جوه تطبيق Capacitor (مثلاً بيتفتح في متصفح عادي)

        // 1) لو التطبيق كان مقفول تمامًا وفتحته اللينك (cold start)
        try {
            var launchUrlResult = await CapacitorApp.getLaunchUrl();
            if (launchUrlResult && launchUrlResult.url) {
                var email = extractEmailFromUrl(launchUrlResult.url);
                if (email) handleDeepLinkEmail(email);
            }
        } catch (e) {}

        // 2) لو التطبيق كان شغال بالفعل في الخلفية وحد ضغط اللينك تاني
        CapacitorApp.addListener('appUrlOpen', function (data) {
            if (!data || !data.url) return;
            var email = extractEmailFromUrl(data.url);
            if (email) handleDeepLinkEmail(email);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
