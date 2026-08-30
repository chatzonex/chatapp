document.addEventListener('DOMContentLoaded', function() {
    const splash = document.getElementById('splash');

    setTimeout(() => {
        splash.classList.add('fade-out');
    }, 2100);

    setTimeout(() => {
        const isLoggedIn = !!localStorage.getItem('cz_verified_email');
        window.location.href = isLoggedIn ? 'MainActivity.html' : 'signup.html';
    }, 2550);
});
