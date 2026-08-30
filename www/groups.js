// groups.js
// =====================================================
// منطق سيكشن "الجروبات" في الصفحة الرئيسية:
//   1) عرض قائمة الجروبات اللي أنا عضو فيها (تحديث لايف)
//   2) زرار + بيفتح: اختيار أعضاء (من جهات الاتصال السابقة)
//      → اسم وصورة الجروب → إنشاء
//   3) الضغط على أي جروب في القايمة بيوديك لـ conv-group.html
// =====================================================

import {
    db,
    doc,
    getDoc,
    getDocs,
    addDoc,
    setDoc,
    collection,
    query,
    where,
    orderBy,
    onSnapshot,
    serverTimestamp,
    ensureAuthenticated
} from "./firebase-init.js";

(function () {
    if (!localStorage.getItem('cz_verified_email')) {
        window.location.href = 'index.html';
        return;
    }

    const savedEmail = localStorage.getItem('cz_verified_email');
    const savedEmailLower = savedEmail.toLowerCase();

    function t(arText, enText) {
        return (localStorage.getItem('cz_lang') || 'ar') === 'en' ? enText : arText;
    }

    // =====================================================
    // Cloudinary — نفس بيانات رفع صورة البروفايل الشخصي بالظبط
    // (your-profile.js) عشان صورة الجروب تترفع بنفس الطريقة وتتخزن
    // كرابط (photoURL) جوه مستند الجروب في groups/{groupId}.
    // =====================================================
    const CLOUDINARY_CLOUD_NAME = 'rkeddyph';
    const CLOUDINARY_UPLOAD_PRESET = 'chatzone_upload_image';
    const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

    // =====================================================
    // عناصر DOM
    // =====================================================
    const addGroupBtn = document.getElementById('addGroupBtn');
    const groupsListEl = document.getElementById('groupsList');
    const groupSearch = document.getElementById('groupSearch');

    const groupMembersOverlay = document.getElementById('groupMembersOverlay');
    const groupMembersList = document.getElementById('groupMembersList');
    const groupMembersEmpty = document.getElementById('groupMembersEmpty');
    const cancelGroupMembers = document.getElementById('cancelGroupMembers');
    const nextGroupMembers = document.getElementById('nextGroupMembers');

    const groupDetailsOverlay = document.getElementById('groupDetailsOverlay');
    const groupPhotoPicker = document.getElementById('groupPhotoPicker');
    const groupPhotoInput = document.getElementById('groupPhotoInput');
    const groupPhotoImg = document.getElementById('groupPhotoImg');
    const groupPhotoInitial = document.getElementById('groupPhotoInitial');
    const groupNameInput = document.getElementById('groupNameInput');
    const groupNameError = document.getElementById('groupNameError');
    const backGroupDetails = document.getElementById('backGroupDetails');
    const createGroupBtn = document.getElementById('createGroupBtn');

    if (!addGroupBtn || !groupsListEl) return; // الصفحة مفيهاش سيكشن الجروبات (احتياط)

    // =====================================================
    // حالة اختيار الأعضاء الجارية
    // =====================================================
    let pickedMembers = new Map(); // email(lower) -> { email, name, photoURL }
    let uploadedGroupPhotoURL = '';

    function displayNameFromEmail(email) {
        if (!email) return t('مستخدم', 'User');
        const namePart = email.split('@')[0];
        return namePart.charAt(0).toUpperCase() + namePart.slice(1);
    }

    async function getUserProfileLite(email) {
        try {
            const snap = await getDoc(doc(db, 'users', email.toLowerCase()));
            const data = snap.exists() ? snap.data() : null;
            const photoHidden = !!(data && data.hidePhotoFromOthers === true);
            return {
                uid: data ? data.uid : null,
                name: (data && data.name) ? data.name : displayNameFromEmail(email),
                photoURL: (data && !photoHidden && data.photoURL) ? data.photoURL : ''
            };
        } catch (e) {
            return { uid: null, name: displayNameFromEmail(email), photoURL: '' };
        }
    }

    // =====================================================
    // خطوة 1: اختيار الأعضاء من جهات الاتصال السابقة
    // (users/{myEmail}/contacts) — نفس المصدر المستخدم في "تحدث مع
    // اكونت تحدثت معه من قبل" بمودال الـ+ العادي.
    // =====================================================
    function updateNextBtnState() {
        if (nextGroupMembers) nextGroupMembers.disabled = pickedMembers.size === 0;
    }

    function renderGroupMembersList(contacts) {
        if (!groupMembersList) return;
        groupMembersList.innerHTML = '';
        if (!contacts.length) {
            if (groupMembersEmpty) groupMembersEmpty.classList.remove('hidden');
            return;
        }
        if (groupMembersEmpty) groupMembersEmpty.classList.add('hidden');

        contacts.forEach(async (email) => {
            const emailLower = email.toLowerCase();
            const row = document.createElement('div');
            row.className = 'contact-row';
            const initial = email.trim().charAt(0).toUpperCase();
            row.innerHTML = `
                <div class="contact-row-avatar">${initial}</div>
                <div class="contact-row-text">
                    <h4 class="contact-row-name">${email}</h4>
                </div>
                <div class="group-pick-check">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
            `;
            row.addEventListener('click', () => {
                if (pickedMembers.has(emailLower)) {
                    pickedMembers.delete(emailLower);
                    row.classList.remove('picked');
                } else {
                    const nameEl = row.querySelector('.contact-row-name');
                    pickedMembers.set(emailLower, {
                        email: emailLower,
                        name: (nameEl && nameEl.textContent) || displayNameFromEmail(email),
                        photoURL: ''
                    });
                    row.classList.add('picked');
                }
                updateNextBtnState();
            });
            groupMembersList.appendChild(row);

            try {
                const profile = await getUserProfileLite(email);
                const nameEl = row.querySelector('.contact-row-name');
                if (nameEl && profile.name) nameEl.textContent = profile.name;
                if (pickedMembers.has(emailLower)) {
                    const entry = pickedMembers.get(emailLower);
                    entry.name = profile.name;
                    entry.photoURL = profile.photoURL;
                }
            } catch (e) {
                // نسيبه بالإيميل لو فشل
            }
        });
    }

    async function loadContactsForGroup() {
        if (groupMembersList) groupMembersList.innerHTML = '';
        if (groupMembersEmpty) groupMembersEmpty.classList.add('hidden');
        try {
            await ensureAuthenticated();
            const contactsRef = collection(db, 'users', savedEmailLower, 'contacts');
            const q = query(contactsRef, orderBy('lastContactAt', 'desc'));
            const snap = await getDocs(q);
            const emails = [];
            snap.forEach((d) => {
                const data = d.data();
                if (data && data.email) emails.push(data.email);
            });
            renderGroupMembersList(emails);
        } catch (e) {
            console.error('فشل تحميل جهات الاتصال لاختيار أعضاء الجروب:', e);
            renderGroupMembersList([]);
        }
    }

    function openGroupMembersModal() {
        pickedMembers.clear();
        updateNextBtnState();
        if (groupMembersOverlay) groupMembersOverlay.classList.remove('hidden');
        loadContactsForGroup();
    }
    function closeGroupMembersModal() {
        if (groupMembersOverlay) groupMembersOverlay.classList.add('hidden');
    }

    addGroupBtn.addEventListener('click', openGroupMembersModal);
    if (cancelGroupMembers) cancelGroupMembers.addEventListener('click', closeGroupMembersModal);
    if (groupMembersOverlay) {
        groupMembersOverlay.addEventListener('click', (e) => {
            if (e.target === groupMembersOverlay) closeGroupMembersModal();
        });
    }

    // =====================================================
    // خطوة 2: اسم وصورة الجروب
    // =====================================================
    function resetGroupDetailsForm() {
        uploadedGroupPhotoURL = '';
        if (groupPhotoImg) {
            groupPhotoImg.src = '';
            groupPhotoImg.classList.add('hidden');
        }
        if (groupPhotoInitial) {
            groupPhotoInitial.style.display = '';
            groupPhotoInitial.textContent = '؟';
        }
        if (groupNameInput) groupNameInput.value = '';
        clearGroupNameError();
    }

    function showGroupNameError(message) {
        if (groupNameError) groupNameError.textContent = message;
        if (groupNameInput) groupNameInput.classList.add('error');
    }
    function clearGroupNameError() {
        if (groupNameError) groupNameError.textContent = '';
        if (groupNameInput) groupNameInput.classList.remove('error');
    }

    if (nextGroupMembers) {
        nextGroupMembers.addEventListener('click', () => {
            if (pickedMembers.size === 0) return;
            closeGroupMembersModal();
            resetGroupDetailsForm();
            if (groupDetailsOverlay) groupDetailsOverlay.classList.remove('hidden');
            setTimeout(() => { if (groupNameInput) groupNameInput.focus(); }, 50);
        });
    }

    if (backGroupDetails) {
        backGroupDetails.addEventListener('click', () => {
            if (groupDetailsOverlay) groupDetailsOverlay.classList.add('hidden');
            openGroupMembersModal();
        });
    }
    if (groupDetailsOverlay) {
        groupDetailsOverlay.addEventListener('click', (e) => {
            if (e.target === groupDetailsOverlay) groupDetailsOverlay.classList.add('hidden');
        });
    }

    if (groupNameInput) {
        groupNameInput.addEventListener('input', clearGroupNameError);
    }

    // ===== رفع صورة الجروب (Cloudinary، بنفس منطق your-profile.js) =====
    if (groupPhotoPicker && groupPhotoInput) {
        groupPhotoPicker.addEventListener('click', () => groupPhotoInput.click());

        groupPhotoInput.addEventListener('change', async () => {
            const file = groupPhotoInput.files && groupPhotoInput.files[0];
            groupPhotoInput.value = '';
            if (!file) return;

            if (!file.type.startsWith('image/')) {
                showGroupNameError(t('من فضلك اختر ملف صورة صالح', 'Please choose a valid image file'));
                return;
            }
            if (file.size > 5 * 1024 * 1024) {
                showGroupNameError(t('حجم الصورة كبير جدًا (الحد الأقصى 5 ميجا)', 'Image is too large (max 5MB)'));
                return;
            }

            groupPhotoPicker.classList.add('uploading');
            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

                const uploadRes = await fetch(CLOUDINARY_UPLOAD_URL, { method: 'POST', body: formData });
                if (!uploadRes.ok) throw new Error('فشل الرفع إلى Cloudinary');
                const uploadData = await uploadRes.json();
                const photoURL = uploadData.secure_url;
                if (!photoURL) throw new Error('لم يتم استلام رابط الصورة');

                uploadedGroupPhotoURL = photoURL;
                if (groupPhotoImg) {
                    groupPhotoImg.src = photoURL;
                    groupPhotoImg.classList.remove('hidden');
                }
                if (groupPhotoInitial) groupPhotoInitial.style.display = 'none';
            } catch (err) {
                console.error('خطأ أثناء رفع صورة الجروب:', err);
                showGroupNameError(t('حصل خطأ أثناء رفع الصورة، حاول تاني', 'Something went wrong uploading the image, please try again'));
            } finally {
                groupPhotoPicker.classList.remove('uploading');
            }
        });
    }

    // بنحدّث الحرف الأول اللي بيظهر في دايرة الصورة تلقائيًا كل ما
    // اسم الجروب يتغيّر (وطالما لسه مفيش صورة مرفوعة فعليًا)
    if (groupNameInput && groupPhotoInitial) {
        groupNameInput.addEventListener('input', () => {
            if (uploadedGroupPhotoURL) return;
            const v = groupNameInput.value.trim();
            groupPhotoInitial.textContent = v ? v.charAt(0).toUpperCase() : '؟';
        });
    }

    // =====================================================
    // إنشاء الجروب فعليًا في Firestore
    // =====================================================
    async function handleCreateGroup() {
        const name = groupNameInput ? groupNameInput.value.trim() : '';
        if (!name) {
            showGroupNameError(t('من فضلك اكتب اسم الجروب', 'Please enter a group name'));
            return;
        }
        if (name.length > 60) {
            showGroupNameError(t('اسم الجروب طويل أوي', 'The group name is too long'));
            return;
        }
        if (pickedMembers.size === 0) {
            groupDetailsOverlay.classList.add('hidden');
            openGroupMembersModal();
            return;
        }

        createGroupBtn.disabled = true;
        try {
            const me = await ensureAuthenticated();

            // بنجيب uid كل عضو مختار (لو مسجل ومتاح)، ولو حد فشل نجيب
            // uid بتاعه بنسيبه من غير ما نمنع إنشاء الجروب بالكامل —
            // هيتضاف تلقائيًا لما يفتح الجروب لأول مرة (زي منطق الشات
            // العادي بالظبط).
            const memberEntries = [...pickedMembers.values()];
            const memberUids = [me.uid];
            const memberEmailsLower = [savedEmailLower];
            const skippedEntries = [];

            for (const entry of memberEntries) {
                let uid = null;
                try {
                    const snap = await getDoc(doc(db, 'users', entry.email));
                    uid = snap.exists() ? snap.data().uid : null;
                } catch (e) {
                    // نتجاهل ونكمل
                }
                // بنضيف الإيميل والـ uid مع بعض بس، عشان الاتنين يفضلوا
                // بنفس العدد بالظبط (شرط أساسي في قواعد الأمان). لو حد
                // مقدرناش نجيب uid بتاعه (حساب مش متسجل فعليًا لسه)،
                // بنستبعده من الجروب بدل ما نكسر الإنشاء بالكامل.
                if (uid && !memberUids.includes(uid)) {
                    memberUids.push(uid);
                    memberEmailsLower.push(entry.email);
                } else if (!uid) {
                    skippedEntries.push(entry.email);
                }
            }

            if (skippedEntries.length) {
                console.warn('تم استبعاد بعض الأعضاء من الجروب لعدم توفر حسابهم:', skippedEntries);
            }

            if (memberUids.length < 2) {
                showGroupNameError(t('حصلت مشكلة في بيانات الأعضاء المختارين، حاول تاني', 'There was a problem with the selected members, please try again'));
                createGroupBtn.disabled = false;
                return;
            }

            const groupsRef = collection(db, 'groups');
            const groupDoc = await addDoc(groupsRef, {
                name,
                photoURL: uploadedGroupPhotoURL || '',
                ownerUid: me.uid,
                ownerEmail: savedEmailLower,
                members: memberUids,
                memberEmails: memberEmailsLower,
                createdAt: serverTimestamp()
            });

            // رسالة نظام ترحيبية أول ما الجروب يتعمل
            try {
                const myName = (await getUserProfileLite(savedEmailLower)).name;
                await addDoc(collection(db, 'groups', groupDoc.id, 'messages'), {
                    type: 'system',
                    text: t(`${myName} أنشأ الجروب`, `${myName} created the group`),
                    createdAt: serverTimestamp()
                });
            } catch (e) {
                // مش خطوة أساسية، متتسببش في فشل الإنشاء لو حصل فيها مشكلة
            }

            groupDetailsOverlay.classList.add('hidden');
            resetGroupDetailsForm();
            pickedMembers.clear();

            localStorage.setItem('cz_active_group_id', groupDoc.id);
            window.location.href = 'conv-group.html';
        } catch (err) {
            console.error('فشل إنشاء الجروب:', err);
            showGroupNameError(t('حصل خطأ أثناء إنشاء الجروب، حاول تاني', 'Something went wrong creating the group, please try again'));
        } finally {
            createGroupBtn.disabled = false;
        }
    }

    if (createGroupBtn) createGroupBtn.addEventListener('click', handleCreateGroup);
    if (groupNameInput) {
        groupNameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleCreateGroup();
        });
    }

    // =====================================================
    // عرض قائمة الجروبات (لايف) في سيكشن Groups
    // =====================================================
    let allGroupsCache = [];

    function timeAgoLabel(date) {
        if (!date) return '';
        const now = new Date();
        const diffMs = now - date;
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return t('الآن', 'now');
        if (diffMin < 60) return t(`منذ ${diffMin} د`, `${diffMin}m`);
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return t(`منذ ${diffHr} س`, `${diffHr}h`);
        const diffDay = Math.floor(diffHr / 24);
        return t(`منذ ${diffDay} ي`, `${diffDay}d`);
    }

    function renderGroupsList(groups) {
        if (!groupsListEl) return;
        const filterText = (groupSearch && groupSearch.value.trim().toLowerCase()) || '';
        const filtered = filterText
            ? groups.filter(g => (g.name || '').toLowerCase().includes(filterText))
            : groups;

        groupsListEl.innerHTML = '';

        if (!filtered.length) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.innerHTML = `
                <div class="empty-icon">👥</div>
                <p class="empty-title">${t('مفيش جروبات لسه', 'No groups yet')}</p>
                <p class="empty-sub">${t('دوس على علامة + وابدأ أول جروب', 'Tap + to start your first group')}</p>
            `;
            groupsListEl.appendChild(empty);
            return;
        }

        filtered.forEach((g) => {
            const row = document.createElement('div');
            row.className = 'chat-row';
            row.dataset.groupId = g.id;
            const initial = (g.name || '؟').trim().charAt(0).toUpperCase();
            const avatarInnerHtml = g.photoURL
                ? `<img class="chat-row-avatar-img" src="${g.photoURL}" alt="">`
                : `<span class="group-row-avatar-initial">${initial}</span>`;
            const memberCount = (g.members && g.members.length) || 0;
            const subLabel = t(`${memberCount} أعضاء`, `${memberCount} members`);

            row.innerHTML = `
                <div class="chat-row-avatar">${avatarInnerHtml}</div>
                <div class="chat-row-text">
                    <h4 class="chat-row-name">${(g.name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</h4>
                    <p class="chat-row-preview">${subLabel}</p>
                </div>
                <div class="chat-row-meta">
                    <div class="chat-row-meta-top">
                        <span class="chat-row-time">${timeAgoLabel(g.createdAtDate)}</span>
                    </div>
                </div>
            `;
            row.addEventListener('click', () => {
                localStorage.setItem('cz_active_group_id', g.id);
                window.location.href = 'conv-group.html';
            });
            groupsListEl.appendChild(row);
        });
    }

    async function initGroupsList() {
        try {
            const me = await ensureAuthenticated();
            const groupsRef = collection(db, 'groups');
            const q = query(groupsRef, where('members', 'array-contains', me.uid));
            onSnapshot(q, (snap) => {
                const groups = [];
                snap.forEach((d) => {
                    const data = d.data();
                    groups.push({
                        id: d.id,
                        name: data.name || '',
                        photoURL: data.photoURL || '',
                        members: data.members || [],
                        createdAtDate: data.createdAt && data.createdAt.toDate ? data.createdAt.toDate() : null
                    });
                });
                groups.sort((a, b) => (b.createdAtDate || 0) - (a.createdAtDate || 0));
                allGroupsCache = groups;
                renderGroupsList(groups);
            }, (err) => {
                console.error('فشل الاستماع لقائمة الجروبات:', err);
            });
        } catch (e) {
            console.error('فشل تهيئة قائمة الجروبات:', e);
        }
    }

    if (groupSearch) {
        groupSearch.addEventListener('input', () => renderGroupsList(allGroupsCache));
    }

    initGroupsList();
})();
