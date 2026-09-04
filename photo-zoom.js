/* ===================================================
   PHOTO-ZOOM.JS
   بيضيف إمكانية الزوم (تكبير/تصغير) على الصورة اللي بتتفتح في
   الفيوور بتاع صفحة المحادثة (photoViewerOverlay / photoViewerImg
   الموجودين في conversation.html وبيتفتحوا من conversation.js).

   الميزات:
   - Pinch to zoom (إصبعين) على الموبايل.
   - Double-tap للتكبير السريع / الرجوع لحجمها الطبيعي.
   - Double-click بالماوس (لو الأبب اتفتح على سطح مكتب/متصفح).
   - سحب (drag / pan) الصورة وهي مكبّرة، بإصبع واحد أو بالماوس.
   - كل مرة الفيوور يتقفل أو يتفتح على صورة جديدة، الزوم بيرجع
     لوضعه الطبيعي تلقائيًا.

   الملف ده مستقل تمامًا ومبيعدلش في conversation.js، بيشتغل بس
   على العنصرين الموجودين بالفعل في الصفحة (لو مش موجودين، مبيعملش
   حاجة). كده مفيش أي خطر إننا نكسر منطق فتح/قفل الفيوور الحالي.
=================================================== */

(function () {
    'use strict';

    function init() {
        var overlay = document.getElementById('photoViewerOverlay');
        var img = document.getElementById('photoViewerImg');
        if (!overlay || !img) return;

        var MIN_SCALE = 1;
        var MAX_SCALE = 4;
        var DOUBLE_TAP_SCALE = 2.5;

        var scale = 1;
        var translateX = 0;
        var translateY = 0;

        // حالة اللمس/السحب الحالية
        var isPanning = false;
        var startX = 0;
        var startY = 0;
        var startTranslateX = 0;
        var startTranslateY = 0;

        // حالة الـ pinch
        var isPinching = false;
        var pinchStartDist = 0;
        var pinchStartScale = 1;
        var pinchStartMidX = 0;
        var pinchStartMidY = 0;
        var pinchStartTranslateX = 0;
        var pinchStartTranslateY = 0;

        var lastTapTime = 0;
        var lastTapX = 0;
        var lastTapY = 0;

        img.style.transformOrigin = '0 0';
        img.style.willChange = 'transform';
        img.style.touchAction = 'none';

        function applyTransform(withTransition) {
            img.style.transition = withTransition ? 'transform 0.22s ease' : 'none';
            img.style.transform =
                'translate(' + translateX + 'px, ' + translateY + 'px) scale(' + scale + ')';
        }

        function clampScale(s) {
            return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
        }

        // يمنع السحب من إنه يودّي الصورة بره حدود معقولة لما تبقى مكبّرة،
        // وبيرجّعها للنص لو الزوم رجع لحجمه الطبيعي.
        function clampTranslate() {
            if (scale <= 1) {
                translateX = 0;
                translateY = 0;
                return;
            }
            var rect = img.getBoundingClientRect();
            var overlayRect = overlay.getBoundingClientRect();

            var scaledWidth = rect.width; // rect already reflects current transform scale
            var scaledHeight = rect.height;

            var maxOffsetX = Math.max(0, (scaledWidth - overlayRect.width) / 2);
            var maxOffsetY = Math.max(0, (scaledHeight - overlayRect.height) / 2);

            // نحسب من غير ما نعتمد على rect بتاع transform الحالي (لتفادي تراكم الخطأ)
            var naturalWidth = rect.width / scale;
            var naturalHeight = rect.height / scale;
            maxOffsetX = Math.max(0, (naturalWidth * scale - overlayRect.width) / 2);
            maxOffsetY = Math.max(0, (naturalHeight * scale - overlayRect.height) / 2);

            translateX = Math.min(maxOffsetX, Math.max(-maxOffsetX, translateX));
            translateY = Math.min(maxOffsetY, Math.max(-maxOffsetY, translateY));
        }

        function resetZoom(withTransition) {
            scale = 1;
            translateX = 0;
            translateY = 0;
            applyTransform(withTransition !== false);
        }

        // نصفّر الزوم كل مرة الفيوور يتفتح (سواء بصورة جديدة أو قديمة)
        var overlayObserver = new MutationObserver(function (mutations) {
            mutations.forEach(function (m) {
                if (m.attributeName === 'class') {
                    if (overlay.classList.contains('open')) {
                        resetZoom(false);
                    }
                }
            });
        });
        overlayObserver.observe(overlay, { attributes: true });

        // لو الصورة اتغيرت (src) نصفّر الزوم برضه احتياطًا
        var imgObserver = new MutationObserver(function () {
            resetZoom(false);
        });
        imgObserver.observe(img, { attributes: true, attributeFilter: ['src'] });

        function distanceBetween(t1, t2) {
            var dx = t1.clientX - t2.clientX;
            var dy = t1.clientY - t2.clientY;
            return Math.sqrt(dx * dx + dy * dy);
        }

        function midpointOf(t1, t2) {
            return {
                x: (t1.clientX + t2.clientX) / 2,
                y: (t1.clientY + t2.clientY) / 2
            };
        }

        function zoomAtPoint(newScale, pointX, pointY, overlayRect) {
            newScale = clampScale(newScale);
            // نخلي نقطة اللمس/الدبل تاب هي نفسها اللي فاضلة تحت الإصبع بعد التكبير
            var relX = pointX - overlayRect.left - overlayRect.width / 2 - translateX;
            var relY = pointY - overlayRect.top - overlayRect.height / 2 - translateY;

            var ratio = newScale / scale;
            translateX -= relX * (ratio - 1);
            translateY -= relY * (ratio - 1);
            scale = newScale;
            clampTranslate();
        }

        function toggleDoubleTapZoom(clientX, clientY) {
            var overlayRect = overlay.getBoundingClientRect();
            if (scale > 1.01) {
                resetZoom(true);
            } else {
                zoomAtPoint(DOUBLE_TAP_SCALE, clientX, clientY, overlayRect);
                applyTransform(true);
            }
        }

        /* ================= Touch events (موبايل) ================= */

        overlay.addEventListener(
            'touchstart',
            function (e) {
                if (!overlay.classList.contains('open')) return;

                if (e.touches.length === 2) {
                    isPinching = true;
                    isPanning = false;
                    pinchStartDist = distanceBetween(e.touches[0], e.touches[1]);
                    pinchStartScale = scale;
                    var mid = midpointOf(e.touches[0], e.touches[1]);
                    pinchStartMidX = mid.x;
                    pinchStartMidY = mid.y;
                    pinchStartTranslateX = translateX;
                    pinchStartTranslateY = translateY;
                    img.style.transition = 'none';
                } else if (e.touches.length === 1) {
                    var now = Date.now();
                    var touch = e.touches[0];

                    // دبل تاب
                    if (
                        now - lastTapTime < 300 &&
                        Math.abs(touch.clientX - lastTapX) < 40 &&
                        Math.abs(touch.clientY - lastTapY) < 40
                    ) {
                        toggleDoubleTapZoom(touch.clientX, touch.clientY);
                        lastTapTime = 0;
                        isPanning = false;
                        return;
                    }
                    lastTapTime = now;
                    lastTapX = touch.clientX;
                    lastTapY = touch.clientY;

                    if (scale > 1.01) {
                        isPanning = true;
                        startX = touch.clientX;
                        startY = touch.clientY;
                        startTranslateX = translateX;
                        startTranslateY = translateY;
                        img.style.transition = 'none';
                    }
                }
            },
            { passive: true }
        );

        overlay.addEventListener(
            'touchmove',
            function (e) {
                if (!overlay.classList.contains('open')) return;

                if (isPinching && e.touches.length === 2) {
                    e.preventDefault();
                    var dist = distanceBetween(e.touches[0], e.touches[1]);
                    var factor = dist / (pinchStartDist || 1);
                    var newScale = clampScale(pinchStartScale * factor);

                    var overlayRect = overlay.getBoundingClientRect();
                    var relX = pinchStartMidX - overlayRect.left - overlayRect.width / 2 - pinchStartTranslateX;
                    var relY = pinchStartMidY - overlayRect.top - overlayRect.height / 2 - pinchStartTranslateY;
                    var ratio = newScale / pinchStartScale;

                    translateX = pinchStartTranslateX - relX * (ratio - 1);
                    translateY = pinchStartTranslateY - relY * (ratio - 1);
                    scale = newScale;
                    clampTranslate();
                    applyTransform(false);
                } else if (isPanning && e.touches.length === 1) {
                    e.preventDefault();
                    var touch = e.touches[0];
                    translateX = startTranslateX + (touch.clientX - startX);
                    translateY = startTranslateY + (touch.clientY - startY);
                    clampTranslate();
                    applyTransform(false);
                }
            },
            { passive: false }
        );

        function endTouch(e) {
            if (e.touches.length < 2) isPinching = false;
            if (e.touches.length < 1) isPanning = false;

            if (scale < MIN_SCALE + 0.01) {
                resetZoom(true);
            }
        }

        overlay.addEventListener('touchend', endTouch, { passive: true });
        overlay.addEventListener('touchcancel', endTouch, { passive: true });

        /* ================= Mouse events (سطح مكتب / متصفح) ================= */

        img.addEventListener('dblclick', function (e) {
            e.preventDefault();
            toggleDoubleTapZoom(e.clientX, e.clientY);
        });

        var mouseDown = false;
        img.addEventListener('mousedown', function (e) {
            if (scale <= 1.01) return;
            mouseDown = true;
            isPanning = true;
            startX = e.clientX;
            startY = e.clientY;
            startTranslateX = translateX;
            startTranslateY = translateY;
            img.style.transition = 'none';
            e.preventDefault();
        });

        window.addEventListener('mousemove', function (e) {
            if (!mouseDown || !isPanning) return;
            translateX = startTranslateX + (e.clientX - startX);
            translateY = startTranslateY + (e.clientY - startY);
            clampTranslate();
            applyTransform(false);
        });

        window.addEventListener('mouseup', function () {
            mouseDown = false;
            isPanning = false;
        });

        // زوم بعجلة الماوس (بونص بسيط لتجربة سطح المكتب)
        img.addEventListener(
            'wheel',
            function (e) {
                if (!overlay.classList.contains('open')) return;
                e.preventDefault();
                var overlayRect = overlay.getBoundingClientRect();
                var delta = e.deltaY < 0 ? 0.18 : -0.18;
                zoomAtPoint(scale + delta, e.clientX, e.clientY, overlayRect);
                applyTransform(false);
            },
            { passive: false }
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
