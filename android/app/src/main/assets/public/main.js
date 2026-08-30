import {
    db,
    auth,
    doc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    deleteField,
    collection,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    writeBatch,
    ensureAuthenticated,
    deleteUser
} from "./firebase-init.js";

(function () {
    // ===== حماية الصفحة: أي حد يفتح MainActivity مباشرة من غير تسجيل دخول يترحّل =====
    if (!localStorage.getItem('cz_verified_email')) {
        window.location.href = 'index.html';
        return;
    }

    const savedEmail = localStorage.getItem('cz_verified_email');
    const savedEmailLower = savedEmail.toLowerCase();

    // ===== مودال محادثة جديدة =====
    const addChatBtn = document.getElementById('addChatBtn');
    const newChatOverlay = document.getElementById('newChatOverlay');
    const newChatEmail = document.getElementById('newChatEmail');
    const newChatError = document.getElementById('newChatError');
    const cancelNewChat = document.getElementById('cancelNewChat');
    const startNewChat = document.getElementById('startNewChat');
    const chatsListEl = document.getElementById('chatsList');

    // ===== اختيار "تحدث مع اكونت قديم" / "شخص جديد" =====
    const addChoiceOverlay = document.getElementById('addChoiceOverlay');
    const addChoiceExisting = document.getElementById('addChoiceExisting');
    const addChoiceNew = document.getElementById('addChoiceNew');
    const cancelAddChoice = document.getElementById('cancelAddChoice');

    // ===== قائمة "تحدث مع اكونت تحدثت معه من قبل" =====
    const contactsOverlay = document.getElementById('contactsOverlay');
    const contactsListEl = document.getElementById('contactsList');
    const contactsEmptyEl = document.getElementById('contactsEmpty');
    const cancelContacts = document.getElementById('cancelContacts');

    function isValidEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }

    function openNewChatModal() {
        newChatOverlay.classList.remove('hidden');
        newChatEmail.value = '';
        clearNewChatError();
        setTimeout(() => newChatEmail.focus(), 50);
    }

    function closeNewChatModal() {
        newChatOverlay.classList.add('hidden');
    }

    function showNewChatError(message) {
        newChatError.textContent = message;
        newChatEmail.classList.add('error');
    }

    function clearNewChatError() {
        newChatError.textContent = '';
        newChatEmail.classList.remove('error');
    }

    function t(arText, enText) {
        return (localStorage.getItem('cz_lang') || 'ar') === 'en' ? enText : arText;
    }

    function goToConversation(email) {
        localStorage.setItem('cz_active_chat_email', email);
        window.location.href = 'conversation.html';
    }

    function handleStartChat() {
        const email = newChatEmail.value.trim();

        if (!email) {
            showNewChatError(t('من فضلك اكتب الإيميل', 'Please enter an email'));
            return;
        }
        if (!isValidEmail(email)) {
            showNewChatError(t('الإيميل ده مش صحيح', 'This email is not valid'));
            return;
        }
        if (savedEmail && email.toLowerCase() === savedEmail.toLowerCase()) {
            showNewChatError(t('متقدرش تبدأ محادثة مع نفسك', "You can't start a chat with yourself"));
            return;
        }

        clearNewChatError();
        // بنحفظ الإيميل اللي هيتفتح معاه المحادثة عشان صفحة conversation تقرأه
        goToConversation(email);
    }

    // ===== ChatZone Ai: فتح شات الذكاء الاصطناعي (دايرة عايمة) =====
    const chatzoneAiFab = document.getElementById('chatzoneAiFab');
    if (chatzoneAiFab) {
        chatzoneAiFab.addEventListener('click', () => {
            window.location.href = 'ai-chat.html';
        });
    }

    // ===== خطوة 1: زرار + بيفتح اختيار (اكونت قديم / شخص جديد) =====
    function openAddChoiceModal() {
        if (addChoiceOverlay) addChoiceOverlay.classList.remove('hidden');
    }
    function closeAddChoiceModal() {
        if (addChoiceOverlay) addChoiceOverlay.classList.add('hidden');
    }

    if (addChatBtn) addChatBtn.addEventListener('click', openAddChoiceModal);
    if (cancelAddChoice) cancelAddChoice.addEventListener('click', closeAddChoiceModal);
    if (addChoiceOverlay) {
        addChoiceOverlay.addEventListener('click', (e) => {
            if (e.target === addChoiceOverlay) closeAddChoiceModal();
        });
    }
    if (addChoiceNew) {
        addChoiceNew.addEventListener('click', () => {
            closeAddChoiceModal();
            openNewChatModal();
        });
    }

    // ===== خطوة 2أ: قائمة جهات الاتصال السابقة =====
    // بتتقرا من users/{myEmail}/contacts، وده منفصل تمامًا عن مجموعة
    // chats، فبيفضل فيها كل حد اتكلمنا معاه قبل كده حتى لو الشات
    // بينا وبينه اتحذف نهائيًا بعد كده.
    function renderContactsList(contacts) {
        if (!contactsListEl) return;
        contactsListEl.innerHTML = '';
        if (!contacts.length) {
            if (contactsEmptyEl) contactsEmptyEl.classList.remove('hidden');
            return;
        }
        if (contactsEmptyEl) contactsEmptyEl.classList.add('hidden');

        contacts.forEach(async (email) => {
            const row = document.createElement('div');
            row.className = 'contact-row';
            const initial = email.trim().charAt(0).toUpperCase();
            row.innerHTML = `
                <div class="contact-row-avatar">${initial}</div>
                <div class="contact-row-text">
                    <h4 class="contact-row-name">${email}</h4>
                </div>
            `;
            row.addEventListener('click', () => {
                closeContactsModal();
                goToConversation(email);
            });
            contactsListEl.appendChild(row);

            // بنجيب الاسم الحقيقي (لو موجود) ونستبدل الإيميل بيه بعد
            // ما الصف يظهر، من غير ما نأخر عرض القائمة كلها في انتظاره.
            try {
                const realName = await getRealName(email);
                const nameEl = row.querySelector('.contact-row-name');
                if (nameEl && realName) nameEl.textContent = realName;
            } catch (e) {
                // نسيبه بالإيميل لو فشل
            }
        });
    }

    async function loadContacts() {
        if (contactsListEl) {
            contactsListEl.innerHTML = '';
        }
        if (contactsEmptyEl) contactsEmptyEl.classList.add('hidden');
        try {
            const user = await ensureAuthenticated();
            const contactsRef = collection(db, 'users', savedEmailLower, 'contacts');
            const q = query(contactsRef, orderBy('lastContactAt', 'desc'));
            const snap = await getDocs(q);
            const emails = [];
            snap.forEach(d => {
                const data = d.data();
                if (data && data.email) emails.push(data.email);
            });
            renderContactsList(emails);
        } catch (e) {
            console.error('فشل جلب جهات الاتصال:', e);
            renderContactsList([]);
        }
    }

    function openContactsModal() {
        if (contactsOverlay) contactsOverlay.classList.remove('hidden');
        loadContacts();
    }
    function closeContactsModal() {
        if (contactsOverlay) contactsOverlay.classList.add('hidden');
    }

    if (addChoiceExisting) {
        addChoiceExisting.addEventListener('click', () => {
            closeAddChoiceModal();
            openContactsModal();
        });
    }
    if (cancelContacts) cancelContacts.addEventListener('click', closeContactsModal);
    if (contactsOverlay) {
        contactsOverlay.addEventListener('click', (e) => {
            if (e.target === contactsOverlay) closeContactsModal();
        });
    }

    // ===== خطوة 2ب: مودال الإيميل العادي (شخص جديد) =====
    cancelNewChat.addEventListener('click', closeNewChatModal);
    newChatOverlay.addEventListener('click', (e) => {
        if (e.target === newChatOverlay) closeNewChatModal();
    });

    newChatEmail.addEventListener('input', clearNewChatError);
    newChatEmail.addEventListener('keydown', e => {
        if (e.key === 'Enter') handleStartChat();
    });

    startNewChat.addEventListener('click', handleStartChat);

    // =====================================================
    // عرض قائمة المحادثات في الشاشة الرئيسية
    // =====================================================

    function displayNameFromEmail(email) {
        if (!email) return t('مستخدم', 'User');
        const namePart = email.split('@')[0];
        return namePart.charAt(0).toUpperCase() + namePart.slice(1);
    }

    // بنكاش الاسم الحقيقي لكل إيميل عشان منعملش getDoc لنفس الإيميل
    // كذا مرة لو ظهر في أكتر من محادثة أو تحديث.
    const nameCache = new Map();

    async function getRealName(email) {
        const profile = await getUserProfile(email);
        return profile.name;
    }

    // زي getRealName بالظبط، بس بيرجّع كمان رابط صورة البروفايل (لو
    // المستخدم رفعها عن طريق Cloudinary وحفظناها في users/{email}.photoURL).
    // بنستخدم نفس الكاش (nameCache) عشان مش هنعمل getDoc تاني لو
    // getRealName اتنادت قبل كده لنفس الإيميل.
    async function getUserProfile(email) {
        const key = email.toLowerCase();
        if (nameCache.has(key)) return nameCache.get(key);
        try {
            const snap = await getDoc(doc(db, 'users', key));
            const data = snap.exists() ? snap.data() : null;
            // لو صاحب الحساب ده مفعّل "إخفاء صورة البروفايل عن الآخرين"،
            // منرجعش رابط صورته خالص هنا، فتفضل الأيقونة الافتراضية
            // ظاهرة في كارت الشات بدلها.
            const photoHidden = !!(data && data.hidePhotoFromOthers === true);
            const profile = {
                name: (data && data.name) ? data.name : displayNameFromEmail(email),
                photoURL: (data && !photoHidden && data.photoURL) ? data.photoURL : ''
            };
            nameCache.set(key, profile);
            return profile;
        } catch (e) {
            return { name: displayNameFromEmail(email), photoURL: '' };
        }
    }

    // الاسم اللي بيظهر فعليًا في كارت الشات لازم ياخد بالِه من الاسم
    // المخصص اللي المستخدم غيّره لجهة الاتصال دي (contactNames.{myUid}
    // جوه مستند الشات نفسه)، مش بس الاسم الحقيقي — وإلا الاسم المخصص
    // هيفضل ظاهر جوه شاشة المحادثة بس، ويرجع الاسم الحقيقي تاني في
    // قائمة الدردشات الرئيسية، وهي بالظبط المشكلة اللي كانت موجودة.
    function displayNameForChat(entry) {
        return entry.myContactName || entry.realName || '';
    }

    function renderEmptyChatsState() {
        chatsListEl.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">💬</div>
                <p class="empty-title">${t('مفيش شتات لسه', 'No chats yet')}</p>
                <p class="empty-sub">${t('دوس على علامة + وابدأ أول محادثة', 'Tap + to start your first chat')}</p>
            </div>`;
    }

    function formatChatTime(date) {
        if (!date) return '';
        const now = new Date();
        const sameDay = date.toDateString() === now.toDateString();
        if (sameDay) {
            let h = date.getHours();
            const m = date.getMinutes().toString().padStart(2, '0');
            const ampm = h < 12 ? t('ص', 'AM') : t('م', 'PM');
            h = h % 12 || 12;
            return `${h}:${m} ${ampm}`;
        }
        return date.toLocaleDateString(t('ar-EG', 'en-US'), { day: 'numeric', month: 'short' });
    }

    // بنخزّن آخر بيانات معروفة لكل شات عشان نعيد الرسم كله مرة واحدة
    // وبترتيب صحيح كل ما يوصل تحديث (سواء تحديث الشات نفسه، أو رسالة
    // جديدة جاية من listener تاني).
    // pinned: تثبيت الشات (خاص بيا أنا بس) — pinnedFor.{myUid} == true
    // deletedAt: وقت "حذف الشات من عندي" (خاص بيا أنا بس) — أي رسالة
    // جاية بعد الوقت ده بترجّع الشات يظهر تاني تلقائيًا.
    // lastMessageStatus/lastMessageIsMine: عشان نعرض صح (رمادي/أزرق)
    // جنب آخر رسالة في القايمة الرئيسية بالظبط زي جوه الشات، بس لو
    // آخر رسالة كانت مبعوتة مني أنا (مش لو هي اللي بعتتها).
    // isOtherTyping: بيتفعّل لحظيًا من مستند الشات (typing.{otherUid})
    // ويطغى على المعاينة النصية العادية طول ما هو شغال.
    const chatsState = new Map(); // chatId -> { otherEmail, lastMessage, lastAt, unread, pinned, deletedAt, lastMessageStatus, lastMessageIsMine, isOtherTyping }
    let messageUnsubscribers = new Map(); // chatId -> unsubscribe fn
    let unreadUnsubscribers = new Map(); // chatId -> unsubscribe fn
    let typingUnsubscribers = new Map(); // chatId -> unsubscribe fn
    let myUidGlobal = null;

    const TICK_ICON = {
        unsent: 'tick-unsent',
        unread: 'tick-unread',
        read: 'tick-read'
    };

    // إجمالي عدد الرسائل غير المقروءة في كل الشاتات مجتمعة، بيتحدّث
    // فورًا مع أي تغيير وبيتعرض كـ badge على تاب "الدردشات" في شريط
    // التنقل السفلي، حتى لو المستخدم مش فاتح شاشة الدردشات دلوقتي.
    function updateGlobalUnreadBadge() {
        let total = 0;
        chatsState.forEach(entry => { total += (entry.unread || 0); });
        const navChatsBtn = document.getElementById('navChats');
        if (!navChatsBtn) return;
        let badge = navChatsBtn.querySelector('.nav-unread-badge');
        if (total > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'nav-unread-badge';
                navChatsBtn.appendChild(badge);
            }
            badge.textContent = total > 99 ? '99+' : String(total);
        } else if (badge) {
            badge.remove();
        }
        // تحديث عنوان التاب (favicon/title) اختياري لاحقًا لو احتجنا
        document.title = total > 0 ? `(${total > 99 ? '99+' : total}) ChatZone` : 'ChatZone';
    }

    async function renderChatsList() {
        // الشات اللي اتحذف "من عندي" بيتخفي من القائمة، إلا لو وصلت
        // رسالة جديدة بعد وقت الحذف (يعني لسه في محادثة فعلية شغالة).
        const entries = Array.from(chatsState.entries())
            .filter(([, entry]) => !entry.deletedAt || (entry.lastAt || 0) > entry.deletedAt)
            .map(([chatId, entry]) => ({ chatId, ...entry }));

        if (!entries.length) {
            renderEmptyChatsState();
            updateGlobalUnreadBadge();
            return;
        }

        // المثبّت الأول، وبعدين ترتيب حسب آخر رسالة
        entries.sort((a, b) => {
            const ap = a.pinned ? 1 : 0;
            const bp = b.pinned ? 1 : 0;
            if (ap !== bp) return bp - ap;
            return (b.lastAt || 0) - (a.lastAt || 0);
        });

        const pinIconSvg = `<svg class="chat-row-pin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg>`;

        const rows = await Promise.all(entries.map(async (entry) => {
            const profile = await getUserProfile(entry.otherEmail);
            entry.realName = profile.name;
            const name = displayNameForChat(entry) || profile.name;
            const avatarInnerHtml = profile.photoURL
                ? `<img class="chat-row-avatar-img" src="${profile.photoURL}" alt="">`
                : `<svg class="chat-row-avatar-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8"/>
                        <path d="M4 20c0-3.87 3.58-7 8-7s8 3.13 8 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                   </svg>`;
            const timeStr = entry.lastAt ? formatChatTime(new Date(entry.lastAt)) : '';
            const unreadCount = entry.unread || 0;
            const unreadBadge = unreadCount > 0
                ? `<span class="chat-row-unread-badge">${unreadCount > 99 ? '99+' : unreadCount}</span>`
                : '';

            // لو آخر رسالة في المحادثة بعتها أنا، بنعرض نفس أيقونة الصح
            // (رمادية = لسه ما اتقرتش، زرقاء = اتقرت) جنب المعاينة —
            // بالظبط نفس منطق جوه شاشة الشات.
            const tickHtml = (entry.lastMessageIsMine && entry.lastMessageStatus)
                ? `<span class="chat-row-tick ${TICK_ICON[entry.lastMessageStatus] || TICK_ICON.unread}"></span>`
                : '';

            // "بيكتب الآن..." بيطغى على المعاينة النصية العادية طول ما
            // الطرف التاني شغال بيكتب فعليًا، وبيرجع تلقائيًا للمعاينة
            // العادية أول ما يوقف.
            const previewHtml = entry.isOtherTyping
                ? `<p class="chat-row-preview chat-row-preview-typing"><span class="chat-row-typing-dot"></span>${t('يكتب الآن...', 'typing...')}</p>`
                : `<p class="chat-row-preview">${tickHtml}${entry.lastMessage
                    ? entry.lastMessage.replace(/</g, '&lt;').replace(/>/g, '&gt;')
                    : t('ابدأ المحادثة', 'Start the conversation')}</p>`;

            return `
                <div class="chat-row${unreadCount > 0 ? ' chat-row-unread' : ''}${entry.pinned ? ' chat-row-pinned' : ''}" data-email="${entry.otherEmail}" data-chat-id="${entry.chatId}" data-pinned="${entry.pinned ? '1' : '0'}">
                    <div class="chat-row-avatar">${avatarInnerHtml}</div>
                    <div class="chat-row-text">
                        <h4 class="chat-row-name">${name}</h4>
                        ${previewHtml}
                    </div>
                    <div class="chat-row-meta">
                        <div class="chat-row-meta-top">
                            ${entry.pinned ? pinIconSvg : ''}
                            <span class="chat-row-time">${timeStr}</span>
                        </div>
                        ${unreadBadge}
                    </div>
                </div>`;
        }));

        chatsListEl.innerHTML = rows.join('');

        chatsListEl.querySelectorAll('.chat-row').forEach(row => {
            attachChatRowInteractions(row);
        });

        updateGlobalUnreadBadge();
    }

    // =====================================================
    // ضغطة مطولة على كارت الشات (أي حتة فيه، بما فيها الصورة) -> بانل
    // الصورة الكبيرة + 5 دواير الأيقونات
    // =====================================================
    const LONG_PRESS_MS = 450;

    function attachChatRowInteractions(row) {
        row.addEventListener('click', () => {
            goToConversation(row.getAttribute('data-email'));
        });

        let pressTimer = null;
        let longPressed = false;
        let startX = 0, startY = 0;

        function cancelPress() {
            if (pressTimer) clearTimeout(pressTimer);
            pressTimer = null;
        }

        function startPress(x, y) {
            longPressed = false;
            startX = x; startY = y;
            pressTimer = setTimeout(() => {
                longPressed = true;
                if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }
                openAvatarPanel(row);
            }, LONG_PRESS_MS);
        }

        row.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            startPress(touch.clientX, touch.clientY);
        }, { passive: true });

        row.addEventListener('touchmove', (e) => {
            const touch = e.touches[0];
            if (Math.abs(touch.clientX - startX) > 10 || Math.abs(touch.clientY - startY) > 10) {
                cancelPress();
            }
        }, { passive: true });

        row.addEventListener('touchend', () => {
            cancelPress();
        });

        row.addEventListener('mousedown', (e) => {
            startPress(e.clientX, e.clientY);
        });
        row.addEventListener('mouseup', cancelPress);
        row.addEventListener('mouseleave', cancelPress);

        row.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            openAvatarPanel(row);
        });

        // بنمنع الـ click العادي (فتح الشات) لو كانت الضغطة طويلة فعلاً
        row.addEventListener('click', (e) => {
            if (longPressed) {
                e.stopImmediatePropagation();
                e.preventDefault();
                longPressed = false;
            }
        }, true);
    }

    // =====================================================
    // بانل الصورة الكبيرة + 5 دواير الأيقونات
    // =====================================================
    const avatarPanelOverlay = document.getElementById('avatarPanelOverlay');
    const avatarPanelPhoto = document.getElementById('avatarPanelPhoto');
    const avatarPanelPhotoIcon = document.getElementById('avatarPanelPhotoIcon');
    let avatarPanelTargetRow = null;

    function openAvatarPanel(row) {
        if (!avatarPanelOverlay) return;
        avatarPanelTargetRow = row;

        const avatarSourceEl = row.querySelector('.chat-row-avatar');
        const img = avatarSourceEl ? avatarSourceEl.querySelector('.chat-row-avatar-img') : null;

        let existingImg = avatarPanelPhoto.querySelector('.avatar-panel-photo-img');
        if (img) {
            if (!existingImg) {
                existingImg = document.createElement('img');
                existingImg.className = 'avatar-panel-photo-img';
                existingImg.alt = '';
                avatarPanelPhoto.appendChild(existingImg);
            }
            existingImg.src = img.src;
            if (avatarPanelPhotoIcon) avatarPanelPhotoIcon.style.display = 'none';
        } else {
            if (existingImg) existingImg.remove();
            if (avatarPanelPhotoIcon) avatarPanelPhotoIcon.style.display = '';
        }

        const isPinned = row.getAttribute('data-pinned') === '1';
        const pinBtn = document.getElementById('avatarPanelPin');
        if (pinBtn) {
            pinBtn.setAttribute('aria-label', isPinned ? t('إلغاء تثبيت المحادثة', 'Unpin chat') : t('تثبيت المحادثة', 'Pin chat'));
        }

        avatarPanelOverlay.classList.add('open');
    }

    function closeAvatarPanel() {
        if (!avatarPanelOverlay) return;
        avatarPanelOverlay.classList.remove('open');
    }

    if (avatarPanelOverlay) {
        avatarPanelOverlay.addEventListener('click', (e) => {
            if (e.target === avatarPanelOverlay) closeAvatarPanel();
        });
    }

    const avatarPanelOpenChat = document.getElementById('avatarPanelOpenChat');
    if (avatarPanelOpenChat) {
        avatarPanelOpenChat.addEventListener('click', () => {
            if (!avatarPanelTargetRow) return;
            const email = avatarPanelTargetRow.getAttribute('data-email');
            closeAvatarPanel();
            goToConversation(email);
        });
    }

    const avatarPanelViewPhoto = document.getElementById('avatarPanelViewPhoto');
    if (avatarPanelViewPhoto) {
        avatarPanelViewPhoto.addEventListener('click', () => {
            const img = avatarPanelPhoto.querySelector('.avatar-panel-photo-img');
            if (img) openPhotoViewer(img.src);
        });
    }

    const avatarPanelInfo = document.getElementById('avatarPanelInfo');
    if (avatarPanelInfo) {
        avatarPanelInfo.addEventListener('click', () => {
            if (!avatarPanelTargetRow) return;
            const email = avatarPanelTargetRow.getAttribute('data-email');
            closeAvatarPanel();
            // بنفتح الشات ومعاه نفس شيت "معلومات الحساب" اللي جوه المحادثة
            localStorage.setItem('cz_open_info_on_load', '1');
            goToConversation(email);
        });
    }

    const avatarPanelDelete = document.getElementById('avatarPanelDelete');
    if (avatarPanelDelete) {
        avatarPanelDelete.addEventListener('click', () => {
            if (!avatarPanelTargetRow) return;
            ctxTargetChatId = avatarPanelTargetRow.getAttribute('data-chat-id');
            ctxTargetEmail = avatarPanelTargetRow.getAttribute('data-email');
            closeAvatarPanel();
            openSheet('sheet-delete-chat');
        });
    }

    const avatarPanelPin = document.getElementById('avatarPanelPin');
    if (avatarPanelPin) {
        avatarPanelPin.addEventListener('click', async () => {
            if (!avatarPanelTargetRow || !myUidGlobal) return;
            const chatId = avatarPanelTargetRow.getAttribute('data-chat-id');
            closeAvatarPanel();
            const entry = chatsState.get(chatId);
            const willPin = !(entry && entry.pinned);
            try {
                await updateDoc(doc(db, 'chats', chatId), {
                    ['pinnedFor.' + myUidGlobal]: willPin ? true : deleteField()
                });
                if (entry) {
                    entry.pinned = willPin;
                    chatsState.set(chatId, entry);
                    renderChatsList();
                }
            } catch (e) {
                console.error('فشل تحديث تثبيت المحادثة:', e);
            }
        });
    }

    // =====================================================
    // Fullscreen photo viewer (من صفحة الرئيسية)
    // =====================================================
    const photoViewerOverlay = document.getElementById('photoViewerOverlay');
    const photoViewerImg = document.getElementById('photoViewerImg');
    const photoViewerClose = document.getElementById('photoViewerClose');

    function openPhotoViewer(photoURL) {
        if (!photoViewerOverlay || !photoViewerImg || !photoURL) return;
        photoViewerImg.src = photoURL;
        photoViewerOverlay.classList.add('open');
    }
    function closePhotoViewer() {
        if (!photoViewerOverlay) return;
        photoViewerOverlay.classList.remove('open');
    }
    if (photoViewerClose) photoViewerClose.addEventListener('click', closePhotoViewer);
    if (photoViewerOverlay) {
        photoViewerOverlay.addEventListener('click', (e) => {
            if (e.target === photoViewerOverlay) closePhotoViewer();
        });
    }

    // ===== حالة الشات المستهدف حاليًا (من بانل الصورة) — مستخدمة في
    // تأكيد الحذف =====
    let ctxTargetChatId = null;
    let ctxTargetEmail = null;

    // بيمسح كل مستندات مجموعة الرسايل بتاعة الشات على دفعات (حد أقصى
    // 500 عملية لكل batch في Firestore)، ثم يمسح مستند الشات نفسه.
    // النتيجة: الشات والرسايل بيختفوا نهائيًا من فايرستور عند الطرفين
    // مافيش أي رجوع.
    async function deleteChatPermanently(chatId) {
        const messagesRef = collection(db, 'chats', chatId, 'messages');
        let snap = await getDocs(messagesRef);
        while (!snap.empty) {
            const batch = writeBatch(db);
            snap.docs.slice(0, 500).forEach((d) => batch.delete(d.ref));
            await batch.commit();
            if (snap.size <= 500) break;
            snap = await getDocs(messagesRef);
        }
        await deleteDoc(doc(db, 'chats', chatId));
    }

    const deleteChatConfirmBtn = document.getElementById('deleteChatConfirmBtn');
    if (deleteChatConfirmBtn) {
        deleteChatConfirmBtn.addEventListener('click', async () => {
            const chatId = ctxTargetChatId;
            closeSheet('sheet-delete-chat');
            if (!chatId || !myUidGlobal) return;
            try {
                await deleteChatPermanently(chatId);
                chatsState.delete(chatId);
                renderChatsList();
            } catch (e) {
                console.error('فشل حذف المحادثة نهائيًا:', e);
            }
        });
    }

    // =====================================================
    // ===== تسجيل خروج = حذف الحساب نهائيًا =====
    // زرار "تسجيل خروج" في آخر صفحة الإعدادات: بعد تأكيد المستخدم،
    // بيمسح كل شاتاته ورسايله نهائيًا (زي حذف الشات النهائي)، بعدين
    // مستند users/{email} بتاعه، بعدين قائمة جهات الاتصال بتاعته،
    // وأخيرًا مستخدم Firebase Auth نفسه (Authentication). في الآخر
    // بيمسح بيانات الجلسة المحلية ويرجّعه لصفحة تسجيل الدخول، فلازم
    // يسجل دخول تاني من الصفر زي ما هو متوقع.
    // =====================================================
    const logoutBtn = document.getElementById('logoutBtn');
    const logoutConfirmBtn = document.getElementById('logoutConfirmBtn');
    const logoutCancelBtn = document.getElementById('logoutCancelBtn');
    const logoutStatusEl = document.getElementById('logoutStatus');

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            openSheet('sheet-logout');
        });
    }
    if (logoutCancelBtn) {
        logoutCancelBtn.addEventListener('click', () => {
            closeSheet('sheet-logout');
        });
    }

    async function deleteMyContacts(myUid) {
        const contactsRef = collection(db, 'users', savedEmailLower, 'contacts');
        let snap = await getDocs(contactsRef);
        while (!snap.empty) {
            const batch = writeBatch(db);
            snap.docs.slice(0, 500).forEach((d) => batch.delete(d.ref));
            await batch.commit();
            if (snap.size <= 500) break;
            snap = await getDocs(contactsRef);
        }
    }

    async function deleteAllMyChats(myUid) {
        const chatsRef = collection(db, 'chats');
        const q = query(chatsRef, where('participants', 'array-contains', myUid));
        const snap = await getDocs(q);
        for (const chatDoc of snap.docs) {
            await deleteChatPermanently(chatDoc.id);
        }
    }

    async function deleteAccountPermanently() {
        const user = await ensureAuthenticated();
        const myUid = user.uid;

        // 1) كل الشاتات والرسايل بتاعتي (زي الحذف النهائي بالظبط)
        await deleteAllMyChats(myUid);

        // 2) قائمة جهات الاتصال بتاعتي
        await deleteMyContacts(myUid);

        // 3) مستند users/{email} بتاعي
        await deleteDoc(doc(db, 'users', savedEmailLower));

        // 4) مستخدم Firebase Authentication نفسه
        await deleteUser(user);
    }

    if (logoutConfirmBtn) {
        logoutConfirmBtn.addEventListener('click', async () => {
            logoutConfirmBtn.disabled = true;
            if (logoutCancelBtn) logoutCancelBtn.disabled = true;
            if (logoutStatusEl) {
                logoutStatusEl.textContent = t('جاري حذف الحساب...', 'Deleting your account...');
                logoutStatusEl.classList.remove('hidden');
            }
            try {
                await deleteAccountPermanently();
            } catch (e) {
                console.error('فشل حذف الحساب نهائيًا أثناء تسجيل الخروج:', e);
                // حتى لو فشلت خطوة معينة (مثلاً deleteUser بسبب جلسة
                // anonymous قديمة)، منسيبش المستخدم عالق في المنتصف:
                // بنكمل نمسح بياناته المحلية ونطلعه برا على أي حال،
                // عشان الوعد اللي اتقاله ("هيتسجل خروج") يتحقق فعليًا.
            } finally {
                closeSheet('sheet-logout');
                if (logoutStatusEl) logoutStatusEl.classList.add('hidden');
                localStorage.removeItem('cz_verified_email');
                localStorage.removeItem('cz_active_chat_email');
                localStorage.removeItem('cz_user_name');
                window.location.href = 'index.html';
            }
        });
    }

    // ===== Sheet helpers (نفس منطق باقي الأبب) =====
    function openSheet(id) {
        const overlay = document.getElementById(id);
        if (overlay) overlay.classList.add('open');
    }
    function closeSheet(id) {
        const overlay = document.getElementById(id);
        if (overlay) overlay.classList.remove('open');
    }
    document.querySelectorAll('[data-close-sheet]').forEach(el => {
        el.addEventListener('click', () => closeSheet(el.dataset.closeSheet));
    });
    document.querySelectorAll('.sheet-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeSheet(overlay.id);
        });
    });

    function listenToChatMessages(chatId, otherEmail, myUid) {
        if (messageUnsubscribers.has(chatId)) return;
        const messagesRef = collection(db, 'chats', chatId, 'messages');
        const q = query(messagesRef, orderBy('createdAt', 'desc'), limit(1));
        const unsub = onSnapshot(q, (snap) => {
            const entry = chatsState.get(chatId) || { otherEmail };
            if (!snap.empty) {
                const data = snap.docs[0].data();
                entry.lastMessage = data.deleted ? t('تم حذف هذه الرسالة', 'This message was deleted') : (data.text || '');
                entry.lastAt = data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().getTime() : Date.now();
                entry.lastMessageIsMine = data.senderUid === myUid;
                entry.lastMessageStatus = data.status || 'unread';
            }
            chatsState.set(chatId, entry);
            renderChatsList();
        }, (err) => {
            console.error('فشل الاستماع لآخر رسالة في المحادثة:', err);
        });
        messageUnsubscribers.set(chatId, unsub);
    }

    // بيستمع لحقل typing.{otherUid} جوه مستند الشات، وبيحدّث معاينة
    // الكارت لحظيًا لما الطرف التاني يبدأ/يوقف الكتابة — حتى لو
    // المستخدم مش فاتح شاشة الشات دي أصلاً، طول ما هو في الصفحة
    // الرئيسية.
    function listenToOtherTyping(chatId, otherEmail, myUid) {
        if (typingUnsubscribers.has(chatId)) return;
        const chatDocRef = doc(db, 'chats', chatId);
        const unsub = onSnapshot(chatDocRef, (snap) => {
            if (!snap.exists()) return;
            const data = snap.data();
            const typingMap = data.typing || {};
            const otherIsTyping = Object.keys(typingMap).some(uid => uid !== myUid && typingMap[uid]);
            const entry = chatsState.get(chatId) || { otherEmail };
            entry.isOtherTyping = otherIsTyping;
            chatsState.set(chatId, entry);
            renderChatsList();
        }, (err) => {
            console.error('فشل الاستماع لحالة الكتابة في المحادثة:', err);
        });
        typingUnsubscribers.set(chatId, unsub);
    }

    // بيستمع لعدد الرسائل غير المقروءة الجاية من الطرف التاني في شات
    // معيّن، وبيحدّث الرقم على كارت الشات وعلى تاب الدردشات فورًا —
    // ده بيشتغل حتى لو المستخدم خارج شاشة الشات نفسها، طول ما
    // main.js فاتح (الصفحة الرئيسية).
    //
    // ملحوظة مهمة: الاستعلام هنا بيفلتر بـ status == 'unread' بس (فلتر
    // واحد)، وبنستبعد رسايلي أنا نفسي (senderUid == myUid) على مستوى
    // الكود مش داخل الاستعلام. ليه؟ لأن الفلتر المركّب اللي كان موجود
    // قبل كده (status == 'unread' AND senderUid != myUid) بيحتاج
    // composite index في Firestore غير موجود أصلاً في المشروع ده، فكل
    // مرة كان بيحصل فيها تحديث كان onSnapshot بيرجّع خطأ "failed-
    // precondition / index required" بدل الداتا، والكود القديم كان
    // بيكتفي بطباعة الخطأ في الكونسول من غير ما يحدّث entry.unread —
    // فالعدد كان بيفضل واقف على آخر قيمة نجحت تتحسب قبل كده بالصدفة
    // (غالبًا 1)، وده بالظبط سبب المشكلة اللي كانت بتظهر أحيانًا وأحيانًا
    // لأ، وبتجيب رسالة واحدة بس مش مقروءة مع إن فيه أكتر من واحدة.
    // الحل: استعلام بفلتر واحد بس (مش محتاج index)، والفلترة التانية
    // (استبعاد رسايلي أنا) بتتعمل على النتيجة نفسها بعد وصولها.
    function listenToUnreadCount(chatId, otherEmail, myUid) {
        if (unreadUnsubscribers.has(chatId)) return;
        const messagesRef = collection(db, 'chats', chatId, 'messages');
        const q = query(messagesRef, where('status', '==', 'unread'));
        const unsub = onSnapshot(q, (snap) => {
            let count = 0;
            snap.forEach(d => {
                const data = d.data();
                if (data.senderUid !== myUid) count++;
            });
            const entry = chatsState.get(chatId) || { otherEmail };
            entry.unread = count;
            chatsState.set(chatId, entry);
            renderChatsList();
        }, (err) => {
            console.error('فشل الاستماع لعدد الرسائل غير المقروءة:', err);
        });
        unreadUnsubscribers.set(chatId, unsub);
    }

    const sidebarRestart = document.getElementById('sidebarRestart');

    function t(arText, enText) {
        return (localStorage.getItem('cz_lang') || 'ar') === 'en' ? enText : arText;
    }

    if (sidebarRestart) {
        sidebarRestart.addEventListener('click', () => {
            closeSidebarMenuIfOpen();
            window.location.reload();
        });
    }

    // ملحوظة: openSheet/closeSheet معرّفين فوق في قسم "Sheet helpers"
    // كـ function declarations، فهم متاحين هنا فورًا (hoisting).
    function closeSidebarMenuIfOpen() {
        const sidebarMenuEl = document.getElementById('sidebarMenu');
        const sidebarOverlayEl = document.getElementById('sidebarOverlay');
        if (sidebarMenuEl) sidebarMenuEl.classList.remove('open');
        if (sidebarOverlayEl) sidebarOverlayEl.classList.remove('open');
    }

    async function initChatsList() {
        let myUid = null;
        try {
            const user = await ensureAuthenticated();
            myUid = user.uid;
            myUidGlobal = user.uid;
        } catch (e) {
            console.error('فشل تسجيل الدخول في Firebase Auth:', e);
            return;
        }

        // بنستعلم بالـ uid بتاعي على حقل participants (مش الإيميل على
        // participantsEmails)، لأن الـ Security Rules بتاعة قراءة
        // chats بتتحقق بالـ uid فقط (request.auth.uid in
        // resource.data.participants). لو استعلمنا بحقل تاني غير
        // اللي الـ rule بتتحقق منه، Firestore بيرفض الـ query كله
        // بمجرد إنه مش قادر يضمن إن كل نتيجة محتملة هتعدي الـ rule.
        const chatsRef = collection(db, 'chats');
        const q = query(chatsRef, where('participants', 'array-contains', myUid));

        onSnapshot(q, (snapshot) => {
            snapshot.forEach(chatDoc => {
                const data = chatDoc.data();
                const emails = data.participantsEmails || [];
                const otherEmail = emails.find(e => e.toLowerCase() !== savedEmailLower) || '';
                if (!otherEmail) return;

                const pinnedFor = data.pinnedFor || {};
                const deletedFor = data.deletedFor || {};
                const contactNames = data.contactNames || {};
                const pinned = !!pinnedFor[myUid];
                const deletedAt = typeof deletedFor[myUid] === 'number' ? deletedFor[myUid] : null;

                const entry = chatsState.get(chatDoc.id) || { otherEmail, lastMessage: '', lastAt: 0, unread: 0 };
                entry.pinned = pinned;
                entry.deletedAt = deletedAt;
                // الاسم المخصص اللي أنا (بس أنا) حطيته لجهة الاتصال دي —
                // نفس الحقل بالظبط اللي بيتحدّث من جوه شاشة المحادثة
                // (contactNames.{myUid})، عشان يفضل ثابت في كل حتة.
                entry.myContactName = contactNames[myUid] || '';
                chatsState.set(chatDoc.id, entry);

                listenToChatMessages(chatDoc.id, otherEmail, myUid);
                listenToUnreadCount(chatDoc.id, otherEmail, myUid);
                listenToOtherTyping(chatDoc.id, otherEmail, myUid);
            });

            if (!snapshot.size) {
                renderEmptyChatsState();
            } else {
                renderChatsList();
            }
        }, (err) => {
            console.error('فشل جلب قائمة المحادثات:', err);
        });
    }

    initChatsList();

    window.addEventListener('unload', () => {
        messageUnsubscribers.forEach(unsub => unsub());
        unreadUnsubscribers.forEach(unsub => unsub());
        typingUnsubscribers.forEach(unsub => unsub());
    });
})();
