// ==========================================
// ChatZone - نظام إشعار التحديثات
// ==========================================
// رقم النسخة الحالية المثبتة في التطبيق (غيّره يدويًا كل مرة تعمل نسخة جديدة)
const CHATZONE_CURRENT_VERSION = "1.0.0";

// رابط ملف version.json على موقعك (نفس مكان index.html)
const CHATZONE_VERSION_CHECK_URL = "https://chatzonex.github.io/ar/version.json";

function compareVersions(v1, v2) {
    const a = v1.split('.').map(Number);
    const b = v2.split('.').map(Number);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const num1 = a[i] || 0;
        const num2 = b[i] || 0;
        if (num1 > num2) return 1;
        if (num1 < num2) return -1;
    }
    return 0;
}

function showChatZoneUpdatePopup(message, downloadUrl) {
    if (document.getElementById('cz-update-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'cz-update-overlay';
    overlay.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.6);
        display: flex; align-items: center; justify-content: center;
        z-index: 999999; font-family: inherit;
    `;

    const box = document.createElement('div');
    box.style.cssText = `
        background: #fff; border-radius: 16px; padding: 24px;
        max-width: 340px; width: 85%; text-align: center;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    `;

    box.innerHTML = `
        <div style="font-size:40px; margin-bottom:12px;">🚀</div>
        <h3 style="margin:0 0 10px; color:#111; font-size:18px;">تحديث جديد متاح</h3>
        <p style="color:#555; font-size:14px; line-height:1.6; margin:0 0 20px;">${message}</p>
        <button id="cz-update-btn" style="
            background:#1878f2; color:#fff; border:none; border-radius:10px;
            padding:12px 24px; font-size:15px; font-weight:bold; width:100%;
            cursor:pointer; margin-bottom:10px;
        ">تحديث الآن</button>
        <button id="cz-update-later-btn" style="
            background:transparent; color:#888; border:none;
            font-size:13px; cursor:pointer; padding:6px;
        ">لاحقًا</button>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    document.getElementById('cz-update-btn').onclick = () => {
        window.open(downloadUrl, '_blank');
    };
    document.getElementById('cz-update-later-btn').onclick = () => {
        overlay.remove();
    };
}

function checkChatZoneUpdate() {
    fetch(CHATZONE_VERSION_CHECK_URL + '?t=' + Date.now())
        .then(res => res.json())
        .then(data => {
            if (compareVersions(data.latestVersion, CHATZONE_CURRENT_VERSION) > 0) {
                showChatZoneUpdatePopup(data.message || 'فيه نسخة جديدة من التطبيق متاحة الآن.', data.downloadUrl);
            }
        })
        .catch(err => console.log('ChatZone update check failed:', err));
}

document.addEventListener('DOMContentLoaded', checkChatZoneUpdate);
