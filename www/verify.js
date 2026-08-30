import { ensureAuthenticated } from "./firebase-init.js";

(function() {
    emailjs.init({ publicKey: 'idu5gyORWMQOOai2X' });

    const EMAILJS_SERVICE_ID = 'service_czab8wl';
    const EMAILJS_TEMPLATE_ID = 'template_mafrpgp';
    const RESEND_COOLDOWN_SECONDS = 30;

    const otpBoxes = Array.from(document.querySelectorAll('.otp-box'));
    const otpRow = document.getElementById('otpRow');
    const verifyStatus = document.getElementById('verifyStatus');
    const targetEmailEl = document.getElementById('targetEmail');
    const resendLink = document.getElementById('resendLink');
    const resendTimer = document.getElementById('resendTimer');
    const toast = document.getElementById('toast');

    const pendingEmail = localStorage.getItem('cz_pending_email');

    if (!pendingEmail) {
        window.location.href = 'signup.html';
        return;
    }

    targetEmailEl.textContent = pendingEmail;

    function isEn() {
        return (window.czGetLang ? window.czGetLang() : 'ar') === 'en';
    }

    // لما اللغة تتغيّر، auth-lang.js بيستبدل innerHTML بتاع الجملة
    // اللي جوّاها #targetEmail (عشان يترجم النص المحيط)، فده بيمسح
    // الإيميل الحقيقي اللي حطيناه. نعيد ضبطه تاني بعد كل تبديل لغة.
    document.addEventListener('czlangchange', () => {
        const emailEl = document.getElementById('targetEmail');
        if (emailEl) emailEl.textContent = pendingEmail;
    });

    function showToast(message, isError) {
        toast.textContent = message;
        toast.className = 'toast show' + (isError ? ' error' : '');
        setTimeout(() => {
            toast.className = 'toast';
        }, 2600);
    }

    function generateCode() {
        return String(Math.floor(100000 + Math.random() * 900000));
    }

    function getStoredCode() {
        return {
            code: localStorage.getItem('cz_pending_code'),
            expiresAt: Number(localStorage.getItem('cz_pending_expires') || 0)
        };
    }

    function clearBoxesError() {
        otpBoxes.forEach(box => box.classList.remove('error'));
    }

    function clearResultState() {
        otpBoxes.forEach(box => box.classList.remove('verified', 'wrong'));
        if (otpRow) otpRow.classList.remove('show-result', 'result-correct', 'result-wrong');
    }

    function markVerified() {
        otpBoxes.forEach(box => {
            box.disabled = true;
            box.classList.add('verified');
        });
        if (otpRow) otpRow.classList.add('show-result', 'result-correct');
        verifyStatus.innerHTML = '<span class="dot"></span> ' + (isEn() ? 'Confirmed successfully' : 'تم التأكيد بنجاح');
    }

    function markWrong() {
        // كل المربعات الستة تتحول مع بعض للون الأحمر، والأرقام تختفي
        // ويظهر بدلها علامة X حمرا واحدة في نص الصف.
        otpBoxes.forEach(box => box.classList.add('wrong'));
        if (otpRow) otpRow.classList.add('show-result', 'result-wrong');

        setTimeout(() => {
            otpBoxes.forEach(box => box.value = '');
            clearResultState();
            clearBoxesError();
            otpBoxes[0].focus();
        }, 900);
    }

    function shakeBoxes() {
        otpBoxes.forEach(box => box.classList.add('error'));
        markWrong();
    }

    async function checkCode() {
        const entered = otpBoxes.map(box => box.value).join('');
        if (entered.length < 6) return;

        const { code, expiresAt } = getStoredCode();

        if (!code || Date.now() > expiresAt) {
            showToast(isEn() ? 'The code has expired, send a new one' : 'الكود انتهت صلاحيته، ابعت كود جديد', true);
            shakeBoxes();
            return;
        }

        if (entered === code) {
            // الكود صح محليًا. دلوقتي نربط الجلسة بـ Firebase Auth حقيقي
            // (anonymous) عشان يبقى عند المستخدم request.auth.uid حقيقي
            // تعتمد عليه Firestore Rules، مش مجرد قيمة في localStorage.
            otpBoxes.forEach(box => box.disabled = true);
            verifyStatus.innerHTML = '<span class="dot"></span> ' + (isEn() ? 'Signing in...' : 'جاري تسجيل الدخول...');

            try {
                await ensureAuthenticated();
            } catch (err) {
                console.error('فشل تسجيل الدخول في Firebase Auth:', err);
                showToast(isEn() ? 'Something went wrong signing in, try again' : 'حصل خطأ أثناء تسجيل الدخول، حاول تاني', true);
                otpBoxes.forEach(box => box.disabled = false);
                verifyStatus.innerHTML = '';
                return;
            }

            markVerified();
            localStorage.setItem('cz_verified_email', pendingEmail);
            localStorage.removeItem('cz_pending_code');
            localStorage.removeItem('cz_pending_expires');
            setTimeout(() => {
                window.location.href = 'profile.html';
            }, 900);
        } else {
            showToast(isEn() ? 'Wrong code, try again' : 'الكود غلط، حاول تاني', true);
            shakeBoxes();
        }
    }

    otpBoxes.forEach((box, index) => {
        box.addEventListener('input', () => {
            box.value = box.value.replace(/[^0-9]/g, '').slice(0, 1);
            clearBoxesError();
            clearResultState();
            if (box.value && index < otpBoxes.length - 1) {
                otpBoxes[index + 1].focus();
            }
            checkCode();
        });

        box.addEventListener('keydown', e => {
            if (e.key === 'Backspace' && !box.value && index > 0) {
                otpBoxes[index - 1].focus();
            }
        });

        box.addEventListener('paste', e => {
            e.preventDefault();
            const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '');
            if (!pasted) return;
            pasted.slice(0, 6).split('').forEach((digit, i) => {
                if (otpBoxes[i]) otpBoxes[i].value = digit;
            });
            const nextEmpty = otpBoxes.findIndex(b => !b.value);
            (nextEmpty === -1 ? otpBoxes[otpBoxes.length - 1] : otpBoxes[nextEmpty]).focus();
            checkCode();
        });
    });

    otpBoxes[0].focus();

    let cooldownInterval = null;

    function startCooldown() {
        let remaining = RESEND_COOLDOWN_SECONDS;
        resendLink.classList.add('disabled');
        resendTimer.textContent = `(${remaining}s)`;

        cooldownInterval = setInterval(() => {
            remaining -= 1;
            if (remaining <= 0) {
                clearInterval(cooldownInterval);
                resendLink.classList.remove('disabled');
                resendTimer.textContent = '';
            } else {
                resendTimer.textContent = `(${remaining}s)`;
            }
        }, 1000);
    }

    async function handleResend() {
        if (resendLink.classList.contains('disabled')) return;

        const code = generateCode();
        const expiresAt = Date.now() + 10 * 60 * 1000;

        resendLink.classList.add('disabled');
        try {
            await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
                to_email: pendingEmail,
                code: code
            });
            localStorage.setItem('cz_pending_code', code);
            localStorage.setItem('cz_pending_expires', String(expiresAt));
            showToast(isEn() ? 'A new code has been sent to your email' : 'اتبعت كود جديد على إيميلك');
            startCooldown();
        } catch (err) {
            console.error('Resend failed:', err);
            showToast(isEn() ? 'Something went wrong sending the code, try again' : 'حصل خطأ أثناء إرسال الكود، حاول تاني', true);
            resendLink.classList.remove('disabled');
        }
    }

    resendLink.addEventListener('click', handleResend);
    startCooldown();
})();
