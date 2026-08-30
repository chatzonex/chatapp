(function() {
    emailjs.init({ publicKey: 'idu5gyORWMQOOai2X' });

    const EMAILJS_SERVICE_ID = 'service_czab8wl';
    const EMAILJS_TEMPLATE_ID = 'template_mafrpgp';
    const CODE_TTL_MINUTES = 10;

    const emailInput = document.getElementById('emailInput');
    const emailError = document.getElementById('emailError');
    const sendCodeBtn = document.getElementById('sendCodeBtn');

    function isValidEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }

    function generateCode() {
        return String(Math.floor(100000 + Math.random() * 900000));
    }

    function setLoading(isLoading) {
        sendCodeBtn.disabled = isLoading;
        sendCodeBtn.classList.toggle('loading', isLoading);
    }

    function showError(message) {
        emailError.textContent = message;
        emailInput.classList.add('error');
    }

    function clearError() {
        emailError.textContent = '';
        emailInput.classList.remove('error');
    }

    emailInput.addEventListener('input', clearError);

    function isEn() {
        return (window.czGetLang ? window.czGetLang() : 'ar') === 'en';
    }

    async function handleSend() {
        const email = emailInput.value.trim().toLowerCase();

        if (!email) {
            showError(isEn() ? 'Please enter your email' : 'من فضلك اكتب إيميلك');
            return;
        }
        if (!isValidEmail(email)) {
            showError(isEn() ? "This email doesn't look right" : 'الإيميل ده مش صحيح، تأكد منه');
            return;
        }

        clearError();
        setLoading(true);

        const code = generateCode();
        const expiresAt = Date.now() + CODE_TTL_MINUTES * 60 * 1000;

        try {
            await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
                to_email: email,
                code: code
            });

            localStorage.setItem('cz_pending_email', email);
            localStorage.setItem('cz_pending_code', code);
            localStorage.setItem('cz_pending_expires', String(expiresAt));

            window.location.href = 'verify.html';
        } catch (err) {
            console.error('EmailJS send failed:', err);
            showError(isEn() ? 'Something went wrong sending the code, try again' : 'حصل خطأ أثناء إرسال الكود، حاول تاني');
            setLoading(false);
        }
    }

    sendCodeBtn.addEventListener('click', handleSend);
    emailInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') handleSend();
    });
})();
