import { db, doc, getDoc, updateDoc, ensureAuthenticated } from "./firebase-init.js";

(function () {
    // ===== احترام الثيم واللغة المحفوظين =====
    const lang = localStorage.getItem('cz_lang') || 'ar';
    const theme = localStorage.getItem('cz_theme') || 'dark';
    const isAr = lang === 'ar';

    document.documentElement.lang = lang;
    document.documentElement.dir = isAr ? 'rtl' : 'ltr';

    if (theme === 'white') document.body.classList.add('theme-white');
    if (theme === 'custom') {
        document.body.classList.add('theme-custom');
        const color = localStorage.getItem('cz_theme_color');
        if (color) document.documentElement.style.setProperty('--accent', color);
    }

    function t(arText, enText) {
        return isAr ? arText : enText;
    }

    const T = {
        title: t('البروفايل الشخصي', 'Your Profile'),
        changePhoto: t('تغيير صورة البروفايل', 'Change profile photo'),
        deletePhoto: t('حذف صورة البروفايل', 'Delete profile photo'),
        sheetHint: t('تقدر تغيّر صورة البروفايل مرة واحدة كل يوم.', 'You can change your profile photo once a day.'),
        uploading: t('جاري رفع صورتك...', 'Uploading your photo...'),
        limitReached: t('تم استهلاك الحد اليومي من رفع الصورة', 'Daily photo upload limit reached'),
        invalidFile: t('من فضلك اختر ملف صورة صالح', 'Please choose a valid image file'),
        tooLarge: t('حجم الصورة كبير جدًا (الحد الأقصى 5 ميجا)', 'Image is too large (max 5MB)'),
        uploadError: t('حصل خطأ أثناء رفع الصورة، حاول تاني', 'Something went wrong uploading the image, please try again'),
        deleteError: t('حصل خطأ أثناء حذف الصورة، حاول تاني', 'Something went wrong deleting the photo, please try again'),
        aboutSaved: t('تم حفظ About', 'About saved'),
        aboutSaveError: t('حصل خطأ أثناء الحفظ، حاول تاني', 'Something went wrong saving, please try again'),
        save: t('حفظ', 'Save'),
        aboutPlaceholder: t('اكتب رسالة تظهر للأشخاص اللي بتكلمهم...', 'Write a message that shows to people you chat with...')
    };

    document.getElementById('ypTitle').textContent = T.title;
    document.getElementById('ypChangePhotoLabel').textContent = T.changePhoto;
    document.getElementById('ypDeletePhotoLabel').textContent = T.deletePhoto;
    document.getElementById('ypSheetHint').textContent = T.sheetHint;
    document.getElementById('ypUploadingLabel').textContent = T.uploading;
    document.getElementById('ypAboutSave').textContent = T.save;
    document.getElementById('ypAboutInput').placeholder = T.aboutPlaceholder;

    // ===== زرار الرجوع =====
    document.getElementById('ypBackBtn').addEventListener('click', () => {
        window.location.href = 'MainActivity.html';
    });

    // ===== بيانات المستخدم =====
    const savedName = localStorage.getItem('cz_user_name');
    const savedEmail = localStorage.getItem('cz_verified_email');
    const emailLower = savedEmail ? savedEmail.toLowerCase() : '';

    const nameEl = document.getElementById('ypName');
    const emailEl = document.getElementById('ypEmail');
    if (savedName) nameEl.textContent = savedName;
    if (savedEmail) emailEl.textContent = savedEmail;

    if (!emailLower) {
        window.location.href = 'MainActivity.html';
        return;
    }

    // ===== Sheets =====
    function openSheet(id) {
        const overlay = document.getElementById(id);
        if (overlay) overlay.classList.add('open');
    }
    function closeSheet(id) {
        const overlay = document.getElementById(id);
        if (overlay) overlay.classList.remove('open');
    }
    document.querySelectorAll('.sheet-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeSheet(overlay.id);
        });
    });

    // ===== Toast (نص الشاشة) =====
    const toastEl = document.getElementById('ypToast');
    let toastTimer = null;
    function showToast(message) {
        if (!toastEl) return;
        toastEl.textContent = message;
        toastEl.classList.add('show');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
    }

    // ===== صورة البروفايل (رفع على Cloudinary + حفظ الرابط في Firestore) =====
    const CLOUDINARY_CLOUD_NAME = 'rkeddyph';
    const CLOUDINARY_UPLOAD_PRESET = 'chatzone_upload_image';
    const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

    const ONE_DAY_MS = 24 * 60 * 60 * 1000;

    const avatarEl = document.getElementById('ypAvatar');
    const avatarIconEl = document.getElementById('ypAvatarIcon');
    const uploadingLabelEl = document.getElementById('ypUploadingLabel');
    const fileInput = document.getElementById('ypFileInput');

    let lastPhotoChangeAt = 0; // millis, من Firestore (photoUpdatedAt)

    function renderAvatarImage(photoURL) {
        let img = avatarEl.querySelector('.yp-avatar-img');
        if (photoURL) {
            if (!img) {
                img = document.createElement('img');
                img.className = 'yp-avatar-img';
                img.alt = '';
                avatarEl.insertBefore(img, avatarEl.firstChild);
            }
            img.src = photoURL;
            avatarIconEl.style.display = 'none';
        } else {
            if (img) img.remove();
            avatarIconEl.style.display = '';
        }
    }

    function setUploadingState(isUploading) {
        avatarEl.classList.toggle('yp-uploading', isUploading);
        uploadingLabelEl.classList.toggle('show', isUploading);
    }

    async function loadProfileData() {
        try {
            const snap = await getDoc(doc(db, 'users', emailLower));
            if (snap.exists()) {
                const data = snap.data();
                if (data.photoURL) renderAvatarImage(data.photoURL);
                if (data.photoUpdatedAt && typeof data.photoUpdatedAt.toMillis === 'function') {
                    lastPhotoChangeAt = data.photoUpdatedAt.toMillis();
                }
                if (typeof data.about === 'string') {
                    aboutInput.value = data.about;
                    updateAboutCount();
                }
            }
        } catch (e) {
            console.warn('تعذّر تحميل بيانات البروفايل:', e);
        }
    }

    function dailyLimitReached() {
        if (!lastPhotoChangeAt) return false;
        return (Date.now() - lastPhotoChangeAt) < ONE_DAY_MS;
    }

    // فتح الشيت لما يدوس على الصورة
    avatarEl.addEventListener('click', () => {
        openSheet('sheet-avatar-options');
    });

    // "تغيير صورة البروفايل" من الشيت
    document.getElementById('ypChangePhotoBtn').addEventListener('click', () => {
        closeSheet('sheet-avatar-options');
        fileInput.click();
    });

    fileInput.addEventListener('change', async () => {
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            showToast(T.invalidFile);
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showToast(T.tooLarge);
            return;
        }

        setUploadingState(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

            const uploadRes = await fetch(CLOUDINARY_UPLOAD_URL, {
                method: 'POST',
                body: formData
            });
            if (!uploadRes.ok) throw new Error('فشل الرفع إلى Cloudinary');
            const uploadData = await uploadRes.json();
            const photoURL = uploadData.secure_url;
            if (!photoURL) throw new Error('لم يتم استلام رابط الصورة');

            await ensureAuthenticated();

            // نتأكد من الحد اليومي وقت الحفظ الفعلي (مش قبل الرفع) —
            // المستخدم يقدر يفتح الشيت ويرفع في أي وقت، والتحقق الحقيقي
            // بيحصل هنا عشان نمنع أي محاولة لتخطي الفحص من واجهة تانية.
            if (dailyLimitReached()) {
                showToast(T.limitReached);
                return;
            }

            await updateDoc(doc(db, 'users', emailLower), {
                photoURL,
                photoUpdatedAt: new Date()
            });
            lastPhotoChangeAt = Date.now();

            renderAvatarImage(photoURL);
        } catch (err) {
            console.error('خطأ أثناء رفع صورة البروفايل:', err);
            showToast(T.uploadError);
        } finally {
            setUploadingState(false);
        }
    });

    // "حذف صورة البروفايل" من الشيت — مجاني، مش بيستهلك الحد اليومي
    document.getElementById('ypDeletePhotoBtn').addEventListener('click', async () => {
        closeSheet('sheet-avatar-options');
        try {
            await ensureAuthenticated();
            await updateDoc(doc(db, 'users', emailLower), {
                photoURL: ''
            });
            renderAvatarImage('');
        } catch (err) {
            console.error('خطأ أثناء حذف صورة البروفايل:', err);
            showToast(T.deleteError);
        }
    });

    // ===== About =====
    const aboutInput = document.getElementById('ypAboutInput');
    const aboutCountEl = document.getElementById('ypAboutCount');
    const aboutSaveBtn = document.getElementById('ypAboutSave');

    function updateAboutCount() {
        aboutCountEl.textContent = `${aboutInput.value.length}/140`;
    }
    aboutInput.addEventListener('input', updateAboutCount);

    aboutSaveBtn.addEventListener('click', async () => {
        aboutSaveBtn.disabled = true;
        try {
            await ensureAuthenticated();
            await updateDoc(doc(db, 'users', emailLower), {
                about: aboutInput.value.trim()
            });
            showToast(T.aboutSaved);
        } catch (err) {
            console.error('خطأ أثناء حفظ About:', err);
            showToast(T.aboutSaveError);
        } finally {
            aboutSaveBtn.disabled = false;
        }
    });

    loadProfileData();
})();
