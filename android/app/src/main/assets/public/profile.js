import { db, doc, getDoc, setDoc, serverTimestamp, ensureAuthenticated } from "./firebase-init.js";

(function () {
    const nameInput = document.getElementById('nameInput');
    const nameError = document.getElementById('nameError');
    const saveNameBtn = document.getElementById('saveNameBtn');
    const toast = document.getElementById('toast');

    // ===== صورة البروفايل (اختياري) =====
    const CLOUDINARY_CLOUD_NAME = 'rkeddyph';
    const CLOUDINARY_UPLOAD_PRESET = 'chatzone_upload_image';
    const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

    const profilePicPicker = document.getElementById('profilePicPicker');
    const profilePicInput = document.getElementById('profilePicInput');
    const profilePicPreview = document.getElementById('profilePicPreview');
    const noPhotoOverlay = document.getElementById('noPhotoOverlay');
    const noPhotoUploadBtn = document.getElementById('noPhotoUploadBtn');
    const noPhotoContinueBtn = document.getElementById('noPhotoContinueBtn');

    // الملف اللي المستخدم اختاره لسه ما اترفعش لـ Cloudinary؛ بنأجل
    // الرفع الفعلي لحد لحظة الحفظ عشان لو غيّر رأيه أو اختار صورة
    // غلط منرفعش حاجة على الفاضي.
    let selectedPhotoFile = null;

    if (profilePicPicker && profilePicInput) {
        profilePicPicker.addEventListener('click', () => profilePicInput.click());

        profilePicInput.addEventListener('change', () => {
            const file = profilePicInput.files && profilePicInput.files[0];
            if (!file) return;

            if (!file.type.startsWith('image/')) {
                showToast(isEn() ? 'Please choose a valid image file' : 'من فضلك اختر ملف صورة صالح', true);
                profilePicInput.value = '';
                return;
            }
            if (file.size > 5 * 1024 * 1024) {
                showToast(isEn() ? 'Image is too large (5MB max)' : 'حجم الصورة كبير جدًا (الحد الأقصى 5 ميجا)', true);
                profilePicInput.value = '';
                return;
            }

            selectedPhotoFile = file;
            const reader = new FileReader();
            reader.onload = () => {
                profilePicPreview.src = reader.result;
                profilePicPreview.hidden = false;
            };
            reader.readAsDataURL(file);
        });
    }

    async function uploadSelectedPhoto() {
        const formData = new FormData();
        formData.append('file', selectedPhotoFile);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

        const uploadRes = await fetch(CLOUDINARY_UPLOAD_URL, { method: 'POST', body: formData });
        if (!uploadRes.ok) throw new Error(isEn() ? 'Upload to Cloudinary failed' : 'فشل الرفع إلى Cloudinary');
        const uploadData = await uploadRes.json();
        if (!uploadData.secure_url) throw new Error(isEn() ? 'No image URL was received' : 'لم يتم استلام رابط الصورة');
        return uploadData.secure_url;
    }

    // لازم يكون المستخدم عدّى مرحلة التأكيد الأول
    const verifiedEmail = localStorage.getItem('cz_verified_email');

    if (!verifiedEmail) {
        window.location.href = 'signup.html';
        return;
    }

    // بنطبّع الإيميل لحروف صغيرة دايمًا قبل استخدامه كمعرّف مستند في
    // Firestore. ده أهم حاجة: باقي الصفحات (conversation.js, main.js)
    // بتدور على المستخدم بالإيميل بعد toLowerCase() فقط، فلو المستند
    // اتحفظ هنا بحروف كابيتال، أي بحث بعد كده هيدور على مستند تاني
    // (مش موجود) وهيفشل التحقق من الملكية أو جلب الاسم الحقيقي.
    const verifiedEmailLower = verifiedEmail.toLowerCase();

    function isEn() {
        return (window.czGetLang ? window.czGetLang() : 'ar') === 'en';
    }

    function showToast(message, isError) {
        toast.textContent = message;
        toast.className = 'toast show' + (isError ? ' error' : '');
        setTimeout(() => {
            toast.className = 'toast';
        }, 2600);
    }

    function showError(message) {
        nameError.textContent = message;
        nameInput.classList.add('error');
    }

    function clearError() {
        nameError.textContent = '';
        nameInput.classList.remove('error');
    }

    function setLoading(isLoading) {
        saveNameBtn.disabled = isLoading;
        saveNameBtn.classList.toggle('loading', isLoading);
    }

    nameInput.addEventListener('input', clearError);

    function openNoPhotoOverlay() {
        if (noPhotoOverlay) noPhotoOverlay.classList.add('open');
    }
    function closeNoPhotoOverlay() {
        if (noPhotoOverlay) noPhotoOverlay.classList.remove('open');
    }

    async function performSave() {
        clearError();
        setLoading(true);
        const name = nameInput.value.trim();

        try {
            let photoURL = '';
            if (selectedPhotoFile) {
                if (profilePicPicker) profilePicPicker.classList.add('uploading');
                try {
                    photoURL = await uploadSelectedPhoto();
                } finally {
                    if (profilePicPicker) profilePicPicker.classList.remove('uploading');
                }
            }

            // لازم يكون فيه جلسة Firebase Auth حقيقية (anonymous) قبل أي
            // كتابة في Firestore، عشان الـ Rules تقدر تتحقق من request.auth.
            const user = await ensureAuthenticated();

            // بنستخدم الإيميل (بحروف صغيرة) كمعرّف فريد للمستخدم في
            // Firestore، وبنسجل الـ uid بتاع Firebase Auth معاه عشان
            // الـ Rules تقدر تربط المستند بصاحبه الحقيقي.
            const userDocRef = doc(db, 'users', verifiedEmailLower);

            // بنجيب المستند الحالي (لو موجود) عشان نعرف هل ده create
            // ولا update، ولو موجود ومملوك لـ uid مختلف عن جلستي الحالية
            // (يعني مفيش تطابق ملكية حقيقي) نوقف فورًا برسالة واضحة
            // بدل ما نسيب Firestore يرفض الطلب برسالة غامضة.
            const existingSnap = await getDoc(userDocRef);
            if (existingSnap.exists() && existingSnap.data().uid && existingSnap.data().uid !== user.uid) {
                console.error('محاولة تعديل مستند مستخدم بجلسة Auth غير مطابقة لصاحبه الأصلي.');
                showToast(isEn() ? 'There\u2019s an issue with your sign-in session, re-enter the code from the verification page' : 'في مشكلة في جلسة الدخول، سجّل الكود تاني من صفحة التأكيد', true);
                setLoading(false);
                return;
            }

            const dataToSave = {
                name: name,
                email: verifiedEmailLower,
                uid: user.uid,
                createdAt: serverTimestamp()
            };
            if (photoURL) dataToSave.photoURL = photoURL;

            await setDoc(userDocRef, dataToSave, { merge: true });

            localStorage.setItem('cz_user_name', name);
            localStorage.setItem('cz_uid', user.uid);

            showToast(isEn() ? 'Your name has been saved' : 'تم حفظ اسمك بنجاح');

            setTimeout(() => {
                window.location.href = 'MainActivity.html';
            }, 900);
        } catch (err) {
            console.error('فشل حفظ الاسم في Firestore:', err);
            showToast(isEn() ? 'Something went wrong saving your name, try again' : 'حصل خطأ أثناء حفظ الاسم، حاول تاني', true);
            setLoading(false);
        }
    }

    async function handleSave() {
        const name = nameInput.value.trim();

        if (!name) {
            showError(isEn() ? 'Please enter your name' : 'من فضلك اكتب اسمك');
            return;
        }
        if (name.length < 2) {
            showError(isEn() ? 'Name is too short' : 'الاسم قصير جدًا');
            return;
        }

        clearError();

        // لو المستخدم اختار صورة بالفعل، نكمل مباشرة من غير أي تحذير.
        // لو مفيش صورة، نوقفه بمودال يخيّره: يرفع دلوقتي أو يكمل من غيرها.
        if (!selectedPhotoFile) {
            openNoPhotoOverlay();
            return;
        }

        await performSave();
    }

    if (noPhotoUploadBtn) {
        noPhotoUploadBtn.addEventListener('click', () => {
            closeNoPhotoOverlay();
            if (profilePicInput) profilePicInput.click();
        });
    }

    if (noPhotoContinueBtn) {
        noPhotoContinueBtn.addEventListener('click', async () => {
            closeNoPhotoOverlay();
            await performSave();
        });
    }

    if (noPhotoOverlay) {
        noPhotoOverlay.addEventListener('click', (e) => {
            if (e.target === noPhotoOverlay) closeNoPhotoOverlay();
        });
    }

    saveNameBtn.addEventListener('click', handleSave);
    nameInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') handleSave();
    });

    nameInput.focus();

    // ===== تواصل مع المطور عبر واتساب =====
    // لما المستخدم يدوس على الزرار، بنفتحله واتساب فيه رسالة جاهزة
    // بالإيميل بتاعه عشان أقدر أساعده بسرعة من غير ما يكتب حاجة إضافية.
    const contactDevBtn = document.getElementById('contactDevBtn');
    const DEV_WHATSAPP_NUMBER = '201550425843'; // 01550425843 بصيغة دولية (مصر)

    if (contactDevBtn) {
        contactDevBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const message = isEn()
                ? `${verifiedEmailLower}\n\nHi, the issue I'm facing is:`
                : `${verifiedEmailLower}\n\nبعد إذنك، المشكلة هي:`;
            const waLink = `https://wa.me/${DEV_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
            window.open(waLink, '_blank');
        });
    }
})();
